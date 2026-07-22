import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { addIssue } from './definition-parser';
import { inspectContractSource, inspectProviderSource } from './source-analysis';
import type { ContractDefinitionRecord, ContractIssue, ContractProviderRecord } from './types';

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

export async function validateContracts(
  root: string,
  contracts: readonly ContractDefinitionRecord[],
  issues: ContractIssue[],
): Promise<void> {
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (ids.has(contract.id)) {
      addIssue(issues, { severity: 'error', area: 'contract', code: 'CONTRACT_DUPLICATE_ID', file: contract.definitionFile, contractId: contract.id, message: `Duplikált contract ID: ${contract.id}.` });
    }
    ids.add(contract.id);
    const targets: readonly Readonly<{ path: string; code: string; message: string }>[] = [
      { path: contract.source, code: 'CONTRACT_SOURCE_MISSING', message: 'Hiányzó contract source' },
      { path: contract.documentation, code: 'CONTRACT_DOCUMENTATION_MISSING', message: 'Hiányzó contract dokumentáció' },
      ...(contract.referenceSuite ? [{ path: contract.referenceSuite, code: 'CONTRACT_REFERENCE_SUITE_MISSING', message: 'Hiányzó reference suite' }] : []),
      ...(contract.runtimeSchema ? [{ path: contract.runtimeSchema, code: 'CONTRACT_RUNTIME_VALIDATION_MISSING', message: 'Hiányzó runtime schema' }] : []),
    ];
    for (const target of targets) {
      if (!await exists(path.join(root, target.path))) {
        addIssue(issues, { severity: 'error', area: 'contract', code: target.code, file: contract.definitionFile, contractId: contract.id, message: `${target.message}: ${target.path}.` });
      }
    }
    if (contract.stability === 'stable' && contract.referenceSuite === null) {
      addIssue(issues, { severity: 'error', area: 'contract', code: 'CONTRACT_REFERENCE_SUITE_MISSING', file: contract.definitionFile, contractId: contract.id, message: 'Stable contracthoz reference suite kötelező.' });
    }
    if (await exists(path.join(root, contract.source))) {
      issues.push(...inspectContractSource(contract.source, await readFile(path.join(root, contract.source), 'utf8'), contract.exportName, contract.id));
    }
  }
}

export async function validateProviders(
  root: string,
  contracts: readonly ContractDefinitionRecord[],
  providers: readonly ContractProviderRecord[],
  issues: ContractIssue[],
): Promise<void> {
  const ids = new Set<string>();
  for (const provider of providers) {
    if (ids.has(provider.id)) {
      addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVIDER_DUPLICATE_ID', file: provider.definitionFile, providerId: provider.id, message: `Duplikált provider ID: ${provider.id}.` });
    }
    ids.add(provider.id);
    const contract = contracts.find(({ id }) => id === provider.contractId);
    if (!contract) {
      addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVIDER_UNKNOWN', file: provider.definitionFile, providerId: provider.id, message: `Ismeretlen contract: ${provider.contractId}.` });
    } else if (contract.major !== provider.contractMajor) {
      addIssue(issues, { severity: 'error', area: 'compatibility', code: 'CONTRACT_PROVIDER_VERSION_INCOMPATIBLE', file: provider.definitionFile, contractId: contract.id, providerId: provider.id, message: `A provider ${provider.contractMajor}-es contract majort deklarál, a contract majorja ${contract.major}.` });
    }
    if (!await exists(path.join(root, provider.source))) {
      addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVIDER_SOURCE_MISSING', file: provider.definitionFile, providerId: provider.id, message: `Hiányzó provider source: ${provider.source}.` });
    } else {
      issues.push(...inspectProviderSource(provider.source, await readFile(path.join(root, provider.source), 'utf8'), provider.exportName, provider.id));
    }
    if (provider.referenceSuite === null || !await exists(path.join(root, provider.referenceSuite))) {
      addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVIDER_CAPABILITY_UNTESTED', file: provider.definitionFile, providerId: provider.id, message: `A providerhez érvényes reference suite evidence szükséges${provider.referenceSuite ? `: ${provider.referenceSuite}` : ''}.` });
    }
  }
  for (const contract of contracts.filter(({ stability }) => stability === 'stable')) {
    if (!providers.some(({ contractId, contractMajor, kind }) => contractId === contract.id && contractMajor === contract.major && kind === 'production')) {
      addIssue(issues, { severity: 'error', area: 'provider', code: 'CONTRACT_PROVEN_IMPLEMENTATION_MISSING', file: contract.definitionFile, contractId: contract.id, message: 'Stable contracthoz legalább egy production-közeli provider szükséges.' });
    }
  }
}
