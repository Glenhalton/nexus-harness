// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { TerminalCommandsStatus, WelcomeApi, WelcomeOnboardingApi, WelcomeSaveResult } from '../src/welcome-api.ts'

afterEach(cleanup)

const offer: TerminalCommandsStatus = { installed: false, binDir: '/Users/me/.local/bin', commands: ['nexus', 'nexus-code'], needsNewTerminal: true }
const signedOut: AccountView = { links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null }

function mount(onboarding?: Partial<WelcomeOnboardingApi>, language = 'en') {
  const saveApiKey = vi.fn<(value: string) => Promise<WelcomeSaveResult>>().mockResolvedValue({ ok: true })
  const setUpFolder = vi.fn<WelcomeOnboardingApi['setUpFolder']>().mockResolvedValue({ ok: true })
  const api: WelcomeApi = {
    ...resolveDesktopLocale(language),
    onAccountState: vi.fn(() => () => {}),
    startSignIn: vi.fn(async () => signedOut),
    cancelSignIn: vi.fn(async () => signedOut),
    copySignInLink: vi.fn(async () => undefined),
    saveApiKey,
    skip: vi.fn(async () => undefined),
    ...onboarding === undefined ? {} : {
      onboarding: {
        chooseFolder: vi.fn().mockResolvedValue({ name: 'shop', path: '/Users/me/shop', state: 'needs-setup' }),
        setUpFolder,
        useFolder: vi.fn().mockResolvedValue({ ok: true }),
        terminalStatus: vi.fn().mockResolvedValue(offer),
        installTerminalCommands: vi.fn().mockResolvedValue({ ...offer, installed: true }),
        ...onboarding,
      },
    },
  }
  render(<Welcome api={api} />)
  const m = api.messages
  const visible = (id: string): boolean => {
    const element = document.getElementById(id)
    return element !== null && element.closest('[hidden]') === null
  }
  const click = async (id: string): Promise<void> => {
    await act(async () => { fireEvent.click(document.getElementById(id)!) })
  }
  const heading = (): string => document.getElementById(document.querySelector('main')!.getAttribute('aria-labelledby')!)!.textContent
  return { api, m, visible, click, heading, saveApiKey, setUpFolder }
}

describe('desktop welcome onboarding presentation', () => {
  it('opens at sign-in when the shell has no onboarding steps', () => {
    const view = mount()
    expect(view.heading()).toContain(view.m.welcomeTaglineBrand)
    expect(view.visible('sign-in')).toBe(true)
    expect(view.visible('choose-folder')).toBe(false)
  })

  it('walks folder → setup → terminal → sign-in with plain-language copy', async () => {
    const view = mount({})
    expect(view.heading()).toBe(view.m.welcomeFolderTitle)
    expect(view.visible('sign-in')).toBe(false)
    await view.click('choose-folder')
    expect(view.heading()).toBe(view.m.welcomeFolderSetupTitle)
    expect(document.getElementById('setup-folder')!.textContent).toBe('Selected: shop')
    expect(view.visible('setup-error')).toBe(false)
    await view.click('set-up-nexus')
    expect(view.setUpFolder).toHaveBeenCalledOnce()
    expect(view.heading()).toBe(view.m.welcomeTerminalTitle)
    expect(document.getElementById('terminal-description')!.textContent).toBe(view.m.welcomeTerminalDescription)
    expect(document.getElementById('terminal-description')!.textContent).toContain('No administrator password')
    expect(document.getElementById('add-commands')!.textContent).toBe(view.m.welcomeTerminalAdd)
    expect(document.getElementById('finish-terminal')!.textContent).toBe(view.m.welcomeTerminalSkip)
    await view.click('add-commands')
    expect(document.getElementById('terminal-description')!.textContent).toBe(view.m.welcomeTerminalDone)
    expect(view.visible('add-commands')).toBe(false)
    expect(document.getElementById('finish-terminal')!.textContent).toBe(view.m.welcomeOnboardingContinue)
    await view.click('finish-terminal')
    expect(view.visible('sign-in')).toBe(true)
    expect(view.visible('terminal-actions')).toBe(false)
  })

  it('shows friendly failures and the busy label while setting up', async () => {
    const pending = Promise.withResolvers<{ ok: boolean }>()
    const view = mount({
      setUpFolder: vi.fn().mockReturnValueOnce(pending.promise),
      installTerminalCommands: vi.fn().mockResolvedValue(null),
    })
    await view.click('choose-folder')
    await view.click('set-up-nexus')
    expect(document.getElementById('set-up-nexus')!.textContent).toBe(view.m.welcomeFolderSettingUp)
    expect((document.getElementById('skip-setup') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { pending.resolve({ ok: false }) })
    expect(view.visible('setup-error')).toBe(true)
    expect(document.getElementById('setup-error')!.textContent).toBe(view.m.welcomeFolderFailed)
    await view.click('choose-another')
    expect(view.heading()).toBe(view.m.welcomeFolderTitle)
    await view.click('skip-folder')
    await view.click('add-commands')
    expect(view.visible('terminal-error')).toBe(true)
  })

  it('tells a translocated macOS app to move into Applications instead of offering install', async () => {
    const view = mount({ terminalStatus: vi.fn().mockResolvedValue({ ...offer, blockedReason: 'translocated' }) })
    await view.click('skip-folder')
    expect(document.getElementById('terminal-description')!.textContent).toBe(
      'Move Nexus Harness into your Applications folder, then reopen it to add terminal commands.')
    expect(view.visible('add-commands')).toBe(false)
    expect(document.getElementById('finish-terminal')!.textContent).toBe(view.m.welcomeOnboardingContinue)
    await view.click('finish-terminal')
    expect(view.visible('sign-in')).toBe(true)
  })

  it('renders the Chinese copy', () => {
    const view = mount({}, 'zh-CN')
    expect(view.heading()).toBe('选择一个项目文件夹')
  })

  it.each([
    ['rejected', 'welcomeKeyRejected'],
    ['unreachable', 'welcomeKeyUnreachable'],
    [undefined, 'welcomeKeyFailed'],
  ] as const)('explains a %s key check on the form', async (reason, key) => {
    const view = mount()
    view.saveApiKey.mockResolvedValue(reason === undefined ? { ok: false } : { ok: false, reason })
    await view.click('api-key')
    fireEvent.change(document.querySelector('input')!, { target: { value: 'sk-typo' } })
    await act(async () => { fireEvent.submit(document.querySelector('form')!) })
    expect(document.getElementById('key-error')!.textContent).toBe(view.m[key])
  })
})
