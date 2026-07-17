#!/usr/bin/env node

import { runRoutingCli } from './routing/cli';
import { RoutingCommandError } from './routing/types';

const routingCommands = [
  'route:list',
  'route:check',
  'route:inspect',
  'route:match',
  'route:aliases',
  'route:docs',
] as const;
const command = process.argv[2] ?? 'list';

if (command === 'list') {
  console.log(routingCommands.join('\n'));
  await import('./cli');
} else if (command.startsWith('route:')) {
  try {
    await runRoutingCli(command, process.argv.slice(3));
  } catch (error) {
    if (error instanceof RoutingCommandError) {
      console.error(`[${error.code}] ${error.file}: ${error.message}`);
    } else {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    }
    process.exitCode = 1;
  }
} else {
  await import('./cli');
}
