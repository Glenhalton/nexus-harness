/**
 * Pre-sign-in onboarding steps of the desktop welcome: choose a project
 * folder, set NEXUS up in it when it has no `.nexus/`, then offer terminal
 * commands. React-free so the step logic is testable without rendering.
 *
 * Flow: `folder` → (`setup` when the folder needs NEXUS) → `terminal` (only
 * when this shell can add commands and they are not already installed) →
 * `auth` (the existing sign-in / API-key pages).
 */

import type { TerminalCommandsStatus, WelcomeFolderChoice, WelcomeOnboardingApi } from '../welcome-api.ts'

/** One rendered onboarding step. */
export type OnboardingState =
  | { readonly page: 'folder'; readonly busy: boolean }
  | { readonly page: 'setup'; readonly folder: WelcomeFolderChoice; readonly phase: 'idle' | 'working' | 'failed' }
  | { readonly page: 'terminal'; readonly status: TerminalCommandsStatus; readonly phase: 'idle' | 'working' | 'done' | 'failed' }
  | { readonly page: 'auth' }

/** Steps after the folder decision run in this order; each failure degrades to the next step. */
export class WelcomeOnboarding {
  private state: OnboardingState = { page: 'folder', busy: false }
  private readonly listeners = new Set<() => void>()

  /** @param api - preload operations; every rejection is treated as that step's failure. */
  constructor(private readonly api: WelcomeOnboardingApi) {}

  /** @returns the current step (stable reference until the next transition). */
  getSnapshot = (): OnboardingState => this.state

  /** @param listener - transition recipient. @returns unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Open the native folder dialog; a ready or unknown folder is used without offering setup. */
  async chooseFolder(): Promise<void> {
    if (this.state.page !== 'folder' || this.state.busy) return
    this.set({ page: 'folder', busy: true })
    let folder: WelcomeFolderChoice | null = null
    try {
      folder = await this.api.chooseFolder()
    } catch {
      folder = null
    }
    if (folder === null) {
      this.set({ page: 'folder', busy: false })
      return
    }
    if (folder.state === 'needs-setup') {
      this.set({ page: 'setup', folder, phase: 'idle' })
      return
    }
    await this.useFolderAndContinue()
  }

  /** Continue without a folder. */
  async skipFolder(): Promise<void> {
    if (this.state.page !== 'folder' || this.state.busy) return
    this.set({ page: 'folder', busy: true })
    await this.toTerminal()
  }

  /** Scaffold NEXUS in the chosen folder; a failure keeps the step with friendly copy. */
  async setUp(): Promise<void> {
    const current = this.state
    if (current.page !== 'setup' || current.phase === 'working') return
    this.set({ ...current, phase: 'working' })
    let ok = false
    try {
      ok = (await this.api.setUpFolder()).ok
    } catch {
      ok = false
    }
    if (!ok) {
      this.set({ ...current, phase: 'failed' })
      return
    }
    await this.useFolderAndContinue()
  }

  /** Use the chosen folder without NEXUS. */
  async skipSetup(): Promise<void> {
    const current = this.state
    if (current.page !== 'setup' || current.phase === 'working') return
    this.set({ ...current, phase: 'working' })
    await this.useFolderAndContinue()
  }

  /** Return to the folder step. */
  chooseAnother(): void {
    if (this.state.page === 'setup' && this.state.phase !== 'working') this.set({ page: 'folder', busy: false })
  }

  /** Add terminal commands; refused while macOS runs the app from a translocated location. */
  async addCommands(): Promise<void> {
    const current = this.state
    if (current.page !== 'terminal' || current.phase === 'working' || current.phase === 'done'
      || current.status.blockedReason !== undefined) return
    this.set({ ...current, phase: 'working' })
    let status: TerminalCommandsStatus | null = null
    try {
      status = await this.api.installTerminalCommands()
    } catch {
      status = null
    }
    this.set(status === null || !status.installed
      ? { ...current, status: status ?? current.status, phase: 'failed' }
      : { page: 'terminal', status, phase: 'done' })
  }

  /** Leave the terminal step (skip or continue after adding). */
  finishTerminal(): void {
    if (this.state.page === 'terminal' && this.state.phase !== 'working') this.set({ page: 'auth' })
  }

  private async useFolderAndContinue(): Promise<void> {
    try {
      // A folder that could not be added stays reachable from the workspace picker; onboarding goes on.
      await this.api.useFolder()
    } catch {
      // Same as a refused add.
    }
    await this.toTerminal()
  }

  private async toTerminal(): Promise<void> {
    let status: TerminalCommandsStatus | null = null
    try {
      status = await this.api.terminalStatus()
    } catch {
      status = null
    }
    this.set(status === null || (status.installed && status.blockedReason === undefined)
      ? { page: 'auth' }
      : { page: 'terminal', status, phase: 'idle' })
  }

  private set(next: OnboardingState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }
}
