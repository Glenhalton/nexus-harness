import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { adHocSignMacOSRuntime } from '../scripts/macos-runtime.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('ad-hoc signs only Mach-O files with stable per-file identifiers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-ad-hoc-'))
  roots.push(root)
  mkdirSync(join(root, 'node_modules', 'native'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'native', 'addon.node'), Buffer.from('cffaedfe00000000', 'hex'))
  writeFileSync(join(root, 'node_modules', 'native', 'index.js'), 'module.exports = 1\n')
  const calls: (readonly string[])[] = []
  const count = await adHocSignMacOSRuntime(root, 'africa.gda.nexus-harness', async (args) => { calls.push(args) })
  expect(count).toBe(1)
  expect(calls).toHaveLength(1)
  expect(calls[0]!.slice(0, 3)).toEqual(['--force', '--sign', '-'])
  expect(calls[0]![4]).toMatch(/^africa\.gda\.nexus-harness\.runtime\.[0-9a-f]{64}$/u)
  expect(calls[0]![5]).toBe(join(root, 'node_modules', 'native', 'addon.node'))
})

it('reports every failed file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-ad-hoc-'))
  roots.push(root)
  writeFileSync(join(root, 'a.dylib'), Buffer.from('cffaedfe', 'hex'))
  await expect(adHocSignMacOSRuntime(root, 'africa.gda.nexus-harness', async () => { throw new Error('codesign failed') }))
    .rejects.toThrow(/ad-hoc signing failed/u)
})
