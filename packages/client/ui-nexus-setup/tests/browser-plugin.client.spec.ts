/**
 * Browser-half lifecycle over the real SlotRegistry: dictionary and header
 * registrations, the injected controller face, and fiber teardown removal.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply, inject, type NexusSetupActionInjected } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { NexusSetupAction } from '../src/client/NexusSetupAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-nexus-setup browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'slots', 'locale'])
  })

  it('registers the header prompt with one stable face, and fiber teardown removes it', async () => {
    const fetcher = vi.fn(async (input: string | URL) => new Response(JSON.stringify(
      String(input).startsWith('nexus-setup/status') ? { state: 'needs-setup' } : { state: 'ready', created: true },
    )))
    vi.stubGlobal('fetch', fetcher)
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.session.header.utilities')[0]
    expect(entry?.component).toBe(NexusSetupAction)
    expect(entry?.options).toMatchObject({ id: 'nexus-setup' })
    const face = (entry?.inject as unknown as () => NexusSetupActionInjected)()
    expect((entry?.inject as unknown as () => NexusSetupActionInjected)()).toBe(face)
    await face.check('/w')
    expect(face.hooks.nexusSetupPhases.getSnapshot()['/w']).toBe('needs-setup')
    expect(await face.setUp('/w')).toBe(true)
    await face.check('/v')
    face.dismiss('/v')
    expect(face.hooks.nexusSetupPhases.getSnapshot()).toEqual({ '/w': 'ready', '/v': 'dismissed' })
    await fiber.dispose()
    expect(ctx.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
  })

  it('registers both dictionaries and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    ctx.locale.setLocale('zh')
    expect(translate('action.label')).toBe(zh['action.label'])
    ctx.locale.setLocale('en')
    expect(translate('dialog.title')).toBe(en['dialog.title'])
    await fiber.dispose()
    expect(translate('dialog.title')).not.toBe(en['dialog.title'])
  })

  it('keeps the dictionaries key-identical', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
