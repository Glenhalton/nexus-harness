# @deepseek-ai/dsh-experimental-tool-nexus-brain

English | [中文](README.zh.md)

The model-facing NEXUS project-brain tools — NEXUS's 17-tool MCP surface (`@nexus-framework/cli`), registered directly on `ctx.tools` instead of behind a separate stdio MCP transport.

## What it does

Registers 17 tools — `nexus_wake`, `nexus_get_vital_signs`, `nexus_query_knowledge`, `nexus_get_active_plan`, `nexus_list_plans`, `nexus_get_plan`, `nexus_brief`, `nexus_doctor`, `nexus_list_skills`, `nexus_get_skill`, `nexus_list_agents`, `nexus_get_agent`, `nexus_get_handoff`, `nexus_get_context`, `nexus_plan_tick`, `nexus_plan_note`, `nexus_add_knowledge_entry` — each a thin wrapper over the identically named handler exported from `@nexus-framework/cli`'s `./mcp` subpath. Every call goes through this harness's real tool pipeline (`ctx.tools.execute`), so it is automatically captured by the session log's `tools/result` event — the same `model-visible ⟺ logged` guarantee every other tool in this harness gets, without a second transport to reconcile.

This package owns no state of its own. Every read and write — plan ticks, knowledge-base entries, the wake-token session file — lands in the target project's `.nexus/` directory exactly as it would through `nexus mcp` over stdio; this is a second entry point into the same brain, not a second brain.

## Configuration

`projectRoot` is required: the absolute path to the target NEXUS project's root (the directory containing `.nexus/`). There is no default — resolving against this host process's `process.cwd()` would silently point at the wrong project when the plugin runs inside a harness session composed for a different repository. A `projectRoot` with no `.nexus/` directory fails loud at plugin load (`resolveBrainContext` throws synchronously in `apply`), not on the first tool call.

## Schema translation

`@nexus-framework/cli`'s tool inputs are validated with zod at its own MCP boundary; this package's `defineTool` parameters are hand-translated into Cordis's `ParameterSchemaSpec`/`ValueSchemaSpec` DSL, not converted programmatically — no zod→DSL adapter exists in this harness. Two output-schema patterns cover all 17 tools: a handful of flat, non-nullable returns (`nexus_get_plan`, `nexus_get_skill`, `nexus_get_agent`, `nexus_brief`, `nexus_plan_note`, `nexus_add_knowledge_entry`) get an explicit `type: 'object'` schema; the rest — nested or nullable-field returns (`nexus_wake`, `nexus_get_context`, `nexus_doctor`, etc.) — use the DSL's `type: 'json'` escape hatch and render via `JSON.stringify`, matching what the stdio MCP server already does for every tool.

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `Config` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Model Experience

### Tool schemas

#### What the model sees

The model sees the 17 generated [`nexus_*` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-experimental-tool-nexus-brain), one per NEXUS brain operation, with descriptions carried over from `@nexus-framework/cli`'s own MCP tool descriptions.

#### Token effect

Fixed schema cost on every request where these tools are visible — 17 tool definitions rather than the usual one or two this harness's other packages register.

#### KV Cache effect

Prefix-stable while `projectRoot` and tool visibility are unchanged; schemas do not vary per call.

### Tool-call history and result

#### What the model sees

Each call's result is either the target tool's canonical JSON value (flat-schema tools) or a pretty-printed JSON text block identical in shape to what `nexus mcp` returns over stdio (`type: 'json'` tools). A handler error (e.g. an out-of-range `nexus_plan_tick` step, an unknown skill name) surfaces as `McpToolError`'s message through the tool registry's `isError` result — the same error text a caller would see over stdio.

#### Token effect

Scales with the underlying NEXUS operation: `nexus_get_context` is bounded by its own `maxChars`; `nexus_get_plan`/`nexus_get_skill`/`nexus_get_agent` return full markdown files, which can be large.

#### KV Cache effect

Append-only; results follow the reusable request prefix like any other tool result.

## Known Limitations and Deferred Work

- **No write locking** — `nexus_plan_tick`, `nexus_plan_note`, and `nexus_add_knowledge_entry` do read-modify-write cycles on plain files with no concurrency guard. This is inherited from `@nexus-framework/cli` itself, not introduced by this package; concurrent calls (from this harness and, say, a separate `nexus` CLI invocation against the same `.nexus/`) can race.
- **No numeric range validation in the tool schema** — `nexus_query_knowledge`'s `limit` and `nexus_get_context`'s `maxChars` have zod-declared ranges on the `@nexus-framework/cli` side that the Cordis `ValueSchemaSpec` DSL cannot express; the underlying handlers already clamp out-of-range values internally, so this is a schema-visibility gap, not a validation gap.
- **No package-specific runtime invariant** — see `src/invariant.ts`; this package writes no durable session events of its own; every effect lands in `@nexus-framework/cli`'s filesystem-backed `.nexus/` brain, outside the event-sourced session log this harness's invariant system governs.
- **Single fixed provider** — there is exactly one way to reach a NEXUS brain (in-process import of `@nexus-framework/cli`'s handlers); no Service Definition/Provider seam, since there is currently only one implementation to swap.
