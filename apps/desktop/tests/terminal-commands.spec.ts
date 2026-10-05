import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PROFILE_BLOCK_BEGIN,
  PROFILE_BLOCK_END,
  SHIM_MARKER,
  configureTerminalCommands,
  createTerminalCommands,
  installTerminalCommands,
  isTransientAppLocation,
  profileBlock,
  removeTerminalCommands,
  shimContents,
  terminalCommandsStatus,
  withProfileBlock,
  withWindowsPathEntry,
  withoutProfileBlock,
  withoutWindowsPathEntry,
  type TerminalCommandsEnvironment,
  type WindowsUserPath,
} from '../src/terminal-commands.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(overrides: Partial<TerminalCommandsEnvironment> = {}): TerminalCommandsEnvironment {
  const root = mkdtempSync(join(tmpdir(), 'desktop-terminal-commands-'))
  roots.push(root)
  const home = join(root, 'home')
  mkdirSync(home)
  return {
    platform: 'darwin',
    home,
    executable: '/Applications/Nexus Harness.app/Contents/MacOS/Nexus Harness',
    runtimeDir: '/Applications/Nexus Harness.app/Contents/Resources/app.asar/dsh',
    stateDir: join(root, 'user-data'),
    currentPath: '/usr/bin:/bin',
    ...overrides,
  }
}

function memoryPath(initial: string): WindowsUserPath & { value: string; writes: number } {
  const store = {
    value: initial,
    writes: 0,
    read: async () => store.value,
    write: async (value: string) => { store.value = value; store.writes += 1 },
  }
  return store
}

describe('POSIX shims and shell profiles', () => {
  it('writes executable nexus and nexus-code shims that run the bundled Electron in Node mode', async () => {
    const environment = fixture()
    const status = await createTerminalCommands(environment).install()
    const binDir = join(environment.home, '.nexus', 'bin')
    expect(status).toEqual({ installed: true, binDir, commands: ['nexus', 'nexus-code'], needsNewTerminal: true })
    const nexus = readFileSync(join(binDir, 'nexus'), 'utf8')
    expect(nexus.startsWith('#!/bin/sh\n')).toBe(true)
    expect(nexus).toContain(SHIM_MARKER)
    expect(nexus).toContain('ELECTRON_RUN_AS_NODE=1 exec \'/Applications/Nexus Harness.app/Contents/MacOS/Nexus Harness\'')
    expect(nexus).toContain('app.asar/dsh/node_modules/@nexus-framework/cli/bin/nexus.js\' "$@"')
    expect(readFileSync(join(binDir, 'nexus-code'), 'utf8')).toContain('node_modules/@deepseek-ai/dsh/lib/bin.js')
    expect(statSync(join(binDir, 'nexus')).mode & 0o111).not.toBe(0)
  })

  it('shim forwards arguments to the configured executable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-terminal-shim-run-'))
    roots.push(root)
    const runtimeDir = join(root, 'it\'s runtime')
    const script = join(runtimeDir, 'node_modules', '@nexus-framework', 'cli', 'bin', 'nexus.js')
    mkdirSync(join(script, '..'), { recursive: true })
    writeFileSync(script, 'console.log(JSON.stringify({ node: process.env.ELECTRON_RUN_AS_NODE, args: process.argv.slice(2) }))\n')
    const environment = fixture({ executable: process.execPath, runtimeDir })
    await createTerminalCommands(environment).install()
    const output = execFileSync(join(environment.home, '.nexus', 'bin', 'nexus'), ['--version', 'a b'], { encoding: 'utf8' })
    expect(JSON.parse(output)).toEqual({ node: '1', args: ['--version', 'a b'] })
  }, 30_000)

  it('adds one marked PATH block to ~/.zprofile and ~/.bashrc and stays idempotent', async () => {
    const environment = fixture()
    writeFileSync(join(environment.home, '.zprofile'), 'export EDITOR=vim\n')
    const commands = createTerminalCommands(environment)
    await commands.install()
    const first = readFileSync(join(environment.home, '.zprofile'), 'utf8')
    await commands.install()
    await commands.install()
    const zprofile = readFileSync(join(environment.home, '.zprofile'), 'utf8')
    expect(zprofile).toBe(first)
    expect(zprofile.startsWith('export EDITOR=vim\n')).toBe(true)
    expect(zprofile.split(PROFILE_BLOCK_BEGIN)).toHaveLength(2)
    expect(zprofile).toContain('export PATH="$HOME/.nexus/bin:$PATH"')
    const bashrc = readFileSync(join(environment.home, '.bashrc'), 'utf8')
    expect(bashrc).toBe(`${profileBlock(environment)}\n`)
  })

  it('profile block puts the bin directory on PATH exactly once when sourced twice', async () => {
    const environment = fixture()
    await createTerminalCommands(environment).install()
    const output = execFileSync('/bin/sh', ['-c', '. "$1"; . "$1"; printf %s "$PATH"', 'sh', join(environment.home, '.bashrc')], {
      encoding: 'utf8', env: { HOME: environment.home, PATH: '/usr/bin:/bin' },
    })
    expect(output).toBe(`${environment.home}/.nexus/bin:/usr/bin:/bin`)
  })

  it('replaces a stale block instead of appending another one', () => {
    const stale = `before\n\n${PROFILE_BLOCK_BEGIN}\nexport PATH="/old:$PATH"\n${PROFILE_BLOCK_END}\nafter\n`
    const updated = withProfileBlock(stale, 'NEW-BLOCK')
    expect(updated).not.toContain('/old')
    expect(updated).toContain('before\n')
    expect(updated).toContain('after\n')
    expect(updated.endsWith('NEW-BLOCK\n')).toBe(true)
  })

  it('round-trips profile text through add and remove', () => {
    for (const original of ['', 'export A=1\n', 'export A=1', 'a\n\nb\n']) {
      const removed = withoutProfileBlock(withProfileBlock(original, `${PROFILE_BLOCK_BEGIN}\nx\n${PROFILE_BLOCK_END}`))
      expect(removed).toBe(original.endsWith('\n') || original === '' ? original : `${original}\n`)
    }
  })

  it('removes shims, the bin directory and both profile blocks while keeping other profile lines', async () => {
    const environment = fixture()
    writeFileSync(join(environment.home, '.zprofile'), 'export EDITOR=vim\n')
    const commands = createTerminalCommands(environment)
    await commands.install()
    const status = await commands.remove()
    expect(status.installed).toBe(false)
    expect(existsSync(join(environment.home, '.nexus', 'bin'))).toBe(false)
    expect(readFileSync(join(environment.home, '.zprofile'), 'utf8')).toBe('export EDITOR=vim\n')
    expect(readFileSync(join(environment.home, '.bashrc'), 'utf8')).toBe('')
  })

  it('removal leaves files it did not write', async () => {
    const environment = fixture()
    const binDir = join(environment.home, '.nexus', 'bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'nexus'), '#!/bin/sh\necho user-owned\n')
    writeFileSync(join(binDir, 'other-tool'), 'keep')
    await createTerminalCommands(environment).remove()
    expect(readFileSync(join(binDir, 'nexus'), 'utf8')).toContain('user-owned')
    expect(existsSync(join(binDir, 'other-tool'))).toBe(true)
  })

  it('reports needsNewTerminal false when the calling PATH already includes the bin directory', async () => {
    const base = fixture()
    const environment = { ...base, currentPath: `${join(base.home, '.nexus', 'bin')}:/usr/bin` }
    expect((await createTerminalCommands(environment).install()).needsNewTerminal).toBe(false)
  })

  it('reports not installed when the app moved and the shims point elsewhere', async () => {
    const environment = fixture()
    await createTerminalCommands(environment).install()
    const moved = { ...environment, executable: '/Users/me/Applications/Nexus Harness.app/Contents/MacOS/Nexus Harness' }
    expect((await createTerminalCommands(moved).status()).installed).toBe(false)
    expect((await createTerminalCommands(moved).ensure()).installed).toBe(true)
    expect(readFileSync(join(environment.home, '.nexus', 'bin', 'nexus'), 'utf8')).toContain('/Users/me/Applications/')
  })
})

describe('launch refresh and translocation', () => {
  it('installs on first launch but respects an explicit removal afterwards', async () => {
    const environment = fixture()
    const commands = createTerminalCommands(environment)
    expect((await commands.ensure()).installed).toBe(true)
    await commands.remove()
    expect((await commands.ensure()).installed).toBe(false)
    expect((await commands.install()).installed).toBe(true)
    expect((await commands.ensure()).installed).toBe(true)
  })

  it('refuses to point shims at an App Translocation or disk-image path', async () => {
    for (const executable of [
      '/private/var/folders/xy/T/AppTranslocation/0A1B/d/Nexus Harness.app/Contents/MacOS/Nexus Harness',
      '/Volumes/Nexus Harness/Nexus Harness.app/Contents/MacOS/Nexus Harness',
    ]) {
      const environment = fixture({ executable })
      const commands = createTerminalCommands(environment)
      expect(await commands.install()).toMatchObject({ installed: false, blockedReason: 'translocated' })
      expect(await commands.ensure()).toMatchObject({ installed: false, blockedReason: 'translocated' })
      expect(existsSync(join(environment.home, '.nexus'))).toBe(false)
      expect(existsSync(join(environment.home, '.zprofile'))).toBe(false)
    }
    expect(isTransientAppLocation('/Applications/Nexus Harness.app/Contents/MacOS/Nexus Harness', 'darwin')).toBe(false)
    expect(isTransientAppLocation('C:\\Volumes\\x.exe', 'win32')).toBe(false)
  })

  it('module contract functions use the configured environment', async () => {
    const environment = fixture()
    configureTerminalCommands(environment)
    expect((await terminalCommandsStatus()).installed).toBe(false)
    expect((await installTerminalCommands()).installed).toBe(true)
    expect((await removeTerminalCommands()).installed).toBe(false)
  })
})

describe('Windows shims and user PATH', () => {
  function windowsFixture(initialPath: string): { environment: TerminalCommandsEnvironment; path: ReturnType<typeof memoryPath> } {
    const path = memoryPath(initialPath)
    const base = fixture()
    return {
      path,
      environment: {
        ...base,
        platform: 'win32',
        executable: 'C:\\Users\\me\\AppData\\Local\\Programs\\Nexus Harness\\Nexus Harness.exe',
        runtimeDir: 'C:\\Users\\me\\AppData\\Local\\Programs\\Nexus Harness\\resources\\app.asar\\dsh',
        currentPath: 'C:\\Windows\\system32',
        windowsPath: path,
      },
    }
  }

  it('writes .cmd shims and appends the bin directory to the user PATH once', async () => {
    const { environment, path } = windowsFixture('%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;')
    const commands = createTerminalCommands(environment)
    const status = await commands.install()
    await commands.install()
    expect(status.installed).toBe(true)
    expect(path.writes).toBe(1)
    expect(path.value).toBe(`%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;${status.binDir}`)
    const shim = readFileSync(join(status.binDir, 'nexus.cmd'), 'utf8')
    expect(shim).toContain(SHIM_MARKER)
    expect(shim).toContain('set ELECTRON_RUN_AS_NODE=1\r\n')
    expect(shim).toContain('"C:\\Users\\me\\AppData\\Local\\Programs\\Nexus Harness\\Nexus Harness.exe" "C:\\Users\\me\\AppData\\Local\\Programs\\Nexus Harness\\resources\\app.asar\\dsh\\node_modules\\@nexus-framework\\cli\\bin\\nexus.js" %*')
  })

  it('removes the PATH entry in any spelling and keeps other entries', async () => {
    const { environment, path } = windowsFixture('C:\\Tools;%USERPROFILE%\\.nexus\\bin\\;D:\\Other')
    const commands = createTerminalCommands(environment)
    await commands.remove()
    expect(path.value).toBe('C:\\Tools;D:\\Other')
  })

  it('treats PATH entries case-insensitively and ignores trailing separators', () => {
    const home = 'C:\\Users\\Me'
    expect(withWindowsPathEntry('c:\\users\\me\\.nexus\\bin\\', 'C:\\Users\\Me\\.nexus\\bin', home)).toBe('c:\\users\\me\\.nexus\\bin\\')
    expect(withWindowsPathEntry('', 'C:\\Users\\Me\\.nexus\\bin', home)).toBe('C:\\Users\\Me\\.nexus\\bin')
    expect(withoutWindowsPathEntry('A;C:\\USERS\\ME\\.NEXUS\\BIN;B', 'C:\\Users\\Me\\.nexus\\bin', home)).toBe('A;B')
  })

  it('escapes percent signs in cmd shims', () => {
    const { environment } = windowsFixture('')
    expect(shimContents({ ...environment, executable: 'C:\\100%\\app.exe' }, 'nexus')).toContain('"C:\\100%%\\app.exe"')
  })
})
