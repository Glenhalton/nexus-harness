---
nexus_plan: true
id: "in-app-onboarding-for-non-technical-users"
title: "In-app onboarding for non-technical users"
status: "in_progress"
created: "2026-10-03"
updated: "2026-10-05"
owner: "nexus-implementer"
source: "manual:feature"
parent: null
estimate: "3d"
phase: "feature-delivery"
tags: ["feature"]
type: "feature"
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
- [x] Find what `@nexus-framework/cli` exports for init/scaffold (`dist/index.js`); if no programmatic init exists, run its bin via `process.execPath`
- [x] Add a host API route (packages/api or packages/host) `POST /nexus/init` + `GET /nexus/status` for a workspace path
- [x] Client: setup prompt component (packages/client, near `ui-nexus-brain-indicator` / `ui-workspace`) shown when status is "not a NEXUS project"
- [x] Desktop welcome: project picker → status check → setup → model step → terminal-commands step
- [ ] First-run model/API-key step reusing settings + credentials, with connection test
- [x] Copy pass for non-technical language (follow `dsh-client-ui-ux` skill)
- [ ] Tests + `npx tsc --noEmit && pnpm test && pnpm lint` on touched packages

## Notes
- (none yet)
- 2026-10-03T09:09:28.802Z — Step 1 finding: @nexus-framework/cli 1.6.0 root export has `adoptProject(targetDir, projectInfo, adoptionContext)` (non-interactive; `adoptCommand`/`initCommand` prompt and call process.exit). Decision: call `adoptProject` programmatically via lazy dynamic import, with a locally-built ProjectInfo (detectProject is not exported through the package exports map). No bin spawn needed.
- 2026-10-05T08:10:20.917Z — Steps 2-3: routes are plain webServer routes (open-in-app pattern), not Typert Remotes: GET /nexus-setup/status?path= and POST /nexus-setup/init in new package packages/host/nexus-setup; client prompt is new package packages/client/ui-nexus-setup registered on conversation.session.header.utilities. tool-nexus-brain left untouched. Brain chip unchanged: it derives from nexus-brain-context nodes and shows synced once .nexus exists on the next turn.
- 2026-10-05T08:25:05.914Z — Step 4 (desktop): welcome order is folder -> NEXUS setup -> terminal commands -> existing sign-in/API-key page (model step moved last so the existing auth completion paths in main.ts stay untouched). Steps run only when the preload exposes `onboarding`. Folder path stays in the main process (renderer never sends paths); setup/status go through the host /nexus-setup routes via the authenticated welcome fetch; the folder is registered via workspace/create RPC. Terminal step consumes nexus:terminal-commands:{status,install} with a local TerminalCommandsStatus type incl. blockedReason 'translocated'; unregistered channel or already-installed hides the step. Step 5: desktop API-key form now checks the key (GET https://api.deepseek.com/models, Bearer) before saving: 401/403 -> rejected copy, network/5xx -> unreachable copy. Web first-run model step (ui-settings-models DeepSeekOnboardingDialog) left unchanged: llm-deepseek registers no model discovery, so there is no existing connection-test seam there; not modified to avoid crossing feature-plugin boundaries.

## Evidence
- (to be filled)
