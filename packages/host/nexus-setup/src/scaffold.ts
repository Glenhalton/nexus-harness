/**
 * Folder status and NEXUS scaffolding through the bundled `@nexus-framework/cli`.
 *
 * Setup calls the CLI's programmatic `adoptProject` (the generator behind
 * `nexus adopt`), never a shell: it writes `.nexus/` plus the AI pointer
 * files (`AGENTS.md`, `CLAUDE.md`, ...) and touches no source code. The CLI's
 * interactive `adoptCommand` is not used because it prompts and calls
 * `process.exit`. Its project detector is not part of the package's public
 * exports, so the few facts the generator reads (name, framework, test runner,
 * package manager) are detected here.
 */

import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { NexusSetupState } from './shared.ts'

/** The CLI generator signature, as `@nexus-framework/cli` exports it. */
export type AdoptProject = typeof import('@nexus-framework/cli').adoptProject
type ProjectInfo = Parameters<AdoptProject>[1]
type AdoptionContext = Parameters<AdoptProject>[2]

/**
 * Read one folder's NEXUS state.
 * @param path - absolute folder path.
 * @returns `missing` unless the path is an existing directory; then `ready` when `.nexus/` exists.
 */
export async function readNexusState(path: string): Promise<NexusSetupState> {
  let directory: boolean
  try {
    directory = (await stat(path)).isDirectory()
  } catch {
    // ENOENT/EACCES both mean there is no folder to set up.
    directory = false
  }
  if (!directory) return 'missing'
  try {
    return (await stat(join(path, '.nexus'))).isDirectory() ? 'ready' : 'needs-setup'
  } catch {
    // No `.nexus` entry: the ordinary not-yet-set-up case.
    return 'needs-setup'
  }
}

const FRAMEWORKS: ReadonlyArray<readonly [string, string]> = [
  ['next', 'nextjs'],
  ['@sveltejs/kit', 'sveltekit'],
  ['nuxt', 'nuxt'],
  ['@remix-run/react', 'remix'],
  ['astro', 'astro'],
]

/**
 * Detect the project facts the adopt generator consumes.
 * @param path - absolute folder path.
 * @returns a CLI `ProjectInfo`; unknown facts stay null and the generator applies its defaults.
 */
export async function detectProjectInfo(path: string): Promise<ProjectInfo> {
  const has = (name: string): boolean => existsSync(join(path, name))
  const info: ProjectInfo = {
    detected: true,
    signals: {
      hasPackageJson: has('package.json'),
      hasGit: has('.git'),
      hasSrc: has('src'),
      hasTsConfig: has('tsconfig.json'),
      hasNodeModules: has('node_modules'),
      hasGoMod: has('go.mod'),
      hasCargoToml: has('Cargo.toml'),
      hasPyProjectToml: has('pyproject.toml'),
      hasFirebaseJson: has('firebase.json'),
      hasPomXml: has('pom.xml'),
      hasBuildGradle: has('build.gradle'),
      isInsideMonorepo: false,
      monorepoRoot: null,
    },
    name: null,
    description: null,
    framework: null,
    testFramework: null,
    packageManager: null,
    hasNexus: has('.nexus'),
    dependencies: [],
  }
  if (info.signals.hasPackageJson) {
    try {
      const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) as Record<string, unknown>
      if (typeof pkg.name === 'string' && pkg.name !== '') info.name = pkg.name
      if (typeof pkg.description === 'string') info.description = pkg.description
      const names = (field: unknown): string[] =>
        typeof field === 'object' && field !== null ? Object.keys(field) : []
      info.dependencies = [...names(pkg.dependencies), ...names(pkg.devDependencies)]
    } catch {
      // An unreadable package.json leaves the generator's defaults in place.
    }
  }
  const deps = new Set(info.dependencies)
  info.framework = FRAMEWORKS.find(([dep]) => deps.has(dep))?.[1]
    ?? (deps.has('vite') && deps.has('react') ? 'react-vite' : null)
  info.testFramework = deps.has('vitest') ? 'vitest' : deps.has('jest') ? 'jest' : null
  info.packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : info.signals.hasPackageJson ? 'npm' : null
  // The CLI names the project after its slug; a bare folder uses its own name.
  info.name ??= basename(path)
  return info
}

/** Neutral adoption answers: the in-app flow asks no interview questions. */
const ADOPTION_CONTEXT: AdoptionContext = {
  projectDescription: '',
  architectureType: 'other',
  techStack: '',
  painPoints: '',
  localOnly: false,
}

/** Lazily load the bundled CLI generator so host boot never pays for it. */
export async function loadAdoptProject(): Promise<AdoptProject> {
  return (await import('@nexus-framework/cli')).adoptProject
}

/**
 * Turn one existing folder into a NEXUS project unless it already is one.
 * @param path - absolute path of an existing directory.
 * @param adopt - the CLI generator (tests may substitute a fake).
 * @returns whether this call created `.nexus/`.
 * @throws when the folder is missing or the generator fails.
 */
export async function initNexusProject(path: string, adopt: () => Promise<AdoptProject> = loadAdoptProject): Promise<boolean> {
  const state = await readNexusState(path)
  if (state === 'missing') throw new Error(`directory does not exist: ${path}`)
  if (state === 'ready') return false
  const generate = await adopt()
  await generate(path, await detectProjectInfo(path), ADOPTION_CONTEXT)
  if (await readNexusState(path) !== 'ready') throw new Error('NEXUS setup finished without creating .nexus/')
  return true
}
