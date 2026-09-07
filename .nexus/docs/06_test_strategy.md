---
nexus_doc: true
id: "06_test_strategy"
title: "Test Strategy & Verification Invariants"
status: populated
confidence: high
last_updated: "2026-09-07"
---

# Test Strategy & Verification Invariants — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Test Framework:** Vitest
**Lint & Hygiene:** Oxlint + Lefthook + custom AST rules

---

## 🧪 Testing Philosophy

In an agent runtime with dynamically composed plugins, unit tests alone are insufficient. The harness uses a three-tier testing hierarchy:

1. **Isolated Unit Tests**: Validate pure functions, schema parsers, event mappings, and tool parameter validation.
2. **Real Cordis Loader-Composition Tests**: Mandatory for any product-visible plugin. Spawns a real Cordis container and verifies that plugin mounting, event hooks, and unmounting succeed against real configurations.
3. **Runtime Invariant Tests**: Assert that every model-visible turn event conforms to session log storage invariants.

---

## 📋 Test Matrix

| Layer | Runner / Tool | Target & Invariant |
|---|---|---|
| **Unit Tests** | `vitest run packages/<package>` | Package-specific logic, utilities, tool handlers |
| **Loader Composition** | `tests/loader-composition.spec.ts` | Real Cordis plugin mounting and dependency injection |
| **Invariants** | `src/invariant.ts` | Session log completeness and event schema validity |
| **ACP Snapshots** | `vitest.snapshot.config.ts` | Deterministic agent trajectory snapshots |
| **Code Hygiene** | `scripts/run-oxlint.ts` | Sub-second AST linting and syntax compliance |
| **Package Hygiene** | `scripts/publint-all.ts` | Package export maps and peer dependency constraints |

---

## 🏃 Running Tests

```bash
# Run all workspace unit tests
pnpm test

# Run tests for a specific package (e.g., experimental bridge packages)
pnpm vitest run packages/experimental

# Run code hygiene and lint sweeps
pnpm run hygiene
npx tsx scripts/run-oxlint.ts
```
