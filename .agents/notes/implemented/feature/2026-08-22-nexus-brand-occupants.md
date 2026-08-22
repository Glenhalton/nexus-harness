# Agent Note: Nexus brand occupants for the web client

Status: implemented

English | [中文](2026-08-22-nexus-brand-occupants.zh.md)

## Problem

The web client shipped only one browser-brand occupant package, `@deepseek-ai/dsh-client-ui-brand-official`, filling the sidebar mark/name and conversation hero mark with DeepSeek Harness's own identity, gated behind `DSH_CLIENT_BUILD_PROFILE === 'official'`. This monorepo also carries NEXUS (the separate project-intelligence CLI this harness bridges to via `packages/experimental/tool-nexus-brain/`), and there was no way to compose a build that presents as Nexus instead of DeepSeek Harness — the favicon, page title, and manifest were also DeepSeek-branded with no alternative.

## Decision

`@deepseek-ai/dsh-client-ui-brand-nexus` (`packages/client/ui-brand-nexus/`) is a second, structurally identical brand-occupant package: it fills the same three slots (`sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`) through the same nested `slots.inject()` pattern as the official package. It carries no `DSH_CLIENT_BUILD_PROFILE` gate — activation is a composition choice, not a runtime one, since a deployment mounts at most one brand package.

`packages/bundle/web-app/cordis.patch.yml` mounts `ui-brand-nexus` in place of `ui-brand-official` (the row that was `id: ui-brand-official` is now `id: ui-brand-nexus`), and `packages/bundle/web-app/package.json`'s `dependencies` was updated the same way — this second edit is required, not cosmetic: `apps/cli/src/profile-boot.ts`'s `healProfilesModuleFallback` populates `$DSH_HOME/profiles/node_modules` by BFS over the app's `dependencies`/`peerDependencies` closure (`packages/boot/app-boot/src/profile.ts`), which is how Loader resolves bare plugin-row specifiers at boot. A row present only in `cordis.patch.yml` with no matching `package.json` dependency edge resolves to nothing — the Loader's own unresolvable-module report goes through a logger service this profile never mounts, so the failure is silent: the plugin simply never appears in the boot manifest, with no console error. This was diagnosed by comparing `window.__DSH_BOOT__`'s served plugin-id list against the expected `ui-brand-nexus` entry.

`apps/web/public/favicon.svg`, `apps/web/public/manifest.webmanifest` (`name`/`short_name`), and `apps/web/vite.config.ts`'s `DEFAULT_CLIENT_TITLE` were changed directly (build-environment-level facts, not slot occupants) to complete the rebrand.

The mark in `ui-brand-nexus/src/client/Brand.tsx` (a hexagonal node frame with the initial built into it) is placeholder art pending final Nexus brand assets — deliberately built as one flat `currentColor` SVG shape (no gradients, no fixed light/dark colors) so it recolors with the theme automatically, matching the official package's `FishLogo` construction, and so replacing it later is a single-file edit to that one component.

## Alternatives considered

**Gate `ui-brand-nexus` behind a `DSH_CLIENT_BUILD_PROFILE` value like the official package does.** Rejected: the official package's gate exists because `official` artifacts must byte-match a specific, environment-frozen public build (see `scripts/client-build-environment.ts`'s `assertClientBuildEnvironment`). Nexus branding has no equivalent frozen-artifact requirement yet; a bundle-composition choice (which brand package is listed in `cordis.patch.yml`) is the simpler, sufficient mechanism.

**Edit `ui-brand-official` in place to show Nexus branding instead of adding a new package.** Rejected: that would make "official DeepSeek Harness branding" and "Nexus branding" mutually exclusive forever at the source level, destroying the ability to build either. Two swappable packages preserve both.

## Consequences

A composition can now choose Nexus branding by mounting `ui-brand-nexus` instead of `ui-brand-official` in its bundle patch — currently the only composition doing so is `packages/bundle/web-app`. The placeholder mark means the web client's visual identity is provisional until final brand art lands; nothing downstream depends on its exact geometry. The silent-resolution-failure class of bug this note diagnosed (a `cordis.patch.yml` row with no matching `package.json` dependency) is a real trap for any future new client plugin package in this monorepo, not specific to branding — worth remembering when adding the next one.
