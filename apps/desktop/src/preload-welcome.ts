import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import {
  TERMINAL_COMMANDS_IPC, WELCOME_IPC,
  type TerminalCommandsStatus, type WelcomeApi, type WelcomeFolderChoice, type WelcomeFolderResult, type WelcomeSaveResult,
} from './welcome-api.ts'

/**
 * Invoke a terminal-commands channel; a shell that never registered it (or a
 * failed install) resolves null, and the welcome hides or keeps its step.
 */
async function terminalCommands(channel: string): Promise<TerminalCommandsStatus | null> {
  try {
    return await ipcRenderer.invoke(channel) as TerminalCommandsStatus
  } catch {
    return null
  }
}

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
const api: WelcomeApi = {
  ...resolveDesktopLocale(locale),
  startSignIn: () => ipcRenderer.invoke(WELCOME_IPC.start) as Promise<AccountView>,
  cancelSignIn: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.cancel, id) as Promise<AccountView>,
  copySignInLink: (id: SignInAttemptId) => ipcRenderer.invoke(WELCOME_IPC.copyLink, id) as Promise<void>,
  onAccountState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: AccountView): void =>{  listener(state) }
    ipcRenderer.on(WELCOME_IPC.state, receive)
    return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive) }
  },
  saveApiKey: (value: string) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value) as Promise<WelcomeSaveResult>,
  skip: () => ipcRenderer.invoke(WELCOME_IPC.skip) as Promise<void>,
  onboarding: {
    chooseFolder: () => ipcRenderer.invoke(WELCOME_IPC.chooseFolder) as Promise<WelcomeFolderChoice | null>,
    setUpFolder: () => ipcRenderer.invoke(WELCOME_IPC.setUpFolder) as Promise<WelcomeFolderResult>,
    useFolder: () => ipcRenderer.invoke(WELCOME_IPC.useFolder) as Promise<WelcomeFolderResult>,
    terminalStatus: () => terminalCommands(TERMINAL_COMMANDS_IPC.status),
    installTerminalCommands: () => terminalCommands(TERMINAL_COMMANDS_IPC.install),
  },
}
contextBridge.exposeInMainWorld('dshWelcome', api)
