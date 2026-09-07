---
nexus_doc: true
id: "03_data_contracts"
title: "Data Contracts & Event Schemas"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# Data Contracts & Event Schemas — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Data Strategy:** Local-first append-only session events + SQLite query index

---

## 📊 Core Data Entities

### 1. `SessionEvent` (Append-Only Event Store)
The foundational unit of state in the harness. Every turn, model token stream, tool execution, and user interaction is recorded as an immutable event.

```typescript
interface SessionEvent<T = unknown> {
  id: string;               // Monotonic or UUID event identifier
  sessionId: string;        // Owning agent session identifier
  type: string;             // Event discriminator (e.g. 'turn/start', 'step/start')
  timestamp: number;        // Epoch millisecond timestamp
  data: T;                  // Typed payload defined in SessionEventMap
}
```

#### Event Discriminators (`SessionEventMap`):
- `turn/start` / `turn/end`: Delimits a multi-step turn.
- `step/start` / `step/end`: Delimits a single LLM inference and its tool calls.
- `user/message`: Inputs claimed and accepted by the agent loop.
- `assistant/chunk`: Real-time streaming delta from the model provider.
- `assistant/message`: Consolidated final response from the assistant.
- `tool/call`: Tool invocations emitted by the model with arguments.
- `tool/result`: Tool output returned to the model or error trace.

---

## 🛡️ Core Invariant: "Model-Visible Means Logged"

The harness enforces a strict architectural invariant:
> **Anything the model observes must be fully reconstructable from the append-only session event log.**

- Ambient context injected by `nexus-brain-context` or time context must be emitted as a session event.
- Direct model history is projected from the log via `deriveMessages(sessionEvents)`.
- Replay, fork, and branch capabilities depend entirely on event log completeness.

---

## 🔌 Tool Parameter & Output Contracts

Tools are registered on `ctx.tools` using Cordis's Schema DSL (`@deepseek-ai/dsh-tools`):

```typescript
interface ToolSpec {
  name: string;
  description: string;
  parameters: ParameterSchemaSpec;
  returns?: ValueSchemaSpec;
  execute: (input: unknown, ctx: ToolExecutionContext) => Promise<unknown>;
}
```

- Input validation is enforced at pre-execution before reaching handler code.
- Flat returns use typed schemas; complex or polymorphic returns leverage the JSON envelope escape hatch.

---

## 📂 Skill Metadata Contract

Skills discovered from filesystem directories (`~/.agents/skills/`, `.agents/skills/`) follow the extended SKILL_SPEC contract:

```yaml
---
name: string               # Unique skill identifier
description: string        # Model-visible capability summary
invocation: model | user   # Invocation mode
category: reference | procedure
projects: string[]         # Optional project directory basenames for scoping
triggers: string[]         # Keyword/intent triggers
---
```
