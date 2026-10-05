#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNexus } from './nexus-command.js';

await runNexus(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
