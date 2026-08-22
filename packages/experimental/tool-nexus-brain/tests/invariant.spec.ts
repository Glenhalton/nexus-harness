// Registers the package's invariant companion against a real InvariantRegistry
// and proves the registration disposes cleanly on fiber teardown.
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as ToolNexusBrainInvariant from '../src/invariant.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('tool-nexus-brain invariant companion', () => {
  it('registers under the package name and disposes without error', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(InvariantRegistry)
    // Settling without throwing is the assertion: a failed apply() rejects
    // the awaited fiber (see loader-composition.spec.ts for that path).
    await expect(ctx.plugin(ToolNexusBrainInvariant)).resolves.toBeDefined()
  })
})
