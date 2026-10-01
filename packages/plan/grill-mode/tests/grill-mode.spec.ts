import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { type Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import CommandRegistry from '@deepseek-ai/dsh-commands'
import GrillModeController, { FINISH_GRILLING, resolveConfig, DEFAULT_GRILL_GUIDANCE } from '../src/index.ts'

interface Bench {
  ctx: Context
  session: Session
  agent: Agent
}

let callCounter = 0

async function setupBench(config = {}): Promise<Bench> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(CommandRegistry)
  ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
  ctx.on('user-questions/request', () => Promise.resolve({
    answers: [{ id: 'grill-review', selected: ['Approve'] }],
  }))
  await ctx.plugin(GrillModeController, config)

  const session = ctx.sessions.create()
  const agent = { id: session.id, session, status: 'idle', ctx, steer: () => {}, inject: () => {} } as unknown as Agent
  await ctx.agents.register(agent)

  return { ctx, session, agent }
}

function callFinishGrilling(ctx: Context, agent: Agent | undefined, record = '## Grilling\n- Ask confirmed\n- Branch 1 decided') {
  return ctx.tools.execute({
    callId: ToolCallId(`call-grill-${++callCounter}`),
    name: FINISH_GRILLING,
    arguments: { record },
    signal: new AbortController().signal,
    ...agent ? { agent } : {},
  })
}

describe('grill-mode config and service', () => {
  it('uses default guidance when config is omitted', () => {
    const config = resolveConfig()
    expect(config.section).toBe(DEFAULT_GRILL_GUIDANCE)
  })

  it('accepts custom section guidance', () => {
    const custom = 'Custom grilling policy.'
    const config = resolveConfig({ section: custom })
    expect(config.section).toBe(custom)
  })

  it('rejects empty or whitespace-only section', () => {
    expect(() => resolveConfig({ section: '' })).toThrow(/non-empty/)
    expect(() => resolveConfig({ section: '   ' })).toThrow(/non-empty/)
  })

  it('rejects unknown configuration keys', () => {
    expect(() => resolveConfig({ section: 'ok', unknown: 123 } as unknown as { section: string }))
      .toThrow(/unknown key/)
  })
})

describe('grill-mode lifecycle and tool execution', () => {
  it('initializes in inactive state', async () => {
    const { ctx, agent } = await setupBench()
    expect(ctx.grillMode.get(agent)).toEqual({ active: false })
  })

  it('switches to active on set(agent, true)', async () => {
    const { ctx, agent } = await setupBench()
    const outcome = ctx.grillMode.set(agent, true)
    expect(outcome).toBe('committed')
    expect(ctx.grillMode.get(agent)).toEqual({ active: true })
  })

  it('allows finishing grilling when active', async () => {
    const { ctx, agent } = await setupBench()
    ctx.grillMode.set(agent, true)
    expect(ctx.grillMode.get(agent).active).toBe(true)

    const finishTool = ctx.tools.schemas(agent).find(t => t.name === FINISH_GRILLING)
    expect(finishTool).toBeDefined()

    const result = await callFinishGrilling(ctx, agent)
    expect(result.isError).toBe(false)
    expect(ctx.grillMode.get(agent)).toEqual({ active: true, pending: false })
  })

  it('rejects finish_grilling when grilling mode is inactive', async () => {
    const { ctx, agent } = await setupBench()
    const result = await callFinishGrilling(ctx, agent)
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'Error: finish_grilling is only available in grilling mode' }])
  })
})
