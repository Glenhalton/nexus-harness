---
nexus_doc: true
id: "08_deployment"
title: "Deployment & Distribution"
status: populated
confidence: high
last_updated: "2026-10-05"
---

# Deployment & Distribution — NEXUS Execution Harness

**Project:** NEXUS Execution Harness (`@deepseek-ai/dsh`)
**Deployment Modes:** Local Web Server (`dsh web`), Headless CLI (`dsh headless`), or Embedded Library

---

## 🚀 Deployment Modes

1. **Local Developer Launch (`dsh web`)**:
   - Starts local web server on `127.0.0.1:3080` and automatically opens browser.
   - Ideal for interactive pair programming, session inspection, and visual workflow debugging.
2. **Headless Execution (`dsh headless`)**:
   - Starts single-turn or batch agent execution with no web server or browser.
   - Ideal for CI pipelines, automated evaluation, and scheduled tasks.
3. **Embedded Execution Engine**:
   - Other systems (e.g. NEXUS 2.0 platform) mount Cordis profiles in-process.

---

## 🔧 Environment Variables

| Variable | Description | Required | Default |
|---|---|---|---|
| `HOST` | Bind address for Web UI | No | `127.0.0.1` |
| `PORT` | HTTP port for Web UI | No | `3080` |
| `DSH_HOME` | Directory for profiles, sessions, and logs | No | `~/.dsh` |
| `OLLAMA_BASE_URL`| Custom endpoint for Ollama local models | No | `http://127.0.0.1:11434` |
| `DEEPSEEK_API_KEY`| DeepSeek platform API key | Optional | — |
| `ANTHROPIC_API_KEY`| Anthropic Claude API key | Optional | — |
| `OPENAI_API_KEY` | OpenAI API key | Optional | — |

---

## 📦 Build & Release Pipeline

```bash
# Build all workspace packages
pnpm run build

# Package checks
pnpm run publint
pnpm run hygiene
```

---

## 🚢 Release Runbook — NEXUS Stack (skills 0.5.0 → CLI 2.0.0 → harness 1.1.0)

Publish strictly in this order. Each step's lockfile can only resolve the previous
package once it exists on npm, so a step never starts before the one above is live.

| Package | Repo | Version | On npm before this release |
|---|---|---|---|
| `@nexus-framework/skills` | `nexus-skills/packages/core` | 0.5.0 | **published ✅ 2026-10-05** |
| `@nexus-framework/cli` | `nexus-cli` | 2.0.0 | 1.6.0 |
| `@nexus-framework/harness` | `nexus-harness` → `apps/nexus-harness` (generated) | 1.1.0 | 1.0.0 (cannot be reused) |

### 1. Skills 0.5.0 — DONE (0.5.0 is live on npm)
```bash
cd nexus-skills && git push origin main --tags
cd packages/core && npm publish --access public
npm view @nexus-framework/skills@0.5.0 version   # confirm
```

### 2. CLI 2.0.0 — package.json already depends on the published `@nexus-framework/skills@^0.5.0`
`package.json` must depend on `"@nexus-framework/skills": "^0.5.0"`, not the
`file:../nexus-skills/packages/core` link used for local development.
```bash
cd nexus-cli
npm run build && npx tsc --noEmit && npm test && npm run lint
npm pack --dry-run                              # no file: deps, dist/ + bin/ + templates/ present
git commit -am "chore(release): depend on published @nexus-framework/skills 0.5.0"
git push origin main && git tag v2.0.0 && git push origin v2.0.0
npm publish --access public
```

### 3. Harness 1.1.0
```bash
cd nexus-harness
# Move every workspace consumer of the CLI to 2.0.0
for p in packages/experimental/tool-nexus-brain packages/experimental/nexus-brain-context packages/host/nexus-setup; do
  (cd $p && pnpm add @nexus-framework/cli@^2.0.0)
done
pnpm install
node ./node_modules/typescript/bin/tsc -b tsconfig.host.json && npx tsc -b tsconfig.client.json
npx vitest run packages/experimental/tool-nexus-brain packages/experimental/nexus-brain-context packages/host/nexus-setup packages/client/ui-nexus-setup packages/client/ui-nexus-brain-indicator scripts/package-npm-harness.spec.ts
# HARNESS_VERSION in scripts/package-npm-harness.ts and root package.json "version" are already 1.1.0
pnpm run build:lib && pnpm run package:harness
cd apps/nexus-harness && npm pack && npm i -g --prefix "$(mktemp -d)" ./nexus-framework-harness-1.1.0.tgz   # smoke: nexus --version, nexus-code --help
git commit -am "chore(release): build harness 1.1.0 against NEXUS CLI 2.0.0" && git push
npm publish --access public
```

### Verified before release (2026-10-05)
- The shared `nexus` command was proven in temp npm prefixes with the real 1.1.0 + 2.0.0 tarballs:
  all seven install/uninstall orders, zero EEXIST. See the knowledge entry
  "The `nexus` command is shared, not owned".
- CLI 1.6.0's published `dist/utils/brain-memory.js` has `split('\\n')`; 2.0.0's has `split('\n')`,
  so step 3's `tool-nexus-brain` run is what clears that failure.
- The harness bundles whatever CLI its workspace resolves, so until step 3 lands,
  `nexus --version` from a harness-only install reports `1.6.0 (via @nexus-framework/harness)`.

### Known release notes
- The `tool-nexus-brain` coverage sweep fails on `nexus_log` under CLI 1.6.0 (a `split('\\n')` bug in
  `brain-memory`). It is fixed in CLI 2.0.0, so step 3's test run is the gate that proves it.
- Desktop installers release separately via `.github/workflows/desktop-release.yml` on a
  `desktop-v<version>` tag, unsigned until the signing secrets exist.
