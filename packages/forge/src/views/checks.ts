import { buildViewInventory } from './inventory';
import type { ViewIssue } from './types';

export async function runViewChecks(root = process.cwd()): Promise<readonly ViewIssue[]> {
  return (await buildViewInventory(root)).issues;
}
