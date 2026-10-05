---
nexus_plan: true
id: "desktop-app-rebrand-release-pipeline-and-nexus-on-path"
title: "Desktop app rebrand, release pipeline, and nexus on PATH"
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
Ship `apps/desktop` as **Nexus Harness**, a downloadable `.dmg`/`.exe` that non-technical
users install with a double-click. Installers publish to GitHub Releases, and installing the
app also puts `nexus` (the NEXUS brain CLI) and `nexus-code` (the harness terminal agent,
`apps/cli`) on the user's terminal PATH.

## Why
The npm package still needs Node and a terminal. The desktop app bundles its own runtime, so it
is the real path for non-technical users. The app gives them the NEXUS workflow, so the
terminal commands must arrive with it rather than as a second install.

## Grilling
**Ask:** Rebrand the Electron desktop app to Nexus Harness, release it through GitHub Releases,
and make install add `nexus` + `nexus-code` to the terminal with no extra install.

**Resolved**
- Terminal commands: both `nexus` (brain CLI, from the bundled `@nexus-framework/cli`) and
  `nexus-code` (harness agent from `apps/cli`). Rejected `nexus` only, because the app's value
  includes the agent itself.
- PATH method: user-level, no admin. The app writes shims into `~/.nexus/bin` (Windows:
  `%USERPROFILE%\.nexus\bin`) and adds that directory to the shell profile (macOS: `~/.zprofile`
  + `~/.bashrc`, idempotent marked block) or to the HKCU user `Path` (Windows, via the NSIS
  installer). Rejected a system-wide symlink because it needs an admin password and leaves a
  messier uninstall.
- Shims run the **app's bundled Node runtime**, so users never need Node installed.
- Release host: GitHub Releases on `GDA-Africa/nexus-harness`. Rejected own storage/CDN as
  extra setup. The DeepSeek COS upload path (`scripts/*cos*`, `upload-*`) gets replaced.
- Signing: wired to read credentials from env/CI secrets (names in plan
  `code-signing-and-notarization-credentials`). Unsigned builds must still succeed when the
  secrets are absent.

**Out of scope**
- Obtaining certificates (that's the user's plan, `code-signing-and-notarization-credentials`).
- Onboarding UI (plan `in-app-onboarding-for-non-technical-users`).
- Linux packages.

## Acceptance Criteria
- [ ] App name, bundle/app id, icons, window titles, installer strings and `package.json` say
      Nexus Harness / NEXUS, not DeepSeek/dsh (internal `@deepseek-ai/*` package names may stay).
- [ ] `package:desktop:mac:arm64:dir` and `package:desktop:win:x64:unsigned` build locally without
      COS/DeepSeek credentials.
- [ ] Auto-update + release publishing target GitHub Releases on `GDA-Africa/nexus-harness`.
- [ ] After install + first launch, a new terminal can run `nexus --version` and `nexus-code --help`
      with no system Node on PATH.
- [ ] Uninstall (Windows) / an in-app "Remove terminal commands" action removes the shims and the
      profile/PATH entry.
- [ ] CI workflow builds mac + win artifacts on tag and attaches them to a GitHub Release (signing
      steps skip cleanly when secrets are missing).
- [ ] Tests cover shim writing, profile-block idempotency, and PATH removal.

## Steps
- [x] Audit branding surfaces in `apps/desktop` (builder config `scripts/electron-builder-config.mjs`, `package.json`, `src/locale.ts`, `installer/strings.nsh`, resources/icons, `src/release.ts`) and rebrand
- [x] Replace COS upload/update publication with GitHub Releases (electron-updater `github` provider or adapt `installed-update-*` to read from Release assets)
- [x] Bundle `@nexus-framework/cli` and the `apps/cli` entry inside the packaged runtime (`prepare-dsh.ts` / `prepare-runtime.ts`)
- [x] Implement `terminal-commands.ts` in `apps/desktop/src`: write `nexus` + `nexus-code` shims to `~/.nexus/bin` that exec the bundled Node; add idempotent profile block; expose install/remove over IPC
- [x] Windows: extend NSIS (`installer/path.nsh` / `scripts/installer.nsh`) to add/remove `%USERPROFILE%\.nexus\bin` in HKCU Path and write `.cmd` shims
- [x] Wire signing to secret names from the signing plan; make unsigned path work
- [x] Add release workflow under `.github/workflows/` for tagged desktop builds
- [x] Tests + `npx tsc --noEmit && pnpm test && pnpm lint` (scoped to touched packages if full suite is too heavy)

## Notes
- `apps/desktop` already has a large custom update system (`installed-update-*`, mandatory-update policy) built around DeepSeek COS. Prefer the smallest change that points it at GitHub Releases; record the choice in knowledge.md.
- Coordinate with the onboarding plan: it will call the `terminal-commands` install action from the welcome flow.
- 2026-10-05T08:34:30.803Z — Decisions (branch worktree-agent-a7d9e16df62ca2251): updates keep the generic provider + nightly channel, pointed at github.com/GDA-Africa/nexus-harness/releases/latest/download/ (DSH_DESKTOP_AUTO_UPDATE_ENV=github, now default; COS kept as opt-in). Signing mode auto-selects: no settings -> unsigned (macOS ad-hoc + manual-update link to Releases), Azure Trusted Signing via azureSignOptions, inherited Developer ID / SafeNet paths. Shims run the app's Electron with ELECTRON_RUN_AS_NODE=1 against app.asar/dsh (nexus = bundled @nexus-framework/cli, nexus-code = @deepseek-ai/dsh lib/bin.js). Translocated/DMG launches return blockedReason 'translocated'. App id africa.gda.nexus-harness (in env templates + CI). dsh base version now read from apps/cli (root is @nexus-framework/harness 1.0.0); dsh release family skips @nexus-framework/* packages. CI builds mac arm64 only (one nightly-mac.yml per release).
- 2026-10-05T08:38:42.312Z — Validation: desktop + scripts/release vitest 1200+ pass (load-induced 5s timeouts in installed-update-* pass in isolation; notarization-proxy needs `pnpm run build:native-system`); tsc -b tsconfig.host.json clean after fixing pre-existing tool-nexus-brain casts; oxlint clean on apps/desktop and scripts/release. Local packaging NOT verified: host is Intel (mac-arm64 refused by design), and mac-x64:dir stops in build:official on pre-existing client type errors in ui-chat error-formatter.ts and ui-nexus-brain-indicator index.ts (master, outside this plan). Acceptance items needing a real build (nexus --version from a packaged app, NSIS uninstall, CI run) remain unverified. Hand to nexus-test-writer.

## Evidence
- (to be filled)
