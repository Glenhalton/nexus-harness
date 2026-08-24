---
nexus_plan: true
id: "ambient-context-injection"
title: "Ambient context injection for NEXUS's context pack"
status: "draft"
created: "2026-08-24"
updated: "2026-08-24"
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

**Out of scope**
- Whether `tool-nexus-brain` keeps *any* of its other 16 tools as tool
  calls (`nexus_wake`, `nexus_doctor`, the plan/knowledge/skill/agent
  tools) — this plan is scoped to `nexus_get_context` specifically. Those
  other 16 are not a round-trip-per-turn cost the way context pack
  retrieval is, and weren't part of what was decided here.
- Whether the existing `nexus_get_context` tool registration should be
  removed outright or kept as a manual-override escape hatch once ambient
  injection exists — a real implementation question, not decided yet.
- A parallel naming-vocabulary decision was also made in the same
  conversation: cross-system docs should always say "NEXUS plans" (never
  bare "plan") to avoid collision with Cordis's own `plan-mode` — unrelated
  to this plan's subject, noted here only so it isn't lost; it doesn't need
  its own plan (it's a documentation convention, not gated work).

## Acceptance Criteria
- [ ] A `context/`-family plugin in this harness exposes NEXUS's composed
      pack (via the same `@nexus-framework/cli` `./mcp` handlers
      `tool-nexus-brain` already imports) as model-visible request context,
      no tool call required.
- [ ] The plugin respects `projectRoot` resolution the same way
      `tool-nexus-brain` does — fails loud at load if `.nexus/` is missing,
      not silently on first use.
- [ ] `nexus_get_context`'s existing budget/`maxTokens` behavior is
      preserved — ambient injection doesn't mean unbounded injection.
- [ ] A decision is made and recorded (see Out of scope) on whether the old
      tool-call registration is removed or kept as an override.
- [ ] Tested with a mocked/fixture `.nexus/` project the same way
      `tool-nexus-brain`'s existing test suite does.

## Steps
- [ ] Read `packages/context/README.md` and at least one existing
      `context/`-family package's implementation as the pattern to follow.
- [ ] Design the plugin's `apply()`/config shape, reusing
      `resolveBrainContext` and the composed-pack handler from
      `@nexus-framework/cli`'s `./mcp` export, same as `tool-nexus-brain`.
- [ ] Decide and implement the tool-call-removal-vs-override question left
      open above.
- [ ] Write tests (fixture `.nexus/` project, mirroring
      `tool-nexus-brain`'s existing fixture pattern).
- [ ] Update `tool-nexus-brain`'s README/design note to reflect the new
      split of responsibilities between the two delivery paths.

## Notes
- This plan does not touch nexus-cli — everything here is additive in
  `nexus-harness` on top of the already-existing `tool-nexus-brain` bridge
  and the `resolveBrainContext`/`./mcp` surface it already depends on.
- Not yet dispatched to an agent as of 2026-08-24 — queued pending scoping
  of the tool-call-removal-vs-override question above, which is a real
  design call, not an implementation detail.

## Evidence
- (to be filled once implemented)
