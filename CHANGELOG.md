# Changelog

All notable changes to Nexus Harness will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-10-08

### 🚀 Packaging & Runtime Enhancements

- **Dynamic Version Derivation**: In the Web UI EmptyHero component, replaced hardcoded `0.0.1` version badge with dynamic derivation from `@deepseek-ai/dsh` runtime package metadata.
- **Defensive Profile Resolution**: In `dsh-app-boot` (`loadProfile`), added backward-compatibility fallback aliasing `default` and `tui` to the `headless` driver, preventing missing-profile errors.
- **Distribution Package**: Packaged `@nexus-framework/harness@1.1.2` with minified self-contained runtime closure at `apps/nexus-harness`.

## [1.1.1] - 2026-10-06

### 🎨 Visual & Telemetry Updates

- In-process telemetry and Cordis reactive plugin architecture stabilization.
- Web UI model selection and connection diagnostics.

## [1.1.0] - 2026-10-02

### ⚡ Nexus 2.0 Launch

- Initial release of `@nexus-framework/harness`.
- Glass dark theme, subagent inspectors, and real-time MCP brain orchestration.
