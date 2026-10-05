/** Per-folder NEXUS setup state and the HTTP carrier for the host status/init routes. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  NEXUS_SETUP_INIT_ROUTE, NEXUS_SETUP_STATUS_ROUTE,
  type NexusSetupInitRequest, type NexusSetupStatusPayload,
} from '@deepseek-ai/dsh-host-nexus-setup/shared'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/**
 * One folder's setup phase. Transitions:
 * - (absent) → `checking` → `ready` | `needs-setup` | `missing` | `unavailable`
 * - `needs-setup` | `failed` → `setting-up` → `ready` | `failed`
 * - `needs-setup` | `failed` → `dismissed` (this page life only)
 *
 * `unavailable` means the host has no setup routes or could not be reached;
 * the prompt then stays hidden instead of offering an action that cannot work.
 */
export type NexusSetupPhase =
  | 'checking' | 'ready' | 'needs-setup' | 'missing' | 'unavailable'
  | 'setting-up' | 'failed' | 'dismissed'

/** Phases keyed by absolute folder path. */
export type NexusSetupPhases = Readonly<Record<string, NexusSetupPhase>>

/**
 * Owns the once-per-folder status read and the setup POST. State publishes
 * through one uSES-safe source so every Session header showing the same
 * folder shares one truth.
 */
export class NexusSetupController {
  readonly phases: SnapshotStore<NexusSetupPhases> = createSnapshotStore<NexusSetupPhases>({})

  /** @param fetcher - HTTP carrier for the status read and the init POST. */
  constructor(private readonly fetcher: Fetch = (input, init) => fetch(input, init)) {}

  /**
   * Read one folder's status once per page life; later calls are no-ops.
   * @param path - absolute folder path.
   * @returns after the phase is published.
   */
  async check(path: string): Promise<void> {
    if (this.phases.getSnapshot()[path] !== undefined) return
    this.publish(path, 'checking')
    let phase: NexusSetupPhase = 'unavailable'
    try {
      const response = await this.fetcher(`${NEXUS_SETUP_STATUS_ROUTE}?path=${encodeURIComponent(path)}`, {
        headers: { accept: 'application/json' },
      })
      if (response.ok) {
        const { state } = await response.json() as Partial<NexusSetupStatusPayload>
        if (state === 'ready' || state === 'needs-setup' || state === 'missing') phase = state
      }
    } catch {
      // An unreachable host or a malformed answer reads as unavailable: no prompt.
    }
    this.publish(path, phase)
  }

  /**
   * Turn one folder into a NEXUS project.
   * @param path - absolute folder path currently offered for setup.
   * @returns true once the folder is a NEXUS project; false when setup failed or is not offered.
   */
  async setUp(path: string): Promise<boolean> {
    const current = this.phases.getSnapshot()[path]
    if (current !== 'needs-setup' && current !== 'failed') return current === 'ready'
    this.publish(path, 'setting-up')
    let ok = false
    try {
      const body: NexusSetupInitRequest = { path }
      const response = await this.fetcher(NEXUS_SETUP_INIT_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      ok = response.ok
    } catch {
      // A dropped connection is the same user-facing failure as a refusal.
    }
    this.publish(path, ok ? 'ready' : 'failed')
    return ok
  }

  /**
   * Hide the prompt for one folder until the page reloads.
   * @param path - absolute folder path currently offered for setup.
   */
  dismiss(path: string): void {
    const current = this.phases.getSnapshot()[path]
    if (current === 'needs-setup' || current === 'failed') this.publish(path, 'dismissed')
  }

  private publish(path: string, phase: NexusSetupPhase): void {
    this.phases.set({ ...this.phases.getSnapshot(), [path]: phase })
  }
}
