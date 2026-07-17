import { buildRouteInventory } from './inventory';
import type { RoutingIssue } from './types';

export async function runRouteChecks(root = process.cwd()): Promise<readonly RoutingIssue[]> {
  return (await buildRouteInventory(root)).issues;
}
