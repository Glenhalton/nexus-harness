/**
 * Browser-half lifecycle over the real SlotRegistry: the chip registers with
 * or without the setup plugin, follows its `nexusSetup` service, and sees a
 * successful setup immediately.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import * as setupPlugin from '@deepseek-ai/dsh-client-ui-nexus-setup/client'
import { apply, extractBrainFromSession, inject } from '../src/client/index.ts'
import { NexusBrainStatusChip, type NexusBrainChipInjected } from '../src/client/NexusBrainStatusChip.tsx'
import { en, NS, zh } from '../src/client/locales.ts'
import { NexusPlanTab } from '../src/client/plan-tab/NexusPlanTab.tsx'
import { NexusPlanTitle } from '../src/client/plan-tab/NexusPlanTitle.tsx'
import { nexusPlanDefinition } from '../src/client/plan-tab/definition.tsx'
import { apply as nodeApply } from '../src/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A Session chat source carrying the given legacy nodes (null = no snapshot yet). */
function conversation(nodes: unknown[] | null, subscribe = vi.fn(() => () => {})) {
  return {
    binding: () => ({
      target: () => ({ getSnapshot: () => nodes === null ? null : { legacy: { nodes } }, subscribe }),
    }),
  }
}

const brainNode = (payload: unknown, shape: 'sections' | 'content' = 'sections') => {
  const text = `NEXUS brain context:\n${typeof payload === 'string' ? payload : JSON.stringify(payload)}`
  return shape === 'sections'
    ? { kind: 'context', source: { kind: 'nexus-brain-context', sections: [{ text }] } }
    : { kind: 'context', source: { kind: 'nexus-brain-context' }, content: [{ type: 'image' }, { type: 'text', text }] }
}

async function bench(withSetup: boolean, uiConversation: unknown = { binding: () => { throw new Error('no chat yet') } }) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sidebarRightTabs', { register: () => () => {} })
  const openTab = vi.fn()
  ctx.provide('sidebarRight', { openTab })
  ctx.provide('uiConversation', uiConversation)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const setup = withSetup ? ctx.plugin({ inject: [...setupPlugin.inject], apply: setupPlugin.apply }) : undefined
  await setup?.await()
  const chipFace = (): NexusBrainChipInjected => {
    const entry = ctx.slots.entries('conversation.session.header.utilities').find(e => e.options.id === 'nexus-brain-status')
    expect(entry?.component).toBe(NexusBrainStatusChip)
    return (entry?.inject as unknown as (sessionId: SessionId) => NexusBrainChipInjected)('s' as SessionId)
  }
  return { ctx, fiber, setup, chipFace, openTab }
}

describe('ui-nexus-brain-indicator browser half', () => {
  it('registers the chip without the setup plugin and reports no turn context', async () => {
    const { fiber, chipFace } = await bench(false)
    const face = chipFace()
    expect(face.hooks.nexusSetupPhases.getSnapshot()).toBeNull()
    expect(face.getBrainState('s' as SessionId)).toBeNull()
    expect(face.openSetup('s' as SessionId, '/w')).toBe(false)
    face.checkWorkspace('/w')
    await fiber.dispose()
  })

  it('follows the setup service: initial status, the dialog request, and the refresh after setup', async () => {
    let status = 'needs-setup'
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      if (String(input).startsWith('nexus-setup/status')) return new Response(JSON.stringify({ state: status }))
      status = 'ready'
      return new Response(JSON.stringify({ state: 'ready', created: true }))
    }))
    const { ctx, fiber, setup, chipFace } = await bench(true)
    const face = chipFace()
    const seen: unknown[] = []
    face.hooks.nexusSetupPhases.subscribe(() => { seen.push(face.hooks.nexusSetupPhases.getSnapshot()?.['/w']) })

    face.checkWorkspace('/w')
    await vi.waitFor(() => { expect(face.hooks.nexusSetupPhases.getSnapshot()?.['/w']).toBe('needs-setup') })
    expect(face.openSetup('s' as SessionId, '/w')).toBe(true)

    // The setup prompt's own header entry runs the init; the chip hears it at once.
    const setupFace = ctx.slots.entries('conversation.session.header.utilities')
      .find(e => e.options.id === 'nexus-setup')?.inject as unknown as () => { setUp: (path: string) => Promise<boolean> }
    expect(await setupFace().setUp('/w')).toBe(true)
    expect(face.hooks.nexusSetupPhases.getSnapshot()?.['/w']).toBe('ready')
    expect(seen).toEqual(['checking', 'needs-setup', 'setting-up', 'ready'])

    await setup?.dispose()
    expect(face.hooks.nexusSetupPhases.getSnapshot()).toBeNull()
    await fiber.dispose()
    expect(ctx.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
  })

  it('reads a folder asked about before the setup service arrived', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'ready' }))))
    const { ctx, fiber, chipFace } = await bench(false)
    const face = chipFace()
    face.checkWorkspace('/w')
    const setup = ctx.plugin({ inject: [...setupPlugin.inject], apply: setupPlugin.apply })
    await setup.await()
    await vi.waitFor(() => { expect(face.hooks.nexusSetupPhases.getSnapshot()?.['/w']).toBe('ready') })
    await fiber.dispose()
  })

  it('subscribes to the Session chat for turn updates, and tolerates a missing binding', async () => {
    const subscribe = vi.fn(() => () => {})
    const live = await bench(false, conversation([], subscribe))
    const callback = vi.fn()
    live.chipFace().subscribeBrainState('s' as SessionId, callback)
    expect(subscribe).toHaveBeenCalledWith(callback)
    await live.fiber.dispose()
    const absent = await bench(false)
    expect(() => { absent.chipFace().subscribeBrainState('s' as SessionId, vi.fn())() }).not.toThrow()
    await absent.fiber.dispose()
  })

  it('serves the plan tab from the same turn context, and removes it with the fiber', async () => {
    const { ctx, fiber } = await bench(false, conversation([brainNode({ plan: { id: '3', steps: [{ text: 'a', done: true }] } })]))
    const body = ctx.slots.entries('sidebar.right.pane.tab')[0]
    expect(body?.component).toBe(NexusPlanTab)
    expect(ctx.slots.entries('sidebar.right.pane.tab.title')[0]?.component).toBe(NexusPlanTitle)
    const tab = (body?.inject as unknown as (sessionId: SessionId) => { getActivePlan: () => unknown })('s' as SessionId)
    expect(tab.getActivePlan()).toEqual({ id: '3', title: 'Plan #3', status: 'in_progress', nextStep: null, steps: [{ text: 'a', done: true }] })
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
  })

  it('opens the plan tab through the right sidebar, ignoring an unmounted sidebar', async () => {
    const { fiber, chipFace, openTab } = await bench(false)
    chipFace().openPlanTab()
    expect(openTab).toHaveBeenCalledWith('nexus-plan')
    openTab.mockImplementation(() => { throw new Error('unmounted') })
    expect(() => { chipFace().openPlanTab() }).not.toThrow()
    await fiber.dispose()
  })

  it('declares a plan tab type whose copy comes from the dictionary, and keeps an inert node half', () => {
    const t = ((key: keyof typeof en) => en[key]) as Parameters<typeof nexusPlanDefinition>[0]
    const definition = nexusPlanDefinition(t)
    expect(definition.title('nexus-plan')).toBe(en['tab.title'])
    expect(definition.guide?.[0]?.title()).toBe(en['tab.guide.title'])
    expect(definition.guide?.[0]?.description?.()).toBe(en['tab.guide.description'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers key-identical dictionaries', async () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    const { ctx, fiber } = await bench(false)
    const translate = ctx.locale.bind(NS)
    ctx.locale.setLocale('zh')
    expect(translate('chip.notProject')).toBe(zh['chip.notProject'])
    ctx.locale.setLocale('en')
    expect(translate('chip.notProject')).toBe(en['chip.notProject'])
    await fiber.dispose()
  })
})

describe('extractBrainFromSession', () => {
  const extract = (nodes: unknown[] | null) => {
    const ctx = new Context()
    ctx.provide('uiConversation', conversation(nodes))
    return extractBrainFromSession(ctx, 's' as SessionId)
  }

  it('reports no turn context before the chat exists or carries NEXUS context', () => {
    expect(extract(null)).toEqual({ state: null, planData: null })
    expect(extract([undefined, { kind: 'user' }, { kind: 'context', source: { kind: 'other' } }])).toEqual({ state: null, planData: null })
    const ctx = new Context()
    ctx.provide('uiConversation', { binding: () => { throw new Error('gone') } })
    expect(extractBrainFromSession(ctx, 's' as SessionId)).toEqual({ state: null, planData: null })
  })

  it('reads plan and vitals from the latest NEXUS context', () => {
    const result = extract([
      brainNode({ plan: { id: 'old' } }),
      brainNode({
        plan: { id: '42', title: 'Ship it', status: 'in_progress', nextStep: 'Write tests', steps: [{ text: 'Write tests', done: false }] },
        vitals: { branch: 'main', dirty: false, testsSummary: '10 passed' },
      }),
    ])
    expect(result.state).toEqual({
      status: 'synced', planId: '42', planStatus: 'in_progress', planNextStep: 'Write tests',
      branch: 'main', dirty: false, testsSummary: '10 passed',
    })
    expect(result.planData).toEqual({
      id: '42', title: 'Ship it', status: 'in_progress', nextStep: 'Write tests', steps: [{ text: 'Write tests', done: false }],
    })
  })

  it('reads text content blocks, reports drift, and derives a one-step checklist from the next step', () => {
    const result = extract([brainNode({ plan: { id: '7', nextStep: 'Next' }, vitals: { dirty: true } }, 'content')])
    expect(result.state).toEqual({ status: 'drift', planId: '7', planNextStep: 'Next', dirty: true })
    expect(result.planData?.steps).toEqual([{ text: 'Next', done: false }])
  })

  it('is synced without a plan, and has no plan data for a plan without an id', () => {
    expect(extract([brainNode({})])).toEqual({ state: { status: 'synced' }, planData: null })
    expect(extract([brainNode({ plan: { title: 'x' } })]).planData).toBeNull()
    expect(extract([brainNode({ plan: { id: '1' } })]).planData?.steps).toEqual([])
  })

  it('skips context it cannot parse and keeps looking further back', () => {
    const older = brainNode({ vitals: { branch: 'dev' } })
    expect(extract([older, brainNode('{ not json }')]).state).toEqual({ status: 'synced', branch: 'dev' })
    expect(extract([brainNode('no payload')]).state).toBeNull()
    expect(extract([{ kind: 'context', source: { kind: 'nexus-brain-context', sections: [] } }]).state).toBeNull()
  })
})
