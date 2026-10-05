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
| `nexus` | The NEXUS CLI (`@nexus-framework/cli`, bundled with the harness) |
| `nexus-code` | The harness CLI |
| `nexus-harness` | The harness CLI (same as `nexus-code`) |
| `harness`, `dsh` | Compatibility aliases for the harness CLI |

### Already have `@nexus-framework/cli` installed globally?

Both packages provide a `nexus` command, and npm will not let two global packages own the same command. If `@nexus-framework/cli` is installed first, `npm i -g @nexus-framework/harness` stops with `EEXIST: file already exists ... bin/nexus` and installs nothing. In the other order, installing the CLI after the harness fails the same way.

The harness already includes the NEXUS CLI, so the fix is to uninstall the standalone CLI first:

```bash
npm uninstall -g @nexus-framework/cli
npm i -g @nexus-framework/harness
nexus --version   # now served by the harness's bundled CLI
```

Avoid `npm i -g --force @nexus-framework/harness`. It does point `nexus` at the harness, but if you later uninstall the harness, `nexus` disappears completely, even though the standalone CLI is still installed. If that happens, run `npm i -g @nexus-framework/cli` again to get the command back.

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
