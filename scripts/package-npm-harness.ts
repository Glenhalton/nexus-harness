/**
 * Packages the self-contained @nexus-framework/harness distribution for npm.
 *
 * Materializes the runtime source closure, web dist assets, TypeScript path configs,
 * and launcher binary so that `npx -y @nexus-framework/harness` runs seamlessly
 * anywhere without monorepo dependencies.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../')
const PKG_DIR = join(REPO_ROOT, 'apps', 'nexus-harness')
const RUNTIME_DIR = join(PKG_DIR, 'runtime')

function collectExternalDependencies(): Record<string, string> {
  const manifestMap = new Map<string, Record<string, unknown>>()

  function walk(currentDir: string, depth: number, maxDepth: number): void {
    if (depth > maxDepth || !existsSync(currentDir)) return
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'nexus-harness') continue
      const full = join(currentDir, entry.name)
      const pkgPath = join(full, 'package.json')
      if (existsSync(pkgPath)) {
        try {
          const manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
          if (typeof manifest.name === 'string') {
            manifestMap.set(manifest.name, manifest)
          }
        } catch {}
      }
      walk(full, depth + 1, maxDepth)
    }
  }

  // Scan workspace trees
  walk(join(REPO_ROOT, 'packages'), 1, 3)
  walk(join(REPO_ROOT, 'vendor'), 1, 3)
  walk(join(REPO_ROOT, 'apps'), 1, 3)
  walk(join(REPO_ROOT, 'native'), 1, 4)

  const externalDeps: Record<string, string> = {
    tsx: '^4.22.4',
    typescript: '^6.0.3',
  }

  for (const [, manifest] of manifestMap) {
    const deps = (manifest.dependencies || {}) as Record<string, string>
    for (const [dep, ver] of Object.entries(deps)) {
      if (!manifestMap.has(dep) && !dep.startsWith('@deepseek-ai/')) {
        // Strip workspace: protocol if present
        const cleanVer = ver.startsWith('workspace:') ? ver.replace('workspace:', '') : ver
        externalDeps[dep] = cleanVer || '*'
      }
    }
  }

  // Sort keys alphabetically
  return Object.keys(externalDeps)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = externalDeps[key] as string
      return acc
    }, {})
}

export function packageHarness(): void {
  console.log('Packaging @nexus-framework/harness...')

  // 1. Verify web dist exists
  const webDist = join(REPO_ROOT, 'apps', 'web', 'dist')
  if (!existsSync(webDist)) {
    throw new Error('apps/web/dist does not exist. Run "pnpm build:web" before packaging.')
  }

  // 2. Clean & recreate runtime directory
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
  mkdirSync(RUNTIME_DIR, { recursive: true })

  const copyFilter = (src: string): boolean => {
    const base = src.split('/').pop() || ''
    if (base === 'node_modules') return false
    if (base === '.git') return false
    if (base === 'tests') return false
    if (base.endsWith('.spec.ts') || base.endsWith('.test.ts')) return false
    if (base.endsWith('.tsbuildinfo')) return false
    return true
  }

  // 3. Copy packages, vendor, apps/cli
  console.log('Copying runtime source packages...')
  cpSync(join(REPO_ROOT, 'packages'), join(RUNTIME_DIR, 'packages'), { recursive: true, filter: copyFilter })
  cpSync(join(REPO_ROOT, 'vendor'), join(RUNTIME_DIR, 'vendor'), { recursive: true, filter: copyFilter })
  cpSync(join(REPO_ROOT, 'apps', 'cli'), join(RUNTIME_DIR, 'apps', 'cli'), { recursive: true, filter: copyFilter })

  // 4. Copy apps/web manifest & dist
  console.log('Copying apps/web frontend dist...')
  mkdirSync(join(RUNTIME_DIR, 'apps', 'web'), { recursive: true })
  cpSync(join(REPO_ROOT, 'apps', 'web', 'package.json'), join(RUNTIME_DIR, 'apps', 'web', 'package.json'))
  cpSync(webDist, join(RUNTIME_DIR, 'apps', 'web', 'dist'), { recursive: true })

  // 5. Copy root tsconfig configs
  cpSync(join(REPO_ROOT, 'tsconfig.json'), join(RUNTIME_DIR, 'tsconfig.json'))
  cpSync(join(REPO_ROOT, 'tsconfig.base.json'), join(RUNTIME_DIR, 'tsconfig.base.json'))

  // 5b. Minify & Obfuscate runtime source files
  console.log('Minifying and obfuscating runtime files with esbuild...')
  const esbuildCandidates = [
    join(REPO_ROOT, 'node_modules', '.pnpm', 'esbuild@0.28.1', 'node_modules', 'esbuild', 'lib', 'main.js'),
    join(REPO_ROOT, 'node_modules', 'esbuild', 'lib', 'main.js'),
  ]
  let esbuild: { transformSync: (code: string, options: Record<string, unknown>) => { code: string } } | null = null
  const localReq = createRequire(import.meta.url)
  for (const candidate of esbuildCandidates) {
    if (existsSync(candidate)) {
      try {
        esbuild = localReq(candidate)
        break
      } catch {}
    }
  }

  if (esbuild) {
    let obfuscatedCount = 0
    const minifyWalk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          minifyWalk(full)
        } else if (
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) &&
          !entry.name.endsWith('.d.ts')
        ) {
          try {
            const raw = readFileSync(full, 'utf8')
            const loader = entry.name.endsWith('.tsx') ? 'tsx' : entry.name.endsWith('.js') || entry.name.endsWith('.mjs') ? 'js' : 'ts'
            const transformed = esbuild.transformSync(raw, {
              loader,
              minify: true,
              legalComments: 'inline',
              target: 'es2024',
              format: 'esm',
            })
            writeFileSync(full, transformed.code, 'utf8')
            obfuscatedCount++
          } catch {}
        }
      }
    }
    minifyWalk(RUNTIME_DIR)
    console.log(`✅ Obfuscated and minified ${obfuscatedCount} runtime source files.`)
  }

  // 6. Write bin/nexus-harness.js
  const binDir = join(PKG_DIR, 'bin')
  mkdirSync(binDir, { recursive: true })
  const binPath = join(binDir, 'nexus-harness.js')
  const binContent = `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const binTs = path.join(packageRoot, 'runtime', 'apps', 'cli', 'src', 'bin.ts');
const tsconfig = path.join(packageRoot, 'runtime', 'tsconfig.json');

const require = createRequire(import.meta.url);
let tsxLoader = 'tsx/esm';
try {
  tsxLoader = require.resolve('tsx/esm');
} catch {}

const nodePath = [
  path.join(packageRoot, 'node_modules'),
  process.env.NODE_PATH || '',
].filter(Boolean).join(path.delimiter);

const child = spawn(process.execPath, [
  '--import', tsxLoader,
  binTs,
  ...process.argv.slice(2),
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    TSX_TSCONFIG_PATH: tsconfig,
    NODE_PATH: nodePath,
  },
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }
  if (signal) {
    process.kill(process.pid, signal);
  }
});
`
  writeFileSync(binPath, binContent, 'utf8')
  chmodSync(binPath, 0o755)

  // 7. Write package.json
  const dependencies = collectExternalDependencies()
  const packageJson = {
    name: '@nexus-framework/harness',
    version: '1.0.0',
    description: 'NEXUS Harness: AI-Native Execution Harness and Web Interface (Proprietary / All Rights Reserved)',
    publishConfig: {
      access: 'public',
    },
    type: 'module',
    bin: {
      'nexus-harness': 'bin/nexus-harness.js',
      harness: 'bin/nexus-harness.js',
      dsh: 'bin/nexus-harness.js',
    },
    files: [
      'bin',
      'runtime',
      'README.md',
      'LICENSE',
    ],
    repository: {
      type: 'git',
      url: 'git+https://github.com/GDA-Africa/nexus-harness.git',
      directory: 'apps/nexus-harness',
    },
    keywords: [
      'nexus',
      'nexus-framework',
      'ai-native',
      'execution-harness',
      'agent',
      'autonomous-development',
    ],
    license: 'SEE LICENSE IN LICENSE',
    engines: {
      node: '>=20.0.0',
    },
    dependencies,
  }

  writeFileSync(join(PKG_DIR, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  // 8. Write LICENSE
  const licenseContent = `NEXUS Harness Distribution License
==================================

Copyright (c) 2026 Glenhalton Takor / GDA Africa. All Rights Reserved.
Proprietary rights are reserved for all NEXUS-specific additions, modifications,
branding assets, themes, CLI launcher bindings, and brain-context plugins.

--------------------------------------------------------------------------------
Portions of this software are derived from DeepSeek Harness (DSH), which is
licensed under the MIT License:

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
--------------------------------------------------------------------------------
`
  writeFileSync(join(PKG_DIR, 'LICENSE'), licenseContent, 'utf8')

  // 9. Write README.md
  const readmeContent = `# @nexus-framework/harness

> The official AI-Native Execution Harness and Web Interface for the NEXUS Framework.

## Overview

\`@nexus-framework/harness\` provides the complete execution environment, interactive web interface, terminal runner, and Cordis plugin architecture for NEXUS projects.

## Quick Start

### Via NEXUS CLI (Recommended)

When you have \`@nexus-framework/cli\` installed, simply run inside any NEXUS project:

\`\`\`bash
nexus harness
\`\`\`

This automatically grounds the session in your project's Brain (\`.nexus/docs/index.md\`, active plans, and skills) and boots the web interface at \`http://localhost:3080\`.

### Direct On-Demand Usage

\`\`\`bash
# Launch the web interface on port 3080
npx -y @nexus-framework/harness web --port 3080

# Launch with a specific port without auto-opening the browser
npx -y @nexus-framework/harness web --port 8080 --no-open

# Verify model context window and tool reliability
npx -y @nexus-framework/harness verify ollama-local
\`\`\`

## Features

- **Brain Synchronization**: Live chips displaying active plan status, project vitals, and orientation memory.
- **Modern Web Dashboard**: Neural vector branding, dark mode, responsive layout, and real-time session tracking.
- **Cordis Plugin Architecture**: Modular, extensible runtime with dynamic plugin loading.
- **Multi-Model Support**: Direct support for DeepSeek, Claude, Codex, Ollama, and local OpenAI-compatible endpoints.

## License

Proprietary additions and modifications © 2026 GDA Africa & NEXUS Framework Contributors. All rights reserved.
Upstream components © 2026 DeepSeek under the MIT License. See [LICENSE](LICENSE) for full legal text and third-party notices.
`
  writeFileSync(join(PKG_DIR, 'README.md'), readmeContent, 'utf8')

  console.log('✅ @nexus-framework/harness successfully packaged at apps/nexus-harness')
}

if (import.meta.main || process.argv[1]?.endsWith('package-npm-harness.ts')) {
  packageHarness()
}
