import { buildDeliveryInventory } from './inventory';
import type { DeliveryIssue } from './types';

export async function runDeliveryChecks(root = process.cwd()): Promise<readonly DeliveryIssue[]> {
  return (await buildDeliveryInventory(root)).issues;
}
