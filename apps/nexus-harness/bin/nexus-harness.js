#!/usr/bin/env node
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
