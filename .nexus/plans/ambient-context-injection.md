---
nexus_plan: true
id: "ambient-context-injection"
title: "Ambient context injection for NEXUS's context pack"
status: "done"
created: "2026-08-24"
updated: "2026-08-25"
owner: "unassigned"
source: "manual:feature"
type: "feature"
parent: null
estimate: "3d"
phase: "feature-delivery"
tags: ["feature"]
---
## Goal
Deliver NEXUS's composed context pack to a Cordis-hosted agent as ambient,
no-tool-call context — via Cordis's `context/` package family — replacing the
current tool-call-only path (`packages/experimental/tool-nexus-brain`'s
`nexus_get_context` registration on `ctx.tools`).

## Why
`nexus-harness-work.md`'s harness profiles exist because small local models
(`tool_calling: unreliable | none`) can't reliably make tool calls at all —
those profiles currently get a static-fallback instruction file specifically
because there was no ambient delivery mechanism available. Cordis's
`context/` family (product plugins that add model-visible request context
without defining a tool) closes that gap for real, for any harness profile,
not only the unreliable-tool-calling ones.

## Grilling
**Ask:** Should NEXUS's context pack keep arriving as a tool call
(`nexus_get_context`, current `tool-nexus-brain` shape), or move to ambient,
no-round-trip injection via Cordis's `context/` family?

**Resolved**
- Delivery mode — switch to ambient `context/`-family injection, replacing
  the tool-call path (not a hybrid/profile-gated choice). Rejected keeping
  the tool call as the permanent default: it costs a round trip the small-
  window harness profiles can't always afford, and Cordis already has a
  mechanism built for exactly this case.
- Rejected the hybrid option (native/large-window profiles keep the tool
  call, small/unreliable profiles get ambient injection) — decided to move
  fully to ambient injection rather than maintain two delivery paths.
- Tool-call removal vs. override (left open below) — resolved 2026-08-24:
  remove `nexus_get_context` outright rather than keep it as a manual
  override. See Steps/Evidence.

**Out of scope**
- Whether `tool-nexus-brain` keeps *any* of its other 16 tools as tool
  calls (`nexus_wake`, `nexus_doctor`, the plan/knowledge/skill/agent
  tools) — this plan is scoped to `nexus_get_context` specifically. Those
  other 16 are not a round-trip-per-turn cost the way context pack
  retrieval is, and weren't part of what was decided here.
- ~~Whether the existing `nexus_get_context` tool registration should be
  removed outright or kept as a manual-override escape hatch once ambient
  injection exists~~ — resolved above, see Grilling.
- A parallel naming-vocabulary decision was also made in the same
  conversation: cross-system docs should always say "NEXUS plans" (never
  bare "plan") to avoid collision with Cordis's own `plan-mode` — unrelated
  to this plan's subject, noted here only so it isn't lost; it doesn't need
  its own plan (it's a documentation convention, not gated work).

## Acceptance Criteria
- [x] A `context/`-family plugin in this harness exposes NEXUS's composed
      pack (via the same `@nexus-framework/cli` `./mcp` handlers
      `tool-nexus-brain` already imports) as model-visible request context,
      no tool call required. — `@deepseek-ai/dsh-experimental-nexus-brain-context`
      (`packages/experimental/nexus-brain-context`), a prepended
      `agent/pre-step` listener that injects the composed pack on step 1 of
      each turn.
- [x] The plugin respects `projectRoot` resolution the same way
      `tool-nexus-brain` does — fails loud at load if `.nexus/` is missing,
      not silently on first use. — `apply()` calls `resolveBrainContext`
      synchronously at plugin load, same as `tool-nexus-brain`; proven by
      the real Loader-composition test's "fails loading when projectRoot
      has no .nexus/ directory" case.
- [x] `nexus_get_context`'s existing budget/`maxChars` behavior is
      preserved — ambient injection doesn't mean unbounded injection. —
      `Config.maxChars` passes straight through to `getContextTool`'s own
      budget (2000-60000 clamp, default 12000, matching the published
      `@nexus-framework/cli@^1.4.0` this package and `tool-nexus-brain`
      both depend on); covered by the "accepts a maxChars override" unit
      test.
- [x] A decision is made and recorded (see Out of scope) on whether the old
      tool-call registration is removed or kept as an override. — Removed.
      Halton chose removal over keep-as-backup or keep-but-deprecated when
      asked directly, once the ambient path existed to replace it.
- [x] Tested with a mocked/fixture `.nexus/` project the same way
      `tool-nexus-brain`'s existing test suite does. — Reuses
      `tool-nexus-brain`'s existing fixture (`tests/fixtures/nexus-project`)
      rather than duplicating it; both a direct-mount unit suite
      (`nexus-brain-context.spec.ts`, 4 tests) and the mandatory real
      Loader-composition suite (`loader-composition.spec.ts`, 2 tests)
      pass against it.

## Steps
- [x] Read `packages/context/README.md` and at least one existing
      `context/`-family package's implementation as the pattern to follow.
      — `time-context` was the primary template (`agent-instructions` was
      examined and rejected as too complex a template for this task's
      scope).
- [x] Design the plugin's `apply()`/config shape, reusing
      `resolveBrainContext` and the composed-pack handler from
      `@nexus-framework/cli`'s `./mcp` export, same as `tool-nexus-brain`.
- [x] Decide and implement the tool-call-removal-vs-override question left
      open above. — Removed `nexus_get_context` from `tool-nexus-brain`:
      the import, the tool registration, and every reference across its
      three test files and both READMEs (English + Chinese).
- [x] Write tests (fixture `.nexus/` project, mirroring
      `tool-nexus-brain`'s existing fixture pattern).
- [x] Update `tool-nexus-brain`'s README/design note to reflect the new
      split of responsibilities between the two delivery paths. — Both
      READMEs (English + Chinese) and the
      `2026-08-22-nexus-brain-tool-bridge` design note (both languages, a
      second "Update, 2026-08-24" section) updated; `docs/tool-catalog.md`/`.zh.md`
      regenerated/re-synced to 16 tools.

## Notes
- This plan does not touch nexus-cli — everything here is additive in
  `nexus-harness` on top of the already-existing `tool-nexus-brain` bridge
  and the `resolveBrainContext`/`./mcp` surface it already depends on.
- Dispatched and implemented 2026-08-24/25 — no further scoping was needed
  once the tool-call-removal-vs-override question was resolved (see
  Grilling). Sequenced after the separate `chore/tool-nexus-brain-real-dependency`
  work (dropping `tool-nexus-brain`'s `file:` dependency for a published
  `^1.4.0` range): `nexus-brain-context` was built to depend on
  `@nexus-framework/cli` the same real way from the start, with no `file:`
  detour of its own.

## Evidence
```json
{
  "verified_at": "2026-09-07T09:58:56.876Z",
  "brain_hash": "4faa1c53c3f4b1f0f792c5aa06420360da5946ca685d1642b14ca4d97f2a2088",
  "wake_token": "NX-WAKE-J9NF-2026-08-22",
  "checks": [
    {
      "id": "bridge-tests",
      "run": "npx vitest run packages/experimental/tool-nexus-brain packages/experimental/nexus-brain-context",
      "exit": 0,
      "duration_ms": 6624,
      "output_sha256": "b0d361dde3f30bfab4bb69430a26c7b10469a80fb41dd841d7c2c1fd6ae2277a",
      "summary": "6 passed"
    }
  ]
}
```
