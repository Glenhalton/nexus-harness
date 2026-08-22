/** Nexus occupants for the generic browser-brand slots. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NexusBrandMark, NexusBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill every shipped brand slot as one declaration-aware registration set.
 * Unlike the official package, this one has no build-profile gate: a
 * deployment composes at most one of the two brand packages, so activation
 * is a composition choice, not a runtime one.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, NexusBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, NexusBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, NexusBrandMark)
      })))
}
