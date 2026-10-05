import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cmdShimFiles,
  compareVersions,
  DELEGATION_ENV,
  ensureNexusCommand,
  findNexusClis,
  harnessVersionLine,
  isHarnessShim,
  isHarnessStub,
  MISSING_CLI_MESSAGE,
  NEXUS_OWNER_MARKER,
  type NexusCli,
  npmGlobalLayout,
  pickNewestCli,
  plainShimFiles,
  readCmdShimTarget,
  readNexusCli,
  selectNexusCli,
  STUB_BIN_SOURCE,
  STUB_VERSION,
} from './nexus-command.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-command-')))
  roots.push(root)
  return root
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function writeCli(root: string, version: string): void {
  write(join(root, 'package.json'), JSON.stringify({ name: '@nexus-framework/cli', version, bin: { nexus: './bin/nexus.js' } }))
  write(join(root, 'bin', 'nexus.js'), '')
}

function cli(version: string, source: NexusCli['source'] = 'bundled'): NexusCli {
  return { root: `/${source}/${version}`, version, entry: `/${source}/${version}/bin/nexus.js`, source }
}

/** An npm global prefix holding the harness, with npm's nexus-code link in place. */
function npmPrefix(windows = false): { prefix: string; nodeModules: string; harness: string; binDir: string } {
  const prefix = fixture()
  const nodeModules = windows ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')
  const harness = join(nodeModules, '@nexus-framework', 'harness')
  const binDir = windows ? prefix : join(prefix, 'bin')
  write(join(harness, 'package.json'), '{"name":"@nexus-framework/harness","version":"1.1.0"}')
  write(join(harness, 'bin', 'nexus-harness.js'), '')
  mkdirSync(binDir, { recursive: true })
  if (windows) write(join(binDir, 'nexus-code.cmd'), cmdShimFiles('node_modules/@nexus-framework/harness/bin/nexus-harness.js')['.cmd'])
  else symlinkSync('../lib/node_modules/@nexus-framework/harness/bin/nexus-harness.js', join(binDir, 'nexus-code'))
  return { prefix, nodeModules, harness, binDir }
}

describe('compareVersions', () => {
  it.each([
    ['2.0.0', '1.6.0', 1],
    ['1.6.0', '2.0.0', -1],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0', '2.0.0', 0],
    ['v2.0.0', '2.0.0', 0],
    ['2.0.0', '2.0.0-rc.1', 1],
    ['2.0.0-rc.2', '2.0.0-rc.10', -1],
    ['2.0.0-alpha', '2.0.0-alpha.1', -1],
    ['2.0.0-beta', '2.0.0-alpha', 1],
    ['1.0.0-1', '1.0.0-alpha', -1],
    ['2.0.0+build.5', '2.0.0', 0],
    [STUB_VERSION, '0.0.1', -1],
    ['garbage', '0.0.1', -1],
    ['0.0.1', 'garbage', 1],
  ])('%s vs %s -> %i', (left, right, expected) => {
    expect(Math.sign(compareVersions(left, right))).toBe(expected)
  })
})

describe('pickNewestCli', () => {
  it('picks the newest and keeps the earlier candidate on a tie', () => {
    expect(pickNewestCli([cli('1.6.0', 'standalone'), cli('2.0.0')])?.version).toBe('2.0.0')
    expect(pickNewestCli([cli('2.0.0', 'standalone'), cli('2.0.0')])?.source).toBe('standalone')
    expect(pickNewestCli([])).toBeUndefined()
  })
})

describe('readNexusCli', () => {
  it('accepts a real CLI and rejects placeholders, other packages, and missing bins', () => {
    const root = fixture()
    writeCli(join(root, 'real'), '2.0.0')
    expect(readNexusCli(join(root, 'real'), 'standalone')).toMatchObject({ version: '2.0.0', entry: join(root, 'real', 'bin', 'nexus.js') })

    write(join(root, 'stub', 'package.json'), JSON.stringify({ name: '@nexus-framework/cli', version: STUB_VERSION, bin: { nexus: 'bin/nexus.js' }, nexusOwner: '@nexus-framework/harness' }))
    write(join(root, 'stub', 'bin', 'nexus.js'), '')
    expect(readNexusCli(join(root, 'stub'), 'standalone')).toBeUndefined()
    expect(isHarnessStub(join(root, 'stub'))).toBe(true)
    expect(isHarnessStub(join(root, 'real'))).toBe(false)

    write(join(root, 'other', 'package.json'), '{"name":"nexus","version":"9.0.0","bin":"x.js"}')
    write(join(root, 'other', 'x.js'), '')
    expect(readNexusCli(join(root, 'other'), 'standalone')).toBeUndefined()

    write(join(root, 'nobin', 'package.json'), '{"name":"@nexus-framework/cli","version":"2.0.0","bin":{"nexus":"gone.js"}}')
    expect(readNexusCli(join(root, 'nobin'), 'standalone')).toBeUndefined()
  })
})

describe('selecting the CLI behind nexus', () => {
  it('finds the global and the bundled CLI and runs the newest', () => {
    const { nodeModules, harness } = npmPrefix()
    writeCli(join(harness, 'node_modules', '@nexus-framework', 'cli'), '1.6.0')
    writeCli(join(nodeModules, '@nexus-framework', 'cli'), '2.0.0')
    expect(findNexusClis(harness).map(entry => `${entry.source}@${entry.version}`)).toEqual(['standalone@2.0.0', 'bundled@1.6.0'])
    expect(selectNexusCli(harness, {})?.source).toBe('standalone')

    writeCli(join(harness, 'node_modules', '@nexus-framework', 'cli'), '2.1.0')
    expect(selectNexusCli(harness, {})?.source).toBe('bundled')
  })

  it('treats a pnpm virtual-store sibling as the bundled CLI', () => {
    const nodeModules = join(fixture(), 'global', '5', '.pnpm', 'harness@1.1.0', 'node_modules')
    const harness = join(nodeModules, '@nexus-framework', 'harness')
    write(join(harness, 'package.json'), '{}')
    writeCli(join(nodeModules, '@nexus-framework', 'cli'), '1.6.0')
    expect(findNexusClis(harness, 'linux').map(entry => `${entry.source}@${entry.version}`)).toEqual(['bundled@1.6.0'])
  })

  it('ignores the placeholder package as a global CLI', () => {
    const { harness } = npmPrefix()
    writeCli(join(harness, 'node_modules', '@nexus-framework', 'cli'), '1.6.0')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('created')
    expect(findNexusClis(harness).map(entry => entry.source)).toEqual(['bundled'])
  })

  it('never hands off again once a run was delegated (loop guard)', () => {
    const { nodeModules, harness } = npmPrefix()
    writeCli(join(harness, 'node_modules', '@nexus-framework', 'cli'), '1.6.0')
    writeCli(join(nodeModules, '@nexus-framework', 'cli'), '2.0.0')
    expect(selectNexusCli(harness, { [DELEGATION_ENV]: '/somewhere/bin/nexus.js' })?.source).toBe('bundled')
  })

  it('labels --version only when the bundled CLI answers', () => {
    expect(harnessVersionLine(cli('1.6.0'), ['--version'])).toBe('1.6.0 (via @nexus-framework/harness)')
    expect(harnessVersionLine(cli('1.6.0'), ['-v'])).toBe('1.6.0 (via @nexus-framework/harness)')
    expect(harnessVersionLine(cli('1.6.0'), ['--version', 'x'])).toBeUndefined()
    expect(harnessVersionLine(cli('2.0.0', 'standalone'), ['--version'])).toBeUndefined()
  })
})

describe('npmGlobalLayout', () => {
  it('recognises POSIX and Windows global prefixes only when our nexus-code is linked there', () => {
    const posix = npmPrefix()
    expect(npmGlobalLayout(posix.harness, 'linux')).toEqual({ nodeModules: posix.nodeModules, binDir: posix.binDir, windows: false })
    const windows = npmPrefix(true)
    expect(npmGlobalLayout(windows.harness, 'win32')).toEqual({ nodeModules: windows.nodeModules, binDir: windows.binDir, windows: true })

    rmSync(join(posix.binDir, 'nexus-code'))
    expect(npmGlobalLayout(posix.harness, 'linux')).toBeUndefined()
    const project = fixture()
    expect(npmGlobalLayout(join(project, 'node_modules', '@nexus-framework', 'harness'), 'linux')).toBeUndefined()
  })
})

describe('ensureNexusCommand on an npm global prefix', () => {
  it('writes the marked placeholder and npm-style link, idempotently', () => {
    const { nodeModules, harness, binDir } = npmPrefix()
    const stub = join(nodeModules, '@nexus-framework', 'cli')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' })).toEqual({ status: 'created', path: join(binDir, 'nexus') })
    expect(readlinkSync(join(binDir, 'nexus'))).toBe('../lib/node_modules/@nexus-framework/cli/bin/nexus.js')
    expect(isHarnessStub(stub)).toBe(true)
    expect(JSON.parse(readFileSync(join(stub, 'package.json'), 'utf8'))).toMatchObject({ version: STUB_VERSION, bin: { nexus: 'bin/nexus.js' } })
    expect(readFileSync(join(stub, 'bin', 'nexus.js'), 'utf8')).toContain(NEXUS_OWNER_MARKER)

    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('unchanged')
    rmSync(join(binDir, 'nexus'))
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('created')
    expect(lstatSync(join(binDir, 'nexus')).isSymbolicLink()).toBe(true)
  })

  it('leaves a real @nexus-framework/cli alone', () => {
    const { nodeModules, harness, binDir } = npmPrefix()
    writeCli(join(nodeModules, '@nexus-framework', 'cli'), '2.0.0')
    symlinkSync('../lib/node_modules/@nexus-framework/cli/bin/nexus.js', join(binDir, 'nexus'))
    const before = readFileSync(join(nodeModules, '@nexus-framework', 'cli', 'package.json'), 'utf8')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('cli-installed')
    expect(readFileSync(join(nodeModules, '@nexus-framework', 'cli', 'package.json'), 'utf8')).toBe(before)
  })

  it('never touches a nexus it did not write', () => {
    const { nodeModules, harness, binDir } = npmPrefix()
    write(join(binDir, 'nexus'), '#!/bin/sh\necho someone else\n')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('foreign')
    expect(readFileSync(join(binDir, 'nexus'), 'utf8')).toBe('#!/bin/sh\necho someone else\n')
    expect(existsSync(join(nodeModules, '@nexus-framework', 'cli'))).toBe(false)

    rmSync(join(binDir, 'nexus'))
    symlinkSync('/opt/other/nexus', join(binDir, 'nexus'))
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('foreign')
    expect(readlinkSync(join(binDir, 'nexus'))).toBe('/opt/other/nexus')

    rmSync(join(binDir, 'nexus'))
    write(join(nodeModules, '@nexus-framework', 'cli', 'README.md'), 'not a package')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux' }).status).toBe('foreign')
    expect(existsSync(join(binDir, 'nexus'))).toBe(false)
  })

  it('writes cmd-shim style Windows shims that npm reads as pointing into the CLI slot', () => {
    const { harness, binDir } = npmPrefix(true)
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'win32' }).status).toBe('created')
    for (const suffix of ['', '.cmd', '.ps1']) {
      const path = join(binDir, `nexus${suffix}`)
      const target = readCmdShimTarget(path, readFileSync(path, 'utf8'))
      expect(target?.replaceAll('\\', '/')).toBe('node_modules/@nexus-framework/cli/bin/nexus.js')
    }
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'win32' }).status).toBe('unchanged')

    write(join(binDir, 'nexus.cmd'), '@ECHO off\r\nREM some other nexus\r\n')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'win32' }).status).toBe('foreign')
    expect(readFileSync(join(binDir, 'nexus.cmd'), 'utf8')).toBe('@ECHO off\r\nREM some other nexus\r\n')
  })
})

describe('the placeholder nexus script', () => {
  it('explains how to get the CLI back once the harness is gone', () => {
    const root = fixture()
    const stub = join(root, 'node_modules', '@nexus-framework', 'cli')
    write(join(stub, 'package.json'), '{"type":"module"}')
    write(join(stub, 'bin', 'nexus.js'), STUB_BIN_SOURCE)
    const result = spawnSync(process.execPath, [join(stub, 'bin', 'nexus.js'), '--version'], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr.trim()).toBe(MISSING_CLI_MESSAGE)
  })

  it('hands off to the sibling harness entry', () => {
    const root = fixture()
    const scope = join(root, 'node_modules', '@nexus-framework')
    write(join(scope, 'cli', 'package.json'), '{"type":"module"}')
    write(join(scope, 'cli', 'bin', 'nexus.js'), STUB_BIN_SOURCE)
    write(join(scope, 'harness', 'bin', 'nexus.js'), 'console.log("harness-entry", process.argv.slice(2).join(" "))\n')
    const result = spawnSync(process.execPath, [join(scope, 'cli', 'bin', 'nexus.js'), 'wake'], { encoding: 'utf8' })
    expect(result.stdout.trim()).toBe('harness-entry wake')
  })
})

describe('ensureNexusCommand on pnpm/yarn style bin directories', () => {
  /** A bin dir holding a pnpm-style nexus-code shim for a harness stored elsewhere. */
  function pnpmHome(): { home: string; harness: string } {
    const root = fixture()
    const home = join(root, 'pnpm-home')
    const harness = join(root, 'global', '5', 'node_modules', '.pnpm', 'h', 'node_modules', '@nexus-framework', 'harness')
    write(join(harness, 'bin', 'nexus-harness.js'), '')
    write(join(home, 'nexus-code'), '#!/bin/sh\nexec node "$basedir/global/5/node_modules/@nexus-framework/harness/bin/nexus-harness.js" "$@"\n')
    return { home, harness }
  }

  it('writes a marked plain shim when no nexus exists on PATH', () => {
    const { home, harness } = pnpmHome()
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux', pathEnv: home })).toEqual({ status: 'created', path: join(home, 'nexus') })
    expect(isHarnessShim(join(home, 'nexus'))).toBe(true)
    expect(readFileSync(join(home, 'nexus'), 'utf8')).toContain(join(harness, 'bin', 'nexus.js'))
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux', pathEnv: home }).status).toBe('unchanged')
  })

  it('stays out of the way when another nexus is on PATH, and skips node_modules/.bin', () => {
    const { home, harness } = pnpmHome()
    const other = join(dirname(home), 'other-bin')
    write(join(other, 'nexus'), '#!/bin/sh\n')
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux', pathEnv: `${other}:${home}` }).status).toBe('foreign')
    expect(existsSync(join(home, 'nexus'))).toBe(false)

    const local = join(dirname(home), 'project', 'node_modules', '.bin')
    write(join(local, 'nexus-code'), readFileSync(join(home, 'nexus-code'), 'utf8'))
    expect(ensureNexusCommand({ harnessRoot: harness, platform: 'linux', pathEnv: local }).status).toBe('unsupported')
  })

  it('plain shims carry the marker on every platform flavour', () => {
    const files = plainShimFiles('/x/harness/bin/nexus.js')
    for (const content of Object.values(files)) expect(content).toContain(NEXUS_OWNER_MARKER)
    expect(files['']).toContain('exec node "$entry" "$@"')
  })
})
