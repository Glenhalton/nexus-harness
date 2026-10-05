---
nexus_plan: true
id: "slim-the-npm-harness-package-and-expose-nexus-bin"
title: "Slim the npm harness package and expose nexus bin"
status: "in_progress"
created: "2026-10-03"
updated: "2026-10-05"
owner: "nexus-implementer"
source: "manual:refactor"
parent: null
estimate: "2d"
phase: "refactor"
tags: ["refactor"]
type: "refactor"
---
## Goal
Make `@nexus-framework/harness` on npm fast to install and start: ship prebuilt JS instead of
running TypeScript through `tsx` at startup, drop test/build-only dependencies, align `engines`,
and expose `nexus` and `nexus-code` bins so `npm i -g @nexus-framework/harness` gives the full
terminal toolset in one install.

## Why
The current launcher spawns `node --import tsx` on `runtime/apps/cli/src/bin.ts`, and the
dependency list ships `vitest`, `typescript`, `@testing-library/*`, `electron-updater` and similar.
That makes installs slow and heavy. Developers and the `nexus harness` path both use this package.

## Grilling
**Ask:** Refactor the npm packaging (`scripts/package-npm-harness.ts`, `apps/nexus-harness`) to
ship built output with runtime-only deps, and add `nexus` + `nexus-code` bins.

**Resolved**
- Same terminal-command decision as the desktop plan: `nexus` + `nexus-code` both ship.
- `nexus` bin forwards to the bundled `@nexus-framework/cli` bin. Keep existing `nexus-harness`,
  `harness`, `dsh` aliases for compatibility.
- `engines` matches the root (`^22.19.0 || >=24.0.0`), since the runtime actually needs it.

**Out of scope**
- Desktop app (separate plan). Publishing a new version to npm (needs the user's go-ahead).

## Acceptance Criteria
- [ ] Packed tarball contains built JS; launcher no longer needs `tsx` at runtime.
- [ ] `dependencies` holds only runtime deps; `vitest`, `typescript`, `@testing-library/*`, `@vitest/spy`, `electron-updater` etc. are gone unless proven needed at runtime.
- [ ] `npm pack` then a global install from the tarball in a temp prefix exposes working `nexus`, `nexus-code`, `nexus-harness`; `nexus-harness web --no-open` boots.
- [ ] Behavior when `@nexus-framework/cli` is already globally installed (bin name clash) is tested and documented in the README (and recorded in knowledge.md).
- [ ] Tarball size and cold-start time before/after recorded in Evidence.

## Steps
- [x] Measure baseline: tarball size, install time, `--help` cold start
- [x] Switch packaging to use built `lib/` output (tsdown) instead of TS sources + tsx
- [x] Compute runtime deps from the built bundle; prune package.json deps in the generator script
- [x] Add `nexus` and `nexus-code` bins (thin forwarders) and align `engines`
- [x] Smoke test: pack → install into temp global prefix → run all bins
- [x] Update `apps/nexus-harness/README.md`
- [x] Tests for the packaging script + validation commands

## Notes
- (none yet)
- 2026-10-05T08:10:49.265Z — Baseline (master 0c57dfc5ec plus build fix 1ee85d75ca, macOS x64, Node 24.13, npm 11.6.2): npm pack gives 27.6 MB packed, 105.6 MB unpacked, 14,255 files. Cold-cache `npm i -g --prefix tmp` took 214 s and used 1.2 GB (1.1 GB of it in node_modules). `nexus-harness --help` FAILS with ERR_MODULE_NOT_FOUND '@deepseek-ai/dsh-app-boot' (first run 1658 ms, median 359 ms to failure). tsx does not apply tsconfig `paths` to files under node_modules, so the published 1.0.0 layout cannot start from a global install at all. Bins: dsh, harness, nexus-harness.
- 2026-10-05T08:30:07.122Z — Decisions: (1) The runtime is the workspace closure of @deepseek-ai/dsh plus the dsh-experimental-tool-nexus-brain and nexus-brain-context plugins (same rule as Desktop's prepare-package-set). Each package goes through `pnpm pack` and is unpacked into runtime/node_modules, because app-boot's profile resolver relies on Node's real node_modules lookup. (2) External deps = declared by the closure AND referenced by the shipped JS/YAML. Range conflicts take the highest minimum: chokidar ^4 vs ^5 resolves to ^5.0.0 (dsh-credentials-local declares ^4), and js-yaml and yaml are same-major bumps. (3) node-addon-system-{darwin,linux}-{x64,arm64} are os/cpu restricted, so they become npm optionalDependencies (~0.1.2, already on npm). (4) The launcher imports lib/bin.js in-process and calls runCli() with argv[1] set to the real entry, so there is no tsx and no second Node process. (5) apps/nexus-harness is excluded from pnpm-workspace.yaml. It is a generated npm package, and the lockfile importer churned on every regeneration. (6) README.md is now maintained by hand; only LICENSE is still generated. (7) Prerequisite fix 1ee85d75ca: master did not pass build:lib (tool-nexus-brain casts, ui-chat locale key, ui-nexus-brain-indicator exactOptionalPropertyTypes).
- 2026-10-05T08:30:07.154Z — Bin clash, tested in temp prefixes with npm 11.6.2. CLI installed first, then the harness: EEXIST on bin/nexus and the harness install aborts. Harness first, then the CLI: EEXIST and the CLI install aborts. With `--force` the harness takes over `nexus`, but `npm rm -g` of the harness afterwards leaves NO `nexus` at all. Uninstalling the CLI before installing the harness works, and `nexus --version` prints 1.6.0 from the bundled CLI. Documented in apps/nexus-harness/README.md and knowledge.md.

## Evidence
- (to be filled)
