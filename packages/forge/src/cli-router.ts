#!/usr/bin/env node
import { runCompositionCli } from './composition/cli';
import { runContractCli } from './contracts/cli';
import { runEventCli } from './events/cli';

try {
  if (
    !await runContractCli(process.argv.slice(2)) &&
    !await runEventCli(process.argv.slice(2)) &&
    !await runCompositionCli(process.argv.slice(2))
  ) {
    await import('./cli-router-base');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = typeof error === 'object' && error !== null && 'exitCode' in error
    ? Number((error as { exitCode?: unknown }).exitCode ?? 1)
    : 1;
}
