#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.npm_config_global === 'true') {
  try {
    const { ensureNexusCommand } = await import('./nexus-command.js');
    const result = ensureNexusCommand({ harnessRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') });
    if (result.status === 'created') console.log('nexus: linked the NEXUS CLI bundled with @nexus-framework/harness at ' + result.path);
  } catch {
    // Best effort: nexus-code repeats this on every start.
  }
}
