#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let manifestPath;
try {
  manifestPath = require.resolve('@nexus-framework/cli/package.json');
} catch {
  console.error('nexus: @nexus-framework/cli is missing from this @nexus-framework/harness install; reinstall the package.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.nexus;
if (typeof bin !== 'string') {
  console.error('nexus: @nexus-framework/cli declares no nexus bin.');
  process.exit(1);
}
const entry = path.resolve(path.dirname(manifestPath), bin);
process.argv[1] = entry;
await import(pathToFileURL(entry).href);
