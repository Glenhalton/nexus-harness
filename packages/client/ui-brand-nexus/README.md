# @deepseek-ai/dsh-client-ui-brand-nexus

English | [中文](README.zh.md)

This package fills `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` with Nexus brand occupants. Unlike [`@deepseek-ai/dsh-client-ui-brand-official`](../ui-brand-official/README.md), it carries no `DSH_CLIENT_BUILD_PROFILE` gate — a deployment composes at most one brand package into its bundle, so which brand shows is a composition choice (`packages/bundle/web-app/cordis.patch.yml`), not a runtime one.

The three occupants install as one declaration-aware registration set through nested `slots.inject()` calls, exactly like the official package: it works whether its row activates before or after the sidebar and conversation declarers, withdraws all occupants when either declaration collapses, and leaves no partial brand mix during HMR. It retains no runtime state. The node half is an empty Loader seat, and the browser title remains a build-environment concern outside this package (`apps/web/vite.config.ts`'s `DEFAULT_CLIENT_TITLE`).

## Placeholder art

The mark in `src/client/Brand.tsx` — a hexagonal node frame with the initial built into it — is a placeholder pending final Nexus brand artwork. It follows the same construction as the official DeepSeek mark (a flat shape riding `currentColor`, so it recolors with the theme automatically) precisely so that dropping in the final SVG later is a single-file edit: replace the `<path>` data in `NexusBrandMark`, nothing else. The `NexusBrandName` wordmark is styled text, not custom letterforms, so it needs no update at all when the display face is chosen.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The mark is placeholder art** — see § Placeholder art; the final Nexus logo has not been chosen.
- **The package supplies one occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
