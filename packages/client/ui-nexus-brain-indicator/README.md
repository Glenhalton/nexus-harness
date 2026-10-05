---
description: "Web NEXUS brain chip and plan tab: an honest Session-header status for the session's folder, plus the active plan in the right sidebar."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-nexus-brain-indicator

English | [中文](README.zh.md)

## Summary

This package adds a "Nexus" chip to the Web Session header and a "Nexus Plan" tab to the right sidebar. The chip says only what it can show: a folder that is not a NEXUS project reads "No NEXUS brain" and opens the "Set up NEXUS" dialog of [`dsh-client-ui-nexus-setup`](../ui-nexus-setup/README.md) on click; a NEXUS project reads "Brain ready" until a turn carries its context, after which the chip shows the plan, branch, and drift from that context. The tab lists the active plan's checklist from the same context.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the Web composition; this row takes no config. Mount [`dsh-client-ui-nexus-setup`](../ui-nexus-setup/README.md) and [`dsh-host-nexus-setup`](../../host/nexus-setup/README.md) beside it so the chip can read the folder status before any turn; without them the chip reads "Status unknown" until a turn carries NEXUS context.

| Chip | When |
|---|---|
| Spinner, no label | The folder status is being read |
| "No NEXUS brain" | The folder has no `.nexus/`; a click opens the setup dialog |
| "Brain ready" | The folder has `.nexus/`, and no turn has carried its context yet |
| "Brain: Synced" / plan number | The latest turn carried NEXUS context with a clean working tree |
| "Brain: Drift" | The latest turn reported uncommitted changes |
| "Status unknown" | No folder, or the host cannot report folder status |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One pure function ([`src/client/brain-status.ts`](src/client/brain-status.ts)) chooses the chip state. Turn context wins: the chip parses the latest `nexus-brain-context` node in the Session chat. Before such a turn, the folder phase from the optional `nexusSetup` service decides. A relay ([`src/client/setup-link.ts`](src/client/setup-link.ts)) gives the chip one stable observable through the inject `hooks` compartment whether or not that service is loaded. The relay binds the service through `ctx.inject(['nexusSetup'], …)` and repeats status reads requested before the service arrived. A successful setup republishes the folder phase through the same source, so the chip shows "Brain ready" without polling or waiting for a turn. The chip opens the setup dialog through the service's `openDialog`, so the dialog stays owned by `dsh-client-ui-nexus-setup`.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the chip and tab are browser chrome that read context another package injected; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Folder status is read once per page.** A `.nexus/` created outside the app (for example by `nexus init` in a terminal) shows on the next turn, which carries NEXUS context, or after a reload.
- **Plan tab ticks are local.** Ticking a step in the tab changes only the tab's view; the plan file updates through the agent's NEXUS tools.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Plan: `.nexus/plans/in-app-onboarding-for-non-technical-users.md`.

</details>

**Runtime invariant:** No companion is published. The plugin registers one dictionary effect, one sidebar tab type, three slot entries, and one service-bound sub-fiber, all removed with the plugin fiber; [`tests/plugin.client.spec.ts`](tests/plugin.client.spec.ts) proves the removal.
