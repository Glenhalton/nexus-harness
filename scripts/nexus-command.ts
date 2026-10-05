/**
 * The `nexus` command as seen from @nexus-framework/harness.
 *
 * `@nexus-framework/cli` is the only npm package that declares `bin.nexus`. The harness
 * bundles the CLI and makes `nexus` available when nothing else does, without ever
 * fighting npm over the bin (npm refuses to link a global bin owned by another package
 * with EEXIST, and it checks before any lifecycle script runs):
 *
 * - **npm global prefix.** npm accepts an existing bin only when it is missing or a
 *   symlink that resolves inside the incoming package's directory. So the harness writes a
 *   marked placeholder package at `<global node_modules>/@nexus-framework/cli` (version
 *   {@link STUB_VERSION}) plus the bin link npm itself would create for it. Installing the
 *   real CLI replaces the placeholder through npm's normal flow; uninstalling the harness
 *   leaves a placeholder that explains how to get the CLI back.
 * - **Other global bin dirs (pnpm, yarn).** These overwrite existing bins, so a plain shim
 *   script carrying {@link NEXUS_OWNER_MARKER} is enough, written only when no `nexus`
 *   exists anywhere on PATH.
 *
 * At run time, whichever install answers `nexus` runs the newest CLI it can see
 * ({@link selectNexusCli}); {@link DELEGATION_ENV} stops a delegated run from handing off
 * again.
 *
 * This module ships as `bin/nexus-command.js` (type-stripped by scripts/package-npm-harness.ts)
 * and runs before the harness runtime loads, so it may import Node builtins only.
 */

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The harness package name. */
export const HARNESS_PACKAGE = '@nexus-framework/harness'
/** The package that owns the `nexus` bin on npm. */
export const CLI_PACKAGE = '@nexus-framework/cli'
/** Text marker carried by every file the harness writes for `nexus`. */
export const NEXUS_OWNER_MARKER = `nexus-owner: ${HARNESS_PACKAGE}`
/** package.json field that marks the placeholder CLI package. */
export const STUB_OWNER_FIELD = 'nexusOwner'
/** Version of the placeholder package; a prerelease below every real CLI release. */
export const STUB_VERSION = '0.0.0-harness-stub'
/** Set (to the chosen entry) when one `nexus` install hands the run to another. */
export const DELEGATION_ENV = 'NEXUS_BIN_DELEGATED'
/** Shown when the harness that provided `nexus` is gone. */
export const MISSING_CLI_MESSAGE = `nexus: the NEXUS CLI came from ${HARNESS_PACKAGE}, which is no longer installed. Run "npm i -g ${CLI_PACKAGE}" (or reinstall ${HARNESS_PACKAGE}) to get it back.`

type Platform = NodeJS.Platform

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u

function comparePrerelease(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  const a = left.split('.')
  const b = right.split('.')
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index]
    const y = b[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xNumeric = /^\d+$/u.test(x)
    const yNumeric = /^\d+$/u.test(y)
    if (xNumeric && yNumeric) return Number(x) > Number(y) ? 1 : -1
    if (xNumeric) return -1
    if (yNumeric) return 1
    return x > y ? 1 : -1
  }
  return 0
}

/**
 * Compare two semver versions, prerelease-aware. Unparseable versions sort below every valid one.
 * @param left - First version.
 * @param right - Second version.
 * @returns A positive number when left is newer, negative when right is newer, 0 when equal.
 */
export function compareVersions(left: string, right: string): number {
  const a = SEMVER.exec(left.trim())
  const b = SEMVER.exec(right.trim())
  if (a === null || b === null) return a === null ? (b === null ? 0 : -1) : 1
  for (let index = 1; index <= 3; index++) {
    const difference = Number(a[index]) - Number(b[index])
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  return comparePrerelease(a[4], b[4])
}

/** One installed copy of @nexus-framework/cli that could answer `nexus`. */
export interface NexusCli {
  /** Package directory. */
  readonly root: string
  readonly version: string
  /** Absolute path of its `nexus` bin script. */
  readonly entry: string
  /** `standalone` = a global @nexus-framework/cli; `bundled` = the harness's own dependency. */
  readonly source: 'standalone' | 'bundled'
}

/**
 * Pick the newest CLI; on equal versions the earlier candidate wins.
 * @param candidates - CLIs in preference order.
 * @returns The newest, or undefined for an empty list.
 */
export function pickNewestCli(candidates: readonly NexusCli[]): NexusCli | undefined {
  let best: NexusCli | undefined
  for (const candidate of candidates) {
    if (best === undefined || compareVersions(candidate.version, best.version) > 0) best = candidate
  }
  return best
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * True when the directory holds the harness's placeholder CLI package.
 * @param dir - Candidate `@nexus-framework/cli` directory.
 * @returns Whether its package.json carries the harness owner field.
 */
export function isHarnessStub(dir: string): boolean {
  return readJsonObject(join(dir, 'package.json'))?.[STUB_OWNER_FIELD] === HARNESS_PACKAGE
}

/**
 * Read a real @nexus-framework/cli install (never the harness placeholder).
 * @param root - Package directory.
 * @param source - Where the copy comes from.
 * @returns The CLI, or undefined when the directory is not a usable CLI.
 */
export function readNexusCli(root: string, source: NexusCli['source']): NexusCli | undefined {
  const manifest = readJsonObject(join(root, 'package.json'))
  if (manifest === undefined || manifest.name !== CLI_PACKAGE || manifest[STUB_OWNER_FIELD] !== undefined) return undefined
  const { version, bin } = manifest
  const script = typeof bin === 'string'
    ? bin
    : (bin !== null && typeof bin === 'object' ? (bin as Record<string, unknown>).nexus : undefined)
  if (typeof version !== 'string' || typeof script !== 'string') return undefined
  const entry = resolve(root, script)
  return existsSync(entry) ? { root, version, entry, source } : undefined
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** The node_modules directory that directly holds the harness, when it sits in one. */
function harnessNodeModules(harnessRoot: string): string | undefined {
  const scope = dirname(harnessRoot)
  const nodeModules = dirname(scope)
  return basename(scope) === '@nexus-framework' && basename(nodeModules) === 'node_modules' ? nodeModules : undefined
}

/** Node's lookup for the harness's own `@nexus-framework/cli` dependency. */
function findBundledCli(harnessRoot: string): NexusCli | undefined {
  let dir = harnessRoot
  for (;;) {
    if (basename(dir) !== 'node_modules') {
      const cli = readNexusCli(join(dir, 'node_modules', '@nexus-framework', 'cli'), 'bundled')
      if (cli !== undefined) return cli
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Every CLI the harness's `nexus` could run, in preference order (standalone first, so it
 * wins ties), deduplicated by real path. A standalone CLI is only looked for next to an npm
 * global harness (`<prefix>/lib/node_modules`, or `<prefix>/node_modules` on Windows); in
 * other layouts (pnpm's virtual store) the sibling CLI is the harness's own dependency.
 * @param harnessRoot - The harness package directory.
 * @param platform - Target platform.
 * @returns The candidates.
 */
export function findNexusClis(harnessRoot: string, platform: Platform = process.platform): NexusCli[] {
  const candidates: NexusCli[] = []
  const nodeModules = harnessNodeModules(harnessRoot)
  if (nodeModules !== undefined && (platform === 'win32' || basename(dirname(nodeModules)) === 'lib')) {
    const standalone = readNexusCli(join(nodeModules, '@nexus-framework', 'cli'), 'standalone')
    if (standalone !== undefined) candidates.push(standalone)
  }
  const bundled = findBundledCli(harnessRoot)
  if (bundled !== undefined && !candidates.some(entry => safeRealpath(entry.root) === safeRealpath(bundled.root))) {
    candidates.push(bundled)
  }
  return candidates
}

/**
 * The CLI the harness's `nexus` runs: the newest one, unless a delegated run asks to stay put.
 * @param harnessRoot - The harness package directory.
 * @param env - Process environment.
 * @returns The CLI to run, or undefined when none is installed.
 */
export function selectNexusCli(harnessRoot: string, env: NodeJS.ProcessEnv = process.env): NexusCli | undefined {
  const candidates = findNexusClis(harnessRoot)
  if (env[DELEGATION_ENV] !== undefined) return candidates.find(entry => entry.source === 'bundled') ?? candidates[0]
  return pickNewestCli(candidates)
}

/**
 * `nexus --version` text for a CLI served by the harness's bundle, or undefined when the
 * CLI should answer itself.
 * @param cli - The selected CLI.
 * @param args - Arguments after the command name.
 * @returns The version line, or undefined.
 */
export function harnessVersionLine(cli: NexusCli, args: readonly string[]): string | undefined {
  if (cli.source !== 'bundled' || args.length !== 1 || (args[0] !== '--version' && args[0] !== '-v')) return undefined
  return `${cli.version} (via ${HARNESS_PACKAGE})`
}

/**
 * Body of the harness's `bin/nexus.js`: run the newest CLI in-process.
 * @param harnessRoot - The harness package directory.
 */
export async function runNexus(harnessRoot: string): Promise<void> {
  const cli = selectNexusCli(harnessRoot)
  if (cli === undefined) {
    console.error(`nexus: ${CLI_PACKAGE} is missing from this ${HARNESS_PACKAGE} install. Run "npm i -g ${CLI_PACKAGE}" or reinstall ${HARNESS_PACKAGE}.`)
    process.exitCode = 1
    return
  }
  const versionLine = harnessVersionLine(cli, process.argv.slice(2))
  if (versionLine !== undefined) {
    console.log(versionLine)
    return
  }
  process.env[DELEGATION_ENV] = cli.entry
  process.argv[1] = cli.entry
  await import(pathToFileURL(cli.entry).href)
}

// ---------------------------------------------------------------------------
// Providing the command
// ---------------------------------------------------------------------------

/** Where npm put the harness's bins, when the harness is an npm global install. */
export interface NpmGlobalLayout {
  readonly nodeModules: string
  readonly binDir: string
  readonly windows: boolean
}

function exists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** True when path lies strictly inside dir. */
function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Recognise an npm global install: `<prefix>/lib/node_modules/@nexus-framework/harness`
 * with bins in `<prefix>/bin` (Windows: `<prefix>/node_modules/...`, bins in `<prefix>`),
 * confirmed by our own `nexus-code` bin being linked there.
 * @param harnessRoot - The harness package directory.
 * @param platform - Target platform.
 * @returns The layout, or undefined for any other kind of install.
 */
export function npmGlobalLayout(harnessRoot: string, platform: Platform = process.platform): NpmGlobalLayout | undefined {
  const nodeModules = harnessNodeModules(harnessRoot)
  if (nodeModules === undefined || basename(harnessRoot) !== 'harness') return undefined
  const windows = platform === 'win32'
  if (!windows && basename(dirname(nodeModules)) !== 'lib') return undefined
  const binDir = windows ? dirname(nodeModules) : join(dirname(dirname(nodeModules)), 'bin')
  const launcher = join(binDir, windows ? 'nexus-code.cmd' : 'nexus-code')
  if (!exists(launcher)) return undefined
  if (!windows && !isInside(safeRealpath(launcher), safeRealpath(harnessRoot))) return undefined
  return { nodeModules, binDir, windows }
}

/** package.json of the placeholder CLI package. */
export function stubManifest(harnessVersion: string): string {
  return `${JSON.stringify({
    name: CLI_PACKAGE,
    version: STUB_VERSION,
    description: `Placeholder written by ${HARNESS_PACKAGE} ${harnessVersion} so "nexus" works without ${CLI_PACKAGE}. Installing ${CLI_PACKAGE} replaces it.`,
    private: true,
    type: 'module',
    bin: { nexus: 'bin/nexus.js' },
    [STUB_OWNER_FIELD]: HARNESS_PACKAGE,
  }, null, 2)}\n`
}

/** The placeholder's `nexus` script: hand off to the sibling harness, or explain its absence. */
export const STUB_BIN_SOURCE = `#!/usr/bin/env node
// ${NEXUS_OWNER_MARKER}
// Placeholder: "npm i -g ${CLI_PACKAGE}" replaces this package.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'harness', 'bin', 'nexus.js');
if (existsSync(entry)) {
  await import(pathToFileURL(entry).href);
} else {
  console.error(${JSON.stringify(MISSING_CLI_MESSAGE)});
  process.exitCode = 1;
}
`

/**
 * The three Windows shims cmd-shim writes for a node script (`#!/usr/bin/env node`), so
 * npm's read-cmd-shim recognises them exactly like its own.
 * @param target - Script path relative to the bin directory, `/`-separated.
 * @returns Files keyed by suffix: '' (sh), '.cmd', '.ps1'.
 */
export function cmdShimFiles(target: string): Record<'' | '.cmd' | '.ps1', string> {
  const winTarget = target.split('/').join('\\')
  const cmd = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\n'
    + 'IF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\n'
    + `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${winTarget}" %*\r\n`
  const sh = '#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")\n\n'
    + 'case `uname` in\n    *CYGWIN*|*MINGW*|*MSYS*)\n        if command -v cygpath > /dev/null 2>&1; then\n            basedir=`cygpath -w "$basedir"`\n        fi\n    ;;\nesac\n\n'
    + `if [ -x "$basedir/node" ]; then\n  exec "$basedir/node"  "$basedir/${target}" "$@"\nelse \n  exec node  "$basedir/${target}" "$@"\nfi\n`
  const ps1 = '#!/usr/bin/env pwsh\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\n\n$exe=""\nif ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {\n  # Fix case when both the Windows and Linux builds of Node\n  # are installed in the same directory\n  $exe=".exe"\n}\n'
    + '$ret=0\nif (Test-Path "$basedir/node$exe") {\n  # Support pipeline input\n  if ($MyInvocation.ExpectingInput) {\n'
    + `    $input | & "$basedir/node$exe"  "$basedir/${target}" $args\n  } else {\n    & "$basedir/node$exe"  "$basedir/${target}" $args\n  }\n  $ret=$LASTEXITCODE\n} else {\n`
    + `  # Support pipeline input\n  if ($MyInvocation.ExpectingInput) {\n    $input | & "node$exe"  "$basedir/${target}" $args\n  } else {\n    & "node$exe"  "$basedir/${target}" $args\n  }\n  $ret=$LASTEXITCODE\n}\nexit $ret\n`
  return { '': sh, '.cmd': cmd, '.ps1': ps1 }
}

/** The target a cmd-shim file points at, using read-cmd-shim's patterns. */
export function readCmdShimTarget(path: string, content: string): string | undefined {
  const pattern = path.endsWith('.cmd')
    ? /"%(?:~dp0|dp0%)\\([^"]+?)"\s+%[*]/u
    : path.endsWith('.ps1') ? /"[$]basedir[/]([^"]+?)"\s+[$]args/u : /"[$]basedir[/]([^"]+?)"\s+"[$]@"/u
  return pattern.exec(content)?.[1]
}

/** True when an existing bin file belongs to the `@nexus-framework/cli` slot (as npm would link it). */
function binTargetsDir(path: string, dir: string, windows: boolean): boolean {
  try {
    if (!windows) {
      const stat = lstatSync(path)
      return stat.isSymbolicLink() && isInside(resolve(dirname(path), readlinkSync(path)), dir)
    }
    const target = readCmdShimTarget(path, readFileSync(path, 'utf8'))
    return target !== undefined && isInside(resolve(dirname(path), target.replace(/\\/gu, '/')), dir)
  } catch {
    return false
  }
}

/** Write a file only when its content differs; returns whether it wrote. */
function writeIfChanged(path: string, content: string, mode?: number): boolean {
  let current: string | undefined
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    current = undefined
  }
  if (current === content) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  if (mode !== undefined) chmodSync(path, mode)
  return true
}

/** Outcome of {@link ensureNexusCommand}. */
export interface EnsureNexusResult {
  /**
   * `created`: wrote or repaired the harness-provided command. `unchanged`: it was already in
   * place. `cli-installed`: a real @nexus-framework/cli owns `nexus`. `foreign`: something
   * else owns `nexus`; left alone. `unsupported`: no global bin directory recognised.
   */
  readonly status: 'created' | 'unchanged' | 'cli-installed' | 'foreign' | 'unsupported'
  /** The command path written or inspected. */
  readonly path?: string
}

function ensureNpmStub(layout: NpmGlobalLayout, harnessVersion: string): EnsureNexusResult {
  const stubDir = join(layout.nodeModules, '@nexus-framework', 'cli')
  const command = join(layout.binDir, 'nexus')
  if (exists(stubDir) && !isHarnessStub(stubDir)) {
    return { status: readNexusCli(stubDir, 'standalone') === undefined ? 'foreign' : 'cli-installed', path: stubDir }
  }
  const bins = layout.windows ? [command, `${command}.cmd`, `${command}.ps1`] : [command]
  if (bins.some(bin => exists(bin) && !binTargetsDir(bin, stubDir, layout.windows))) return { status: 'foreign', path: command }

  const entry = join(stubDir, 'bin', 'nexus.js')
  let wrote = writeIfChanged(join(stubDir, 'package.json'), stubManifest(harnessVersion))
  wrote = writeIfChanged(entry, STUB_BIN_SOURCE, 0o755) || wrote
  const target = relative(layout.binDir, entry).split(sep).join('/')
  if (layout.windows) {
    for (const [suffix, content] of Object.entries(cmdShimFiles(target))) {
      wrote = writeIfChanged(`${command}${suffix}`, content, 0o755) || wrote
    }
  } else if (!exists(command) || readlinkSync(command) !== target) {
    rmSync(command, { force: true })
    mkdirSync(layout.binDir, { recursive: true })
    symlinkSync(target, command)
    wrote = true
  }
  return { status: wrote ? 'created' : 'unchanged', path: command }
}

function quoteSh(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

/**
 * Plain shims for bin directories whose package manager overwrites existing bins.
 * @param entry - Absolute path of the harness's `bin/nexus.js`.
 * @returns Files keyed by suffix: '' (sh), '.cmd', '.ps1'.
 */
export function plainShimFiles(entry: string): Record<'' | '.cmd' | '.ps1', string> {
  const message = MISSING_CLI_MESSAGE
  return {
    '': `#!/bin/sh\n# ${NEXUS_OWNER_MARKER}\nentry=${quoteSh(entry)}\nif [ -f "$entry" ]; then\n  exec node "$entry" "$@"\nfi\necho ${quoteSh(message)} >&2\nexit 1\n`,
    '.cmd': `@ECHO off\r\nREM ${NEXUS_OWNER_MARKER}\r\nIF NOT EXIST "${entry}" GOTO missing\r\nnode "${entry}" %*\r\nEXIT /b %ERRORLEVEL%\r\n:missing\r\nECHO ${message.replaceAll('"', '')} 1>&2\r\nEXIT /b 1\r\n`,
    '.ps1': `# ${NEXUS_OWNER_MARKER}\n$entry = '${entry.replaceAll('\'', '\'\'')}'\nif (Test-Path $entry) {\n  & node $entry $args\n  exit $LASTEXITCODE\n}\n[Console]::Error.WriteLine('${message.replaceAll('\'', '\'\'')}')\nexit 1\n`,
  }
}

/**
 * True when the file is a shim the harness wrote (carries {@link NEXUS_OWNER_MARKER}).
 * @param path - Candidate shim.
 * @returns Whether the marker appears in its first lines.
 */
export function isHarnessShim(path: string): boolean {
  try {
    return readFileSync(path, 'utf8').split('\n', 4).some(line => line.includes(NEXUS_OWNER_MARKER))
  } catch {
    return false
  }
}

const WINDOWS_COMMAND_SUFFIXES = ['.cmd', '.exe', '.bat', '.ps1', '']

function findOnPath(name: string, pathEnv: string, windows: boolean): string[] {
  const found: string[] = []
  for (const dir of pathEnv.split(windows ? ';' : delimiter)) {
    if (dir === '') continue
    for (const suffix of windows ? WINDOWS_COMMAND_SUFFIXES : ['']) {
      const candidate = join(dir, `${name}${suffix}`)
      if (existsSync(candidate)) found.push(candidate)
    }
  }
  return found
}

/** A PATH directory whose `nexus-code` launches this harness (pnpm/yarn style shims or links). */
function findHarnessBinDir(harnessRoot: string, pathEnv: string, windows: boolean): string | undefined {
  const realRoot = safeRealpath(harnessRoot)
  for (const launcher of findOnPath('nexus-code', pathEnv, windows)) {
    const dir = dirname(launcher)
    if (basename(dir) === '.bin') continue
    if (isInside(safeRealpath(launcher), realRoot)) return dir
    try {
      const content = readFileSync(launcher, 'utf8').replaceAll('\\', '/')
      if (content.includes(`${HARNESS_PACKAGE}/bin/nexus-harness.js`)) return dir
    } catch {
      // unreadable launcher: not ours
    }
  }
  return undefined
}

function ensurePlainShim(harnessRoot: string, pathEnv: string, windows: boolean): EnsureNexusResult {
  const binDir = findHarnessBinDir(harnessRoot, pathEnv, windows)
  if (binDir === undefined) return { status: 'unsupported' }
  const command = join(binDir, 'nexus')
  const others = findOnPath('nexus', pathEnv, windows).filter(path => !(dirname(path) === binDir && isHarnessShim(path)))
  if (others.length > 0) return { status: 'foreign', path: others[0] ?? command }
  const files = plainShimFiles(join(harnessRoot, 'bin', 'nexus.js'))
  let wrote = false
  for (const suffix of windows ? ['', '.cmd', '.ps1'] as const : [''] as const) {
    wrote = writeIfChanged(`${command}${suffix}`, files[suffix], 0o755) || wrote
  }
  return { status: wrote ? 'created' : 'unchanged', path: command }
}

/** Inputs for {@link ensureNexusCommand}. */
export interface EnsureNexusOptions {
  readonly harnessRoot: string
  readonly platform?: Platform
  /** PATH to search for non-npm bin directories; defaults to process.env.PATH. */
  readonly pathEnv?: string
}

/**
 * Make `nexus` available from a global harness install when nothing provides it. Idempotent,
 * and never touches a `nexus` the harness did not write.
 * @param options - Harness location, platform, and PATH.
 * @returns What happened.
 */
export function ensureNexusCommand(options: EnsureNexusOptions): EnsureNexusResult {
  const platform = options.platform ?? process.platform
  const layout = npmGlobalLayout(options.harnessRoot, platform)
  if (layout !== undefined) {
    const manifest = readJsonObject(join(options.harnessRoot, 'package.json'))
    return ensureNpmStub(layout, typeof manifest?.version === 'string' ? manifest.version : 'unknown')
  }
  const pathEnv = options.pathEnv ?? process.env.PATH ?? process.env.Path ?? ''
  return ensurePlainShim(options.harnessRoot, pathEnv, platform === 'win32')
}
