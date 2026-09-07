---
nexus_doc: true
id: "02_architecture"
title: "System Architecture"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# System Architecture — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Kernel:** Cordis Spatiotemporal Plugin Engine
**Runtime:** Node.js 22 (ESM) / TypeScript strict
**Package Manager:** pnpm (workspaces)

---

## 🏗️ Architecture Overview

The harness architecture follows the **"Everything is a Plugin"** paradigm powered by [Cordis](https://github.com/cordiverse/cordis). No part of the system is a privileged core: agent loops, model streaming, tool execution, session storage, and the web interface are all modular plugins providing services and listening to typed events on a shared context (`ctx`).

```text
┌──────────────────────────────────────────────────────────────┐
│                       Cordis Context                         │
├─────────────────┬─────────────────┬──────────────────────────┤
│   ctx.sessions  │    ctx.tools    │        ctx.agents        │
│  (Session Store)│ (Tool Registry) │   (Agent Loop & Inbox)   │
├─────────────────┼─────────────────┼──────────────────────────┤
│     ctx.llm     │ ctx.systemPrompt│     ctx.permissions      │
│  (Model Adapter)│ (Prompt Sections│   (Approvals & Policy)   │
└────────┬────────┴────────┬────────┴─────────────┬────────────┘
         │                 │                      │
┌────────▼────────┐┌───────▼────────┐┌────────────▼────────────┐
│ NEXUS Ambient   ││ NEXUS Brain    ││ Local Model Layer       │
│ Context Plugin  ││ Toolset Plugin ││ (Ollama / Claude / API) │
└─────────────────┘└────────────────┘└─────────────────────────┘
```

---

## 🛠️ Tech Stack & Workspace Layers

| Layer | Technology | Role & Rationale |
|---|---|---|
| **Plugin Kernel** | Cordis | Dynamic service discovery, typed events, and reversible plugin effects |
| **Language & Build** | TypeScript / tsdown | Fast multi-package bundling and strict typing across 50+ packages |
| **Package Manager** | pnpm (workspaces) | Fast workspace linking, strict peer dependency isolation |
| **Web UI** | Vue 3 / Vite / Tailwind CSS | High-performance interactive dashboard with streaming markdown & glass styling |
| **Testing** | Vitest | Unit suites, Loader-composition tests, and ACP snapshot testing |
| **Linting & Hygiene** | Oxlint / Lefthook / TypeScript | Sub-second AST linting and git pre-commit safety invariants |
| **NEXUS Bridge** | `@nexus-framework/cli` (`./mcp`) | Direct in-process invocation of project intelligence |

---

## 📁 Directory Structure & Workspace Groups

```text
nexus-harness/
├── apps/                          # Executable applications
│   ├── web/                       # Web UI host process
│   └── cli/                       # Command-line binary (dsh)
├── packages/
│   ├── boot/                      # Profile loading, CLI entry, Cordis configuration
│   ├── bundle/                    # Profile definitions (base, web-app, headless)
│   ├── core/                      # Core Cordis services (agent, agent-loop, session, tools)
│   ├── context/                   # Ambient prompt context plugins (time, instructions)
│   ├── experimental/              # Incubation packages (nexus-brain-context, tool-nexus-brain)
│   ├── fs/                        # Filesystem tools, sandboxes, and path isolation
│   ├── llm/                       # LLM streaming adapters (DeepSeek, Ollama, Anthropic, OpenAI)
│   ├── permission/                # Approval seams and interactive security gates
│   ├── skill/                     # Skill catalog discovery and filesystem indexing
│   ├── subagent/                  # Multi-agent trees, child settlement, and persona scoping
│   └── ui/                        # Web UI components, markdown cards, and themes
├── .nexus/                        # NEXUS Brain (docs, plans, state)
└── docs/                          # Subsystem documentation, guides, and event maps
```

---

## 🔄 Turn Flow & Event Pipeline

Execution flows in a strictly structured lifecycle:

1. **`turn/start`**: Input claimed from the agent inbox; prompt sections and tool schemas assembled.
2. **`agent/pre-step`**: Waterfall listener deciding what the model sees. The `nexus-brain-context` plugin injects the NEXUS context pack at step 1 here.
3. **`step/start`**: Entered messages committed to the append-only session log as `user/message`.
4. **`agent/request` → `llm/stream`**: Model chunks stream in real time; completed response appends as `assistant/message`.
5. **`tool/call*`**: Guarded pipeline runs `tools/pre-execute` → `tools/execute` → `tools/post-execute`.
6. **`step/end`**: Results recorded; if tools requested follow-up work, another step claims input.
7. **`turn/end`**: Closed once no tools owe further requests.
