/**
 * Package-owned durable invariants for the ambient NEXUS brain-context
 * reading: append position and message shape.
 * @module @deepseek-ai/dsh-experimental-nexus-brain-context/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-nexus-brain-context'
const SOURCE_NAME = 'nexus-brain-context'

/** Cordis companion plugin name. */
export const name = 'nexus-brain-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Derive the open turn/step at the point one event appears in history. Fails when unset. */
function preparationPosition(
  history: readonly SessionEvent[],
  fail: InvariantFailure,
): { turn: number; step: number } {
  let openTurn: number | undefined
  let openStep: number | undefined
  for (const event of history) {
    switch (event.type) {
      case 'turn/start': {
        openTurn = event.data.turn
        openStep = undefined
        break
      }
      case 'step/start': {
        openStep = event.data.step
        break
      }
      case 'step/end': {
        openStep = undefined
        break
      }
      case 'turn/end': {
        openTurn = undefined
        openStep = undefined
        break
      }
      default:
        break
    }
  }
  if (openTurn === undefined) fail('nexus-brain-context reading must be appended inside an open turn')
  if (openStep === undefined) fail('nexus-brain-context reading must follow step/start')
  return { turn: openTurn, step: openStep }
}

/** Validate one plugin-attributed brain-context reading against its session position and message shape. */
function validateReading(
  history: readonly SessionEvent[],
  event: SessionEvent<'user/message'>,
  fail: InvariantFailure,
): void {
  const blockValue: unknown = event.data.content[0]
  const block = typeof blockValue === 'object' && blockValue !== null
    ? blockValue as Record<string, unknown>
    : undefined
  const blockText = block?.text
  if (event.data.content.length !== 1
    || block === undefined
    || Object.keys(block).length !== 2
    || block.type !== 'text'
    || typeof blockText !== 'string') {
    fail('nexus-brain-context messages must contain exactly one text block')
    return
  }
  if (!blockText.startsWith('<system-reminder>\n') || !blockText.endsWith('\n</system-reminder>')) {
    fail('nexus-brain-context message must be framed as a system-reminder')
  }
  const openBrace = blockText.indexOf('{')
  const closeBrace = blockText.lastIndexOf('}')
  if (openBrace < 0 || closeBrace < openBrace) {
    fail('nexus-brain-context message must carry a composed-pack JSON body')
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(blockText.slice(openBrace, closeBrace + 1))
  } catch (error: unknown) {
    fail(`nexus-brain-context message body must be valid JSON: ${String(error)}`)
    return
  }
  if (typeof parsed !== 'object' || parsed === null
    || typeof (parsed as Record<string, unknown>).task !== 'string'
    || typeof (parsed as Record<string, unknown>).truncated !== 'boolean') {
    fail('nexus-brain-context message body must carry the composed-pack shape (string task, boolean truncated)')
  }

  const { turn, step } = preparationPosition(history, fail)
  if (step !== 1) {
    fail(`nexus-brain-context reading appeared at step ${step}, but only injects on step 1 of a turn (turn ${turn})`)
  }

  const source = event.data.source
  /* v8 ignore next 2 -- replay and dispatch callers select this exact package-owned source before validation. */
  if (source.kind !== 'plugin' || source.plugin !== SOURCE_NAME) {
    fail('nexus-brain-context source must retain package ownership')
    return
  }
  const sections: unknown = 'sections' in source ? source.sections : undefined
  const sectionValue: unknown = Array.isArray(sections) ? sections[0] : undefined
  const section = typeof sectionValue === 'object' && sectionValue !== null
    ? sectionValue as Record<string, unknown>
    : undefined
  if (Object.keys(source).length !== 4
    || source.form !== 'snapshot'
    || !Array.isArray(sections)
    || sections.length !== 1
    || section === undefined
    || Object.keys(section).length !== 2
    || section.name !== SOURCE_NAME
    || section.text !== blockText) {
    fail('nexus-brain-context source must carry only the exact snapshot text, not request authority')
  }
}

/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate all package-owned readings already present in one session. */
function validateSession(session: Session, fail: InvariantFailure): void {
  for (const [index, event] of session.events.entries()) {
    if (event.type !== 'user/message'
      || event.data.source.kind !== 'plugin'
      || event.data.source.plugin !== SOURCE_NAME) continue
    validateReading(session.events.slice(0, index), event, fail)
  }
}

/** Install validation for loaded and newly appended brain-context readings. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) validateSession(session, fail)
  ctx.on('session/created', (session) => { validateSession(session, fail) }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    if (event.type !== 'user/message'
      || event.data.source.kind !== 'plugin'
      || event.data.source.plugin !== SOURCE_NAME) return
    validateReading(session.events, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })
/* jscpd:ignore-end */

/**
 * Register the nexus-brain-context invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
