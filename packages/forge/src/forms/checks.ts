import { buildFormInventory } from './inventory';
import type { FormIssue } from './types';

export async function runFormChecks(root = process.cwd()): Promise<readonly FormIssue[]> {
  return (await buildFormInventory(root)).issues;
}
