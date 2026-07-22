#!/usr/bin/env node
import { runCompositionCli } from './composition/cli';

try {
  if (!await runCompositionCli(process.argv.slice(2))) {
    await import('./cli-router-base');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = typeof error === 'object' && error !== null && 'exitCode' in error
    ? Number((error as { exitCode?: unknown }).exitCode ?? 1)
    : 1;
}
