---
nexus_doc: true
id: "project_index"
title: "Project Index — AI Agent Brain"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# NEXUS Execution Harness — Project Index

> **🧠 THIS IS THE AI AGENT'S BRAIN** for `nexus-harness`.
> AI agents MUST read this file before every task and update it after every task.

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh` / `nexus-harness`)
**Published Version:** 0.1.1-rc.2 (per package.json)
**Framework:** Cordis Spatiotemporal Plugin Kernel (TypeScript / ESM)
**Data Strategy:** Local-first append-only session events + SQLite
**Status:** 🟢 Populated & Active — Phase 3 (Bridge Package Promotion)

---

<!-- NEXUS:VITAL_SIGNS:START — managed by `nexus sync` -->
## 🩺 Vital Signs (auto)

_Last sync: 2026-10-05T17:18:03.761Z · branch `master` · 0 commits ahead of main · working tree dirty_

| Sensor | Reading |
|--------|---------|
| Last commit | b32103d9be — docs(knowledge): record the verified nexus command handoff between CLI and harness · Glenhalton · 44 seconds ago |
| Tests | not yet measured |
| Coverage | not collected · M1 sensor adds `vitest --coverage` parsing |
| Stale folders | src/commands never created · src/utils never created · src/generators never created · tests/e2e never created · tests/unit never created · tests/integration never created |
| Packages | not yet measured |
<!-- NEXUS:VITAL_SIGNS:END -->

---

## 🎯 Current Objective

**Active Phase:** Phase 3 — Bridge Package Promotion & Production Presets
**Current Task:** Promote experimental bridge packages (`tool-nexus-brain` and `nexus-brain-context`) and integrate into default Cordis runtime profiles.
**Blocked:** None
**Next Up:** Execution Evidence Pipeline (NEXUS 2.0 Phase 2)

---

## 📊 Project Status Matrix

| Area | Status | Notes |
|------|--------|-------|
| 📋 Vision & Requirements | 🟢 Populated | Documented in `01_vision.md` |
| 🏗️ Architecture | 🟢 Populated | Documented in `02_architecture.md` |
| 📊 Data Contracts | 🟢 Populated | Documented in `03_data_contracts.md` |
| 🔌 API Contracts | 🟢 Populated | Documented in `04_api_contracts.md` |
| 📐 Business Logic | 🟢 Populated | Documented in `05_business_logic.md` |
| 🧪 Test Strategy | 🟢 Populated | Documented in `06_test_strategy.md` |
| 🔨 Implementation Plan | 🟢 Populated | Documented in `07_implementation.md` |
| 🚀 Deployment | 🟢 Populated | Documented in `08_deployment.md` |
| 🏠 Core Features | 🟢 In Progress | Core runtime + ambient brain context live |
| 🧪 Tests | 🟢 Passing | Loader composition + unit suites green |

---

## 🗂️ Feature Backlog

| # | Feature | Priority | Status | Phase | Notes |
|---|---------|----------|--------|-------|-------|
| 1 | Native NEXUS Brain Tool Bridge | P0 | 🟢 Built | Phase 2 | 16 native Cordis tools wrapped |
| 2 | Ambient Brain Context Injection | P0 | 🟢 Built | Phase 2 | `agent/pre-step` step 1 context injection |
| 3 | Ollama Local Model Header & UI | P1 | 🟢 Built | Phase 2 | Zero-config local model support |
| 4 | Skill Catalog Project Scoping | P1 | 🟢 Built | Phase 2 | `projects` frontmatter filter in `skill-filesystem` |
| 5 | Populate Harness Project Brain | P0 | 🟢 Populated | Phase 3 | All 8 docs populated from codebase reality |
| 6 | Promote Bridge Packages from Experimental | P0 | 🟡 Active | Phase 3 | Promote to standard workspace package group |
| 7 | Default Profile Context Auto-Mount | P1 | 🟡 Active | Phase 3 | Mount ambient context in default `cordis.yml` |
| 8 | NEXUS 2.0 Execution Evidence Pipeline | P0 | 📋 Planned | Phase 4 | Export `AgentRun` session logs as task Evidence |
| 9 | Desktop Distribution (Nexus Harness app, GitHub Releases, `nexus`/`nexus-code` on PATH) | P0 | 🟢 Built | Phase 3 | Packaged builds still unverified on Apple Silicon/Windows; awaiting signing certs |
| 10 | In-App Onboarding (Set up NEXUS, terminal commands, key check) | P0 | 🟢 Built | Phase 3 | Desktop key check is DeepSeek-only |
| 11 | Slim npm Harness Package (prebuilt JS, runtime-only deps) | P1 | 🟢 Built | Phase 3 | 27.6 MB → 10.3 MB tarball |
| 12 | Choose Your AI Provider first-run step | P1 | 📋 Planned | Phase 4 | Let first-run onboarding (desktop + web) pick Claude, Ollama, OpenAI-compatible etc., not just DeepSeek, with a per-provider connection test |
| 13 | Code Signing & Notarization | P0 | 📋 Planned | Phase 3 | Owner: user. See `.nexus/plans/code-signing-and-notarization-credentials.md` |

---

## 📁 What Has Been Built

### Packages & Modules
| Package | Path | Status | Description |
|---|---|---|---|
| `tool-nexus-brain` | `packages/experimental/tool-nexus-brain` | ✅ | Direct Cordis `ctx.tools` wrapper for 16 NEXUS brain tools |
| `nexus-brain-context` | `packages/experimental/nexus-brain-context` | ✅ | Ambient step 1 context injection plugin |
| `skill-filesystem` | `packages/skill/skill-filesystem` | ✅ | Filesystem skill loader with project scoping |
| `web` | `apps/web` | ✅ | Nexus-branded glass web dashboard and streaming chat |

---

## 🔄 Progress Log

### 2026-10-05 — Desktop Distribution, Onboarding, and npm Slimming Merged
- ✅ Merged three plans to master: desktop rebrand + GitHub Releases + terminal commands, in-app onboarding, slim npm package.
- ✅ Typecheck clean on host + client; scoped tests 1270 passed (2 load-timeout flakes pass in isolation).
- ⚠️ `tool-nexus-brain` coverage sweep fails on `nexus_log` under CLI 1.6.0 (`split('\\n')` bug in brain-memory); fixed in CLI 2.0.0 source. Resolves when the harness moves to CLI 2.0.0.
- ⏭️ Added backlog #12 "Choose Your AI Provider" first-run step.

### 2026-09-07 — Harness Project Brain Populated (Track 1 Complete)
- ✅ All 8 template docs (`01_vision.md` through `08_deployment.md`) populated with actual Cordis architecture, event contracts, runtime state machines, test hierarchies, and deployment modes.
- ✅ Root `index.md` status matrix updated from `template` to `populated`.
- ✅ Resolved pre-commit hook conflict and committed upgrade to NEXUS CLI v1.5.2 (`3f4d4ae31e`).

### 2026-08-24 / 2026-08-25 — Ambient Brain Context Injection & Skill Scoping
- ✅ Completed plan `ambient-context-injection` (`packages/experimental/nexus-brain-context`) with `agent/pre-step` listener.
- ✅ Removed redundant `nexus_get_context` tool call from `tool-nexus-brain` (down to 16 tools).
- ✅ Swapped `file:` dependency for published `@nexus-framework/cli` semver (`^1.4.0` / `1.5.1`).
- ✅ Shipped `projects` frontmatter scoping in `skill-filesystem`.
- ✅ Added Ollama header bypass and quick-add card in settings.

- 2026-10-05 — ✅ Completed plan `slim-the-npm-harness-package-and-expose-nexus-bin`: Slim the npm harness package and expose nexus bin

- 2026-10-05 — ✅ Completed plan `desktop-app-rebrand-release-pipeline-and-nexus-on-path`: Desktop app rebrand, release pipeline, and nexus on PATH

- 2026-10-05 — ✅ Completed plan `in-app-onboarding-for-non-technical-users`: In-app onboarding for non-technical users
