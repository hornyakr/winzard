import { createHash } from 'node:crypto';

import { collectContractDefinitions } from './discovery';
import type { ContractDefinitionRecord, ContractInventory, ContractIssue } from './types';
import { validateContracts, validateProviders } from './validation';

export async function buildContractInventory(root: string): Promise<ContractInventory> {
  const issues: ContractIssue[] = [];
  const collected = await collectContractDefinitions(root, issues);
  await validateContracts(root, collected.contracts, issues);
  await validateProviders(root, collected.contracts, collected.providers, issues);
  const definitions = [...collected.definitions].sort((left, right) => left.id.localeCompare(right.id));
  const providerDefinitions = [...collected.providerDefinitions].sort((left, right) => left.id.localeCompare(right.id));
  const contracts = [...collected.contracts].sort((left, right) => left.id.localeCompare(right.id));
  const providers = [...collected.providers].sort((left, right) => left.id.localeCompare(right.id));
  const fingerprint = createHash('sha256').update(JSON.stringify({ definitions, providerDefinitions, contracts, providers })).digest('hex');
  return Object.freeze({
    schemaVersion: 1,
    projectRoot: '.',
    definitions: Object.freeze(definitions),
    providerDefinitions: Object.freeze(providerDefinitions),
    contracts: Object.freeze(contracts),
    providers: Object.freeze(providers),
    issues: Object.freeze(issues.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code))),
    fingerprint,
  });
}

export function inspectContracts(inventory: ContractInventory, query: string): readonly ContractDefinitionRecord[] {
  const normalized = query.trim().toLowerCase();
  return inventory.contracts.filter((contract) => [
    contract.id,
    contract.owner,
    contract.source,
    contract.exportName,
    contract.documentation,
    ...contract.categories,
  ].some((value) => value.toLowerCase().includes(normalized)));
}
