---
nexus_doc: true
id: "08_deployment"
title: "Deployment & Distribution"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# Deployment & Distribution — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Deployment Modes:** Local Web Server (`dsh web`), Headless CLI (`dsh headless`), or Embedded Library

---

## 🚀 Deployment Modes

1. **Local Developer Launch (`dsh web`)**:
   - Starts local web server on `127.0.0.1:3080` and automatically opens browser.
   - Ideal for interactive pair programming, session inspection, and visual workflow debugging.
2. **Headless Execution (`dsh headless`)**:
   - Starts single-turn or batch agent execution with no web server or browser.
   - Ideal for CI pipelines, automated evaluation, and scheduled tasks.
3. **Embedded Execution Engine**:
   - Other systems (e.g. NEXUS 2.0 platform) mount Cordis profiles in-process.

---

## 🔧 Environment Variables

| Variable | Description | Required | Default |
|---|---|---|---|
| `HOST` | Bind address for Web UI | No | `127.0.0.1` |
| `PORT` | HTTP port for Web UI | No | `3080` |
| `DSH_HOME` | Directory for profiles, sessions, and logs | No | `~/.dsh` |
| `OLLAMA_BASE_URL`| Custom endpoint for Ollama local models | No | `http://127.0.0.1:11434` |
| `DEEPSEEK_API_KEY`| DeepSeek platform API key | Optional | — |
| `ANTHROPIC_API_KEY`| Anthropic Claude API key | Optional | — |
| `OPENAI_API_KEY` | OpenAI API key | Optional | — |

---

## 📦 Build & Release Pipeline

```bash
# Build all workspace packages
pnpm run build

# Package checks
pnpm run publint
pnpm run hygiene
```
