/** The chip's status decision and the relay over the optional setup service. */

import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { NexusSetupPhases, NexusSetupService } from '@deepseek-ai/dsh-client-ui-nexus-setup/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveBrainState, type TurnBrainState } from '../src/client/brain-status.ts'
import { createNexusSetupLink } from '../src/client/setup-link.ts'

describe('resolveBrainState', () => {
  it.each([
    [undefined, { status: 'checking' }],
    ['checking', { status: 'checking' }],
    ['ready', { status: 'ready' }],
    ['needs-setup', { status: 'not-project', canSetUp: true }],
    ['failed', { status: 'not-project', canSetUp: true }],
    ['dismissed', { status: 'not-project', canSetUp: true }],
    ['setting-up', { status: 'not-project', canSetUp: true }],
    ['missing', { status: 'not-project', canSetUp: false }],
    ['unavailable', { status: 'unknown' }],
    [null, { status: 'unknown' }],
  ] as const)('maps folder phase %s before any turn', (phase, expected) => {
    expect(resolveBrainState(null, '/w', phase)).toEqual(expected)
  })

  it('is unknown without a folder', () => {
    expect(resolveBrainState(null, undefined, 'ready')).toEqual({ status: 'unknown' })
    expect(resolveBrainState(null, '', 'ready')).toEqual({ status: 'unknown' })
  })

  it('lets turn context win once a turn carried it', () => {
    const turn: TurnBrainState = { status: 'synced', planId: '7' }
    expect(resolveBrainState(turn, '/w', 'needs-setup')).toBe(turn)
    expect(resolveBrainState(turn, undefined, null)).toBe(turn)
  })
})

function fakeService(initial: NexusSetupPhases = {}) {
  const phases = createSnapshotStore<NexusSetupPhases>(initial)
  const check = vi.fn(async (_path: string) => {})
  const openDialog = vi.fn((_sessionId: SessionId, _path: string) => true)
  const service: NexusSetupService = { phases, check, openDialog }
  return { phases, service, check, openDialog }
}

describe('createNexusSetupLink', () => {
  it('reads as no service until attached, then relays the service and re-asks pending folders', () => {
    const link = createNexusSetupLink()
    expect(link.phases.getSnapshot()).toBeNull()
    expect(link.openSetup('s' as SessionId, '/w')).toBe(false)
    link.check('/w')

    const listener = vi.fn()
    link.phases.subscribe(listener)
    const { phases, service, check, openDialog } = fakeService({ '/w': 'needs-setup' })
    const detach = link.attach(service)
    expect(listener).toHaveBeenCalledOnce()
    expect(check).toHaveBeenCalledWith('/w')
    expect(link.phases.getSnapshot()).toBe(phases.getSnapshot())

    phases.set({ '/w': 'ready' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(link.phases.getSnapshot()).toEqual({ '/w': 'ready' })

    link.check('/v')
    expect(check).toHaveBeenLastCalledWith('/v')
    expect(link.openSetup('s' as SessionId, '/w')).toBe(true)
    expect(openDialog).toHaveBeenCalledWith('s', '/w')

    detach()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(link.phases.getSnapshot()).toBeNull()
    phases.set({ '/w': 'needs-setup' })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('keeps a newer service when an older one detaches late', () => {
    const link = createNexusSetupLink()
    const first = fakeService({ '/a': 'ready' })
    const second = fakeService({ '/b': 'ready' })
    const detachFirst = link.attach(first.service)
    link.attach(second.service)
    detachFirst()
    expect(link.phases.getSnapshot()).toEqual({ '/b': 'ready' })
  })

  it('stops notifying an unsubscribed listener', () => {
    const link = createNexusSetupLink()
    const listener = vi.fn()
    link.phases.subscribe(listener)()
    link.attach(fakeService().service)
    expect(listener).not.toHaveBeenCalled()
  })
})
