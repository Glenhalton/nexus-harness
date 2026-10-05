/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  chooseFolder: 'dsh-welcome:choose-folder',
  setUpFolder: 'dsh-welcome:set-up-folder',
  useFolder: 'dsh-welcome:use-folder',
} as const

/**
 * Application-lifetime terminal-command channels owned by the Desktop main
 * process (`terminal-commands.ts`). Each returns {@link TerminalCommandsStatus};
 * an older shell without them rejects the invoke, and the welcome hides its step.
 */
export const TERMINAL_COMMANDS_IPC = {
  status: 'nexus:terminal-commands:status',
  install: 'nexus:terminal-commands:install',
  remove: 'nexus:terminal-commands:remove',
} as const

/**
 * Local copy of the main-process terminal-commands status, kept here so the
 * welcome renderer does not depend on the module that implements it.
 * `blockedReason: 'translocated'` means macOS is running the app from the
 * disk image or Downloads, where commands cannot be added until it is moved
 * into Applications.
 */
export interface TerminalCommandsStatus {
  readonly installed: boolean
  readonly binDir: string
  readonly commands: readonly string[]
  readonly needsNewTerminal: boolean
  readonly blockedReason?: 'translocated'
}

/**
 * Credential writes return a safe outcome without exposing Host diagnostics.
 * `reason` names a failed connection check: the provider refused the key, or
 * could not be reached to check it. Absent, the write itself failed.
 */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false; readonly reason?: 'rejected' | 'unreachable' }

/**
 * One chosen project folder. `state` is the NEXUS setup state the Host
 * reported; `unknown` when the Host could not answer, in which case the
 * folder is used without offering setup.
 */
export interface WelcomeFolderChoice {
  readonly name: string
  readonly path: string
  readonly state: 'ready' | 'needs-setup' | 'unknown'
}

/** Outcome of a folder action; diagnostics stay in the main process. */
export interface WelcomeFolderResult {
  readonly ok: boolean
}

/**
 * Main-process folder operations behind the welcome's project step. They
 * always act on the folder the native dialog last returned to this window;
 * the renderer never supplies a path.
 */
export interface WelcomeFolderOperations {
  /** @param path - picked absolute folder. @returns its NEXUS state, or `unknown` when the Host cannot answer. */
  folderState(path: string): Promise<WelcomeFolderChoice['state']>
  /** @param path - picked absolute folder. @returns whether `.nexus/` now exists. */
  setUpFolder(path: string): Promise<WelcomeFolderResult>
  /** @param path - picked absolute folder. @returns whether it was added to the workspace list. */
  useFolder(path: string): Promise<WelcomeFolderResult>
}

/** Onboarding steps the renderer shows before sign-in; absent in shells that predate them. */
export interface WelcomeOnboardingApi {
  /** @returns the picked folder and its state, or null when the dialog was cancelled. */
  chooseFolder(): Promise<WelcomeFolderChoice | null>
  /** Scaffold NEXUS in the picked folder. */
  setUpFolder(): Promise<WelcomeFolderResult>
  /** Add the picked folder to the workspace list. */
  useFolder(): Promise<WelcomeFolderResult>
  /** @returns terminal-command status, or null when this shell cannot add commands. */
  terminalStatus(): Promise<TerminalCommandsStatus | null>
  /** @returns the status after installing, or null when installation failed. */
  installTerminalCommands(): Promise<TerminalCommandsStatus | null>
}

/** Host-owned sign-in and credential operations the welcome renderer reaches through the preload. */
export interface WelcomeAuthOperations {
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<AccountView>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: SignInAttemptId): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
}

/** Main-process operations behind the welcome window's IPC handlers. */
export type WelcomeOperations = WelcomeAuthOperations & WelcomeFolderOperations

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeAuthOperations & {
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
  /** Project-folder and terminal steps shown before sign-in; absent, the welcome opens at sign-in. */
  onboarding?: WelcomeOnboardingApi
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @returns true only when neither authentication route is configured.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  return !authentication.loggedIn && !authentication.hasApiKey
}
