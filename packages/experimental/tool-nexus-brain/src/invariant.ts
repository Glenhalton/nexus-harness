/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-experimental-tool-nexus-brain`.
 * @module @deepseek-ai/dsh-experimental-tool-nexus-brain/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-tool-nexus-brain'

/** Cordis companion plugin name. */
export const name = 'tool-nexus-brain-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every `nexus_*` tool call and result is already
 * validated call/result data owned by the tool registry (`@deepseek-ai/dsh-tools`).
 * This package writes no durable session events of its own — it delegates
 * every read and write to `@nexus-framework/cli`'s own filesystem-backed
 * `.nexus/` brain, which is outside the event-sourced session log this
 * invariant system governs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
