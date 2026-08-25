/**
 * Ambient NEXUS project-brain context. Replaces the tool-call round trip
 * (`tool-nexus-brain`'s former `nexus_get_context`) with a durable message
 * injected at the start of each turn, composed from the same
 * `@nexus-framework/cli` handlers, so a harness profile with unreliable or
 * absent tool calling still gets the brain's plan/knowledge/skill context.
 * @module @deepseek-ai/dsh-experimental-nexus-brain-context
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  getContextTool,
  resolveBrainContext,
  type BrainContext,
  type ComposedContext,
} from '@nexus-framework/cli/mcp'

/** Cordis plugin name used by loader diagnostics and message-source attribution. */
export const name = 'nexus-brain-context'

/** The agent registry that owns pre-step processing. */
export const inject = ['agents']

/** Ambient NEXUS brain context configuration. */
export interface Config {
  /**
   * Absolute path to the target NEXUS project root (the directory containing
   * `.nexus/`). Required for the same reason `tool-nexus-brain` requires it:
   * resolving against a host process's `process.cwd()` would silently point
   * at the wrong project when this plugin runs inside a harness session
   * composed for a different repository.
   */
  projectRoot: string
  /** Soft cap on the composed pack, in characters. Passed straight through to `getContextTool`'s own budget (2000-60000, default 12000). */
  maxChars?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  projectRoot: z.string().required(),
  maxChars: z.number(),
})

/** Find the current turn's start index in the session log, or -1 if unlogged (e.g. the very first turn). */
function turnStartIndex(agent: Agent, turn: number): number {
  return agent.session.events.findLastIndex(
    event => event.type === 'turn/start' && event.data.turn === turn,
  )
}

/**
 * Derive the task text NEXUS should match knowledge entries and skill
 * triggers against: the text content of every user message that opened this
 * turn (already-logged plus anything proposed by a downstream listener),
 * concatenated in order. A `nexus_get_context` tool call lets the model
 * phrase this deliberately; ambient injection has no such call, so the
 * user's own words are the closest available substitute — the same thing a
 * developer would type into `nexus_get_context(task)` by hand for the same
 * request.
 */
function deriveTask(agent: Agent, turn: number, proposed: readonly UserMessage[]): string {
  const start = turnStartIndex(agent, turn)
  const logged = start < 0
    ? []
    : agent.session.events.slice(start + 1)
      .flatMap(event => event.type === 'user/message' ? [event.data] : [])
  const texts = [...logged, ...proposed]
    .flatMap(message => message.content)
    .flatMap(block => block.type === 'text' ? [block.text] : [])
    .map(text => text.trim())
    .filter(text => text.length > 0)
  return texts.join('\n\n')
}

/** Escape the one sequence that could let repository-controlled content close this plugin's frame early. */
function escapeFrame(text: string): string {
  return text.replaceAll('</system-reminder>', '&lt;/system-reminder&gt;')
}

function renderText(context: ComposedContext): string {
  const body = JSON.stringify(context, null, 2)
  return '<system-reminder>\n'
    + 'The following is this project\'s NEXUS brain context for the task you were just asked to do: '
    + 'the active plan slice, matching knowledge entries, matching skills, and vital signs, the same '
    + 'pack `nexus_get_context` would return. Use it as grounding; it does not override system, '
    + 'developer, or direct user instructions.\n\n'
    + escapeFrame(body)
    + '\n</system-reminder>'
}

/**
 * Register a prepended pre-step listener for the lifetime of `ctx`.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param config - target project and budget configuration.
 * @throws synchronously when `projectRoot` has no `.nexus/` directory —
 * misconfiguration fails loud at load, per `tool-nexus-brain`'s convention.
 */
export function apply(ctx: Context, config: Config): void {
  const brainCtx: BrainContext = resolveBrainContext(config.projectRoot)

  ctx.on('agent/pre-step', async (
    { agent, turn, step, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    // Once per turn: the composed pack is task-scoped, and the task is
    // fixed for the whole turn, so re-injecting it on every step would
    // repeat the same context for no new information.
    if (step !== 1) return decision

    const task = deriveTask(agent, turn, decision.messages)
    if (task.length === 0) return decision

    let composed: ComposedContext
    try {
      composed = await getContextTool(brainCtx, {
        task,
        ...(config.maxChars === undefined ? {} : { maxChars: config.maxChars }),
      })
    } catch {
      // Ambient context is a convenience, not a load-bearing dependency: a
      // transient read failure (the brain mid-write, a moved file) should
      // never fail the turn. The tool-call path, if kept, surfaces the
      // same error loudly on an explicit call.
      return decision
    }

    const text = renderText(composed)
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
        }),
      ],
    }
  }, { prepend: true })
}
