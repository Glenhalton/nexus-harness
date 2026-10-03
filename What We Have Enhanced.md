# What We Have Enhanced (Why Nexus Harness is a Commercial Powerhouse)

> **Commercial Value Proposition:** Upstream DeepSeek Harness (DSH) is a powerful low-level execution engine, but it is stateless, unbranded, developer-opaque, and disconnected from project architectures. **Nexus Harness transforms it into a full-featured, architecture-grounded, proprietary AI development suite** that teams and solo engineers can rely on to build production software.

---

## 1. Ambient Brain-Context Injection (`nexus-brain-context`)
* **The Problem in Upstream:** Upstream DSH starts every turn as a blank slate. The agent has zero memory of project architecture, data contracts, current sprint objectives, or established team conventions. Developers waste tokens and time repeatedly priming the agent.
* **Our Enhancement:** We built `packages/experimental/nexus-brain-context/` to inject project intelligence into **Step 1 of every turn** via ambient `<system-reminder>` blocks.
* **Commercial Edge:** The agent arrives at every turn already knowing:
  - The current sprint plan and next unfinished task.
  - Active architecture specs and data contracts.
  - Project conventions, tech stack definitions, and knowledge base gotchas.
  - **Zero tool calls wasted** just getting oriented.

---

## 2. In-Process NEXUS Brain Tools (`tool-nexus-brain`)
* **The Problem in Upstream:** Connecting custom tools to DSH traditionally requires spinning up separate MCP processes communicating over stdio JSON-RPC, introducing network latency, process crash points, and disconnected logging.
* **Our Enhancement:** We created `packages/experimental/tool-nexus-brain/` which mounts all 19 NEXUS tools (`nexus_wake`, `nexus_plan_tick`, `nexus_plan_verify`, `nexus_log`, `nexus_project_graph`, `nexus_query_knowledge`, `nexus_doctor`, etc.) **directly in-process** on `ctx.tools` with Schemastery lossless JSON sanitization.
* **Commercial Edge:** Instant zero-latency tool dispatch, fully integrated into the harness's event timeline and token accounting without external daemon processes.

---

## 3. Visual Brain Indicators & Interactive Plan Inspector (Web UI)
* **The Problem in Upstream:** Developers have no visibility into what context the model was given or how it is progressing through multi-step tasks.
* **Our Enhancement:**
  1. **Conversation Header Status Chip:** Displays real-time brain grounding state and active plan name directly in the main header.
  2. **Turn Grounding Inspector Drawer:** A clickable slide-out inspector detailing the exact spec excerpts, active plan slices, and knowledge items injected into each turn.
  3. **Interactive Plan Checklist Widget:** Embedded directly in the right sidebar—allows users to watch tasks turn green in real-time or tick off steps manually.
* **Commercial Edge:** Total transparency and control. Customers can visually audit agent reasoning and plan execution in real time.

---

## 4. Unified First-Class CLI Launcher (`nexus harness` & `nexus agent`)
* **The Problem in Upstream:** Launching DSH requires navigating into subdirectories, knowing internal profile names, passing obscure `--patch` flags, or writing bash wrappers.
* **Our Enhancement:** Integrated first-class `nexus harness` and `nexus agent` subcommands into `@nexus-framework/cli`.
* **Commercial Edge:**
  - Zero-config launch from any repository root: `nexus harness` auto-detects `.nexus/`, auto-wires the brain patch, and launches the web interface at `http://localhost:3080`.
  - Dedicated CLI flags: `--port`, `--no-open`, `--tui`, `--desktop`.
  - High-tech branded ASCII banner displaying project vitals, model provider, and active plan on launch.

---

## 5. Claude Code-Style Interactive Terminal TUI Agent
* **The Problem in Upstream:** Terminal users were limited to a basic line runner without streaming, real-time approval prompts, or ergonomic REPL features.
* **Our Enhancement:** Built a native Cordis TUI bundle (`packages/bundle/tui-app`) running directly on `dsh-base`.
* **Commercial Edge:**
  - Real-time token streaming in terminal.
  - Interactive approval modals for tool calls (filesystem edits, terminal commands).
  - Built-in slash commands (`/help`, `/plan`, `/grill`, `/clear`).
  - Session resumption and persistent history without leaving the shell.

---

## 6. Nexus Glass Visual Identity & Ambient UI
* **The Problem in Upstream:** Out-of-the-box DSH has utilitarian, stark styling with generic placeholder logos.
* **Our Enhancement:**
  - Shipped the **Nexus Glass** theme with backdrop blur filters, sleek dark-mode glassmorphism, and subtle ambient gradients (`AmbientBackground.tsx`).
  - Made Nexus Glass the first-run default (`DEFAULT_PREFERENCE = 'nexus'`).
  - Integrated official hexagonal Nexus vector marks, wordmarks, and custom favicons into the sidebar and conversation hero.
* **Commercial Edge:** Looks and feels like a state-of-the-art $50/mo developer platform from the very first second a user opens it.

---

## 7. Side-by-Side Subagent Inspector View
* **The Problem in Upstream:** When agents spawn child agents (subagents) to perform delegated tasks, their transcripts and intermediate tools run opaquely in the background.
* **Our Enhancement:** Created a dedicated split-view panel in the details drawer to view live subagent transcripts, tool calls, and completion status concurrently with the parent agent.
* **Commercial Edge:** Essential for enterprise-grade autonomous workflows where supervisors need to inspect subagent safety and correctness in flight.

---

## 8. First-Class Local Model Support (Ollama Quick-Add) & Robust Error Recovery
* **The Problem in Upstream:** Setting up local models required manual JSON editing; model connection drops or context overflows produced cryptic stream crashes.
* **Our Enhancement:**
  - Added an **Ollama Quick-Add** card in Settings → Models with automated header patching.
  - **Nested JSON Error Unwrapping:** Intelligent parser that unwraps nested vendor error payloads into clear, actionable error toasts instead of raw stack traces.
  - **Model Inventory Toggles:** Switch models on/off per workspace with a single toggle.
* **Commercial Edge:** Makes local privacy-first offline AI painless for enterprise security requirements.

---

## 9. Alignment & Grilling Interviews (`dsh-grill-mode`)
* **The Problem in Upstream:** Models immediately start guessing code implementations upon reading a vague prompt, causing huge rework.
* **Our Enhancement:** Integrated interactive alignment interviews where the harness grills the developer on architectural decisions, trade-offs, and edge cases before writing code.
* **Commercial Edge:** Prevents hallucinated architectures and aligns code with real business logic.

---

## 10. Self-Contained Packaging, Minification & Dual-License Structure
* **The Problem in Upstream:** Distributed as raw monorepo packages requiring manual setup, while open-source modifications risk license ambiguity or trivial copy-pasting.
* **Our Enhancement:**
  - **Self-Contained Standalone Packaging:** Packaged as `@nexus-framework/harness` with all 325 internal package dependencies materialized and external runtime dependencies resolved into a single distributable.
  - **Code Minification & Variable Mangling:** 5,100+ runtime files processed with `esbuild` to strip internal comments, inline legal notices, and mangle local variable identifiers—significantly raising the friction against trivial casual inspection or copy-pasting.
  - **Responsible Protection Claims:** Minification is a pragmatic friction layer rather than unbreakable encryption or DRM. True product defensibility stems from continuous ecosystem velocity, active plan synchronization, and deep platform integration.
  - **Strict Legal & License Compliance:** Shipped under `SEE LICENSE IN LICENSE`. Fully preserves the original DeepSeek MIT copyright notice for all upstream base components, while reserving All Rights Reserved proprietary rights for NEXUS additions (custom themes, branding, launcher bindings, and brain-context plugins).
* **Commercial Edge:** Professional, friction-reduced distribution that respects open-source licensing obligations while clearly asserting commercial ownership over proprietary additions.

---

## 11. Dynamic Verified Skills Registry & On-Demand Resolution
* **The Problem in Upstream:** Upstream agents operate without curated architectural skills or require manual skill downloads into the local workspace. If a project lacks a specific skill locally, the agent falls back to generic, often outdated model assumptions.
* **Our Enhancement:**
  - Linked `@nexus-framework/skills` directly to the CLI and Harness with a multi-tiered fallback hierarchy: `custom/` (local user overrides) > `core/` (project-installed skills) > `community/` (third-party packs) > `verified` (in-memory registry fallback from `@nexus-framework/skills`).
  - Elevated the skills registry with production-standard architectures: **AI Integration** (Zod schemas, SSE streaming, token budgeting), **Authentication Patterns** (HttpOnly cookies, Argon2id, JWT rotatable refresh), **Zero-Downtime Data Migrations** (expand-and-contract, concurrent indexing, lock timeouts), **State Machines & Workflows** (FSM transition matrices, Idempotency-Keys, Saga orchestrations), **Docker Containerization** (multi-stage builds, non-root `appuser`, signal forwarding), and complete **API Design & Testing** packs for Python, Go, and Rust.
* **Commercial Edge:** Out-of-the-box enterprise expertise. Even in a brand-new unconfigured repository, Nexus Harness automatically resolves verified, best-practice skills for full-stack microservices without manual configuration.
