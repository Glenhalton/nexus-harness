---
nexus_plan: true
id: "in-app-onboarding-for-non-technical-users"
title: "In-app onboarding for non-technical users"
status: "in_progress"
created: "2026-10-03"
updated: "2026-10-03"
owner: "nexus-implementer"
source: "manual:feature"
type: "feature"
parent: null
estimate: "3d"
phase: "feature-delivery"
tags: ["feature"]
---
## Goal
A first-run flow in the desktop app (and the web UI) that lets someone with no terminal
experience pick or create a project folder, turn it into a NEXUS project with one button,
connect a model/API key, and land in a working session.

## Why
Today a folder without `.nexus/` needs `nexus init` in a terminal. UI-first users never
see a terminal, so every CLI-only step must have a UI equivalent.

## Grilling
**Ask:** Build in-app onboarding: project picker, "Set up NEXUS for this folder" (runs init
through the bundled CLI, not a shell), first-run model/API-key setup, and an offer to add
terminal commands.

**Resolved**
- Init runs via the bundled `@nexus-framework/cli` programmatically (or its bundled bin with the
  app's Node), never by asking the user to type a command. Rejected "show a command to copy".
- Extend the existing desktop welcome flow (`apps/desktop/src/welcome-*.ts`, `project-manager.ts`)
  and the web client's directory picker rather than building a parallel onboarding app.
- The "Add `nexus` to my terminal" step calls the `terminal-commands` action from the desktop
  plan; it is on by default with a clear explanation, and skippable.
- Model setup reuses the existing settings/credentials packages (`ui-settings-models`, `credentials`).

**Out of scope**
- Rebrand/release/PATH shims themselves (desktop plan).
- New model providers.
- Filling the NEXUS docs' vision interview inside the UI (later backlog item).

## Acceptance Criteria
- [ ] Opening a folder without `.nexus/` shows a plain-language "Set up NEXUS" prompt; one click scaffolds it and the brain chip shows the project as synced.
- [ ] Opening an existing NEXUS project skips setup.
- [ ] First launch with no configured model routes to a model/API-key step with a test-connection check and friendly error copy.
- [ ] Desktop: welcome flow offers "Add nexus to my terminal" (wired to the desktop plan's IPC action; stubbed behind an interface if that plan hasn't landed).
- [ ] Web (`npx` path): same "Set up NEXUS" prompt works through the host API.
- [ ] Tests for the host-side init endpoint and the client state machine; no regressions in existing welcome tests.

## Steps
- [ ] Find what `@nexus-framework/cli` exports for init/scaffold (`dist/index.js`); if no programmatic init exists, run its bin via `process.execPath`
- [ ] Add a host API route (packages/api or packages/host) `POST /nexus/init` + `GET /nexus/status` for a workspace path
- [ ] Client: setup prompt component (packages/client, near `ui-nexus-brain-indicator` / `ui-workspace`) shown when status is "not a NEXUS project"
- [ ] Desktop welcome: project picker → status check → setup → model step → terminal-commands step
- [ ] First-run model/API-key step reusing settings + credentials, with connection test
- [ ] Copy pass for non-technical language (follow `dsh-client-ui-ux` skill)
- [ ] Tests + `npx tsc --noEmit && pnpm test && pnpm lint` on touched packages

## Notes
- (none yet)

## Evidence
- (to be filled)
