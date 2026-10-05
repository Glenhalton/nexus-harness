/**
 * Packages the self-contained @nexus-framework/harness distribution for npm.
 *
 * The package ships the prebuilt JavaScript that `pnpm build:lib` / `pnpm build:web`
 * emit, never TypeScript sources, so nothing compiles at startup:
 *
 * 1. Select the workspace closure rooted at the `@deepseek-ai/dsh` CLI (plus the
 *    Nexus brain plugins), the same closure rule the Desktop package set uses.
 * 2. `pnpm pack` every closure member (honours each package's `files` and rewrites
 *    `workspace:` ranges) and unpack it to `runtime/node_modules/<name>`, so Node's
 *    ordinary node_modules lookup — which the profile resolver relies on — finds it.
 * 3. Derive `dependencies` from the external packages the shipped JavaScript actually
 *    references, intersected with what the closure manifests declare.
 * 4. Minify the shipped JavaScript with esbuild (the obfuscation step).
 * 5. Write the thin launchers (`nexus-harness`/`nexus-code`/`harness`/`dsh`), the `nexus`
 *    entry and postinstall built from scripts/nexus-command.ts, manifest, and LICENSE.
 *    README.md is maintained by hand next to the generated files.
 *
 * The harness does not declare `bin.nexus`: @nexus-framework/cli owns it on npm, and the
 * harness provides the command only when it is missing (see scripts/nexus-command.ts).
 */

import { spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../')
const PKG_DIR = join(REPO_ROOT, 'apps', 'nexus-harness')
const RUNTIME_DIR = join(PKG_DIR, 'runtime')
const RUNTIME_MODULES_DIR = join(RUNTIME_DIR, 'node_modules')

/** Published package identity. */
export const HARNESS_PACKAGE_NAME = '@nexus-framework/harness'
/** Published package version; bump deliberately before a release. */
export const HARNESS_VERSION = '1.1.0'
/** Workspace package that owns the harness command-line entry (`lib/bin.js`). */
export const CLI_PACKAGE = '@deepseek-ai/dsh'
/** npm package whose `nexus` bin the `nexus` forwarder runs. */
export const NEXUS_CLI_PACKAGE = '@nexus-framework/cli'
/** Version range for the bundled NEXUS CLI when no closure package declares one. */
export const NEXUS_CLI_FALLBACK_RANGE = '^1.6.0'

/**
 * Closure roots. The CLI pulls in everything `dsh web` composes; the Nexus brain plugins
 * are loaded by profile configuration rather than imported, so nothing else reaches them.
 */
export const HARNESS_ROOT_PACKAGES: readonly string[] = [
  CLI_PACKAGE,
  '@deepseek-ai/dsh-experimental-tool-nexus-brain',
  '@deepseek-ai/dsh-experimental-nexus-brain-context',
]

/**
 * Bin names; every harness alias runs the same launcher. `nexus` is deliberately absent:
 * @nexus-framework/cli is its only npm owner, so the two packages never clash with EEXIST.
 */
export const HARNESS_BINS: Readonly<Record<string, string>> = {
  'nexus-harness': 'bin/nexus-harness.js',
  'nexus-code': 'bin/nexus-harness.js',
  harness: 'bin/nexus-harness.js',
  dsh: 'bin/nexus-harness.js',
}

/** Lifecycle scripts of the published package; the postinstall never fails the install. */
export const HARNESS_SCRIPTS: Readonly<Record<string, string>> = {
  postinstall: 'node bin/nexus-postinstall.js',
}

/** Files under the unpacked runtime that are never needed to run (types, source maps, build state). */
const RUNTIME_PRUNE_PATTERN = /(?:\.d\.[cm]?ts|\.map|\.tsbuildinfo)$/u
/** JavaScript files the minifier rewrites. */
const MINIFY_PATTERN = /\.(?:[cm]?js)$/u
/** Files scanned for references to external packages. */
const REFERENCE_SCAN_PATTERN = /\.(?:[cm]?js|ya?ml)$/u

type DependencyMap = Readonly<Record<string, string>>

/** The manifest fields the packaging logic reads. */
export interface WorkspaceManifest {
  readonly name: string
  readonly version: string
  /** Absolute package directory. */
  readonly dir: string
  readonly dependencies?: DependencyMap
  readonly peerDependencies?: DependencyMap
  readonly optionalDependencies?: DependencyMap
  /**
   * True for prebuilt-binary packages restricted by `os`/`cpu` (the node-addon-system
   * platform packages). One machine builds only its own binary, so these ship as npm
   * optional dependencies, and npm installs whichever matches the user's platform.
   */
  readonly platform?: boolean
}

/**
 * Turn a pnpm `workspace:` range into the range a published manifest carries.
 * @param range - Declared range, possibly using the workspace protocol.
 * @param version - Version of the workspace package the range points at.
 * @returns The published range.
 */
export function resolveWorkspaceRange(range: string, version: string): string {
  if (!range.startsWith('workspace:')) return range
  const spec = range.slice('workspace:'.length)
  if (spec === '*' || spec === '') return version
  if (spec === '~' || spec === '^') return `${spec}${version}`
  return spec
}

/** Section names that make a workspace package part of the closure. */
const CLOSURE_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

/**
 * Select every workspace package reachable from the roots through dependencies, peer
 * dependencies, and optional dependencies; external names are left for npm to resolve.
 * @param workspace - Workspace manifests keyed by package name.
 * @param roots - Package names the closure starts from.
 * @returns Selected manifests sorted by name.
 */
export function selectWorkspaceClosure(
  workspace: ReadonlyMap<string, WorkspaceManifest>,
  roots: readonly string[],
): WorkspaceManifest[] {
  const selected = new Map<string, WorkspaceManifest>()
  const visit = (name: string): void => {
    if (selected.has(name)) return
    const manifest = workspace.get(name)
    if (manifest === undefined) throw new Error(`package-npm-harness: closure root ${name} is not a workspace package`)
    selected.set(name, manifest)
    for (const section of CLOSURE_SECTIONS) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (workspace.get(dependency)?.platform !== true && workspace.has(dependency)) visit(dependency)
      }
    }
  }
  for (const root of roots) visit(root)
  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Package name of a bare module specifier.
 * @param specifier - Import specifier such as `@scope/pkg/sub` or `pkg/sub`.
 * @returns The package name, or undefined for relative, absolute, URL, and builtin specifiers.
 */
export function packageNameOfSpecifier(specifier: string): string | undefined {
  if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return undefined
  if (/^[a-z][a-z0-9+.-]*:/iu.test(specifier)) return undefined
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) {
    const [scope, name] = parts
    if (scope === undefined || name === undefined || scope.length < 2 || name === '') return undefined
    return `${scope}/${name}`
  }
  return parts[0]
}

/** A quoted string that could be a bare module specifier or a package-relative path. */
const QUOTED_SPECIFIER = /(["'`])((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[^"'`\s]*)?)\1/giu
/** An unquoted scoped package name, as YAML plugin lists write them. */
const SCOPED_NAME = /@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*/giu

/**
 * Collect every package name a shipped file could reference: string literals shaped like
 * bare specifiers (covers `import`, `import()`, `require`, `require.resolve`,
 * `import.meta.resolve`, and names handed to spawners), plus unquoted scoped names.
 * This deliberately over-collects; callers intersect it with declared dependencies.
 * @param source - File contents.
 * @returns Referenced package names.
 */
export function collectReferencedPackages(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(QUOTED_SPECIFIER)) {
    const name = packageNameOfSpecifier(match[2] ?? '')
    if (name !== undefined) names.add(name)
  }
  for (const match of source.matchAll(SCOPED_NAME)) names.add(match[0])
  return names
}

/** The external dependency sections of the published manifest, with the evidence behind them. */
export interface ExternalDependencyPlan {
  readonly dependencies: Record<string, string>
  readonly optionalDependencies: Record<string, string>
  /** Declared by a closure manifest but never referenced by shipped files. */
  readonly pruned: readonly string[]
  /** Declared with different ranges by different closure packages: `name: range (pkg), ... -> chosen`. */
  readonly conflicts: readonly string[]
}

/**
 * Lowest version a simple range admits (`^1.2.3`, `~1.2`, `>=1`, `1.2.3`), as numbers.
 * @param range - A semver range.
 * @returns `[major, minor, patch]`, or undefined when the range is not a single comparator.
 */
export function rangeMinimum(range: string): [number, number, number] | undefined {
  const match = /^\s*(?:\^|~|>=|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[\w.]+)?\s*$/u.exec(range)
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

/**
 * Pick one range when closure packages disagree: the one with the highest minimum version,
 * so every declaring package gets at least what it asked for. Unparseable ranges lose to
 * parseable ones; ties keep the earlier range.
 * @param left - Range currently chosen.
 * @param right - Competing range.
 * @returns The range to keep.
 */
export function preferRange(left: string, right: string): string {
  const a = rangeMinimum(left)
  const b = rangeMinimum(right)
  if (b === undefined) return left
  if (a === undefined) return right
  for (let index = 0; index < 3; index++) {
    if ((b[index] ?? 0) !== (a[index] ?? 0)) return (b[index] ?? 0) > (a[index] ?? 0) ? right : left
  }
  return left
}

function sortedRecord(entries: Iterable<readonly [string, string]>): Record<string, string> {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)))
}

/**
 * Plan the external dependencies: a name is kept when some closure package declares it
 * and some shipped file references it. A name only ever declared as optional stays optional,
 * so a failed native build does not fail the install. Forced names are always kept, and so
 * are platform workspace packages (as optional dependencies: their names are computed at
 * runtime, so no literal reference exists).
 * @param closure - Selected workspace manifests.
 * @param workspace - Every workspace manifest; non-platform members are bundled, never external.
 * @param referenced - Names collected from the shipped files.
 * @param forced - Names kept regardless of references, with a fallback range.
 * @returns The dependency plan.
 */
export function planExternalDependencies(
  closure: readonly WorkspaceManifest[],
  workspace: ReadonlyMap<string, WorkspaceManifest>,
  referenced: ReadonlySet<string>,
  forced: DependencyMap = {},
): ExternalDependencyPlan {
  const declared = new Map<string, { range: string; owner: string; optional: boolean }>()
  const conflicts = new Map<string, Set<string>>()
  const declare = (name: string, declaredRange: string, owner: string, optional: boolean): void => {
    const member = workspace.get(name)
    if (member !== undefined && member.platform !== true) return
    const range = member === undefined ? declaredRange : resolveWorkspaceRange(declaredRange, member.version)
    const existing = declared.get(name)
    if (existing === undefined) {
      declared.set(name, { range, owner, optional })
      return
    }
    if (!optional) existing.optional = false
    if (existing.range !== range) {
      const seen = conflicts.get(name) ?? new Set([`${existing.range} (${existing.owner})`])
      seen.add(`${range} (${owner})`)
      conflicts.set(name, seen)
      existing.range = preferRange(existing.range, range)
    }
  }
  // Sorted owners make conflict reports, and so the output, deterministic.
  for (const manifest of [...closure].sort((left, right) => left.name.localeCompare(right.name))) {
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) declare(name, range, manifest.name, false)
    for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) declare(name, range, manifest.name, false)
    for (const [name, range] of Object.entries(manifest.optionalDependencies ?? {})) declare(name, range, manifest.name, true)
  }

  const required: Array<[string, string]> = []
  const optional: Array<[string, string]> = []
  const pruned: string[] = []
  for (const [name, entry] of declared) {
    if (name in forced) continue
    if (workspace.get(name)?.platform === true) {
      optional.push([name, entry.range])
      continue
    }
    if (!referenced.has(name)) {
      pruned.push(name)
      continue
    }
    ;(entry.optional ? optional : required).push([name, entry.range])
  }
  for (const [name, fallback] of Object.entries(forced)) {
    required.push([name, declared.get(name)?.range ?? fallback])
  }
  return {
    dependencies: sortedRecord(required),
    optionalDependencies: sortedRecord(optional),
    pruned: pruned.sort(),
    conflicts: [...conflicts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, ranges]) => `${name}: ${[...ranges].join(', ')} -> ${declared.get(name)?.range ?? ''}`),
  }
}

/** Inputs for the published manifest. */
export interface HarnessManifestInput {
  readonly engines: string
  readonly dependencies: Record<string, string>
  readonly optionalDependencies: Record<string, string>
}

/**
 * Build the published package.json.
 * @param input - Engines range and dependency sections.
 * @returns The manifest object.
 */
export function buildHarnessManifest(input: HarnessManifestInput): Record<string, unknown> {
  return {
    name: HARNESS_PACKAGE_NAME,
    version: HARNESS_VERSION,
    description: 'NEXUS Harness: AI-Native Execution Harness and Web Interface for NEXUS Projects. Features real-time MCP orchestration, Cordis reactive plugin runtime, session management, and integrated agent tooling.',
    author: 'Glenhalton Takor <nexus@glenhalton.com>',
    contributors: [
      'GDA Africa <hello@gdaafrica.org>',
      'Glenhalton Digital Agency <contact@glenhalton.com>',
    ],
    homepage: 'https://nexus.glenhalton.com/harness',
    bugs: {
      url: 'https://github.com/Glenhalton/nexus-harness/issues',
      email: 'hello@gdaafrica.org',
    },
    funding: [
      {
        type: 'individual',
        url: 'https://nexus.glenhalton.com',
      },
      {
        type: 'github',
        url: 'https://github.com/Glenhalton',
      },
    ],
    publishConfig: {
      access: 'public',
    },
    preferGlobal: true,
    type: 'module',
    bin: { ...HARNESS_BINS },
    scripts: { ...HARNESS_SCRIPTS },
    files: [
      'bin',
      'runtime',
      'README.md',
      'LICENSE',
    ],
    repository: {
      type: 'git',
      url: 'git+https://github.com/Glenhalton/nexus-harness.git',
      directory: 'apps/nexus-harness',
    },
    keywords: [
      'nexus',
      'nexus-framework',
      'nexus-harness',
      'nexus-code',
      'ai-native',
      'execution-harness',
      'agent-harness',
      'coding-agent',
      'autonomous-development',
      'developer-tools',
      'mcp',
      'mcp-server',
      'model-context-protocol',
      'cordis',
      'deepseek-harness',
      'gda-africa',
      'cli',
      'terminal',
      'ai-ide',
      'agentic-ai',
      'context-engine',
      'web-ui',
    ],
    license: 'SEE LICENSE IN LICENSE',
    engines: {
      node: input.engines,
    },
    dependencies: input.dependencies,
    ...(Object.keys(input.optionalDependencies).length > 0 && { optionalDependencies: input.optionalDependencies }),
  }
}

/**
 * Launcher shared by `nexus-harness`, `nexus-code`, `harness`, and `dsh`. It first makes sure
 * `nexus` exists (the fallback for `--ignore-scripts` and for pnpm/yarn globals, whose
 * postinstall may never run), then runs the prebuilt CLI in-process (no `tsx`, no second
 * Node process) with `process.argv[1]` at the real entry so code that re-derives it keeps working.
 */
export const HARNESS_LAUNCHER_SOURCE = `#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const { ensureNexusCommand } = await import('./nexus-command.js');
  ensureNexusCommand({ harnessRoot: packageRoot });
} catch {
  // Providing nexus is best effort; the harness itself must always start.
}
const entry = path.join(packageRoot, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
process.argv[1] = entry;
const { runCli } = await import(pathToFileURL(entry).href);
await runCli();
`

/**
 * The harness's `nexus` entry. It is not an npm bin: the placeholder CLI package and the
 * plain shims run it. It runs the newest installed CLI, global or bundled.
 */
export const NEXUS_ENTRY_SOURCE = `#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNexus } from './nexus-command.js';

await runNexus(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
`

/** Postinstall: provide \`nexus\` for global installs only, and never fail the install. */
export const NEXUS_POSTINSTALL_SOURCE = `#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.npm_config_global === 'true') {
  try {
    const { ensureNexusCommand } = await import('./nexus-command.js');
    const result = ensureNexusCommand({ harnessRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') });
    if (result.status === 'created') console.log('nexus: linked the NEXUS CLI bundled with ${HARNESS_PACKAGE_NAME} at ' + result.path);
  } catch {
    // Best effort: nexus-code repeats this on every start.
  }
}
`

/** Source of the launcher helper module, type-stripped into bin/nexus-command.js. */
const NEXUS_COMMAND_SOURCE = join(REPO_ROOT, 'scripts', 'nexus-command.ts')

/**
 * Every file in the published bin/ directory, keyed by file name.
 * @param esbuild - esbuild, used to strip types from scripts/nexus-command.ts.
 * @returns File contents.
 */
export function buildLauncherFiles(esbuild: Esbuild = loadEsbuild()): Record<string, string> {
  const helper = esbuild.transformSync(readFileSync(NEXUS_COMMAND_SOURCE, 'utf8'), {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    legalComments: 'inline',
  }).code
  return {
    'nexus-harness.js': HARNESS_LAUNCHER_SOURCE,
    'nexus.js': NEXUS_ENTRY_SOURCE,
    'nexus-postinstall.js': NEXUS_POSTINSTALL_SOURCE,
    'nexus-command.js': `// Generated from scripts/nexus-command.ts by scripts/package-npm-harness.ts.\n${helper}`,
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function asDependencyMap(value: unknown): DependencyMap | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as DependencyMap
}

/** Read every workspace manifest named by pnpm-workspace.yaml, except this generated package. */
function readWorkspace(): Map<string, WorkspaceManifest> {
  const config = yaml.load(readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8')) as { packages: string[] }
  const include = config.packages.filter(pattern => !pattern.startsWith('!'))
  const exclude = new Set(config.packages.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1)))
  const workspace = new Map<string, WorkspaceManifest>()
  for (const path of globSync(include.map(pattern => `${pattern}/package.json`), { cwd: REPO_ROOT })) {
    const dir = dirname(path)
    if (exclude.has(dir) || dir === relative(REPO_ROOT, PKG_DIR)) continue
    const manifest = readJson(join(REPO_ROOT, path))
    const { name, version } = manifest
    if (typeof name !== 'string' || typeof version !== 'string') continue
    const dependencies = asDependencyMap(manifest.dependencies)
    const peerDependencies = asDependencyMap(manifest.peerDependencies)
    const optionalDependencies = asDependencyMap(manifest.optionalDependencies)
    workspace.set(name, {
      name,
      version,
      dir: join(REPO_ROOT, dir),
      ...((manifest.os !== undefined || manifest.cpu !== undefined) && { platform: true }),
      ...(dependencies !== undefined && { dependencies }),
      ...(peerDependencies !== undefined && { peerDependencies }),
      ...(optionalDependencies !== undefined && { optionalDependencies }),
    })
  }
  return workspace
}

function run(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.once('error', rejectRun)
    child.once('close', (status) => {
      if (status === 0) resolveRun(output)
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with ${String(status)}:\n${output}`))
    })
  })
}

function pnpmCommand(): { command: string; prefix: string[] } {
  const execpath = process.env.npm_execpath
  if (execpath !== undefined && /pnpm/iu.test(execpath) && /\.[cm]?js$/iu.test(execpath)) {
    return { command: process.execPath, prefix: [execpath] }
  }
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', prefix: [] }
}

async function runPool<T>(items: readonly T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      if (item !== undefined) await task(item)
    }
  }))
}

/** `pnpm pack` each closure member and unpack it under runtime/node_modules/<name>. */
async function materializeClosure(closure: readonly WorkspaceManifest[]): Promise<void> {
  const packDir = mkdtempSync(join(tmpdir(), 'nexus-harness-pack-'))
  const pnpm = pnpmCommand()
  try {
    await runPool(closure, 8, async (manifest) => {
      const destination = join(packDir, manifest.name.replace('/', '+'))
      mkdirSync(destination, { recursive: true })
      await run(pnpm.command, [...pnpm.prefix, '--dir', manifest.dir, 'pack', '--pack-destination', destination])
      const tarball = readdirSync(destination).find(file => file.endsWith('.tgz'))
      if (tarball === undefined) throw new Error(`package-npm-harness: pnpm pack produced no tarball for ${manifest.name}`)
      const target = join(RUNTIME_MODULES_DIR, manifest.name)
      mkdirSync(target, { recursive: true })
      await run('tar', ['-xzf', join(destination, tarball), '-C', target, '--strip-components', '1'])
    })
  } finally {
    rmSync(packDir, { recursive: true, force: true })
  }
}

function walkFiles(dir: string, visit: (path: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, visit)
    else if (entry.isFile()) visit(full)
  }
}

interface Esbuild {
  transformSync: (code: string, options: Record<string, unknown>) => { code: string }
}

function loadEsbuild(): Esbuild {
  const localRequire = createRequire(import.meta.url)
  const candidates = [
    join(REPO_ROOT, 'node_modules', 'esbuild', 'lib', 'main.js'),
    ...globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js', { cwd: REPO_ROOT })
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map(path => join(REPO_ROOT, path)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return localRequire(candidate) as Esbuild
  }
  throw new Error('package-npm-harness: esbuild is not installed; run pnpm install before packaging.')
}

/** Minify shipped JavaScript in place. esbuild keeps hashbangs and, with no `format`, module syntax. */
function minifyRuntime(esbuild: Esbuild): { minified: number; failed: string[] } {
  let minified = 0
  const failed: string[] = []
  walkFiles(RUNTIME_MODULES_DIR, (path) => {
    if (!MINIFY_PATTERN.test(path)) return
    try {
      const transformed = esbuild.transformSync(readFileSync(path, 'utf8'), {
        loader: 'js',
        minify: true,
        legalComments: 'inline',
        target: 'es2024',
      })
      writeFileSync(path, transformed.code, 'utf8')
      minified++
    } catch {
      failed.push(relative(RUNTIME_DIR, path))
    }
  })
  return { minified, failed }
}

function directorySize(dir: string): number {
  let bytes = 0
  walkFiles(dir, (path) => { bytes += statSync(path).size })
  return bytes
}

/** Package the npm distribution into apps/nexus-harness. */
export async function packageHarness(): Promise<void> {
  console.log(`Packaging ${HARNESS_PACKAGE_NAME}...`)

  // 1. Built inputs must exist: lib/ from build:lib, apps/web/dist from build:web.
  if (!existsSync(join(REPO_ROOT, 'apps', 'web', 'dist', 'index.html'))) {
    throw new Error('apps/web/dist does not exist. Run "pnpm build:web" before packaging.')
  }
  if (!existsSync(join(REPO_ROOT, 'apps', 'cli', 'lib', 'bin.js'))) {
    throw new Error('apps/cli/lib/bin.js does not exist. Run "pnpm build:lib" before packaging.')
  }

  // 2. Closure of workspace packages, packed exactly as npm would publish them.
  const workspace = readWorkspace()
  const closure = selectWorkspaceClosure(workspace, HARNESS_ROOT_PACKAGES)
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
  mkdirSync(RUNTIME_MODULES_DIR, { recursive: true })
  console.log(`Packing ${String(closure.length)} workspace packages into runtime/node_modules...`)
  await materializeClosure(closure)

  // 3. Drop type declarations, source maps, and build state; nothing reads them at runtime.
  walkFiles(RUNTIME_DIR, (path) => {
    if (RUNTIME_PRUNE_PATTERN.test(path)) rmSync(path)
  })

  // 4. External dependencies: declared by the closure AND referenced by the shipped files.
  const referenced = new Set<string>()
  walkFiles(RUNTIME_MODULES_DIR, (path) => {
    if (!REFERENCE_SCAN_PATTERN.test(path)) return
    for (const name of collectReferencedPackages(readFileSync(path, 'utf8'))) referenced.add(name)
  })
  const plan = planExternalDependencies(closure, workspace, referenced, {
    [NEXUS_CLI_PACKAGE]: NEXUS_CLI_FALLBACK_RANGE,
  })
  console.log(`Runtime dependencies: ${String(Object.keys(plan.dependencies).length)} required, ${String(Object.keys(plan.optionalDependencies).length)} optional.`)
  if (plan.pruned.length > 0) console.log(`Pruned (declared, never referenced): ${plan.pruned.join(', ')}`)
  for (const conflict of plan.conflicts) console.warn(`⚠️  range conflict, highest minimum wins — ${conflict}`)

  // 5. Minify & obfuscate the shipped JavaScript.
  const esbuild = loadEsbuild()
  const minify = minifyRuntime(esbuild)
  console.log(`✅ Minified ${String(minify.minified)} runtime JavaScript files.`)
  if (minify.failed.length > 0) {
    throw new Error(`package-npm-harness: esbuild could not minify ${String(minify.failed.length)} file(s): ${minify.failed.slice(0, 10).join(', ')}`)
  }

  // 6. Launchers.
  const binDir = join(PKG_DIR, 'bin')
  rmSync(binDir, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  for (const [file, content] of Object.entries(buildLauncherFiles(esbuild))) {
    writeFileSync(join(binDir, file), content, 'utf8')
    chmodSync(join(binDir, file), 0o755)
  }

  // 7. Manifest; engines follow the repository root, which is what the runtime is built and tested against.
  const rootEngines = (readJson(join(REPO_ROOT, 'package.json')).engines as { node?: unknown } | undefined)?.node
  if (typeof rootEngines !== 'string') throw new Error('package-npm-harness: root package.json has no engines.node')
  const manifest = buildHarnessManifest({
    engines: rootEngines,
    dependencies: plan.dependencies,
    optionalDependencies: plan.optionalDependencies,
  })
  writeFileSync(join(PKG_DIR, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  // 8. LICENSE is generated; README.md is maintained by hand in apps/nexus-harness.
  writeFileSync(join(PKG_DIR, 'LICENSE'), LICENSE_TEXT, 'utf8')
  if (!existsSync(join(PKG_DIR, 'README.md'))) throw new Error('package-npm-harness: apps/nexus-harness/README.md is missing')

  console.log(`Runtime size: ${(directorySize(RUNTIME_DIR) / 1024 / 1024).toFixed(1)} MB`)
  console.log(`✅ ${HARNESS_PACKAGE_NAME} successfully packaged at apps/nexus-harness`)
}

const LICENSE_TEXT = `NEXUS Harness Distribution License
==================================

Copyright (c) 2026 Glenhalton Takor / GDA Africa. All Rights Reserved.
Proprietary rights are reserved for all NEXUS-specific additions, modifications,
branding assets, themes, CLI launcher bindings, and brain-context plugins.

--------------------------------------------------------------------------------
Portions of this software are derived from DeepSeek Harness (DSH), which is
licensed under the MIT License:

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
--------------------------------------------------------------------------------
`

if (import.meta.main || process.argv[1]?.endsWith('package-npm-harness.ts')) {
  await packageHarness()
}
