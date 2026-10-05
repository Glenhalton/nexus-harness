/**
 * One-click NEXUS setup for the session's folder: a Session-header action
 * shown only while the folder has no `.nexus/`, backed by the host routes of
 * `@deepseek-ai/dsh-host-nexus-setup`. A host without those routes renders
 * nothing.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { NexusSetupController } from './controller.ts'
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

/** Required services: sessions, the slot registry, and copy. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the header setup prompt.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new NexusSetupController()
  // One face for every header: stable callback identities keep the
  // component's status-read effect from re-running on each render.
  const face: NexusSetupActionInjected = {
    hooks: { nexusSetupPhases: controller.phases },
    check: path => controller.check(path),
    setUp: path => controller.setUp(path),
    dismiss: (path) => { controller.dismiss(path) },
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'nexus-setup: dictionaries')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'nexus-setup',
    order: -6,
    locale: NS,
    inject: (): NexusSetupActionInjected => face,
  }, NexusSetupAction))
}
