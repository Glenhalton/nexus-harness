/**
 * Host routes over a real WebServer booted through the vendored Loader,
 * asserting the HTTP surface: the connection trust fence, method and wire
 * validation, status reads, and init (including concurrent-request joining
 * and generator failure). The CLI generator is faked through `internals`;
 * the filesystem is real.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as NexusSetup from '../src/index.ts'
import type { AdoptProject } from '../src/scaffold.ts'
import { NEXUS_SETUP_INIT_PATH, NEXUS_SETUP_STATUS_PATH } from '../src/shared.ts'

let root: string | undefined
let context: Context | undefined
const trust: { rejection: 401 | 403 | undefined } = { rejection: undefined }

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  NexusSetup.internals.adopt = undefined
  trust.rejection = undefined
})

/** Boot webserver + nexus-setup rows through the real Loader. */
async function boot(): Promise<{ base: string; root: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-nexus-setup-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-host-nexus-setup'",
    '',
  ].join('\n'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  context.provide('connection', { requestRejection: () => trust.rejection } as never)
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-host-nexus-setup', NexusSetup],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return { base: `http://127.0.0.1:${String(context.webServer.port)}`, root }
}

/** A fake generator that creates `.nexus/` after an optional gate. */
function fakeAdopt(gate?: Promise<void>): ReturnType<typeof vi.fn<AdoptProject>> {
  return vi.fn<AdoptProject>(async (dir) => {
    await gate
    await mkdir(join(dir, '.nexus'))
  })
}

const status = (base: string, path?: string): Promise<Response> =>
  fetch(`${base}${NEXUS_SETUP_STATUS_PATH}${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}`)

const init = (base: string, body: unknown, type = 'application/json'): Promise<Response> =>
  fetch(`${base}${NEXUS_SETUP_INIT_PATH}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('nexus-setup host routes', () => {
  it('fences every route behind the connection rejection', async () => {
    const { base, root: dir } = await boot()
    trust.rejection = 401
    expect((await status(base, dir)).status).toBe(401)
    trust.rejection = 403
    expect((await init(base, { path: dir })).status).toBe(403)
  })

  it('reports folder status and validates the query', async () => {
    const { base, root: dir } = await boot()
    expect(await (await status(base, dir)).json()).toEqual({ path: dir, state: 'needs-setup' })
    expect(await (await status(base, join(dir, 'absent'))).json()).toMatchObject({ state: 'missing' })
    await mkdir(join(dir, '.nexus'))
    expect(await (await status(base, `${dir}/`)).json()).toEqual({ path: dir, state: 'ready' })
    expect((await status(base)).status).toBe(400)
    expect((await status(base, 'relative/dir')).status).toBe(400)
    const post = await fetch(`${base}${NEXUS_SETUP_STATUS_PATH}`, { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET')
  })

  it('scaffolds once, joins a concurrent request, and is idempotent afterwards', async () => {
    const { base, root: dir } = await boot()
    const gate = Promise.withResolvers<void>()
    const adopt = fakeAdopt(gate.promise)
    NexusSetup.internals.adopt = () => Promise.resolve(adopt)
    const first = init(base, { path: dir })
    const second = init(base, { path: `${dir}/` })
    await vi.waitFor(() => { expect(adopt).toHaveBeenCalledTimes(1) })
    gate.resolve()
    expect(await (await first).json()).toEqual({ path: dir, state: 'ready', created: true })
    expect(await (await second).json()).toEqual({ path: dir, state: 'ready', created: true })
    expect(await (await init(base, { path: dir })).json()).toEqual({ path: dir, state: 'ready', created: false })
    expect(adopt).toHaveBeenCalledTimes(1)
  })

  it('answers generator failures with init-failed', async () => {
    const { base, root: dir } = await boot()
    NexusSetup.internals.adopt = () => Promise.resolve((() => Promise.reject(new Error('disk full'))) as AdoptProject)
    const response = await init(base, { path: dir })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 'init-failed', message: 'disk full' })
    NexusSetup.internals.adopt = () => Promise.resolve((() => Promise.reject('opaque')) as unknown as AdoptProject)
    expect(await (await init(base, { path: dir })).json()).toEqual({ code: 'init-failed', message: 'opaque' })
  })

  it('validates method, media type, body, and folder existence', async () => {
    const { base, root: dir } = await boot()
    const get = await fetch(`${base}${NEXUS_SETUP_INIT_PATH}`)
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect((await init(base, { path: dir }, 'text/plain')).status).toBe(415)
    expect((await init(base, '{ nope')).status).toBe(400)
    expect((await init(base, 'null')).status).toBe(400)
    expect((await init(base, { path: 'relative' })).status).toBe(400)
    expect((await init(base, { path: 7 })).status).toBe(400)
    const missing = await init(base, { path: join(dir, 'absent') })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'not-found' })
    const large = await init(base, { path: dir, pad: 'x'.repeat(70 * 1024) })
    expect(large.status).toBe(413)
  })

  it('answers a body cut mid-stream with bad-request', async () => {
    const { base, root: dir } = await boot()
    const { port } = new URL(base)
    const done = new Promise<string>((resolve) => {
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write(`POST ${NEXUS_SETUP_INIT_PATH} HTTP/1.1\r\nhost: 127.0.0.1\r\ncontent-type: application/json\r\ncontent-length: 100\r\n\r\n{"path":"${dir}`)
        socket.destroy()
        resolve('closed')
      })
    })
    expect(await done).toBe('closed')
    // The server survives the aborted request and keeps answering.
    expect((await status(base, dir)).status).toBe(200)
  })
})
