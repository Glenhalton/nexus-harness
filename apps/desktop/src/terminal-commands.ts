/**
 * Terminal commands: put `nexus` (bundled @nexus-framework/cli) and `nexus-code` (the bundled dsh CLI)
 * on the user's PATH without administrator rights.
 *
 * Shims live in `~/.nexus/bin` (`%USERPROFILE%\.nexus\bin` on Windows) and run the application's own
 * Electron executable in Node mode, so users never need a system Node.js. macOS and Linux add the
 * directory through one marked block in `~/.zprofile` and `~/.bashrc`; Windows adds it to the
 * per-user `Path` value under HKCU. Every operation is idempotent, and removal deletes only files
 * carrying the shim marker.
 *
 * The module never imports Electron: the main process calls {@link configureTerminalCommands} once
 * with the packaged locations, and tests drive {@link createTerminalCommands} with temporary homes.
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'

/** State reported to the onboarding UI and the application menu. */
export type TerminalCommandsStatus = {
  /** Every shim is current and the PATH entry is registered. */
  installed: boolean
  /** Directory holding the shims. */
  binDir: string
  /** Command names the shims provide. */
  commands: readonly string[]
  /** Installed, but terminals started before installation (including this process) lack the PATH entry. */
  needsNewTerminal: boolean
  /**
   * Why installation is refused. `translocated`: the app runs from a randomized App Translocation
   * path or a mounted disk image, so shims would break; the user must move it to Applications first.
   */
  blockedReason?: 'translocated'
}

/** Read and write the raw per-user Windows `Path` value. */
export interface WindowsUserPath {
  read(): Promise<string>
  write(value: string): Promise<void>
}

/** Everything the terminal-command logic needs from the host process. */
export interface TerminalCommandsEnvironment {
  readonly platform: NodeJS.Platform
  /** User home directory; tests pass a temporary directory. */
  readonly home: string
  /** Electron executable that runs the shims in Node mode. */
  readonly executable: string
  /** Directory whose `node_modules` holds `@deepseek-ai/dsh` and `@nexus-framework/cli`. */
  readonly runtimeDir: string
  /** Private directory recording an explicit removal, so launches do not reinstall against the user's choice. */
  readonly stateDir: string
  /** PATH of the calling process, used for `needsNewTerminal`. */
  readonly currentPath?: string | undefined
  /** Windows per-user PATH access; defaults to PowerShell. */
  readonly windowsPath?: WindowsUserPath
}

/** IPC channels the main process registers with `ipcMain.handle`; each resolves to a {@link TerminalCommandsStatus}. */
export const TERMINAL_COMMANDS_IPC = {
  status: 'nexus:terminal-commands:status',
  install: 'nexus:terminal-commands:install',
  remove: 'nexus:terminal-commands:remove',
} as const

/** Command names in their published order. */
export const TERMINAL_COMMANDS = ['nexus', 'nexus-code'] as const

/** First line marker of every generated shim; removal deletes only files carrying it. */
export const SHIM_MARKER = 'nexus-harness-shim v1'

/** Shell profile block delimiters. */
export const PROFILE_BLOCK_BEGIN = '# >>> nexus terminal commands >>>'
export const PROFILE_BLOCK_END = '# <<< nexus terminal commands <<<'

/** Shell profiles that receive the PATH block on macOS and Linux. */
export const PROFILE_FILES = ['.zprofile', '.bashrc'] as const

const STATE_FILE = 'terminal-commands.json'

/** Script each command runs, relative to the runtime directory. */
const COMMAND_SCRIPTS: Record<(typeof TERMINAL_COMMANDS)[number], readonly string[]> = {
  'nexus': ['node_modules', '@nexus-framework', 'cli', 'bin', 'nexus.js'],
  'nexus-code': ['node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'],
}

function windows(environment: TerminalCommandsEnvironment): boolean {
  return environment.platform === 'win32'
}

function pathModule(environment: TerminalCommandsEnvironment): typeof posix {
  return windows(environment) ? win32 : posix
}

/**
 * Directory that receives the shims.
 * @param environment - Host locations.
 * @returns `<home>/.nexus/bin`.
 */
export function terminalCommandsBinDir(environment: Pick<TerminalCommandsEnvironment, 'home'>): string {
  return join(environment.home, '.nexus', 'bin')
}

/**
 * Whether the executable runs from a location that will not survive: App Translocation's randomized
 * read-only mount, or a disk image under /Volumes that disappears on eject.
 * @param executable - Electron executable path.
 * @param platform - Host platform.
 * @returns True when shims must not point at this executable.
 */
export function isTransientAppLocation(executable: string, platform: NodeJS.Platform): boolean {
  if (platform !== 'darwin') return false
  return executable.includes('/AppTranslocation/') || executable.startsWith('/Volumes/')
}

function shQuote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

function cmdQuote(value: string): string {
  if (value.includes('"')) throw new Error(`terminal commands: unsupported quote in path ${value}`)
  return `"${value.replaceAll('%', '%%')}"`
}

/**
 * Text of one shim.
 * @param environment - Host locations.
 * @param command - Command name.
 * @returns Shim file contents.
 */
export function shimContents(environment: TerminalCommandsEnvironment, command: (typeof TERMINAL_COMMANDS)[number]): string {
  const script = pathModule(environment).join(environment.runtimeDir, ...COMMAND_SCRIPTS[command])
  if (windows(environment)) {
    return [
      '@echo off',
      `rem ${SHIM_MARKER}: managed by Nexus Harness; use "Remove nexus from Terminal" in the app to remove it.`,
      'setlocal',
      'set ELECTRON_RUN_AS_NODE=1',
      `${cmdQuote(environment.executable)} ${cmdQuote(script)} %*`,
      '',
    ].join('\r\n')
  }
  return [
    '#!/bin/sh',
    `# ${SHIM_MARKER}: managed by Nexus Harness; use "Remove nexus from Terminal" in the app to remove it.`,
    `ELECTRON_RUN_AS_NODE=1 exec ${shQuote(environment.executable)} ${shQuote(script)} "$@"`,
    '',
  ].join('\n')
}

function shimPath(environment: TerminalCommandsEnvironment, command: string): string {
  return join(terminalCommandsBinDir(environment), windows(environment) ? `${command}.cmd` : command)
}

/**
 * The marked shell-profile block that prepends the bin directory to PATH.
 * @param environment - Host locations.
 * @returns Block text without surrounding blank lines.
 */
export function profileBlock(environment: Pick<TerminalCommandsEnvironment, 'home'>): string {
  const binDir = terminalCommandsBinDir(environment)
  const relative = posix.relative(environment.home, binDir)
  const shellPath = relative.startsWith('..') || posix.isAbsolute(relative) ? binDir : `$HOME/${relative}`
  return [
    PROFILE_BLOCK_BEGIN,
    '# Added by Nexus Harness so terminals can run `nexus` and `nexus-code`.',
    `case ":$PATH:" in *":${shellPath}:"*) ;; *) export PATH="${shellPath}:$PATH" ;; esac`,
    PROFILE_BLOCK_END,
  ].join('\n')
}

function blockPattern(): RegExp {
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  // One preceding newline belongs to the block, so add-then-remove restores the original bytes.
  return new RegExp(`\\n?${escape(PROFILE_BLOCK_BEGIN)}[\\s\\S]*?${escape(PROFILE_BLOCK_END)}\\n?`, 'gu')
}

/**
 * Insert or replace the marked block, leaving all other profile content untouched.
 * @param contents - Existing profile text (empty when absent).
 * @param block - Current block text.
 * @returns Profile text containing exactly one block.
 */
export function withProfileBlock(contents: string, block: string): string {
  const stripped = withoutProfileBlock(contents)
  const separator = stripped === '' || stripped.endsWith('\n') ? '' : '\n'
  return `${stripped}${separator}${stripped === '' ? '' : '\n'}${block}\n`
}

/**
 * Remove every marked block.
 * @param contents - Existing profile text.
 * @returns Profile text without the block.
 */
export function withoutProfileBlock(contents: string): string {
  if (!contents.includes(PROFILE_BLOCK_BEGIN)) return contents
  const removed = contents.replace(blockPattern(), '\n')
  // Collapse the newline left where a block stood at the start or end of the file.
  return removed.replace(/^\n/u, '').replace(/\n\n$/u, '\n')
}

function normalizeWindowsEntry(entry: string, home: string): string {
  return entry.trim()
    .replace(/^%USERPROFILE%/iu, home)
    .replace(/[\\/]+$/u, '')
    .replaceAll('/', '\\')
    .toLowerCase()
}

/**
 * Add a directory to a Windows `Path` value when it is absent.
 * @param value - Raw `Path` value (unexpanded).
 * @param directory - Directory to add.
 * @param home - Profile directory used to recognize `%USERPROFILE%` entries.
 * @returns The new value; unchanged when already present.
 */
export function withWindowsPathEntry(value: string, directory: string, home: string): string {
  const target = normalizeWindowsEntry(directory, home)
  const entries = value.split(';').filter(entry => entry.trim() !== '')
  if (entries.some(entry => normalizeWindowsEntry(entry, home) === target)) return value
  return [...entries, directory].join(';')
}

/**
 * Remove every occurrence of a directory from a Windows `Path` value.
 * @param value - Raw `Path` value (unexpanded).
 * @param directory - Directory to remove.
 * @param home - Profile directory used to recognize `%USERPROFILE%` entries.
 * @returns The new value.
 */
export function withoutWindowsPathEntry(value: string, directory: string, home: string): string {
  const target = normalizeWindowsEntry(directory, home)
  return value.split(';').filter(entry => entry.trim() !== '' && normalizeWindowsEntry(entry, home) !== target).join(';')
}

const POWERSHELL_PATH_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Environment", $true)',
  'if ($env:NEXUS_PATH_ACTION -eq "read") {',
  '  [Console]::Out.Write($key.GetValue("Path", "", [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames))',
  '} else {',
  '  $key.SetValue("Path", $env:NEXUS_PATH_VALUE, [Microsoft.Win32.RegistryValueKind]::ExpandString)',
  // Setting and clearing a throwaway variable through .NET broadcasts WM_SETTINGCHANGE to Explorer.
  '  [Environment]::SetEnvironmentVariable("NEXUS_HARNESS_PATH_REFRESH", "1", "User")',
  '  [Environment]::SetEnvironmentVariable("NEXUS_HARNESS_PATH_REFRESH", $null, "User")',
  '}',
].join('\n')

/** Per-user Windows PATH access through PowerShell and the registry API, preserving REG_EXPAND_SZ. */
export const powershellWindowsUserPath: WindowsUserPath = {
  read: () => runPowerShell({ NEXUS_PATH_ACTION: 'read' }),
  write: async (value) => { await runPowerShell({ NEXUS_PATH_ACTION: 'write', NEXUS_PATH_VALUE: value }) },
}

function runPowerShell(variables: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_PATH_SCRIPT], {
      env: { ...process.env, ...variables }, windowsHide: true, encoding: 'utf8',
    }, (error, stdout) => {
      if (error) reject(new Error(`terminal commands: cannot update the user PATH (${error.message})`))
      else resolve(stdout)
    })
  })
}

async function readText(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Operations bound to one host environment. */
export interface TerminalCommands {
  status(): Promise<TerminalCommandsStatus>
  install(): Promise<TerminalCommandsStatus>
  remove(): Promise<TerminalCommandsStatus>
  /** Launch-time refresh: install unless blocked or explicitly removed earlier. */
  ensure(): Promise<TerminalCommandsStatus>
}

/**
 * Bind the terminal-command operations to one environment.
 * @param environment - Host locations; tests use temporary directories.
 * @returns Status, install, remove and launch-refresh operations.
 */
export function createTerminalCommands(environment: TerminalCommandsEnvironment): TerminalCommands {
  const binDir = terminalCommandsBinDir(environment)
  const windowsPath = environment.windowsPath ?? powershellWindowsUserPath
  const statePath = join(environment.stateDir, STATE_FILE)
  const blocked = isTransientAppLocation(environment.executable, environment.platform) ? 'translocated' as const : undefined

  const pathRegistered = async (): Promise<boolean> => {
    if (windows(environment)) {
      const value = await windowsPath.read()
      return withWindowsPathEntry(value, binDir, environment.home) === value
    }
    for (const name of PROFILE_FILES) {
      if (!(await readText(join(environment.home, name)) ?? '').includes(profileBlock(environment))) return false
    }
    return true
  }

  const inCurrentPath = (): boolean => {
    const separator = windows(environment) ? ';' : ':'
    const entries = (environment.currentPath ?? '').split(separator)
    return windows(environment)
      ? entries.some(entry => entry.trim() !== '' && normalizeWindowsEntry(entry, environment.home) === normalizeWindowsEntry(binDir, environment.home))
      : entries.includes(binDir)
  }

  const status = async (): Promise<TerminalCommandsStatus> => {
    let shims = true
    for (const command of TERMINAL_COMMANDS) {
      if (await readText(shimPath(environment, command)) !== shimContents(environment, command)) shims = false
    }
    const installed = shims && await pathRegistered()
    return {
      installed,
      binDir,
      commands: TERMINAL_COMMANDS,
      needsNewTerminal: installed && !inCurrentPath(),
      ...blocked === undefined ? {} : { blockedReason: blocked },
    }
  }

  const install = async (): Promise<TerminalCommandsStatus> => {
    if (blocked !== undefined) return status()
    await mkdir(binDir, { recursive: true })
    for (const command of TERMINAL_COMMANDS) {
      await writeFile(shimPath(environment, command), shimContents(environment, command), { mode: 0o755 })
    }
    if (windows(environment)) {
      const value = await windowsPath.read()
      const next = withWindowsPathEntry(value, binDir, environment.home)
      if (next !== value) await windowsPath.write(next)
    } else {
      for (const name of PROFILE_FILES) {
        const file = join(environment.home, name)
        const contents = await readText(file) ?? ''
        const next = withProfileBlock(contents, profileBlock(environment))
        if (next !== contents) await writeFile(file, next)
      }
    }
    await rm(statePath, { force: true })
    return status()
  }

  const remove = async (): Promise<TerminalCommandsStatus> => {
    for (const command of TERMINAL_COMMANDS) {
      const file = shimPath(environment, command)
      if ((await readText(file))?.includes(SHIM_MARKER)) await rm(file, { force: true })
    }
    try {
      if ((await readdir(binDir)).length === 0) await rmdir(binDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (windows(environment)) {
      const value = await windowsPath.read()
      const next = withoutWindowsPathEntry(value, binDir, environment.home)
      if (next !== value) await windowsPath.write(next)
    } else {
      for (const name of PROFILE_FILES) {
        const file = join(environment.home, name)
        const contents = await readText(file)
        if (contents === undefined) continue
        const next = withoutProfileBlock(contents)
        if (next !== contents) await writeFile(file, next)
      }
    }
    await mkdir(environment.stateDir, { recursive: true })
    await writeFile(statePath, `${JSON.stringify({ removed: true })}\n`)
    return status()
  }

  const ensure = async (): Promise<TerminalCommandsStatus> => {
    if (blocked !== undefined || await readText(statePath) !== undefined) return status()
    const current = await status()
    return current.installed ? current : install()
  }

  return { status, install, remove, ensure }
}

let configured: TerminalCommands | undefined

/**
 * Bind the module-level contract functions to the running application.
 * @param environment - Packaged or development locations.
 * @returns The bound operations.
 */
export function configureTerminalCommands(environment: TerminalCommandsEnvironment): TerminalCommands {
  configured = createTerminalCommands(environment)
  return configured
}

function bound(): TerminalCommands {
  if (configured === undefined) throw new Error('terminal commands: configureTerminalCommands() has not run')
  return configured
}

/** @returns Current shim and PATH state. */
export function terminalCommandsStatus(): Promise<TerminalCommandsStatus> {
  return bound().status()
}

/** @returns State after writing the shims and registering the PATH entry. */
export function installTerminalCommands(): Promise<TerminalCommandsStatus> {
  return bound().install()
}

/** @returns State after deleting the shims and the PATH entry. */
export function removeTerminalCommands(): Promise<TerminalCommandsStatus> {
  return bound().remove()
}
