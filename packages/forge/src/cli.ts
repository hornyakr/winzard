#!/usr/bin/env node
import path from 'node:path';

import { runProjectChecks, type CheckFailure } from './checks/project';
import { checkCapabilityEnvironment } from './environment';
import { loadProjectManifest } from './manifest';

const supportedCommands = ['about', 'doctor', 'check', 'env:check', 'security:check'] as const;
const argumentsList = process.argv.slice(2);
const command = argumentsList.find((argument) => !argument.startsWith('-')) ?? 'list';

function optionValue(name: string): string | null {
  const equals = argumentsList.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] ?? null : null;
}

const projectArgument = optionValue('--project') ?? '.';
const root = path.resolve(process.cwd(), projectArgument);

function printFailures(failures: readonly CheckFailure[]): void {
  for (const failure of failures) console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
}

async function manifestOrExit() {
  const result = await loadProjectManifest(root);
  if (result.manifest === null) {
    printFailures(result.failures);
    process.exitCode = 1;
    return null;
  }
  return result.manifest;
}

async function runChecks(label: string): Promise<void> {
  const failures = await runProjectChecks(root);
  if (failures.length > 0) {
    printFailures(failures);
    console.error(`FAIL: ${label} (${failures.length} hiba)`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${label} (${projectArgument})`);
}

async function runEnvironmentCheck(): Promise<void> {
  const manifest = await manifestOrExit();
  if (!manifest) return;
  const failures = await checkCapabilityEnvironment(root, manifest);
  if (failures.length > 0) {
    printFailures(failures);
    console.error(`FAIL: env:check (${failures.length} hiba)`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: env:check (${projectArgument})`);
}

async function printAbout(): Promise<void> {
  const manifest = await manifestOrExit();
  if (!manifest) return;
  console.log(`${manifest.profile} [${manifest.capabilities.join(', ')}]`);
}

switch (command) {
  case 'list':
    console.log(supportedCommands.join('\n'));
    break;
  case 'about':
    await printAbout();
    break;
  case 'env:check':
    await runEnvironmentCheck();
    break;
  case 'doctor':
    await runEnvironmentCheck();
    if (!process.exitCode) await runChecks('doctor');
    break;
  case 'check':
  case 'security:check':
    await runChecks(command);
    break;
  default:
    console.error(`Unknown or not yet implemented Forge command: ${command}`);
    process.exitCode = 2;
}
