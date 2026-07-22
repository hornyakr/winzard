import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { isContractJsonObject, parseContractFactories } from './ast';
import {
  addIssue,
  DEFINITION_FIELDS,
  parseContract,
  parseProvider,
  PROVIDER_DEFINITION_FIELDS,
  text,
  unknownFields,
} from './definition-parser';
import type {
  ContractDefinitionFileRecord,
  ContractDefinitionRecord,
  ContractIssue,
  ContractProviderFileRecord,
  ContractProviderRecord,
} from './types';

const IGNORED = new Set(['node_modules', '.next', 'generated']);

async function definitionFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const output: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !IGNORED.has(entry.name)) output.push(...await definitionFiles(target));
    else if (entry.isFile() && (entry.name.endsWith('.contract.definition.ts') || entry.name.endsWith('.contract-provider.ts'))) output.push(target);
  }
  return output.sort();
}

export type CollectedContractDefinitions = Readonly<{
  definitions: readonly ContractDefinitionFileRecord[];
  providerDefinitions: readonly ContractProviderFileRecord[];
  contracts: readonly ContractDefinitionRecord[];
  providers: readonly ContractProviderRecord[];
}>;

export async function collectContractDefinitions(root: string, issues: ContractIssue[]): Promise<CollectedContractDefinitions> {
  const definitions: ContractDefinitionFileRecord[] = [];
  const providerDefinitions: ContractProviderFileRecord[] = [];
  const contracts: ContractDefinitionRecord[] = [];
  const providers: ContractProviderRecord[] = [];
  for (const file of await definitionFiles(path.join(root, 'src'))) {
    const projectFile = path.relative(root, file).split(path.sep).join('/');
    const providerFile = file.endsWith('.contract-provider.ts');
    const factory = providerFile ? 'defineContractProviders' : 'defineContracts';
    let parsed;
    try { parsed = parseContractFactories(projectFile, await readFile(file, 'utf8'), factory); }
    catch (error) {
      addIssue(issues, {
        severity: 'error',
        area: providerFile ? 'provider' : 'contract',
        code: providerFile ? 'CONTRACT_PROVIDER_DEFINITION_PARSE' : 'CONTRACT_DEFINITION_PARSE',
        file: projectFile,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const definition of parsed) {
      unknownFields(
        definition.value,
        providerFile ? PROVIDER_DEFINITION_FIELDS : DEFINITION_FIELDS,
        projectFile,
        issues,
        providerFile ? 'CONTRACT_PROVIDER_DEFINITION_UNKNOWN_FIELD' : 'CONTRACT_DEFINITION_UNKNOWN_FIELD',
      );
      const id = text(definition.value.id);
      const items = providerFile ? definition.value.providers : definition.value.contracts;
      if (definition.value.schemaVersion !== 1 || !id || !Array.isArray(items)) {
        addIssue(issues, {
          severity: 'error',
          area: providerFile ? 'provider' : 'contract',
          code: providerFile ? 'CONTRACT_PROVIDER_DEFINITION_INVALID' : 'CONTRACT_DEFINITION_INVALID',
          file: projectFile,
          message: `${factory} schemaVersion=1, id és ${providerFile ? 'providers' : 'contracts'} tömb mezőket igényel.`,
        });
        continue;
      }
      const itemIds: string[] = [];
      for (const raw of items) {
        if (!isContractJsonObject(raw)) {
          addIssue(issues, {
            severity: 'error',
            area: providerFile ? 'provider' : 'contract',
            code: providerFile ? 'CONTRACT_PROVIDER_INVALID' : 'CONTRACT_DEFINITION_INVALID',
            file: projectFile,
            message: 'A definition elemei objektumok legyenek.',
          });
          continue;
        }
        if (providerFile) {
          const provider = parseProvider(raw, id, projectFile, issues);
          if (provider) { providers.push(provider); itemIds.push(provider.id); }
        } else {
          const contract = parseContract(raw, id, projectFile, issues);
          if (contract) { contracts.push(contract); itemIds.push(contract.id); }
        }
      }
      if (providerFile) {
        providerDefinitions.push(Object.freeze({ id, file: projectFile, exportName: definition.exportName, providers: Object.freeze(itemIds) }));
      } else {
        definitions.push(Object.freeze({ id, file: projectFile, exportName: definition.exportName, contracts: Object.freeze(itemIds) }));
      }
    }
  }
  return Object.freeze({ definitions, providerDefinitions, contracts, providers });
}
