---
nexus_doc: true
id: "04_api_contracts"
title: "API Contracts & Interfaces"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# API Contracts & Interfaces — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Transport:** HTTP + WebSocket (Web UI) / In-Process RPC (Cordis `ctx.tools`)

---

## 🌐 Web Server & WebSocket RPC

The Harness Web App (`apps/web`) serves an interactive dashboard on `http://127.0.0.1:3080` and exposes WebSocket endpoints for live duplex communication:

### 1. Session Lifecycle Endpoints
- **`POST /api/sessions`**: Create a new agent session.
  - Body: `{ profile?: string, workspaceRoot: string, model?: string }`
  - Returns: `{ sessionId: string, status: "ready" }`
- **`GET /api/sessions/:id`**: Fetch session status and metadata.
- **`POST /api/sessions/:id/fork`**: Branch an existing session from a specific step.

### 2. WebSocket Protocol (`/ws`)
- **`session.subscribe`**: Client subscribes to real-time events for a session ID.
- **`session.event`**: Server pushes streamed `assistant/chunk`, `step/start`, and `tool/call` events.
- **`user.input`**: Client submits prompt or follow-up instruction.
- **`permission.respond`**: Client sends interactive human approval (`approve | reject`) for gated tool calls.

---

## 🛠️ In-Process Tool Interface (`ctx.tools`)

Every tool registered in the harness adheres to the Cordis tool execution interface:

```typescript
ctx.tools.defineTool({
  name: "tool_name",
  description: "Tool purpose and instructions for model",
  parameters: { ... },
  execute: async (args, executionContext) => { ... }
});
```

### Registered NEXUS Tools (via `tool-nexus-brain`):
The bridge package registers 16 native tools:
1. `nexus_wake`: Session handshake and doctor status summary.
2. `nexus_brief`: High-level human digest of project state.
3. `nexus_doctor`: Health and drift diagnostic checks.
4. `nexus_get_active_plan` / `nexus_get_plan` / `nexus_list_plans`: Plan discovery and inspection.
5. `nexus_plan_start` / `nexus_plan_tick` / `nexus_plan_note` / `nexus_plan_done`: Plan progression.
6. `nexus_query_knowledge` / `nexus_add_knowledge_entry`: Knowledge base retrieval and append.
7. `nexus_list_skills` / `nexus_get_skill`: Skill catalog queries.
8. `nexus_get_agent`: Agent persona definition.
9. `nexus_refresh_stats`: Regenerate project stats.
