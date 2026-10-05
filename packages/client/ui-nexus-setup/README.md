---
description: "Web \"Set up NEXUS\" prompt: a Session-header action that turns the session's folder into a NEXUS project in one click through the host nexus-setup routes."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-nexus-setup

English | [中文](README.zh.md)

## Summary

This package adds a "Set up NEXUS" button to the Web Session header while the session's folder has no `.nexus/`. The button opens a short, plain-language dialog; one click scaffolds the folder through [`dsh-host-nexus-setup`](../../host/nexus-setup/README.md), and the button disappears. Folders that are already NEXUS projects, missing folders, and hosts without the setup routes show nothing.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the Web composition beside [`dsh-host-nexus-setup`](../../host/nexus-setup/README.md); this row takes no config. "Not now" hides the button for that folder until the page reloads. A failed setup keeps the dialog open with a short explanation and a retry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

A page-lifetime controller ([`src/client/controller.ts`](src/client/controller.ts)) reads each folder's status once and owns the setup POST; per-folder phases (`checking`, `needs-setup`, `setting-up`, `failed`, `ready`, `missing`, `unavailable`, `dismissed`) publish through one snapshot store that the component receives through the inject `hooks` compartment. The component reads the session's `cwd` through `useSessions` and renders only in the `needs-setup`, `setting-up`, and `failed` phases. Route forms come from the host package's browser-safe `./shared` subpath.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the prompt is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Status is read once per folder per page.** A `.nexus/` created outside the app (for example by `nexus init` in a terminal) hides the button after a reload.
- **The brain chip follows the next turn.** [`ui-nexus-brain-indicator`](../ui-nexus-brain-indicator/) derives its state from the context injected on the next turn, not from this setup.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Plan: `.nexus/plans/in-app-onboarding-for-non-technical-users.md`.

</details>

**Runtime invariant:** No companion is published. The plugin registers one dictionary effect and one slot entry whose disposal the HMR-safety spec proves; folder phases live only in the controller's snapshot store.
