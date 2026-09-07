---
nexus_doc: true
id: "07_implementation"
title: "Implementation Plan & Phases"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# Implementation Plan & Phases — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Active Phase:** Phase 3 — Bridge Package Promotion & Production Presets

---

## 🎯 Implementation Roadmap

### Phase 1: Cordis Kernel & Core Subsystems (✅ Complete)
- Cordis spatiotemporal plugin kernel and profile composition (`web`, `headless`).
- Append-only `SessionEvent` store and in-memory session query index.
- LLM streaming adapters (`deepseek`, `ollama`, `anthropic`, `openai`).
- Tool execution pipeline with permission gating and sandboxed filesystem.

### Phase 2: NEXUS Brain Integration & Local AI (✅ Complete)
- Built `packages/experimental/tool-nexus-brain` exposing 16 NEXUS tools directly to Cordis.
- Built `packages/experimental/nexus-brain-context` for ambient, step-1 context injection.
- Replaced local `file:` dependency with published `@nexus-framework/cli` semver (`^1.4.0` / `1.5.1`).
- Added Ollama header bypass and quick-add card in Web UI.
- Implemented `projects` frontmatter scoping in `skill-filesystem`.

### Phase 3: Bridge Package Promotion & Production Presets (🟡 Active)
- Promote `tool-nexus-brain` and `nexus-brain-context` from `packages/experimental/` to first-class workspace packages.
- Wire ambient context injection into default runtime profiles so every session gets project grounding automatically.
- Clean up allowlists and verify workspace invariant suites.

### Phase 4: NEXUS 2.0 Execution Evidence Pipeline (📋 Planned)
- Implement an execution evidence exporter that transforms session event logs into machine-readable evidence for NEXUS tasks.
- Connect test verification and task settlement to verifiable `AgentRun` records.
- Integrate with `nexus-cli`'s Provable Done manifest.
