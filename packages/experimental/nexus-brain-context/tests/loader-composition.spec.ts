// Product-visible plugins require a non-unit REAL-composition test (packages/AGENTS.md):
// boot a real cordis.yml through the actual Loader, drive one real agent turn
// through it, and assert the composed pack reached the outgoing model
// request, rather than only mounting the plugin directly with ctx.plugin().
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import * as NexusBrainContext from '../src/index.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../tool-nexus-brain/tests/fixtures/nexus-project')

let scratch: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

/**
 * Boot a cordis.yml carrying every AgentLoop prerequisite plus
 * `@deepseek-ai/dsh-experimental-nexus-brain-context`, exactly as a real
 * deployment's config would declare them.
 * @param projectRoot - absolute path passed as the plugin's Config.projectRoot.
 * @returns the booted context, with a mock LLM adapter registered.
 */
async function boot(projectRoot: string): Promise<{ ctx: Context; adapter: ScriptedAdapter }> {
  scratch = await mkdtemp(join(tmpdir(), 'dsh-nexus-brain-context-loader-'))
  const configPath = join(scratch, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-llm'",
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-agent-loop'",
    '  config:',
    '    agents: []',
    "- name: '@deepseek-ai/dsh-experimental-nexus-brain-context'",
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
    ['@deepseek-ai/dsh-llm', LlmRuntime],
    ['@deepseek-ai/dsh-session', SessionStore],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-agent-loop', AgentLoop],
    ['@deepseek-ai/dsh-experimental-nexus-brain-context', NexusBrainContext],
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

  const adapter = new ScriptedAdapter([textResponse('done')])
  ctx.llm.registerAdapter(['mock'], adapter)
  return { ctx, adapter }
}

describe('nexus-brain-context real Loader composition through cordis.yml', () => {
  it('boots from cordis.yml and delivers the composed pack on the real outgoing model request', async () => {
    const { ctx, adapter } = await boot(FIXTURE_ROOT)

    const agent = ctx.agentLoop.create(SessionId('loader-turn'), { provider: 'mock', model: 'mock' })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'exercise the fixture plan' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    const requestText = adapter.requests[0]?.messages
      .flatMap(message => message.content)
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') ?? ''
    expect(requestText).toContain('<system-reminder>')
    expect(requestText).toContain('fixture-plan')

    const injected = agent.session.events.filter(event => event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'nexus-brain-context')
    expect(injected).toHaveLength(1)
  }, 30_000)

  it('fails loading when projectRoot has no .nexus/ directory', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'dsh-nexus-brain-context-bare-'))
    try {
      await expect(boot(bare)).rejects.toThrow(/No \.nexus\/ directory found/)
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  }, 30_000)
})
