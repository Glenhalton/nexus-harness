/**
 * Model-facing NEXUS project-brain tools. Wraps `@nexus-framework/cli`'s 16
 * MCP tool handlers as Cordis-registered tools on `ctx.tools`, so an agent
 * running inside this harness gets the same project intelligence (plan
 * state, knowledge base, skills, doctor drift report, alignment gate) a
 * NEXUS-aware coding agent gets over stdio — with every call flowing through
 * this harness's own tool pipeline and therefore its session log, instead of
 * a separate MCP transport. The scoped-context composition itself
 * (`nexus_get_context`) has moved to the ambient, tool-call-free
 * `@deepseek-ai/dsh-experimental-nexus-brain-context` companion package.
 * @module @deepseek-ai/dsh-experimental-tool-nexus-brain
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  addKnowledgeEntryTool,
  briefTool,
  doctorTool,
  getActivePlanTool,
  getAgentTool,
  getHandoffTool,
  getPlanTool,
  getSkillTool,
  getVitalSignsTool,
  KNOWLEDGE_CATEGORIES,
  listAgentsTool,
  listPlansTool,
  listSkillsTool,
  planNoteTool,
  planTickTool,
  PLAN_STATUSES,
  queryKnowledgeTool,
  resolveBrainContext,
  wakeTool,
} from '@nexus-framework/cli/mcp'

export const name = 'tool-nexus-brain'
export const inject = ['tools']

/** Model-facing NEXUS brain tool configuration. */
export interface Config {
  /**
   * Absolute path to the target NEXUS project root (the directory containing
   * `.nexus/`). Required — resolving against a host process's `process.cwd()`
   * would silently point at the wrong project when this plugin runs inside a
   * harness session composed for a different repository.
   */
  projectRoot: string
}

/** Schemastery configuration for the NEXUS brain tool consumer. */
export const Config: z<Config> = z.object({
  projectRoot: z.string().required(),
})

/**
 * Register the 16 `nexus_*` tools on `ctx.tools`.
 *
 * The brain context is resolved once, at plugin load: a `projectRoot` with
 * no `.nexus/` directory throws synchronously here rather than on the first
 * tool call — misconfiguration fails loud at load, per convention.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - the target NEXUS project's root.
 */
export function apply(ctx: Context, config: Config): void {
  const brainCtx = resolveBrainContext(config.projectRoot)
  const asJson = (_args: unknown, value: unknown): [{ type: 'text'; text: string }] => [{
    type: 'text',
    text: JSON.stringify(value, null, 2),
  }]
  // Tool handler return types are plain data interfaces (no index signature),
  // which JsonValue's mapped-object branch requires structurally even though
  // every field is already JSON-serializable data — the same cast the
  // tool-cordis package uses for the same DSL escape hatch.
  const toJson = (value: unknown): JsonValue => value as JsonValue

  ctx.tools.register(defineTool({
    name: 'nexus_wake',
    description: 'NEXUS session handshake: token + compact brain digest (active plan, doctor counts) in one call.',
    parameters: {
      agent: { type: 'string', description: 'Agent identity recorded in .nexus/state/session.json.' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: wake', kind: 'other', rawInput: args }),
    execute: args => wakeTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_vital_signs',
    description: 'Live NEXUS repo sensors: git branch/dirty state, file counts, test summary, package status.',
    parameters: {},
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: vital signs', kind: 'other', rawInput: args }),
    execute: () => getVitalSignsTool(brainCtx).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_query_knowledge',
    description: 'Targeted retrieval over the NEXUS project\'s append-only knowledge base.',
    parameters: {
      query: { type: 'string', description: 'Space-separated keywords matched against category, title, and body.' },
      category: { type: 'string', enum: [...KNOWLEDGE_CATEGORIES], description: 'Restrict to one category tag.' },
      limit: { type: 'integer', description: 'Maximum entries returned (1-50, default 10); out-of-range values are clamped.' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: query knowledge', kind: 'other', rawInput: args }),
    execute: args => queryKnowledgeTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_active_plan',
    description: 'The active NEXUS plan with its next unchecked step — the "what am I doing" call.',
    parameters: {},
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: active plan', kind: 'other', rawInput: args }),
    execute: () => getActivePlanTool(brainCtx).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_list_plans',
    description: 'All NEXUS plans with status, for orientation.',
    parameters: {
      status: { type: 'string', enum: [...PLAN_STATUSES], description: 'Restrict to one plan status.' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: list plans', kind: 'other', rawInput: args }),
    execute: args => listPlansTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_plan',
    description: 'Full markdown of one NEXUS plan by id.',
    parameters: {
      id: { type: 'string', required: true, description: 'Plan id, e.g. "add-user-authentication".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          markdown: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: get plan', kind: 'other', rawInput: args }),
    execute: args => getPlanTool(brainCtx, args),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_brief',
    description: 'Markdown status digest — recent shipped work, vitals, doctor findings, suggested next actions.',
    parameters: {
      since: { type: 'string', description: 'Git date expression for the shipped window (default "7 days ago").' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { markdown: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: brief', kind: 'other', rawInput: args }),
    execute: args => briefTool(brainCtx, args),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_doctor',
    description: 'NEXUS drift report (D01-D14 checks) — stale docs, missing gate records, brain hygiene issues.',
    parameters: {
      minSeverity: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Minimum severity to report (default "info").' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: doctor', kind: 'other', rawInput: args }),
    execute: args => doctorTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_list_skills',
    description: 'List every installed NEXUS skill across custom/, core/, community/.',
    parameters: {},
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: list skills', kind: 'other', rawInput: args }),
    execute: () => listSkillsTool(brainCtx).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_skill',
    description: 'Read one NEXUS skill by name (custom > core > community precedence).',
    parameters: {
      name: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          source: { type: 'string', required: true, enum: ['custom', 'core', 'community'] },
          markdown: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: get skill', kind: 'other', rawInput: args }),
    execute: args => getSkillTool(brainCtx, args),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_list_agents',
    description: 'List installed NEXUS agent role definitions.',
    parameters: {},
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: list agents', kind: 'other', rawInput: args }),
    execute: () => listAgentsTool(brainCtx).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_agent',
    description: 'Read one NEXUS agent role definition by name.',
    parameters: {
      name: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          source: { type: 'string', required: true },
          markdown: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: get agent', kind: 'other', rawInput: args }),
    execute: args => getAgentTool(brainCtx, args),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_get_handoff',
    description:
      'The NEXUS agent handoff pipeline and, given the current agent, the next one to dispatch. '
      + 'Handoffs are executed by the MAIN THREAD — subagents cannot call subagents.',
    parameters: {
      agent: { type: 'string', description: 'The agent currently acting, to look up the next in the handoff chain.' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: get handoff', kind: 'other', rawInput: args }),
    execute: args => getHandoffTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_plan_tick',
    description: 'Tick (check or reopen) one step of a NEXUS plan. Schema-validated — never hand-edit plan markdown.',
    parameters: {
      id: { type: 'string', required: true },
      step: { type: 'integer', required: true, description: '1-based step index as shown by nexus_get_active_plan.' },
      checked: { type: 'boolean', description: 'Set false to reopen a step. Default true.' },
    },
    output: { schema: { type: 'json' }, render: asJson },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: plan tick', kind: 'other', rawInput: args }),
    execute: args => planTickTool(brainCtx, args).then(toJson),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_plan_note',
    description: 'Append a timestamped note to a NEXUS plan.',
    parameters: {
      id: { type: 'string', required: true },
      message: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          noted: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Noted: ${value.noted}` }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: plan note', kind: 'other', rawInput: args }),
    execute: args => planNoteTool(brainCtx, args),
  }))

  ctx.tools.register(defineTool({
    name: 'nexus_add_knowledge_entry',
    description: 'Append a validated entry to the NEXUS project\'s append-only knowledge base.',
    parameters: {
      category: { type: 'string', required: true, enum: [...KNOWLEDGE_CATEGORIES], description: 'One knowledge category tag.' },
      title: { type: 'string', required: true, description: 'Short, specific title — must not collide with an existing entry.' },
      body: { type: 'string', required: true, description: '1-3 sentence insight.' },
      why: { type: 'string', description: 'Optional "Why" line — the reason this matters.' },
      howToApply: { type: 'string', description: 'Optional "How to apply" line.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          heading: { type: 'string', required: true },
          appended: { type: 'boolean', required: true, const: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Added knowledge entry: ${value.heading}` }],
    },
    presentCall: args => ({ card: 'generic', title: 'NEXUS: add knowledge entry', kind: 'other', rawInput: args }),
    execute: args => addKnowledgeEntryTool(brainCtx, args),
  }))
}
