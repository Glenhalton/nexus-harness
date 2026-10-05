/**
 * One-click NEXUS setup for the session's folder: a Session-header action
 * shown only while the folder has no `.nexus/`, backed by the host routes of
 * `@deepseek-ai/dsh-host-nexus-setup`. A host without those routes renders
 * nothing.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { NexusSetupController, type NexusSetupPhases } from './controller.ts'
import { NexusSetupAction, type NexusSetupActionInjected } from './NexusSetupAction.tsx'
import { en, NS, zh, type NexusSetupKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header NEXUS setup prompt copy. */
    'nexus-setup': NexusSetupKey
  }
}

export type { NexusSetupActionInjected, NexusSetupActionProps } from './NexusSetupAction.tsx'
export type { NexusSetupPhase, NexusSetupPhases } from './controller.ts'

/**
 * Per-folder NEXUS setup state shared with other browser plugins (the brain
 * status chip reads it so it can tell a NEXUS project from a plain folder
 * before any turn, and refresh the moment setup succeeds).
 */
export interface NexusSetupService {
  /** Setup phase per absolute folder path; republished on every transition, including a successful setup. */
  readonly phases: ObservableSnapshot<NexusSetupPhases>
  /**
   * Read one folder's status (once per page life; later calls are no-ops).
   * @param path - absolute folder path.
   */
  check(path: string): Promise<void>
  /**
   * Open the existing "Set up NEXUS" dialog in one Session's header.
   * @param sessionId - Session whose header shows the dialog.
   * @param path - absolute folder path of that Session.
   * @returns false when setup cannot be offered for the folder.
   */
  openDialog(sessionId: SessionId, path: string): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    nexusSetup: NexusSetupService
  }
}

/** Required services: sessions, the slot registry, and copy. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries, the header setup prompt, and
 * the `nexusSetup` service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new NexusSetupController()
  // One face for every header: stable callback identities keep the
  // component's status-read effect from re-running on each render.
  const face: NexusSetupActionInjected = {
    hooks: { nexusSetupPhases: controller.phases, nexusSetupDialog: controller.dialog },
    check: path => controller.check(path),
    setUp: path => controller.setUp(path),
    dismiss: (path) => { controller.dismiss(path) },
    openDialog: (sessionId, path) => { controller.openDialog(sessionId, path) },
    closeDialog: (sessionId) => { controller.closeDialog(sessionId) },
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'nexus-setup: dictionaries')
  const service: NexusSetupService = {
    phases: controller.phases,
    check: path => controller.check(path),
    openDialog: (sessionId, path) => controller.openDialog(sessionId, path),
  }
  ctx.provide('nexusSetup', service)
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'nexus-setup',
    order: -6,
    locale: NS,
    inject: (): NexusSetupActionInjected => face,
  }, NexusSetupAction))
}
