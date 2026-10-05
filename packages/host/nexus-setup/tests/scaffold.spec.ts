/**
 * Folder status and scaffolding over real temp directories. The success
 * case runs the real bundled `@nexus-framework/cli` generator, so a CLI
 * upgrade that changes the adopt contract fails here.
 */

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectProjectInfo, initNexusProject, readNexusState, type AdoptProject } from '../src/scaffold.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function folder(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-nexus-setup-'))
  roots.push(root)
  return root
}

describe('readNexusState', () => {
  it('reports missing, needs-setup, and ready', async () => {
    const root = await folder()
    expect(await readNexusState(join(root, 'absent'))).toBe('missing')
    await writeFile(join(root, 'file.txt'), 'x')
    expect(await readNexusState(join(root, 'file.txt'))).toBe('missing')
    expect(await readNexusState(root)).toBe('needs-setup')
    await writeFile(join(root, '.nexus'), 'not a directory')
    expect(await readNexusState(root)).toBe('needs-setup')
    await rm(join(root, '.nexus'))
    await mkdir(join(root, '.nexus'))
    expect(await readNexusState(root)).toBe('ready')
  })
})

describe('detectProjectInfo', () => {
  it('names a bare folder after itself and leaves stack facts to the generator defaults', async () => {
    const root = await folder()
    const info = await detectProjectInfo(root)
    expect(info).toMatchObject({
      detected: true, framework: null, testFramework: null, packageManager: null, hasNexus: false,
    })
    expect(info.name).toBe(root.split(/[\\/]/).at(-1))
  })

  it('reads package.json name, framework, test runner, and lockfile', async () => {
    const root = await folder()
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'shop', description: 'A shop', dependencies: { next: '15' }, devDependencies: { vitest: '3' },
    }))
    await writeFile(join(root, 'pnpm-lock.yaml'), '')
    expect(await detectProjectInfo(root)).toMatchObject({
      name: 'shop', description: 'A shop', framework: 'nextjs', testFramework: 'vitest', packageManager: 'pnpm',
    })
  })

  it('recognizes vite+react, jest, yarn, and survives an unreadable package.json', async () => {
    const root = await folder()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { vite: '5', react: '18' }, devDependencies: { jest: '29' } }))
    await writeFile(join(root, 'yarn.lock'), '')
    expect(await detectProjectInfo(root)).toMatchObject({ framework: 'react-vite', testFramework: 'jest', packageManager: 'yarn' })
    await writeFile(join(root, 'package.json'), '{ broken')
    expect(await detectProjectInfo(root)).toMatchObject({ framework: null, packageManager: 'yarn' })
  })
})

describe('initNexusProject', () => {
  it('scaffolds .nexus/ through the bundled CLI without touching existing files', async () => {
    const root = await folder()
    await writeFile(join(root, 'notes.txt'), 'mine')
    expect(await initNexusProject(root)).toBe(true)
    expect(await readNexusState(root)).toBe('ready')
    expect(existsSync(join(root, '.nexus', 'docs', 'index.md'))).toBe(true)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(root, 'notes.txt'))).toBe(true)
  }, 60_000)

  it('skips an existing NEXUS project and never loads the generator', async () => {
    const root = await folder()
    await mkdir(join(root, '.nexus'))
    const adopt = vi.fn<() => Promise<AdoptProject>>()
    expect(await initNexusProject(root, adopt)).toBe(false)
    expect(adopt).not.toHaveBeenCalled()
  })

  it('rejects a missing folder and a generator that writes nothing', async () => {
    const root = await folder()
    await expect(initNexusProject(join(root, 'absent'))).rejects.toThrow(/does not exist/)
    const noop = (async () => undefined) as AdoptProject
    await expect(initNexusProject(root, () => Promise.resolve(noop))).rejects.toThrow(/without creating/)
  })
})
