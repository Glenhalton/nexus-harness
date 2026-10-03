---
nexus_plan: true
id: "slim-the-npm-harness-package-and-expose-nexus-bin"
title: "Slim the npm harness package and expose nexus bin"
status: "in_progress"
created: "2026-10-03"
updated: "2026-10-03"
owner: "nexus-implementer"
source: "manual:refactor"
type: "refactor"
parent: null
estimate: "2d"
phase: "refactor"
tags: ["refactor"]
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
- [ ] Measure baseline: tarball size, install time, `--help` cold start
- [ ] Switch packaging to use built `lib/` output (tsdown) instead of TS sources + tsx
- [ ] Compute runtime deps from the built bundle; prune package.json deps in the generator script
- [ ] Add `nexus` and `nexus-code` bins (thin forwarders) and align `engines`
- [ ] Smoke test: pack → install into temp global prefix → run all bins
- [ ] Update `apps/nexus-harness/README.md`
- [ ] Tests for the packaging script + validation commands

## Notes
- (none yet)

## Evidence
- (to be filled)
