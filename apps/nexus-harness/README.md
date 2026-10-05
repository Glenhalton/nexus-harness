# @nexus-framework/harness

> The official AI-Native Execution Harness and Web Interface for the NEXUS Framework.

## Overview

`@nexus-framework/harness` provides the complete execution environment, interactive web interface, terminal runner, and Cordis plugin architecture for NEXUS projects. It ships prebuilt JavaScript, so nothing is compiled when it starts, and a single install gives you the whole terminal toolset.

Requires Node.js `^22.19.0 || >=24.0.0`.

## Install

```bash
npm i -g @nexus-framework/harness
```

This puts these commands on your `PATH`:

| Command | What it runs |
|---------|--------------|
| `nexus` | The NEXUS CLI: the newest of a global `@nexus-framework/cli` and the copy bundled with the harness |
| `nexus-code` | The harness CLI |
| `nexus-harness` | The harness CLI (same as `nexus-code`) |
| `harness`, `dsh` | Compatibility aliases for the harness CLI |

### Using it alongside `@nexus-framework/cli`

You can install the harness and the standalone CLI globally together, in either order. They share one `nexus` command and never fail with `EEXIST`:

- **`@nexus-framework/cli` owns `nexus` on npm.** The harness does not declare a `nexus` bin. If no `nexus` exists yet, the harness adds one after install: a small placeholder package at `<global node_modules>/@nexus-framework/cli` (version `0.0.0-harness-stub`, marked `"nexusOwner": "@nexus-framework/harness"`) plus the link npm would create for it. If the postinstall did not run (`--ignore-scripts`, pnpm, or yarn), the first `nexus-code` start adds it instead. For pnpm and yarn, it writes a marked shim next to `nexus-code`, and only when no `nexus` is on your `PATH`.
- **Installing the CLI later just replaces the placeholder.** npm accepts it like any other package upgrade, so `npm i -g @nexus-framework/cli` works without `--force`. The harness never overwrites a `nexus` it did not create.
- **The newest CLI answers.** Whichever install runs `nexus` compares its CLI version with the other install's and runs the newer one. So installing either package works like an upgrade (or a downgrade) of the same command. `nexus --version` shows which install answered: a plain version means the standalone CLI, and `1.6.0 (via @nexus-framework/harness)` means the harness's bundled copy. Set `NEXUS_BIN_DELEGATED=1` to turn the handoff off for one run.

What happens when you uninstall one of them:

| You uninstall | `nexus` afterwards |
|---------------|--------------------|
| The harness (the CLI stays) | The standalone CLI keeps answering. |
| The CLI (the harness stays) | npm removes `nexus` with the CLI. It comes back, served by the harness, the next time `nexus-code` starts (or after `npm i -g @nexus-framework/harness`). |
| The harness, when it was the only one | The placeholder stays and prints how to get the CLI back. Run `npm i -g @nexus-framework/cli`, or `npm uninstall -g @nexus-framework/cli` to remove the placeholder too. |

`npm ls -g` lists the placeholder as `@nexus-framework/cli@0.0.0-harness-stub`, and `npm update -g` replaces it with the real CLI. That is fine, because the newest CLI answers either way.

Nexus Desktop's "Add nexus to Terminal" puts `~/.nexus/bin` first on your `PATH`. Its `nexus` (the CLI bundled with the app) answers before any npm global, whatever their versions.

## Quick Start

### Via NEXUS CLI (Recommended)

Run inside any NEXUS project:

```bash
nexus harness
```

This automatically grounds the session in your project's Brain (`.nexus/docs/index.md`, active plans, and skills) and boots the web interface at `http://localhost:3080`.

### Direct Usage

```bash
# Launch the web interface on port 3080
nexus-harness web --port 3080

# Launch on a specific port without auto-opening the browser
nexus-harness web --port 8080 --no-open

# On demand, without a global install
npx -y @nexus-framework/harness web --port 3080
```

## Features

- **Brain Synchronization**: Live chips displaying active plan status, project vitals, and orientation memory.
- **Modern Web Dashboard**: Neural vector branding, dark mode, responsive layout, and real-time session tracking.
- **Cordis Plugin Architecture**: Modular, extensible runtime with dynamic plugin loading.
- **Multi-Model Support**: Direct support for DeepSeek, Claude, Codex, Ollama, and local OpenAI-compatible endpoints.

## License

Proprietary additions and modifications © 2026 GDA Africa & NEXUS Framework Contributors. All rights reserved.
Upstream components © 2026 DeepSeek under the MIT License. See [LICENSE](LICENSE) for full legal text and third-party notices.
