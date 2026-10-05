import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildHarnessManifest,
  buildLauncherFiles,
  collectReferencedPackages,
  HARNESS_BINS,
  HARNESS_LAUNCHER_SOURCE,
  NEXUS_ENTRY_SOURCE,
  NEXUS_POSTINSTALL_SOURCE,
  packageNameOfSpecifier,
  planExternalDependencies,
  preferRange,
  rangeMinimum,
  resolveWorkspaceRange,
  selectWorkspaceClosure,
  type WorkspaceManifest,
} from './package-npm-harness.ts'

function member(name: string, fields: Partial<Omit<WorkspaceManifest, 'name'>> = {}): WorkspaceManifest {
  return { name, version: '0.1.0', dir: `/ws/${name}`, ...fields }
}

function workspaceOf(...members: WorkspaceManifest[]): Map<string, WorkspaceManifest> {
  return new Map(members.map(entry => [entry.name, entry]))
}

describe('selectWorkspaceClosure', () => {
  it('follows dependencies, peers, and optionals inside the workspace only', () => {
    const workspace = workspaceOf(
      member('@w/cli', { dependencies: { '@w/a': 'workspace:*', chalk: '^5.0.0' } }),
      member('@w/a', { peerDependencies: { '@w/b': 'workspace:*' }, optionalDependencies: { '@w/c': 'workspace:*' } }),
      member('@w/b'),
      member('@w/c'),
      member('@w/unused'),
    )
    expect(selectWorkspaceClosure(workspace, ['@w/cli']).map(entry => entry.name)).toEqual(['@w/a', '@w/b', '@w/c', '@w/cli'])
  })

  it('leaves platform binary packages to npm', () => {
    const workspace = workspaceOf(
      member('@w/addon', { optionalDependencies: { '@w/addon-darwin-x64': 'workspace:~' } }),
      member('@w/addon-darwin-x64', { platform: true }),
    )
    expect(selectWorkspaceClosure(workspace, ['@w/addon']).map(entry => entry.name)).toEqual(['@w/addon'])
  })

  it('fails loudly for an unknown root', () => {
    expect(() => selectWorkspaceClosure(new Map(), ['@w/missing'])).toThrow(/not a workspace package/u)
  })
})

describe('packageNameOfSpecifier', () => {
  it.each([
    ['chalk', 'chalk'],
    ['chalk/source/index.js', 'chalk'],
    ['@scope/pkg', '@scope/pkg'],
    ['@scope/pkg/sub/path', '@scope/pkg'],
    ['./local.js', undefined],
    ['/abs/path', undefined],
    ['#internal', undefined],
    ['node:fs', undefined],
    ['https://example.com/x.js', undefined],
    ['@scope', undefined],
    ['', undefined],
  ])('%s -> %s', (specifier, expected) => {
    expect(packageNameOfSpecifier(specifier)).toBe(expected)
  })
})

describe('collectReferencedPackages', () => {
  it('finds names in import, dynamic import, require.resolve, import.meta.resolve, and YAML', () => {
    const source = [
      'import{a}from"ws";import"side-effect"',
      'const m=await import(\'@scope/dyn/sub.js\')',
      'require.resolve(`@vscode/ripgrep/package.json`)',
      'const o=import.meta.resolve("open")',
      'plugins:\n  - @deepseek-ai/plugin-x',
      'import x from"./relative.js";import y from"node:path"',
    ].join('\n')
    const names = collectReferencedPackages(source)
    for (const name of ['ws', 'side-effect', '@scope/dyn', '@vscode/ripgrep', 'open', '@deepseek-ai/plugin-x']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('node')
    expect([...names].some(name => name.startsWith('.'))).toBe(false)
  })
})

describe('resolveWorkspaceRange', () => {
  it.each([
    ['workspace:*', '1.2.3'],
    ['workspace:', '1.2.3'],
    ['workspace:~', '~1.2.3'],
    ['workspace:^', '^1.2.3'],
    ['workspace:^1.0.0', '^1.0.0'],
    ['^4.0.0', '^4.0.0'],
  ])('%s -> %s', (range, expected) => {
    expect(resolveWorkspaceRange(range, '1.2.3')).toBe(expected)
  })
})

describe('range preference', () => {
  it('parses simple range minimums', () => {
    expect(rangeMinimum('^4.2.0')).toEqual([4, 2, 0])
    expect(rangeMinimum('~1.2')).toEqual([1, 2, 0])
    expect(rangeMinimum('>=5')).toEqual([5, 0, 0])
    expect(rangeMinimum('1.2.0-beta.15')).toEqual([1, 2, 0])
    expect(rangeMinimum('^1 || ^2')).toBeUndefined()
    expect(rangeMinimum('*')).toBeUndefined()
  })

  it('keeps the range with the highest minimum, and parseable over unparseable', () => {
    expect(preferRange('^4.0.3', '^5.0.0')).toBe('^5.0.0')
    expect(preferRange('^2.9.0', '^2.4.2')).toBe('^2.9.0')
    expect(preferRange('^4.1.0', '^4.1.0')).toBe('^4.1.0')
    expect(preferRange('*', '^1.0.0')).toBe('^1.0.0')
    expect(preferRange('^1.0.0', '*')).toBe('^1.0.0')
  })
})

describe('planExternalDependencies', () => {
  const workspace = workspaceOf(
    member('@w/cli', {
      dependencies: { '@w/lib': 'workspace:*', ws: '^8.21.0', vitest: '^4.1.8', chokidar: '^4.0.3' },
      optionalDependencies: { 'native-thing': '^1.0.0', '@w/addon-darwin-x64': 'workspace:~' },
    }),
    member('@w/lib', { dependencies: { chokidar: '^5.0.0' }, peerDependencies: { 'native-thing': '^1.2.0' } }),
    member('@w/addon-darwin-x64', { version: '0.1.2', platform: true }),
  )
  const closure = selectWorkspaceClosure(workspace, ['@w/cli'])

  it('keeps only referenced externals and prunes the rest', () => {
    const plan = planExternalDependencies(closure, workspace, new Set(['ws', 'chokidar', 'native-thing']))
    expect(plan.dependencies).toEqual({ chokidar: '^5.0.0', 'native-thing': '^1.2.0', ws: '^8.21.0' })
    expect(plan.pruned).toEqual(['vitest'])
  })

  it('never lists bundled workspace packages, and ships platform packages as optional', () => {
    const plan = planExternalDependencies(closure, workspace, new Set(['@w/lib', 'ws']))
    expect(plan.dependencies).not.toHaveProperty('@w/lib')
    expect(plan.optionalDependencies).toEqual({ '@w/addon-darwin-x64': '~0.1.2' })
  })

  it('keeps a name optional only when every declaration is optional', () => {
    const optionalOnly = workspaceOf(member('@w/x', { optionalDependencies: { koffi: '^3.1.0' } }))
    const plan = planExternalDependencies([...optionalOnly.values()], optionalOnly, new Set(['koffi']))
    expect(plan.optionalDependencies).toEqual({ koffi: '^3.1.0' })
    expect(plan.dependencies).toEqual({})
  })

  it('reports range conflicts with the chosen range', () => {
    const plan = planExternalDependencies(closure, workspace, new Set(['chokidar']))
    expect(plan.conflicts).toEqual([
      'chokidar: ^4.0.3 (@w/cli), ^5.0.0 (@w/lib) -> ^5.0.0',
      'native-thing: ^1.0.0 (@w/cli), ^1.2.0 (@w/lib) -> ^1.2.0',
    ])
  })

  it('always keeps forced names, preferring a declared range over the fallback', () => {
    const plan = planExternalDependencies(closure, workspace, new Set(), { ws: '^1.0.0', '@nexus-framework/cli': '^1.6.0' })
    expect(plan.dependencies).toEqual({ '@nexus-framework/cli': '^1.6.0', ws: '^8.21.0' })
  })
})

describe('buildHarnessManifest', () => {
  it('exposes every harness bin, the given engines, and omits an empty optional section', () => {
    const manifest = buildHarnessManifest({ engines: '^22.19.0 || >=24.0.0', dependencies: { ws: '^8.0.0' }, optionalDependencies: {} })
    expect(manifest.bin).toEqual({
      'nexus-harness': 'bin/nexus-harness.js',
      'nexus-code': 'bin/nexus-harness.js',
      harness: 'bin/nexus-harness.js',
      dsh: 'bin/nexus-harness.js',
    })
    expect(manifest.engines).toEqual({ node: '^22.19.0 || >=24.0.0' })
    expect(manifest).not.toHaveProperty('optionalDependencies')
    expect(JSON.stringify(manifest)).not.toMatch(/tsx|typescript|vitest/u)
  })

  it('keeps a non-empty optional section', () => {
    const manifest = buildHarnessManifest({ engines: '>=22', dependencies: {}, optionalDependencies: { koffi: '^3.1.0' } })
    expect(manifest.optionalDependencies).toEqual({ koffi: '^3.1.0' })
  })

  it('maps nexus-code to the harness launcher', () => {
    expect(HARNESS_BINS['nexus-code']).toBe(HARNESS_BINS['nexus-harness'])
  })

  it('leaves the nexus bin to @nexus-framework/cli and provides it from a postinstall instead', () => {
    const manifest = buildHarnessManifest({ engines: '>=22', dependencies: {}, optionalDependencies: {} })
    expect(manifest.bin).not.toHaveProperty('nexus')
    expect(manifest.scripts).toEqual({ postinstall: 'node bin/nexus-postinstall.js' })
    expect(Object.values(HARNESS_BINS)).not.toContain('bin/nexus.js')
  })
})

describe('launchers', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  function write(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }

  function fixture(): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-harness-launcher-')))
    roots.push(root)
    return root
  }

  const launcherFiles = buildLauncherFiles()

  function writeLaunchers(packageRoot: string): void {
    write(join(packageRoot, 'package.json'), '{"name":"@nexus-framework/harness","version":"1.1.0","type":"module"}')
    for (const [file, content] of Object.entries(launcherFiles)) write(join(packageRoot, 'bin', file), content)
  }

  function writeCli(root: string, version: string, label: string): void {
    write(join(root, 'package.json'), JSON.stringify({ name: '@nexus-framework/cli', version, type: 'module', bin: { nexus: './bin/nexus.js' } }))
    write(join(root, 'bin', 'nexus.js'), `console.log(${JSON.stringify(label)}, process.argv.slice(2).join(" "), process.env.NEXUS_BIN_DELEGATED === process.argv[1])\n`)
  }

  // Module resolution must see only the fixture: no inherited NODE_PATH, no ~/.node_modules.
  const { NODE_PATH: _ignored, ...isolatedEnv } = process.env

  it('generates the launcher layer, with the helper module type-stripped', () => {
    expect(Object.keys(launcherFiles).sort()).toEqual(['nexus-command.js', 'nexus-harness.js', 'nexus-postinstall.js', 'nexus.js'])
    expect(launcherFiles['nexus-harness.js']).toBe(HARNESS_LAUNCHER_SOURCE)
    expect(launcherFiles['nexus.js']).toBe(NEXUS_ENTRY_SOURCE)
    expect(launcherFiles['nexus-postinstall.js']).toBe(NEXUS_POSTINSTALL_SOURCE)
    expect(launcherFiles['nexus-command.js']).toContain('function ensureNexusCommand(')
    expect(launcherFiles['nexus-command.js']).toMatch(/export \{[^}]*\bensureNexusCommand\b/u)
    expect(launcherFiles['nexus-command.js']).not.toMatch(/:\s*NexusCli\b|interface /u)
  })

  it('runs the prebuilt CLI in-process with argv[1] at the real entry', () => {
    const root = fixture()
    writeLaunchers(root)
    write(
      join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      'export async function runCli(){console.log(JSON.stringify({entry:process.argv[1],args:process.argv.slice(2)}))}\n',
    )
    const result = spawnSync(process.execPath, [join(root, 'bin', 'nexus-harness.js'), 'web', '--no-open'], { encoding: 'utf8', env: { ...isolatedEnv, PATH: '' } })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout) as { entry: string; args: string[] }
    expect(output.entry).toBe(join(root, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
    expect(output.args).toEqual(['web', '--no-open'])
  })

  it('forwards nexus to the bundled @nexus-framework/cli bin with the delegation guard set', () => {
    const root = fixture()
    writeLaunchers(root)
    writeCli(join(root, 'node_modules', '@nexus-framework', 'cli'), '1.6.0', 'bundled-cli')
    const result = spawnSync(process.execPath, [join(root, 'bin', 'nexus.js'), 'wake'], { encoding: 'utf8', cwd: root, env: { ...isolatedEnv, HOME: root } })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('bundled-cli wake true')
  })

  it('labels the version when the bundled CLI answers', () => {
    const root = fixture()
    writeLaunchers(root)
    writeCli(join(root, 'node_modules', '@nexus-framework', 'cli'), '1.6.0', 'bundled-cli')
    const result = spawnSync(process.execPath, [join(root, 'bin', 'nexus.js'), '--version'], { encoding: 'utf8', cwd: root, env: { ...isolatedEnv, HOME: root } })
    expect(result.stdout.trim()).toBe('1.6.0 (via @nexus-framework/harness)')
  })

  it('runs a newer global @nexus-framework/cli instead of the bundled one', () => {
    const root = fixture()
    const nodeModules = join(root, 'lib', 'node_modules')
    const harness = join(nodeModules, '@nexus-framework', 'harness')
    writeLaunchers(harness)
    writeCli(join(harness, 'node_modules', '@nexus-framework', 'cli'), '1.6.0', 'bundled-cli')
    writeCli(join(nodeModules, '@nexus-framework', 'cli'), '2.0.0', 'global-cli')
    const result = spawnSync(process.execPath, [join(harness, 'bin', 'nexus.js'), '--version'], { encoding: 'utf8', cwd: root, env: { ...isolatedEnv, HOME: root } })
    expect(result.stdout.trim()).toBe('global-cli --version true')
  })

  it('explains a missing bundled CLI instead of crashing', () => {
    const root = fixture()
    writeLaunchers(root)
    const result = spawnSync(process.execPath, [join(root, 'bin', 'nexus.js')], { encoding: 'utf8', cwd: root, env: { ...isolatedEnv, HOME: root } })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/@nexus-framework\/cli is missing/u)
  })

  it('postinstall provides nexus for a global npm install only, and never fails', () => {
    const root = fixture()
    const harness = join(root, 'lib', 'node_modules', '@nexus-framework', 'harness')
    writeLaunchers(harness)
    mkdirSync(join(root, 'bin'))
    symlinkSync('../lib/node_modules/@nexus-framework/harness/bin/nexus-harness.js', join(root, 'bin', 'nexus-code'))
    const postinstall = join(harness, 'bin', 'nexus-postinstall.js')

    const local = spawnSync(process.execPath, [postinstall], { encoding: 'utf8', cwd: harness, env: { ...isolatedEnv, npm_config_global: '' } })
    expect(local.status).toBe(0)
    expect(existsSync(join(root, 'bin', 'nexus'))).toBe(false)

    const global = spawnSync(process.execPath, [postinstall], { encoding: 'utf8', cwd: harness, env: { ...isolatedEnv, npm_config_global: 'true' } })
    expect(global.status).toBe(0)
    expect(global.stdout).toContain('nexus: linked the NEXUS CLI')
    expect(readlinkSync(join(root, 'bin', 'nexus'))).toBe('../lib/node_modules/@nexus-framework/cli/bin/nexus.js')

    // A broken helper must not fail the install.
    writeFileSync(join(harness, 'bin', 'nexus-command.js'), 'throw new Error("boom")\n')
    const broken = spawnSync(process.execPath, [postinstall], { encoding: 'utf8', cwd: harness, env: { ...isolatedEnv, npm_config_global: 'true' } })
    expect(broken.status).toBe(0)
  })
})
