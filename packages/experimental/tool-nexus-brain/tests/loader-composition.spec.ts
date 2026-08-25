// Product-visible plugins require a non-unit REAL-composition test (packages/AGENTS.md):
// boot a real cordis.yml through the actual Loader and drive one tool call through it,
// rather than only mounting the plugin directly with ctx.plugin().
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolNexusBrain from '../src/index.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures/nexus-project')

let scratch: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/**
 * Boot a cordis.yml carrying `@deepseek-ai/dsh-experimental-tool-nexus-brain`
 * with the given projectRoot.
 * @param projectRoot - absolute path passed as the plugin's Config.projectRoot.
 * @returns the booted context.
 */
async function boot(projectRoot: string): Promise<Context> {
  scratch = await mkdtemp(join(tmpdir(), 'dsh-nexus-brain-loader-'))
  const configPath = join(scratch, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-experimental-tool-nexus-brain'",
    '  config:',
    `    projectRoot: ${JSON.stringify(projectRoot)}`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(scratch).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-experimental-tool-nexus-brain', ToolNexusBrain],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('tool-nexus-brain real Loader composition through cordis.yml', () => {
  it('boots from cordis.yml and serves nexus_wake against the real fixture project', async () => {
    const ctx = await boot(FIXTURE_ROOT)

    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toContain('nexus_wake')
    expect(names).toContain('nexus_get_active_plan')

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('loader-wake-1'),
      name: 'nexus_wake',
      arguments: {},
    })
    expect(result.isError).toBe(false)
    const payload = JSON.parse(resultText(result)) as { token: string; activePlan: string | null }
    expect(payload.token).toMatch(/^NX-WAKE-/)
    expect(payload.activePlan).toBe('fixture-plan')
  }, 30_000)

  it('fails loading when projectRoot has no .nexus/ directory', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'dsh-nexus-brain-bare-'))
    try {
      await expect(boot(bare)).rejects.toThrow(/No \.nexus\/ directory found/)
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  }, 30_000)
})
