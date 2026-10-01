/**
 * Grill mode is logged per-agent collaboration state: while active, a
 * grilling guidance section is included in each model request to conduct an
 * alignment interview before coding. `finish_grilling` presents the finalized
 * grilling record for user review, and `/grill off` lets a user leave directly.
 *
 * @module @deepseek-ai/dsh-grill-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { Session, UserMessage } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import type { CommandDefinitionId, CommandId } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { GrillProjection, GrillUnitState } from './types.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'grill-mode': { kind: 'grill-mode' } & ContextFormed
  }
}
export type * from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whether grill mode is in force from this point on: log-only, non-surface,
     * whole-value replace. The last `grill/mode` wins; a log with none folds to
     * inactive through the projection unit's fold.
     */
    'grill/mode': { active: boolean }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    grillMode: GrillModeController
  }
}

/**
 * The model-facing finish tool's name. It stays registered while grill mode is
 * inactive so the request tool catalog is stable across transitions.
 */
export const FINISH_GRILLING = 'finish_grilling'

export const DEFAULT_GRILL_GUIDANCE = `You are in grilling mode — an alignment interview discipline to resolve design decisions before implementation starts:
1. Read before you ask: understand the plan, codebase, and docs first. Never ask questions answered by the repository.
2. State the ask back in one clear sentence to verify alignment.
3. Map the undecided branches: scope boundaries, data models, failure behaviors, user personas, and acceptance criteria.
4. Ask one question at a time using ask_user_question (or interactive prompts). Never ask a list or batch of questions.
5. Go depth-first: pursue the consequences of an answer before jumping to another branch.
6. Push back on vagueness ("handle gracefully", "make it clean", "standard approach").
7. Explicitly record what is OUT OF SCOPE.
8. When all branches are decided or explicitly out-of-scope, call finish_grilling with the complete markdown record.`

/** Deployment-owned grill guidance. */
export interface GrillModeConfig {
  /** Guidance rendered as the \`grill:policy\` prompt section while grill mode is active. */
  section?: string
}

/** The review question's id, echoed in the answer this tool reads. */
const REVIEW_ID = 'grill-review'

/** The review question's approve option label. */
const APPROVE_LABEL = 'Approve'

/** The review question's keep-grilling option label. */
const KEEP_GRILLING_LABEL = 'Keep grilling'

const FINISH_DESCRIPTION
  = 'Use only in grilling mode. Present the completed grilling record for user review and, on approval, leave grilling mode. '
  + 'Send the complete markdown record containing the restated ask, resolved decision branches, and explicit out-of-scope list. '
  + 'The user may approve (conclude grilling and proceed with work) or keep '
  + 'grilling — their feedback comes back in the tool result; continue resolving questions and present again.'

export function resolveConfig(config: GrillModeConfig = {}): { section: string } {
  const section = config.section ?? DEFAULT_GRILL_GUIDANCE
  if (typeof section !== 'string' || section.trim() === '') {
    throw new Error('GrillModeConfig needs a non-empty string `section`')
  }
  const unknown = Object.keys(config).filter(key => key !== 'section')
  if (unknown.length > 0) {
    throw new Error(`GrillModeConfig has unknown key(s) ${unknown.join(', ')} — config is { section? }`)
  }
  return { section }
}

const grillUnitStateSchema: ZodType<GrillUnitState> = zod.object({
  active: zod.boolean(),
  wanted: zod.boolean().nullable(),
  running: zod.object({
    commandId: zod.string() as unknown as ZodType<CommandId>,
    wanted: zod.boolean(),
  }).strict().nullable(),
  activeAtLastHeader: zod.boolean().nullable(),
}).strict()

/** Wire payload schema of the `grill` projection. */
const grillProjectionSchema: ZodType<GrillProjection> = zod.object({
  active: zod.boolean(),
  pending: zod.boolean(),
})

/** Projection of logged grill selections and committed mode. */
export const grillProjectionDefinition = {
  key: 'grill',
  stateVersion: 1,
  stateSchema: grillUnitStateSchema,
  init: () => ({ active: false, wanted: null, running: null, activeAtLastHeader: null }),
  apply: (state, event) => {
    if (event.type === 'command/run' && event.data.name === 'grill') {
      if (event.data.args === undefined) return state
      const wanted = event.data.args.trim() !== 'off'
      return { ...state, running: { commandId: event.data.commandId, wanted } }
    }
    if (event.type === 'command/done' && event.data.commandId === state.running?.commandId) {
      const wanted = event.data.kind === 'success' && state.running.wanted !== state.active
        ? state.running.wanted
        : null
      return { ...state, wanted, running: null }
    }
    if (event.type === 'grill/mode') {
      return { ...state, active: event.data.active, wanted: null }
    }
    if (event.type === 'request/header') {
      return { ...state, activeAtLastHeader: state.active }
    }
    return state
  },
  wire: {
    viewSchema: grillProjectionSchema,
    view: (state) => {
      const wanted = state.running?.wanted ?? state.wanted
      return { active: state.active, pending: wanted !== null && wanted !== state.active }
    },
  },
} satisfies ProjectionDefinition<'grill', GrillUnitState>

/**
 * `ctx.grillMode`: owns logged grilling state, applies and narrates selected state at step start,
 * the `grill:policy` section, the `/grill` command, and the finish tool.
 */
export class GrillModeController extends Service {
  static inject = ['tools', 'systemPrompt', 'sessionProjections']

  /** Validated guidance. */
  private readonly section: string

  /**
   * Latest selection per session awaiting the next accepted in-turn pre-step.
   */
  private readonly pendingIntents = new WeakMap<Session, { active: boolean; narrate: boolean }>()

  constructor(ctx: Context, config: GrillModeConfig = {}) {
    super(ctx, 'grillMode')
    this.section = resolveConfig(config).section
    let disposed = false

    ctx.on('agent/pre-step', async (
      { agent, signal },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      const pending = this.pendingIntents.get(agent.session)
      if (decision.kind === 'reject' || signal.aborted || pending === undefined) return decision
      const narration = this.narration(agent.session, pending.active)
      try {
        this.onBoundary(agent.session)
      } catch (error) {
        ctx.logger.warn('dsh-grill-mode: failed to append selected grill mode at step start: %o', error)
        return decision
      }
      return !pending.narrate || narration === undefined
        ? decision
        : { ...decision, messages: [...decision.messages, narration] }
    })
    ctx.effect(() => () => { disposed = true }, 'dsh-grill-mode: close service lifetime')

    ctx.systemPrompt.section({
      name: 'grill:policy',
      order: ctx.systemPrompt.getSectionOrder('PLAN_POLICY') + 1,
      text: (context) => {
        if (context.agent === undefined) return ''
        const pending = this.pendingIntents.get(context.agent.session)
        return (pending?.active ?? this.loggedActive(context.agent.session)) ? this.section : ''
      },
    })

    ctx.sessionProjections.register(grillProjectionDefinition)

    // Register /grill command when commands service is present
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        definitionId: brandString<CommandDefinitionId>('@deepseek-ai/dsh-grill-mode'),
        name: 'grill',
        description: 'Enter or leave grilling mode for alignment interviews',
        input: { hint: '[off|topic]', attachments: false },
        handler: ({ agent, rawInput }) => {
          const message = rawInput.trim()
          if (message === 'off') {
            switch (this.set(agent, false)) {
              case 'committed':
                return { kind: 'success', text: 'Grilling mode off.' }
              case 'queued':
                return { kind: 'success', text: 'Leaving grilling mode (applies from the next step).' }
              case 'cancelled':
                return { kind: 'success', text: 'Grilling mode entry cancelled.' }
              case 'noop':
                return this.loggedActive(agent.session)
                  ? { kind: 'success', text: 'Leaving grilling mode (applies from the next step).' }
                  : { kind: 'success', text: 'Grilling mode is already inactive.' }
            }
          }
          const outcome = this.set(agent, true)
          if (message !== '') {
            agent.steer(createUserMessage({
              content: [{ type: 'text' as const, text: `Topic to grill: ${message}` }],
              source: { kind: 'user' },
            }))
          }
          return {
            kind: 'success',
            text: outcome === 'committed'
              ? 'Grilling mode on. Use /grill off to leave.'
              : 'Entering grilling mode (applies from the next step). Use /grill off to leave.',
          }
        },
      })
    })

    ctx.tools.register(defineTool({
      name: FINISH_GRILLING,
      description: FINISH_DESCRIPTION,
      parameters: {
        record: {
          type: 'string',
          required: true,
          description: 'The complete markdown ## Grilling section containing the restated ask, resolved branches, and out-of-scope list.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            approved: { type: 'boolean', const: true, required: true },
          },
        },
        render: () => [{ type: 'text', text: 'Grilling record approved — grilling mode exited; proceed with drafting or implementing the plan.' }],
      },
      execute: async (args, exec) => {
        const agent = exec.agent
        if (agent === undefined) throw new Error(`${FINISH_GRILLING} requires a calling agent (no session to switch)`)
        if (!this.loggedActive(agent.session)) {
          throw new Error(`${FINISH_GRILLING} is only available in grilling mode`)
        }
        if (args.record.trim() === '') {
          throw new Error(`${FINISH_GRILLING} requires a non-empty markdown record`)
        }
        const interaction = ctx.get('userQuestions')
        if (interaction !== undefined) {
          const answer = await interaction.ask({
            questions: [{
              id: REVIEW_ID,
              header: 'Grilling record review',
              question: 'Approve this grilling alignment record and exit grilling mode?',
              detail: args.record,
              options: [
                { label: APPROVE_LABEL, description: 'Leave grilling mode; the alignment record is accepted.' },
                { label: KEEP_GRILLING_LABEL, description: 'Stay in grilling mode; feedback goes back to the model.' },
              ],
              intent: { kind: 'plan-review', approve: APPROVE_LABEL, callId: exec.callId },
            }],
            agent,
            signal: exec.signal,
          }).catch((cause: unknown) => {
            if (cause instanceof UserQuestionError && cause.code === 'ASK_CANCELLED') {
              throw new Error('The user dismissed the grilling review to speak instead; stay in grilling mode and wait for their message.')
            }
            throw cause
          })

          if (disposed) {
            throw new Error('the grill-mode service was reloaded while grilling was under review; present the record again')
          }
          const reviewItems = answer.answers.filter(entry => entry.id === REVIEW_ID)
          const item = reviewItems.length === 1 ? reviewItems[0] : undefined
          if (item?.selected.length !== 1 || item.selected[0] !== APPROVE_LABEL || item.custom !== undefined) {
            const feedback = item?.custom ?? ''
            throw new Error(feedback === ''
              ? 'The user chose to keep grilling; continue asking questions to resolve remaining branches.'
              : `The user chose to keep grilling; their feedback: ${feedback}`)
          }
        }

        this.pendingIntents.set(agent.session, { active: false, narrate: false })
        return { approved: true }
      },
      presentCall: args => ({
        card: 'generic',
        title: 'Grilling Alignment Record',
        kind: 'other',
        content: [{ type: 'text', text: args.record }],
      }),
      presentResult: (_args, result) => ({
        card: 'generic',
        title: 'Grilling review',
        content: result.content,
      }),
    }))
  }

  private loggedActive(session: Session): boolean {
    return this.grillState(session).active
  }

  private hasOpenTurn(session: Session): boolean {
    const state = this.ctx.sessionProjections.stateOf(session, 'turnBoundary')
    if (state === undefined) throw new Error('grill-mode requires the turnBoundary session projection')
    return state.openTurnStartSeq !== null
  }

  private loggedActiveAtLastHeader(session: Session): boolean | undefined {
    return this.grillState(session).activeAtLastHeader ?? undefined
  }

  /** Read the required grill projection state or fail at the first service access. */
  private grillState(session: Session): GrillUnitState {
    const state = this.ctx.sessionProjections.stateOf(session, 'grill')
    if (state === undefined) throw new Error('grill-mode requires the grill session projection')
    return state
  }

  /**
   * Read the logged grill state and any selected state awaiting the next
   * accepted in-turn pre-step.
   */
  get(agent: Agent): { active: boolean; pending?: boolean } {
    const active = this.loggedActive(agent.session)
    const pending = this.pendingIntents.get(agent.session)
    return pending === undefined ? { active } : { active, pending: pending.active }
  }

  /**
   * Select whether grill mode should be active.
   */
  set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop' {
    const session = agent.session
    const pending = this.pendingIntents.get(session)
    const target = pending?.active ?? this.loggedActive(session)
    if (active === target) return 'noop'
    if (this.hasOpenTurn(session)) {
      this.pendingIntents.set(session, { active, narrate: true })
      return this.loggedActive(session) === active ? 'cancelled' : 'queued'
    }
    if (active === this.loggedActive(session)) {
      this.pendingIntents.delete(session)
      return 'cancelled'
    }
    session.append('grill/mode', { active })
    this.pendingIntents.delete(session)
    const narration = this.narration(session, active)
    if (narration !== undefined) agent.inject(narration)
    return 'committed'
  }

  /** Append one pending selection before the next request assembly. */
  private onBoundary(session: Session): void {
    const pending = this.pendingIntents.get(session)
    if (pending === undefined) return
    const target = pending.active
    if (target === this.loggedActive(session)) {
      this.pendingIntents.delete(session)
      return
    }
    session.append('grill/mode', { active: target })
    this.pendingIntents.delete(session)
  }

  /** Build a user-switch notice when the last logged header described the other mode. */
  private narration(session: Session, target: boolean): UserMessage | undefined {
    const told = this.loggedActiveAtLastHeader(session)
    if (told === undefined || told === target) return
    const text = target
      ? 'The user switched this session to grilling mode.'
      : 'The user switched this session back to the default mode.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'grill-mode', form: 'notice', summary: text },
    })
  }
}

export default GrillModeController
