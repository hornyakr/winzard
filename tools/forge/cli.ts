#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseDotenv } from 'dotenv';

import { parseEnvironment } from '../../src/platform/config/env';
import { runProjectChecks, type CheckFailure } from './checks/project';

const command = process.argv[2] ?? 'list';
const root = process.cwd();
const supportedCommands = ['about', 'doctor', 'check', 'env:check', 'security:check'] as const;

function printFailures(failures: readonly CheckFailure[]): void {
  for (const failure of failures) {
    console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  }
}

async function runChecks(label: string): Promise<void> {
  const failures = await runProjectChecks(root);

  if (failures.length > 0) {
    printFailures(failures);
    console.error(`FAIL: ${label} (${failures.length} hiba)`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS: ${label}`);
}

async function loadLocalEnvironment(): Promise<void> {
  try {
    const parsed = parseDotenv(await readFile(path.join(root, '.env'), 'utf8'));

    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] ??= value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function checkEnvironment(): Promise<void> {
  await loadLocalEnvironment();
  parseEnvironment(process.env);
  console.log('PASS: env:check');
}

async function printAbout(): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    name?: unknown;
    version?: unknown;
    winzard?: { profile?: unknown };
  };

  const name = typeof manifest.name === 'string' ? manifest.name : 'winzard';
  const version = typeof manifest.version === 'string' ? manifest.version : 'unknown';
  const profile = typeof manifest.winzard?.profile === 'string' ? manifest.winzard.profile : 'unknown';

  console.log(`${name} ${version} (${profile})`);
}

switch (command) {
  case 'list':
    console.log(supportedCommands.join('\n'));
    break;
  case 'about':
    await printAbout();
    break;
  case 'env:check':
    await checkEnvironment();
    break;
  case 'doctor':
    await checkEnvironment();
    await runChecks('doctor');
    break;
  case 'check':
  case 'security:check':
    await runChecks(command);
    break;
  default:
    console.error(`Unknown or not yet implemented Forge command: ${command}`);
    process.exitCode = 2;
}
