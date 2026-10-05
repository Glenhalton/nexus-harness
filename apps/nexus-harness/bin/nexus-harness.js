#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const { ensureNexusCommand } = await import('./nexus-command.js');
  ensureNexusCommand({ harnessRoot: packageRoot });
} catch {
  // Providing nexus is best effort; the harness itself must always start.
}
const entry = path.join(packageRoot, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
process.argv[1] = entry;
const { runCli } = await import(pathToFileURL(entry).href);
await runCli();
