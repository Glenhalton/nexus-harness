# @Deepseek Ai/Dsh Root — Knowledge Base

> **Progressive learning file.** AI agents append entries here as they discover
> project-specific insights. This file grows organically — never delete entries.

---

## How This Works

- **When to add:** After discovering something non-obvious — a bug pattern, an architecture decision, a package quirk, a performance finding, a convention choice
- **When NOT to add:** Routine task completion (that goes in `index.md` Progress Log)
- **Format:** One entry = category tag + one-line insight + optional detail line
- **When to read:** Before making architectural decisions, debugging recurring issues, or choosing packages/patterns — scan for relevant categories first

---

## Categories

| Tag | Use When |
|-----|----------|
| `architecture` | Design decisions, structural choices, why X over Y |
| `bug-fix` | Recurring bugs, root causes, things to watch for |
| `pattern` | Code patterns that work well (or don't) in this project |
| `package` | Package quirks, version issues, config gotchas |
| `performance` | Bottlenecks found, optimizations applied |
| `convention` | Team/project conventions established during development |
| `gotcha` | Non-obvious traps, edge cases, things that wasted time |

---

## Entries

<!-- AI: Append new entries below this line. Format:

### [CATEGORY] Short title
**2026-08-22** — One-line insight.
Optional: Brief supporting detail (1-2 sentences max).

-->

### [convention] Project scaffolded with NEXUS CLI
**2026-08-22** — This project was generated with NEXUS CLI. Follow the doc system in `.nexus/docs/` and always read `index.md` (the brain) before each task.

### [architecture] Desktop Updates Use GitHub latest/download With The Existing Generic Provider
**2026-10-05** — Desktop releases point electron-updater's unchanged generic provider + fixed `nightly` channel at `https://github.com/GDA-Africa/nexus-harness/releases/latest/download/` (`DSH_DESKTOP_AUTO_UPDATE_ENV=github`, now the default) instead of adopting the `github` provider or rewriting `installed-update-*`.
GitHub redirects that path to the newest published non-prerelease release, so feed names, macOS app-update.yml verification and the coordinator stay as they were; the COS `test`/`production` deployments remain selectable, and the `desktop-release.yml` workflow (not `upload:*`) publishes. Prereleases are invisible to installed apps, and only one `nightly-mac.yml` fits per release (CI builds mac arm64 only).

### [gotcha] Unsigned macOS Builds Must Be Ad-Hoc Signed And Cannot Self-Update
**2026-10-05** — With no signing settings the desktop package path ad-hoc signs (`codesign --sign -` on runtime Mach-O files before the runtime inventory, electron-builder `identity: '-'`, hardened runtime off); Apple Silicon refuses fully unsigned code. Squirrel.Mac rejects updates without a Developer ID signature, so ad-hoc builds set `nexusManualUpdates` and open the GitHub Releases page instead.

### [gotcha] lefthook Pre-Commit Can Drop Unstaged Changes In A Worktree
**2026-10-05** — When the staged lint auto-fixes a file that also has unstaged edits, lefthook fails to re-apply its stashed unstaged patch and the unstaged edits are lost. Stage everything you mean to keep (or commit it) before running `git commit`.
