# @deepseek-ai/dsh-experimental-nexus-brain-context

English | [中文](README.zh.md)

Ambient NEXUS project-brain context (`@nexus-framework/cli`), injected as a durable message once per turn — no tool call required. Companion to [`tool-nexus-brain`](../tool-nexus-brain/README.md), which registers the same brain as model-callable `nexus_*` tools; this package instead composes the same context pack automatically, for harness profiles where tool calling is unreliable, absent, or simply not how a given agent is expected to reach the brain.

## What it does

Prepends an `agent/pre-step` listener. On step 1 of each turn, once the downstream decision has entered, it derives a task string from the turn's user-message text, calls the same `getContextTool` handler `tool-nexus-brain`'s (now-removed) `nexus_get_context` used to wrap, and appends one durable `UserMessage` carrying the composed pack — active plan slice, matching knowledge entries, matching skills, and vital signs — framed in a `<system-reminder>` block. Later steps of the same turn get no further injection: the composed pack is task-scoped, and the task does not change mid-turn.

This package owns no state of its own. It only reads from the target project's `.nexus/` directory, through the same `@nexus-framework/cli` handlers `tool-nexus-brain` uses; there is nothing here for `nexus_plan_tick`, `nexus_plan_note`, or `nexus_add_knowledge_entry` to replace — writes still go through `tool-nexus-brain`'s tools (or `nexus mcp` directly) when both packages are mounted together.

## Config

```yaml
- id: nexus-brain-context
  name: '@deepseek-ai/dsh-experimental-nexus-brain-context'
  config:
    projectRoot: /abs/path/to/project  # required
    maxChars: 12000                    # optional; clamped to 2000-60000, default 12000
```

`projectRoot` is required: the absolute path to the target NEXUS project's root (the directory containing `.nexus/`). There is no default — resolving against this host process's `process.cwd()` would silently point at the wrong project when the plugin runs inside a harness session composed for a different repository. A `projectRoot` with no `.nexus/` directory fails loud at plugin load (`resolveBrainContext` throws synchronously in `apply`), not on the first turn — the same convention `tool-nexus-brain` follows.

`maxChars` passes straight through to the composition's own budget — the same soft cap the former `nexus_get_context` tool's `maxChars` parameter bounded; `@nexus-framework/cli` clamps it to 2000-60000 and defaults to 12000 when omitted. (`@nexus-framework/cli`'s own work spec calls out replacing this char budget with a token budget as planned future work; this package will follow suit once that ships in a published version.)

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `Config` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Task derivation

`nexus_get_context` let the model phrase its own `task` string deliberately. Ambient injection has no such call, so this package concatenates the text content of every user message that opened the current turn — already-logged plus anything a downstream `agent/pre-step` listener proposed — in order, separated by blank lines. This is the closest available substitute: the same words a developer would type into `nexus_get_context(task)` by hand for the same request. A turn with no text content (e.g. tool-result-only) derives an empty task and is skipped — no injection, no error.

## Failure behavior

Ambient context is a convenience, not a load-bearing dependency. A transient failure inside `getContextTool` (the brain mid-write, a moved file) is caught and the turn proceeds without injection — silently, since a missing convenience should never surface as a turn-blocking error the way a deliberately issued `nexus_get_context` call would. The one exception is misconfiguration at load: an invalid `projectRoot` still fails loud when the plugin is mounted, per the config section above.

## Timing semantics

The plugin prepends an `agent/pre-step` listener and delegates first. When step 1 enters and a task derives, it appends one sourced `UserMessage` to the returned batch — the same append point `time-context` uses, so AgentLoop records the final batch after `step/start` and before request derivation. Rejection, an already-aborted signal, or step 2+ of the same turn appends nothing.

Each reading uses the exact snapshot source `{ kind: 'plugin', plugin: 'nexus-brain-context', form: 'snapshot', sections: [{ name: 'nexus-brain-context', text: <same text> }] }`. The `./invariant` companion validates that shape, re-derives the turn/step position from the durable session log, and checks that the message body is valid JSON carrying the composed-pack shape (a string `task`, a boolean `truncated`).

## Model Experience

### Ambient brain-context reading

#### What the model sees

One message per turn, on step 1 only:

```
<system-reminder>
The following is this project's NEXUS brain context for the task you were just asked to do: the active plan slice, matching knowledge entries, matching skills, and vital signs, the same pack `nexus_get_context` would return. Use it as grounding; it does not override system, developer, or direct user instructions.

<pretty-printed ComposedContext JSON>
</system-reminder>
```

#### Token effect

One composed pack per turn, bounded by `maxChars` (default 12000, the same soft cap the former `nexus_get_context` tool's `maxChars` bounded). Unlike `time-context`, there is no refresh-interval config — every turn with derivable task text gets exactly one fresh reading.

#### KV Cache effect

Append-only; the reading follows the reusable request prefix like any other durable message and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Heuristic task derivation** — concatenated user-turn text stands in for a deliberately phrased `task` string; it can under- or over-match knowledge entries and skill triggers compared to a hand-written query.
- **Silent best-effort failures** — a transient composition error is swallowed rather than surfaced, by design (see Failure behavior); there is currently no counter or log line distinguishing "nothing to inject" from "injection failed."
- **No mid-turn refresh** — later steps of a turn never see an updated pack even if the turn's effective task shifts significantly across steps.
- **No numeric range validation in Config** — `maxChars`'s 2000-60000 range is enforced by `@nexus-framework/cli`'s own clamp, not by this package's Schemastery `Config`.
- **Char budget, not a token budget** — `@nexus-framework/cli`'s work spec calls out replacing `maxChars` with a token-aware `maxTokens` as planned future work; this package inherits whichever budget shape the currently depended-on published version exposes, and will follow that change once it ships.
- **Single fixed provider** — there is exactly one way to reach a NEXUS brain (in-process import of `@nexus-framework/cli`'s handlers); no Service Definition/Provider seam, since there is currently only one implementation to swap.
