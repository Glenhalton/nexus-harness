# Agent Note: NEXUS project-brain tools as Cordis tools

Status: implemented

English | [中文](2026-08-22-nexus-brain-tool-bridge.zh.md)

## Problem

NEXUS (`@nexus-framework/cli`) is a separate project-intelligence CLI that exposes 17 tools — session handshake, active plan, knowledge base, skills, agent roles, doctor drift report, a composed context pack — over its own stdio MCP server. A NEXUS 2.0 investigation concluded NEXUS should own project meaning (plans, knowledge, evidence) while an execution engine owns turns, tool calls, and traceable runs, and that this harness already provides the missing execution layer: the plugin runtime, session/event log, model routing, and subagent orchestration. Nothing connected the two: an agent running inside this harness had no way to reach a NEXUS project's brain except by shelling out to a second MCP transport, which this harness's own tool pipeline, session log, and invariants system cannot see.

## Decision

`@deepseek-ai/dsh-experimental-tool-nexus-brain` wraps NEXUS's 17 MCP tool handlers as native `ctx.tools` registrations. `@nexus-framework/cli` gained a transport-agnostic public surface for this: a `src/mcp/index.ts` barrel and a `./mcp` `package.json` export re-export `resolveBrainContext`, `BrainContext`, `McpToolError`, all 17 tool functions and their types, and `buildMcpServer` — the same functions `src/mcp/server.ts` already wrapped for stdio, now callable directly.

The package lives under `packages/experimental/` (not a new `packages/nexus/` group) because it depends on `@nexus-framework/cli` via a `file:../../../../nexus-cli` reference — nexus-cli has not published the new `./mcp` subpath yet — and workspace constraints require any `packages/*/*` outside `experimental/` to be a `private: false` release member with no local-file dependency. `scripts/publint-all.ts` carries one narrow, named allowlist entry for this package's resulting `LOCAL_DEPENDENCY` finding, since publint has no per-package severity override and the finding has no real consumer for a `private: true` package that will never be published.

Each tool's zod input schema (defined only in nexus-cli's `server.ts`, for MCP transport validation) is hand-translated into Cordis's `ParameterSchemaSpec`/`ValueSchemaSpec` DSL — no zod→DSL adapter exists anywhere in this harness. Output schemas split into two patterns: flat, non-nullable returns (`nexus_get_plan`, `nexus_get_skill`, `nexus_get_agent`, `nexus_brief`, `nexus_plan_note`, `nexus_add_knowledge_entry`) get an explicit `type: 'object'` schema; nested or nullable-field returns use the DSL's `type: 'json'` escape hatch (matching `packages/extensions/tool-cordis`'s existing use of the same escape hatch) and render via `JSON.stringify`, identical to what the stdio MCP server already produces. The brain context is resolved once at plugin `apply()` from the required `Config.projectRoot`, so a target project missing `.nexus/` fails loud at load, not on the first tool call. `src/invariant.ts` registers an empty installer with a package-specific reason (mirroring `packages/settings/settings-file`'s precedent): the package writes no durable session events of its own, so there is no session-log relation for the invariants system to check.

## Alternatives considered

**Have NEXUS embed Cordis directly and become a harness plugin host itself.** Rejected: this would give NEXUS a runtime dependency on this harness's own concepts, exactly the entanglement the NEXUS 2.0 investigation warned against — NEXUS is meant to own project meaning independently of any one execution engine.

**Drive NEXUS only through its existing stdio MCP server from inside a harness session (a `dsh-tool-mcp`-style bridge).** Rejected for now: it would keep every `nexus_*` call outside this harness's own session log (the opposite of the `model-visible ⟺ logged` goal) and add a second process and transport per call. The direct in-process wrapper reuses the same underlying handlers with neither cost.

**Publish a versioned `@nexus-framework/cli` release before wiring the bridge.** Rejected for this first step: it would block the seam on an external publish cycle. The `file:` dependency plus the publint allowlist entry is a deliberate, narrow, and documented trade-off, not a broad relaxation of the local-dependency rule.

## Consequences

Any agent session composed in this harness can mount `@deepseek-ai/dsh-experimental-tool-nexus-brain` and get the same NEXUS project intelligence a NEXUS-aware coding agent gets over stdio, with every call captured by this harness's session log automatically. The trade-off: `@nexus-framework/cli`'s numeric-range zod validation (`nexus_query_knowledge`'s `limit`, `nexus_get_context`'s `maxChars`) is not visible in the Cordis tool schema — the underlying handlers already clamp out-of-range values internally, so this is a schema-visibility gap, not a correctness gap. The package cannot be promoted out of `packages/experimental/` until nexus-cli publishes a version carrying the `./mcp` export and the dependency becomes an ordinary semver range.


## Update, 2026-08-24

The `file:` dependency was replaced with `"@nexus-framework/cli": "^1.4.0"` —
the `./mcp` subpath export was confirmed live on the already-published npm
`1.4.0` (not merely committed; checked the registry directly), so the
"has not published yet" premise above no longer holds. The
`LOCAL_DEPENDENCY_ALLOWLIST` entry in `scripts/publint-all.ts` was removed
accordingly (the allowlist mechanism itself stays, empty, for the next
package that needs it). The package still lives under `packages/experimental/`
for now — dropping a real dependency doesn't by itself answer whether this
belongs in a first-class `packages/*/` group instead; that's a separate,
not-yet-made decision, not a blocker this update resolves.
