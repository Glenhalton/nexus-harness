// Unit-level coverage: mount the plugin directly (no Loader/cordis.yml) against
// the fixture NEXUS project and drive a representative read and write tool
// through the real ctx.tools.execute pipeline.
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolNexusBrain from '../src/index.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures/nexus-project')

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

function resultText(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

async function mount(projectRoot: string): Promise<Context> {
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ToolNexusBrain, { projectRoot })
  return ctx
}

describe('tool-nexus-brain', () => {
  it('registers all 16 nexus_* tools', async () => {
    const ctx = await mount(FIXTURE_ROOT)
    const names = ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('nexus_')).sort()
    expect(names).toEqual([
      'nexus_add_knowledge_entry',
      'nexus_brief',
      'nexus_doctor',
      'nexus_get_active_plan',
      'nexus_get_agent',
      'nexus_get_handoff',
      'nexus_get_plan',
      'nexus_get_skill',
      'nexus_get_vital_signs',
      'nexus_list_agents',
      'nexus_list_plans',
      'nexus_list_skills',
      'nexus_plan_note',
      'nexus_plan_tick',
      'nexus_query_knowledge',
      'nexus_wake',
    ])
  })

  it('nexus_wake reads real data from the fixture NEXUS project', async () => {
    const ctx = await mount(FIXTURE_ROOT)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('wake-1'),
      name: 'nexus_wake',
      arguments: {},
    })
    expect(result.isError).toBe(false)
    const payload = JSON.parse(resultText(result)) as { token: string; activePlan: string | null }
    expect(payload.token).toMatch(/^NX-WAKE-/)
    expect(payload.activePlan).toBe('fixture-plan')
  })

  it('nexus_get_plan renders the full plan markdown as the tool result', async () => {
    const ctx = await mount(FIXTURE_ROOT)
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('get-plan-1'),
      name: 'nexus_get_plan',
      arguments: { id: 'fixture-plan' },
    })
    expect(result.isError).toBe(false)
    expect(resultText(result)).toContain('Exercise the NEXUS brain tools from a Cordis-mounted plugin.')
  })

  it('nexus_plan_tick writes through to the fixture project and rejects an out-of-range step', async () => {
    const ctx = await mount(FIXTURE_ROOT)
    const outOfRange = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('tick-bad'),
      name: 'nexus_plan_tick',
      arguments: { id: 'fixture-plan', step: 99 },
    })
    expect(outOfRange.isError).toBe(true)
    expect(resultText(outOfRange)).toContain('out of range')
  })

  // "Misconfiguration fails loud at load" for a missing .nexus/ is proven by
  // the REAL Loader-composition test in loader-composition.spec.ts, not here:
  // packages/AGENTS.md requires that path specifically because a direct
  // ctx.plugin(...) mount does not surface a synchronous apply() throw as a
  // rejection the way loading through the real Loader does.
})
