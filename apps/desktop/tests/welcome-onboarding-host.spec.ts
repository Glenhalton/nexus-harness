/** Welcome folder operations over the Host nexus-setup routes and Workspace RPC, plus the pre-save key check. */
import { describe, expect, it, vi } from 'vitest'
import { checkDeepSeekApiKey, connectDesktopWelcome, DEEPSEEK_KEY_CHECK_URL } from '../src/welcome-backend.ts'

const url = 'http://127.0.0.1:19387/?token=fixture'

type Send = Parameters<typeof connectDesktopWelcome>[1]

/** Host fake: GET launch, nexus-setup routes, and the workspace/create RPC. */
function host(routes: { status?: () => Response; init?: () => Response; create?: 'ok' | 'fail' } = {}) {
  const created: unknown[] = []
  const send = vi.fn<Send>(async (input, init) => {
    const target = new URL(input)
    if (target.pathname === '/nexus-setup/status') return routes.status?.() ?? Response.json({ state: 'needs-setup' })
    if (target.pathname === '/nexus-setup/init') return routes.init?.() ?? Response.json({ state: 'ready', created: true })
    if (init?.method !== 'POST') return new Response('index')
    const { rpcId, method, payload } = JSON.parse(init.body as string) as { rpcId: string; method: string; payload: { args: unknown } }
    if (method === 'workspace/create') {
      if (routes.create === 'fail') return new Response('', { status: 500 })
      created.push(payload.args)
    }
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value: {} } })
  })
  return { send, created }
}

describe('desktop welcome folder operations', () => {
  it('reads folder state through the authenticated status route', async () => {
    const fake = host({ status: () => Response.json({ path: '/w', state: 'ready' }) })
    const backend = await connectDesktopWelcome(url, fake.send)
    expect(await backend.folderState('/Users/me/my shop')).toBe('ready')
    const [input, init] = fake.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/nexus-setup/status?path=%2FUsers%2Fme%2Fmy+shop')
    expect(init).toMatchObject({ credentials: 'include', redirect: 'error' })
  })

  it.each([
    ['an absent route', () => new Response('', { status: 404 })],
    ['a missing folder', () => Response.json({ state: 'missing' })],
    ['a non-object body', () => Response.json(null)],
    ['a broken body', () => new Response('{ nope')],
  ])('reads %s as unknown', async (_name, status) => {
    const backend = await connectDesktopWelcome(url, host({ status }).send)
    expect(await backend.folderState('/w')).toBe('unknown')
  })

  it('reads a network failure as unknown', async () => {
    const fake = host()
    const backend = await connectDesktopWelcome(url, fake.send)
    fake.send.mockRejectedValueOnce(new Error('down'))
    expect(await backend.folderState('/w')).toBe('unknown')
  })

  it('posts setup for one folder and reports the outcome only', async () => {
    const answers = [Response.json({ state: 'ready' }), Response.json({ code: 'init-failed', message: 'secret' }, { status: 500 })]
    const fake = host({ init: () => answers.shift()! })
    const backend = await connectDesktopWelcome(url, fake.send)
    expect(await backend.setUpFolder('/w')).toEqual({ ok: true })
    expect(fake.send.mock.calls.at(-1)).toEqual(['http://127.0.0.1:19387/nexus-setup/init', {
      method: 'POST', credentials: 'include', redirect: 'error',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/w' }),
    }])
    expect(await backend.setUpFolder('/w')).toEqual({ ok: false })
    fake.send.mockRejectedValueOnce(new Error('down'))
    expect(await backend.setUpFolder('/w')).toEqual({ ok: false })
  })

  it('registers the folder as a Workspace through the standard RPC', async () => {
    const fake = host()
    const backend = await connectDesktopWelcome(url, fake.send)
    expect(await backend.useFolder('/w')).toEqual({ ok: true })
    expect(fake.created).toEqual([{ request: { path: '/w' } }])
    const failing = await connectDesktopWelcome(url, host({ create: 'fail' }).send)
    expect(await failing.useFolder('/w')).toEqual({ ok: false })
  })
})

describe('checkDeepSeekApiKey', () => {
  it('asks the official model list with the key as a bearer token', async () => {
    const send = vi.fn<Send>(async () => Response.json({ data: [] }))
    expect(await checkDeepSeekApiKey('sk-ok', send)).toBe('ok')
    const [input, init] = send.mock.calls[0]!
    expect(input).toBe(DEEPSEEK_KEY_CHECK_URL)
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', headers: { authorization: 'Bearer sk-ok' } })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [401, 'rejected'], [403, 'rejected'], [500, 'unreachable'], [503, 'unreachable'], [429, 'ok'], [402, 'ok'],
  ] as const)('maps HTTP %i to %s', async (status, expected) => {
    expect(await checkDeepSeekApiKey('sk', async () => new Response('x', { status }))).toBe(expected)
  })

  it('reads network failure and timeout as unreachable', async () => {
    expect(await checkDeepSeekApiKey('sk', async () => { throw new Error('ENOTFOUND') })).toBe('unreachable')
    const hang: Send = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
    })
    expect(await checkDeepSeekApiKey('sk', hang, 5)).toBe('unreachable')
  })
})
