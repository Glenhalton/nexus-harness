---
nexus_doc: true
id: "01_vision"
title: "Product Vision & Requirements"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# Product Vision & Requirements — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh` / `nexus-harness`)
**Role in Ecosystem:** Execution Engine for NEXUS 2.0

---

## 🎯 Product Vision

The **NEXUS Execution Harness** is an open-source, plugin-composable autonomous agent runtime powered by [Cordis](https://github.com/cordiverse/cordis). While NEXUS CLI owns **project meaning** (plans, knowledge, requirements, specifications, and doctor verification), the Harness owns **execution**: model routing, tool dispatch, turn loops, multi-agent trees, sandboxed execution, and append-only session logging.

By decoupling project intelligence from execution, any coding agent running in the harness receives rich project context ambiently without wasting round trips, and every execution trace becomes machine-verifiable evidence for the project's roadmap.

---

## 👥 Target Users

1. **AI-Native Software Engineers**: Developers building complex systems who need autonomous agents capable of multi-step tool execution, local-model inference (Ollama), and durable state across reboots.
2. **Technical Project Managers (TPMs)**: Leaders using NEXUS to manage requirements who need execution evidence that tasks and tests actually ran and succeeded.
3. **Agent Platform Contributors**: Developers extending the harness with custom plugins, tools, model providers, and subagent personas via Cordis's spatiotemporal composability model.

---

## ✨ Core Features (Current & Near-Term)

### 1. Cordis Plugin Kernel
- Every component (agent loop, tool registry, session log, model adapters, web UI) is an unprivileged, composable plugin.
- Dynamically mounted, unmounted, and patched via `cordis.patch.yml` and profile stacks (`web`, `headless`, `code`).

### 2. Native NEXUS Brain Integration
- **Ambient Context Injection** ([`nexus-brain-context`](../../packages/experimental/nexus-brain-context)): Hooks into `agent/pre-step` to automatically inject the composed NEXUS context pack (active plan, knowledge, skills, vitals) into turn step 1.
- **Direct Tool Bridge** ([`tool-nexus-brain`](../../packages/experimental/tool-nexus-brain)): Exposes 16 native Cordis tools (`nexus_wake`, `nexus_doctor`, `nexus_plan_*`, etc.) so calls are captured directly in the session log.

### 3. Local Model Ergonomics & Ollama
- Direct header bypass allowing local models to run without API keys.
- Quick-add UI presets for Ollama in model settings.
- Scoped skill discovery via `projects` frontmatter in `skill-filesystem` to preserve context windows.

### 4. Append-Only Session Log & Invariants
- Every turn, step, model message, and tool result is an immutable `SessionEvent`.
- Strict invariant: *Model-visible means logged* — every input presented to the model is reconstructable from the log.

### 5. Multi-Agent & Subagent Orchestration
- In-process and background subagent dispatch, persona-based tool filtering, and continuable child report obligations.

### 6. Nexus Glass Web UI
- Modern, glassmorphic UI with streaming chat, interactive tool expansion, file links, diff cards, and trajectory inspection.

---

## 🚫 Out of Scope (Harness Layer)

- **Project Specification & Requirements Storage**: The harness does not define business logic or backlog items; it executes against the brain managed by `nexus-cli`.
- **Proprietary Cloud Lock-in**: The harness remains open-source, locally runnable, and transport-agnostic.

---

## 📊 Success Metrics

- **Startup Latency**: Web UI ready within <2 seconds on local launch.
- **Context Efficiency**: Ambient injection stays within configured token budget without manual tool calls.
- **Test & Hygiene Integrity**: 100% green on Cordis Loader-composition tests, invariant suites, and oxlint.
- **Evidence Traceability**: Every finished agent turn yields a reconstructable session event stream.
