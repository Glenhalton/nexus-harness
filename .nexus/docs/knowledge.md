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

### [gotcha] `nexus` bin clash between @nexus-framework/harness and @nexus-framework/cli
**2026-10-05** — Both packages own the `nexus` bin. If either one is already installed globally, `npm i -g` of the other fails with `EEXIST ... bin/nexus` and installs nothing (verified in temp prefixes with npm 11.6.2, in both orders). The fix is `npm uninstall -g @nexus-framework/cli` and then installing the harness, which bundles the CLI. `--force` does take over the link, but uninstalling the harness afterwards deletes `nexus` even though the standalone CLI is still installed.

### [gotcha] tsx ignores tsconfig `paths` for files under node_modules
**2026-10-05** — The 1.0.0 @nexus-framework/harness layout (TS sources plus `node --import tsx` with TSX_TSCONFIG_PATH) fails on a global install with ERR_MODULE_NOT_FOUND for `@deepseek-ai/*`, because the runtime then lives under node_modules. Ship built lib/ output with real `runtime/node_modules/<pkg>` directories instead. npm 10 and npm 11 both pack nested node_modules that `files` lists.

### [architecture] npm harness = pnpm-packed dsh closure + evidence-derived externals
**2026-10-05** — scripts/package-npm-harness.ts follows the same closure rule as Desktop (deps, peers, optionals from @deepseek-ai/dsh plus the Nexus brain plugins). It runs `pnpm pack` on each package so `files` and `workspace:` rewriting behave exactly as they would on publish. External deps are kept only if the shipped JS references them. Platform packages restricted by os/cpu (node-addon-system-*) go out as npm optionalDependencies, since one machine can only build its own binary.
