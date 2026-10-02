# @nexus-framework/harness

> The official AI-Native Execution Harness and Web Interface for the NEXUS Framework.

## Overview

`@nexus-framework/harness` provides the complete execution environment, interactive web interface, terminal runner, and Cordis plugin architecture for NEXUS projects.

## Quick Start

### Via NEXUS CLI (Recommended)

When you have `@nexus-framework/cli` installed, simply run inside any NEXUS project:

```bash
nexus harness
```

This automatically grounds the session in your project's Brain (`.nexus/docs/index.md`, active plans, and skills) and boots the web interface at `http://localhost:3080`.

### Direct On-Demand Usage

```bash
# Launch the web interface on port 3080
npx -y @nexus-framework/harness web --port 3080

# Launch with a specific port without auto-opening the browser
npx -y @nexus-framework/harness web --port 8080 --no-open

# Verify model context window and tool reliability
npx -y @nexus-framework/harness verify ollama-local
```

## Features

- **Brain Synchronization**: Live chips displaying active plan status, project vitals, and orientation memory.
- **Modern Web Dashboard**: Neural vector branding, dark mode, responsive layout, and real-time session tracking.
- **Cordis Plugin Architecture**: Modular, extensible runtime with dynamic plugin loading.
- **Multi-Model Support**: Direct support for DeepSeek, Claude, Codex, Ollama, and local OpenAI-compatible endpoints.

## License

MIT © GDA Africa & NEXUS Framework Contributors
