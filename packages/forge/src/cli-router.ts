#!/usr/bin/env node
import { runCompositionCli } from './composition/cli';
import { runContractCli } from './contracts/cli';
import { runEventCli } from './events/cli';
import { EXTENSION_COMMANDS, runExtensionCli } from './extensions/cli';
import { FORM_COMMANDS, runFormCli } from './forms/cli';
import { PERSISTENCE_COMMANDS, runPersistenceCli } from './persistence/cli';
import { TESTING_COMMANDS, runTestingCli } from './testing/cli';

try {
  const args = process.argv.slice(2);
  if (
    !await runContractCli(args) &&
    !await runEventCli(args) &&
    !await runCompositionCli(args) &&
    !await runExtensionCli(args) &&
    !await runFormCli(args) &&
    !await runPersistenceCli(args) &&
    !await runTestingCli(args)
  ) {
    await import('./cli-router-base');
    if ((args[0] ?? 'list') === 'list') {
      console.log([
        ...EXTENSION_COMMANDS,
        ...FORM_COMMANDS,
        ...PERSISTENCE_COMMANDS,
        ...TESTING_COMMANDS,
      ].join('\n'));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = typeof error === 'object' && error !== null && 'exitCode' in error
    ? Number((error as { exitCode?: unknown }).exitCode ?? 1)
    : 1;
}
