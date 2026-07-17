#!/usr/bin/env node
import path from 'node:path';

import { DocumentationCommandError } from './documentation/types';
import { loadProjectManifest } from './manifest';
import { checkRouteDocumentation, generateRouteDocumentation } from './routing/docs';
import { buildRouteInventory, inspectRoutePattern } from './routing/inventory';
import { matchRoutePath } from './routing/matcher';
import {
  renderAliases,
  renderRouteInspection,
  renderRouteList,
  renderRouteMatches,
  renderRoutingIssues,
} from './routing/render';

const routeCommands = new Set([
  'route:list',
  'route:inspect',
  'route:match',
  'route:check',
  'route:aliases',
  'route:docs',
]);

const argumentsList = process.argv.slice(2);
const command = argumentsList[0]?.startsWith('-') === false ? argumentsList[0] : 'list';

if (!routeCommands.has(command)) {
  await import('./cli');
} else {
  const commandArguments = argumentsList.slice(1);
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < commandArguments.length; index += 1) {
    const argument = commandArguments[index] ?? '';
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const equals = argument.indexOf('=');
    if (equals > 2) {
      options.set(argument.slice(0, equals), argument.slice(equals + 1));
      continue;
    }
    const next = commandArguments[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options.set(argument, next);
      index += 1;
    } else {
      options.set(argument, true);
    }
  }

  const option = (name: string): string | null => {
    const value = options.get(name);
    return typeof value === 'string' ? value : null;
  };
  const flag = (name: string): boolean => options.get(name) === true;
  const projectArgument = option('--project') ?? '.';
  const root = path.resolve(process.cwd(), projectArgument);
  const jsonOutput = flag('--json');

  const manifestResult = await loadProjectManifest(root);
  if (!manifestResult.manifest) {
    for (const failure of manifestResult.failures) {
      console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
    }
    process.exitCode = 1;
  } else if (!manifestResult.manifest.capabilities.includes('next-app')) {
    console.error('[CAPABILITY_MISSING] A routing parancsokhoz next-app capability szükséges.');
    process.exitCode = 1;
  } else {
    const routeArgument = (label: string): string => {
      const value = positionals[0]?.trim();
      if (!value) {
        throw new DocumentationCommandError(
          'ROUTE_ARGUMENT_MISSING',
          `A ${label} parancshoz route pattern vagy pathname szükséges.`,
        );
      }
      return value.startsWith('/') ? value : `/${value}`;
    };

    try {
      switch (command) {
        case 'route:list': {
          const inventory = await buildRouteInventory(root);
          console.log(jsonOutput ? JSON.stringify(inventory, null, 2) : renderRouteList(inventory));
          break;
        }
        case 'route:inspect': {
          const pattern = routeArgument('route:inspect');
          const routes = inspectRoutePattern(await buildRouteInventory(root), pattern);
          if (routes.length === 0) {
            console.error(`[ROUTE_NOT_FOUND] ${pattern}`);
            process.exitCode = 1;
          } else {
            console.log(jsonOutput ? JSON.stringify({ pattern, routes }, null, 2) : renderRouteInspection(routes));
          }
          break;
        }
        case 'route:match': {
          const pathname = routeArgument('route:match');
          const matches = matchRoutePath(await buildRouteInventory(root), pathname);
          if (matches.length === 0) process.exitCode = 1;
          console.log(
            jsonOutput
              ? JSON.stringify({ approximation: true, authoritativeRuntime: 'Next.js', pathname, matches }, null, 2)
              : renderRouteMatches(matches),
          );
          break;
        }
        case 'route:check': {
          const inventory = await buildRouteInventory(root);
          console.log(jsonOutput ? JSON.stringify({ issues: inventory.issues }, null, 2) : renderRoutingIssues(inventory.issues));
          if (inventory.issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
          break;
        }
        case 'route:aliases': {
          const aliases = (await buildRouteInventory(root)).aliases;
          console.log(jsonOutput ? JSON.stringify({ aliases }, null, 2) : renderAliases(aliases));
          break;
        }
        case 'route:docs': {
          if (flag('--check')) {
            const issues = await checkRouteDocumentation(root);
            console.log(jsonOutput ? JSON.stringify({ issues }, null, 2) : renderRoutingIssues(issues));
            if (issues.some(({ severity }) => severity === 'error')) process.exitCode = 1;
          } else {
            const files = await generateRouteDocumentation(root);
            console.log(jsonOutput ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} routing dokumentum`);
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof DocumentationCommandError) {
        console.error(`[${error.code}] ${error.message}`);
        process.exitCode = 1;
      } else {
        throw error;
      }
    }
  }
}
