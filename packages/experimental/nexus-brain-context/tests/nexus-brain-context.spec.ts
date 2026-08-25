import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry, { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import * as NexusBrainContext from '../src/index.ts'
import type { Config } from '../src/index.ts'

const FIXTURE_ROOT = resolve(
  import.meta.dirname,
  '../../tool-nexus-brain/tests/fixtures/nexus-project',
)
const SIGNAL = new AbortController().signal

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

async function mount(config: Config) {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(AgentRegistry)
  const fiber = await ctx.plugin(NexusBrainContext, config)
  return { ctx, fiber }
}

function sessionAgent(session: Session, id = 'agent'): Agent {
  return {
    id: SessionId(id),
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('nexus-brain-context must append directly to the open step') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

function openMessageTurn(session: Session, turn: number, text: string): void {
  session.append('turn/start', { turn })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
}

async function fire(ctx: Context, agent: Agent, turn: number, step: number) {
  return agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn, step, signal: SIGNAL },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
}

describe('nexus-brain-context', () => {
  // "Misconfiguration fails loud at load" for a missing .nexus/ is proven by
  // the REAL Loader-composition test in loader-composition.spec.ts, not here:
  // packages/AGENTS.md requires that path specifically because a direct
  // ctx.plugin(...) mount does not surface a synchronous apply() throw as a
  // rejection the way loading through the real Loader does.

  it('injects the composed pack as a durable user message on step 1', async () => {
    const { ctx } = await mount({ projectRoot: FIXTURE_ROOT })
    const session = Session.create(SessionId('nexus-brain-context-test'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1, 'exercise the fixture plan')

    const decision = await fire(ctx, agent, 1, 1)

    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(decision.messages).toHaveLength(1)
    const text = decision.messages[0]?.content.find(block => block.type === 'text')?.text ?? ''
    expect(text).toContain('<system-reminder>')
    expect(text).toContain('nexus_get_context')
    expect(text).toContain('fixture-plan')
    expect(decision.messages[0]?.source).toEqual({
      kind: 'plugin',
      plugin: 'nexus-brain-context',
      form: 'snapshot',
      sections: [{ name: 'nexus-brain-context', text }],
    })
  })

  it('does not inject on step 2+ of the same turn', async () => {
    const { ctx } = await mount({ projectRoot: FIXTURE_ROOT })
    const session = Session.create(SessionId('nexus-brain-context-test'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1, 'exercise the fixture plan')

    const decision = await fire(ctx, agent, 1, 2)

    expect(decision).toEqual({ kind: 'enter', messages: [] })
  })

  it('skips injection when the turn has no text content to derive a task from', async () => {
    const { ctx } = await mount({ projectRoot: FIXTURE_ROOT })
    const session = Session.create(SessionId('nexus-brain-context-test'))
    const agent = sessionAgent(session)
    session.append('turn/start', { turn: 1 })

    const decision = await fire(ctx, agent, 1, 1)

    expect(decision).toEqual({ kind: 'enter', messages: [] })
  })

  it('accepts a maxChars override and still returns a well-shaped pack', async () => {
    const { ctx } = await mount({ projectRoot: FIXTURE_ROOT, maxChars: 2000 })
    const session = Session.create(SessionId('nexus-brain-context-test'))
    const agent = sessionAgent(session)
    openMessageTurn(session, 1, 'exercise the fixture plan')

    const decision = await fire(ctx, agent, 1, 1)

    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    const text = decision.messages[0]?.content.find(block => block.type === 'text')?.text ?? ''
    const body = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const parsed = JSON.parse(body) as { truncated?: boolean }
    expect(typeof parsed.truncated).toBe('boolean')
  })
})
