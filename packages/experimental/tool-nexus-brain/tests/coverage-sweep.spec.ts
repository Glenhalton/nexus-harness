// Exercises every one of the 16 nexus_* tools' execute()/render() and
// presentCall() closures at least once. Each tool follows the identical
// defineTool wiring pattern (see src/index.ts); the behavior of any one tool
// is already covered by tool-nexus-brain.spec.ts and loader-composition.spec.ts —
// this file's job is coverage completeness across the repeated pattern, not
// re-asserting per-tool behavior. Write tools run against a throwaway copy of
// the fixture project so they never mutate the checked-in fixture.
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolNexusBrain from '../src/index.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures/nexus-project')

let context: Context | undefined
let scratch: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

const ARGS: Record<string, Record<string, unknown>> = {
  nexus_wake: {},
  nexus_get_vital_signs: {},
  nexus_query_knowledge: { query: 'npm' },
  nexus_get_active_plan: {},
  nexus_list_plans: {},
  nexus_get_plan: { id: 'fixture-plan' },
  nexus_brief: {},
  nexus_doctor: {},
  nexus_list_skills: {},
  nexus_get_skill: { name: 'example-skill' },
  nexus_list_agents: {},
  nexus_get_agent: { name: 'example-agent' },
  nexus_get_handoff: {},
  nexus_plan_tick: { id: 'fixture-plan', step: 2, checked: true },
  nexus_plan_note: { id: 'fixture-plan', message: 'coverage sweep note' },
  nexus_add_knowledge_entry: { category: 'pattern', title: 'Coverage sweep entry', body: 'Exercised by the coverage sweep test.' },
}

describe('tool-nexus-brain coverage sweep', () => {
  it('every nexus_* tool succeeds through execute() and presentCall()', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-nexus-brain-sweep-'))
    await cp(FIXTURE_ROOT, scratch, { recursive: true })

    const ctx = new Context()
    context = ctx
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ToolNexusBrain, { projectRoot: scratch })

    for (const [name, args] of Object.entries(ARGS)) {
      const definition = ctx.tools.get(name)
      expect(definition, `${name} must be registered`).toBeDefined()
      definition!.presentCall?.(args)

      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId(`sweep-${name}`),
        name,
        arguments: args,
      })
      expect(result.isError, `${name} -> ${JSON.stringify(result.content)}`).toBe(false)
    }
  }, 30_000)
})
