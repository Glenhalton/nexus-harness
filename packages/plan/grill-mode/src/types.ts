/**
 * Pure types of the grill domain: the ONE home of the `grill` projection-key
 * declaration, free of this package's host-side value imports (cordis,
 * dsh-tools, dsh-agent). Two namespace projections serve it — `./types` for
 * host consumers and `./client` for client aggregates — with zero content
 * duplication.
 *
 * @module @deepseek-ai/dsh-grill-mode/types
 */

import type { CommandId } from '@deepseek-ai/dsh-commands/brand'

/**
 * The grill projection's wire value. `active` is the logged state in force
 * (the last `grill/mode`, inactive before the first); `pending` is true while
 * a logged `/grill` selection targets a state other than `active`, has not
 * failed through its paired `command/done`, and no later `grill/mode` event has
 * recorded that state. Capability absence (grill-mode not composed) is the
 * key's absence, never a value.
 */
export interface GrillProjection {
  active: boolean
  pending: boolean
}

/** Host state used to derive {@link GrillProjection}. */
export interface GrillUnitState {
  /** Logged grill mode. */
  active: boolean
  /** The selection's target mode; null when no selection is outstanding. */
  wanted: boolean | null
  /** The latest grill command awaiting its paired settlement. */
  running: { commandId: CommandId; wanted: boolean } | null
  /** Active state recorded by the latest `request/header`, or null. */
  activeAtLastHeader: boolean | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Host grill-mode fold state. */
    grill: GrillUnitState
  }
  interface SessionProjectionMap {
    /** Grill collaboration state folded from the grill command lifecycle and `grill/mode` events. */
    grill: GrillProjection
  }
}
