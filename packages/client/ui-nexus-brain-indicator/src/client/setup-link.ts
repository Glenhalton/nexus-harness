/**
 * Optional link to the `nexusSetup` service of `@deepseek-ai/dsh-client-ui-nexus-setup`.
 * The chip registers whether or not that plugin is loaded; this relay gives it
 * one stable observable and stable callbacks across the service coming and going.
 */

import { notifySubscribers, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { NexusSetupPhases, NexusSetupService } from '@deepseek-ai/dsh-client-ui-nexus-setup/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Relay over the optional setup service. */
export interface NexusSetupLink {
  /** Per-folder phases, or null while no setup service is available. */
  readonly phases: ObservableSnapshot<NexusSetupPhases | null>
  /**
   * Bind the live service; folders asked about before it arrived are read now.
   * @param service - the `nexusSetup` service.
   * @returns detach callback restoring the service-less state.
   */
  attach(service: NexusSetupService): () => void
  /**
   * Read one folder's status through the service (idempotent per folder).
   * @param path - absolute folder path.
   */
  check(path: string): void
  /**
   * Open the "Set up NEXUS" dialog in one Session's header.
   * @param sessionId - Session whose header shows the dialog.
   * @param path - absolute folder path of that Session.
   * @returns false when no service is bound or setup cannot be offered.
   */
  openSetup(sessionId: SessionId, path: string): boolean
}

/**
 * Create the relay owned by one plugin fiber.
 * @returns a detached link.
 */
export function createNexusSetupLink(): NexusSetupLink {
  let service: NexusSetupService | undefined
  const asked = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = (): void => { notifySubscribers(listeners, '[nexus-brain-indicator]') }

  return {
    phases: {
      getSnapshot: () => service?.phases.getSnapshot() ?? null,
      subscribe: (fn) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
    attach(next) {
      service = next
      const unsubscribe = next.phases.subscribe(notify)
      notify()
      for (const path of asked) void next.check(path)
      return () => {
        unsubscribe()
        if (service === next) service = undefined
        notify()
      }
    },
    check(path) {
      asked.add(path)
      if (service !== undefined) void service.check(path)
    },
    openSetup: (sessionId, path) => service?.openDialog(sessionId, path) ?? false,
  }
}
