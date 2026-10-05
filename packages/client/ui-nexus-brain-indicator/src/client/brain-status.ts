/**
 * The chip's single status decision. Two sources, in order of authority:
 * 1. the NEXUS context injected into the latest turn (plan, vitals, drift);
 * 2. before any such turn, the folder status read through the setup routes.
 * Nothing is reported as synced without evidence.
 */

import type { NexusSetupPhase } from '@deepseek-ai/dsh-client-ui-nexus-setup/client'

/** Brain facts parsed from the NEXUS context of the latest turn. */
export interface TurnBrainState {
  status: 'synced' | 'drift'
  planId?: string
  planStatus?: string
  planNextStep?: string | null
  branch?: string | null
  dirty?: boolean | null
  testsSummary?: string
}

/**
 * What the chip shows:
 * - `synced` / `drift`: a turn carried NEXUS context; details come from it.
 * - `ready`: the folder is a NEXUS project, but no turn has carried its context yet.
 * - `not-project`: the folder has no NEXUS brain (`canSetUp` when setup can be offered).
 * - `checking`: the folder status is being read.
 * - `unknown`: no folder, or the status cannot be read on this host.
 */
export type BrainState =
  | TurnBrainState
  | { status: 'ready' }
  | { status: 'not-project'; canSetUp: boolean }
  | { status: 'checking' }
  | { status: 'unknown' }

/** Every status the chip can show. */
export type BrainStatus = BrainState['status']

/**
 * Decide the chip state.
 * @param turn - context of the latest NEXUS turn, or null before any.
 * @param cwd - the Session folder, when known.
 * @param phase - the folder's setup phase; null when no setup service is loaded, undefined before the first read.
 * @returns the state to render.
 */
export function resolveBrainState(
  turn: TurnBrainState | null,
  cwd: string | undefined,
  phase: NexusSetupPhase | null | undefined,
): BrainState {
  if (turn !== null) return turn
  if (cwd === undefined || cwd === '' || phase === null) return { status: 'unknown' }
  switch (phase) {
    case undefined:
    case 'checking':
      return { status: 'checking' }
    case 'ready':
      return { status: 'ready' }
    case 'needs-setup':
    case 'failed':
    case 'dismissed':
    case 'setting-up':
      return { status: 'not-project', canSetUp: true }
    case 'missing':
      return { status: 'not-project', canSetUp: false }
    case 'unavailable':
      return { status: 'unknown' }
  }
}
