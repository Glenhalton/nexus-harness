// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NexusSetupController, type NexusSetupPhases } from '../src/client/controller.ts'
import { NexusSetupAction, type NexusSetupActionProps } from '../src/client/NexusSetupAction.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = 'session' as SessionId
const t: NexusSetupActionProps['t'] = makeTranslate(en)

/** Render the action over a real controller whose phases the test drives. */
function bench(cwd: string | undefined, phases: NexusSetupPhases, setUpResult = true) {
  const state: SessionListState = {
    ids: [SESSION],
    byId: cwd === undefined ? {} : { [SESSION]: { id: SESSION, displayTitle: 'W', cwd, running: false, retainedBy: {}, blank: false, updatedAt: 0 } },
    phase: 'ready',
    projectionsBySession: {},
  }
  const controller = new NexusSetupController(vi.fn())
  controller.phases.set(phases)
  const check = vi.fn(async () => {})
  const gate = Promise.withResolvers<boolean>()
  const setUp = vi.fn(async (path: string) => {
    controller.phases.set({ ...controller.phases.getSnapshot(), [path]: 'setting-up' })
    const ok = await gate.promise
    controller.phases.set({ ...controller.phases.getSnapshot(), [path]: ok ? 'ready' : 'failed' })
    return ok
  })
  const dismiss = vi.fn((path: string) => { controller.phases.set({ ...controller.phases.getSnapshot(), [path]: 'dismissed' }) })
  const openDialog = vi.fn((sessionId: SessionId, path: string) => { controller.openDialog(sessionId, path) })
  const closeDialog = vi.fn((sessionId: SessionId) => { controller.closeDialog(sessionId) })
  const props = (): NexusSetupActionProps => ({
    sessionId: SESSION,
    useSessions: <T,>(select: (snapshot: SessionListState) => T): T => select(state),
    useNexusSetupPhases: <T,>(select: (value: NexusSetupPhases) => T): T => select(controller.phases.getSnapshot()),
    useNexusSetupDialog: <T,>(select: (value: SessionId | null) => T): T => select(controller.dialog.getSnapshot()),
    hooks: { nexusSetupPhases: controller.phases, nexusSetupDialog: controller.dialog },
    check, setUp, dismiss, openDialog, closeDialog, t,
  } as unknown as NexusSetupActionProps)
  const view = render(<NexusSetupAction {...props()} />)
  const rerender = (): void => { view.rerender(<NexusSetupAction {...props()} />) }
  controller.phases.subscribe(rerender)
  controller.dialog.subscribe(rerender)
  return { view, controller, check, setUp, dismiss, gate, settle: (ok = setUpResult) => { gate.resolve(ok) } }
}

describe('NexusSetupAction', () => {
  it('checks the folder and renders nothing unless setup is offered', () => {
    for (const phase of [undefined, 'checking', 'ready', 'missing', 'unavailable', 'dismissed'] as const) {
      const { view, check } = bench('/w', phase === undefined ? {} : { '/w': phase })
      expect(view.container.innerHTML).toBe('')
      expect(check).toHaveBeenCalledWith('/w')
      cleanup()
    }
    for (const cwd of [undefined, '']) {
      const { view, check } = bench(cwd, {})
      expect(view.container.innerHTML).toBe('')
      expect(check).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('opens a plain-language dialog and sets the folder up in one click', async () => {
    const { setUp, settle } = bench('/home/me/shop', { '/home/me/shop': 'needs-setup' })
    fireEvent.click(screen.getByRole('button', { name: en['action.label'] }))
    expect(screen.getByRole('dialog', { name: en['dialog.title'] })).toBeTruthy()
    expect(screen.getByText(en['dialog.body'])).toBeTruthy()
    expect(screen.getByText('Folder: /home/me/shop')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.confirm'] }))
    expect(setUp).toHaveBeenCalledWith('/home/me/shop')
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.working'] }).hasAttribute('disabled')).toBe(true)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.later'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    await act(async () => { settle(true) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: en['action.label'] })).toBeNull()
  })

  it('keeps the dialog open with friendly copy when setup fails', async () => {
    const { settle } = bench('/w', { '/w': 'needs-setup' })
    fireEvent.click(screen.getByRole('button', { name: en['action.label'] }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.confirm'] }))
    await act(async () => { settle(false) })
    expect(screen.getByRole('alert').textContent).toBe(en['dialog.failed'])
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.confirm'] }).hasAttribute('disabled')).toBe(false)
  })

  it('closes on Escape and hides the prompt on "Not now"', () => {
    const { dismiss } = bench('/w', { '/w': 'needs-setup' })
    fireEvent.click(screen.getByRole('button', { name: en['action.label'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['action.label'] }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en['dialog.later'] }))
    expect(dismiss).toHaveBeenCalledWith('/w')
    expect(screen.queryByRole('button', { name: en['action.label'] })).toBeNull()
  })

  it('opens when another surface asks for this Session, and only for this Session', () => {
    const { controller } = bench('/w', { '/w': 'dismissed' })
    expect(screen.queryByRole('button', { name: en['action.label'] })).toBeNull()
    act(() => { controller.openDialog('other' as SessionId, '/w') })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { controller.openDialog(SESSION, '/w') })
    expect(screen.getByRole('dialog', { name: en['dialog.title'] })).toBeTruthy()
    // The header button is back beside the dialog's own confirm button.
    expect(screen.getAllByRole('button', { name: en['action.label'] })).toHaveLength(2)
  })
})
