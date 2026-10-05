/** Pre-sign-in onboarding state machine: folder → setup → terminal → auth, with every failure degrading forward. */
import { describe, expect, it, vi } from 'vitest'
import { WelcomeOnboarding } from '../src/client/welcome-onboarding.ts'
import type { TerminalCommandsStatus, WelcomeFolderChoice, WelcomeOnboardingApi } from '../src/welcome-api.ts'

const offer: TerminalCommandsStatus = { installed: false, binDir: '/Users/me/.local/bin', commands: ['nexus', 'nexus-code'], needsNewTerminal: true }
const folder = (state: WelcomeFolderChoice['state']): WelcomeFolderChoice => ({ name: 'shop', path: '/Users/me/shop', state })

function api(over: Partial<WelcomeOnboardingApi> = {}) {
  return {
    chooseFolder: vi.fn<WelcomeOnboardingApi['chooseFolder']>().mockResolvedValue(folder('needs-setup')),
    setUpFolder: vi.fn<WelcomeOnboardingApi['setUpFolder']>().mockResolvedValue({ ok: true }),
    useFolder: vi.fn<WelcomeOnboardingApi['useFolder']>().mockResolvedValue({ ok: true }),
    terminalStatus: vi.fn<WelcomeOnboardingApi['terminalStatus']>().mockResolvedValue(offer),
    installTerminalCommands: vi.fn<WelcomeOnboardingApi['installTerminalCommands']>().mockResolvedValue({ ...offer, installed: true }),
    ...over,
  }
}

describe('WelcomeOnboarding', () => {
  it('walks a folder without NEXUS through setup, terminal commands, and on to sign-in', async () => {
    const ops = api()
    const flow = new WelcomeOnboarding(ops)
    const seen: string[] = []
    flow.subscribe(() => { seen.push(flow.getSnapshot().page) })
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: false })
    await flow.chooseFolder()
    expect(flow.getSnapshot()).toEqual({ page: 'setup', folder: folder('needs-setup'), phase: 'idle' })
    await flow.setUp()
    expect(ops.setUpFolder).toHaveBeenCalledOnce()
    expect(ops.useFolder).toHaveBeenCalledOnce()
    expect(flow.getSnapshot()).toEqual({ page: 'terminal', status: offer, phase: 'idle' })
    await flow.addCommands()
    expect(flow.getSnapshot()).toEqual({ page: 'terminal', status: { ...offer, installed: true }, phase: 'done' })
    flow.finishTerminal()
    expect(flow.getSnapshot()).toEqual({ page: 'auth' })
    expect(seen).toEqual(['folder', 'setup', 'setup', 'terminal', 'terminal', 'terminal', 'auth'])
  })

  it.each(['ready', 'unknown'] as const)('uses a %s folder without offering setup', async (state) => {
    const ops = api({ chooseFolder: vi.fn().mockResolvedValue(folder(state)) })
    const flow = new WelcomeOnboarding(ops)
    await flow.chooseFolder()
    expect(ops.setUpFolder).not.toHaveBeenCalled()
    expect(ops.useFolder).toHaveBeenCalledOnce()
    expect(flow.getSnapshot().page).toBe('terminal')
  })

  it('stays on the folder step when the dialog is cancelled or fails, and ignores a second click', async () => {
    const pending = Promise.withResolvers<WelcomeFolderChoice | null>()
    const ops = api({ chooseFolder: vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('x')) })
    const flow = new WelcomeOnboarding(ops)
    const first = flow.chooseFolder()
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: true })
    await flow.chooseFolder()
    await flow.skipFolder()
    pending.resolve(null)
    await first
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: false })
    await flow.chooseFolder()
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: false })
    expect(ops.chooseFolder).toHaveBeenCalledTimes(2)
  })

  it('keeps the setup step with a failure, retries, and can skip setup or choose another folder', async () => {
    const ops = api({ setUpFolder: vi.fn().mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('x')) })
    const flow = new WelcomeOnboarding(ops)
    await flow.chooseFolder()
    await flow.setUp()
    expect(flow.getSnapshot()).toMatchObject({ page: 'setup', phase: 'failed' })
    await flow.setUp()
    expect(flow.getSnapshot()).toMatchObject({ page: 'setup', phase: 'failed' })
    flow.chooseAnother()
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: false })
    await flow.chooseFolder()
    await flow.skipSetup()
    expect(ops.useFolder).toHaveBeenCalledOnce()
    expect(flow.getSnapshot().page).toBe('terminal')
  })

  it('ignores setup actions while setup is working', async () => {
    const pending = Promise.withResolvers<{ ok: boolean }>()
    const ops = api({ setUpFolder: vi.fn().mockReturnValue(pending.promise) })
    const flow = new WelcomeOnboarding(ops)
    await flow.chooseFolder()
    const running = flow.setUp()
    await flow.setUp()
    await flow.skipSetup()
    flow.chooseAnother()
    expect(flow.getSnapshot()).toMatchObject({ page: 'setup', phase: 'working' })
    pending.resolve({ ok: true })
    await running
    expect(ops.setUpFolder).toHaveBeenCalledOnce()
    expect(flow.getSnapshot().page).toBe('terminal')
  })

  it('continues when the folder cannot be added to the workspace list', async () => {
    const flow = new WelcomeOnboarding(api({ useFolder: vi.fn().mockRejectedValue(new Error('x')) }))
    await flow.chooseFolder()
    await flow.setUp()
    expect(flow.getSnapshot().page).toBe('terminal')
  })

  it.each([
    ['the channel is not registered', vi.fn().mockResolvedValue(null)],
    ['the status read throws', vi.fn().mockRejectedValue(new Error('No handler registered'))],
    ['commands are already installed', vi.fn().mockResolvedValue({ ...offer, installed: true })],
  ])('skips the terminal step when %s', async (_name, terminalStatus) => {
    const flow = new WelcomeOnboarding(api({ terminalStatus }))
    await flow.skipFolder()
    expect(flow.getSnapshot()).toEqual({ page: 'auth' })
  })

  it('shows a translocated app the move-to-Applications step and never installs', async () => {
    const blocked: TerminalCommandsStatus = { ...offer, blockedReason: 'translocated' }
    const ops = api({ terminalStatus: vi.fn().mockResolvedValue(blocked) })
    const flow = new WelcomeOnboarding(ops)
    await flow.skipFolder()
    expect(flow.getSnapshot()).toEqual({ page: 'terminal', status: blocked, phase: 'idle' })
    await flow.addCommands()
    expect(ops.installTerminalCommands).not.toHaveBeenCalled()
    flow.finishTerminal()
    expect(flow.getSnapshot()).toEqual({ page: 'auth' })
  })

  it('reports a failed install, allows retry, and holds the step while installing', async () => {
    const pending = Promise.withResolvers<TerminalCommandsStatus | null>()
    const ops = api({
      installTerminalCommands: vi.fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValueOnce({ ...offer, installed: false })
        .mockReturnValueOnce(pending.promise),
    })
    const flow = new WelcomeOnboarding(ops)
    await flow.skipFolder()
    for (let attempt = 0; attempt < 3; attempt++) {
      await flow.addCommands()
      expect(flow.getSnapshot()).toMatchObject({ page: 'terminal', phase: 'failed' })
    }
    const running = flow.addCommands()
    flow.finishTerminal()
    await flow.addCommands()
    expect(flow.getSnapshot()).toMatchObject({ phase: 'working' })
    pending.resolve({ ...offer, installed: true })
    await running
    await flow.addCommands()
    expect(ops.installTerminalCommands).toHaveBeenCalledTimes(4)
    expect(flow.getSnapshot()).toMatchObject({ phase: 'done' })
  })

  it('ignores actions that do not belong to the current step, and unsubscribes', async () => {
    const ops = api()
    const flow = new WelcomeOnboarding(ops)
    const listener = vi.fn()
    flow.subscribe(listener)()
    await flow.setUp()
    await flow.skipSetup()
    await flow.addCommands()
    flow.finishTerminal()
    flow.chooseAnother()
    expect(flow.getSnapshot()).toEqual({ page: 'folder', busy: false })
    expect(listener).not.toHaveBeenCalled()
    await flow.skipFolder()
    flow.finishTerminal()
    await flow.chooseFolder()
    await flow.skipFolder()
    expect(ops.chooseFolder).not.toHaveBeenCalled()
  })
})
