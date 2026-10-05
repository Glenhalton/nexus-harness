---
description: "Host half of in-app NEXUS setup: reports whether a folder is a NEXUS project and scaffolds one through the bundled NEXUS CLI, as two webServer routes."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-nexus-setup

English | [中文](README.zh.md)

## Summary

Use `dsh-host-nexus-setup` so people who never open a terminal can turn a folder into a NEXUS project with one click. It serves a status route and an init route; init runs the bundled `@nexus-framework/cli` generator in process, never a shell command. The [browser prompt](../../client/ui-nexus-setup/README.md) and the Desktop welcome window both call these routes. Requests require the deployment's browser authentication and host-origin trust checks.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in a composition that carries `webServer` and `connection`, normally beside [`dsh-client-ui-nexus-setup`](../../client/ui-nexus-setup/README.md). It takes no configuration.

```yaml
- name: '@deepseek-ai/dsh-host-nexus-setup'
```

| Route | Method | Answer |
|---|---|---|
| `/nexus-setup/status?path=<absolute folder>` | GET | `{ path, state }` with `state` one of `ready` (has `.nexus/`), `needs-setup`, `missing` |
| `/nexus-setup/init` with body `{ "path": "<absolute folder>" }` | POST | `{ path, state: 'ready', created }`; `created` is false when `.nexus/` already existed |

Init writes `.nexus/` and the AI pointer files the CLI's `nexus adopt` writes (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and similar); it does not touch source files. Errors answer `{ code, message }` with `bad-request` (400), `not-found` (404), `unsupported-media-type` (415), `payload-too-large` (413), or `init-failed` (500). Route paths and payload types are published browser-safe at `./shared`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/scaffold.ts`](src/scaffold.ts) reads folder state and calls the CLI's exported `adoptProject`. The CLI's `adoptCommand` is not used because it prompts and calls `process.exit`, and its project detector is outside the package's public exports, so this package detects the few facts the generator reads (name, framework, test runner, package manager). The CLI is imported lazily on the first init, so host boot does not load it. Concurrent init requests for the same normalized path join one run.

</details>

-----

<a id="model-experience"></a>
## Model Experience

None, as the routes are user actions; a folder set up here later gains the ambient context of [`nexus-brain-context`](../../experimental/nexus-brain-context/README.md).

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Setup asks no interview questions.** The generated docs start as templates; the NEXUS onboarding interview runs later with the agent.
- **Project detection is a subset of the CLI's.** Monorepo and non-Node framework detection stay at the generator defaults.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Plan: `.nexus/plans/in-app-onboarding-for-non-technical-users.md`.

</details>

**Runtime invariant:** No companion is published. The plugin registers two routes as fiber-scoped effects and holds no state beyond in-flight init promises.
