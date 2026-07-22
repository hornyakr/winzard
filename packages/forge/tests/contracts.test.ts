import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTRACT_COMMANDS } from '../src/contracts/cli';
import { checkContractCompatibility, compareContractManifests } from '../src/contracts/compatibility';
import { checkContractGeneration, generateContracts } from '../src/contracts/generator';
import { buildContractInventory } from '../src/contracts/inventory';
import type { ContractManifest } from '../src/contracts/types';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-contracts-'));
  await file(root, 'src/ports/clock.ts', 'export interface Clock { now(): Date; }\n');
  await file(root, 'src/providers/system-clock.ts', 'import type { Clock } from \'../ports/clock\'; export class SystemClock implements Clock { now(): Date { return new Date(); } }\n');
  await file(root, 'docs/contracts/clock.md', '# Clock\n');
  await file(root, 'tests/contracts/clock.test.ts', 'export const clockContractEvidence = true;\n');
  await file(root, 'src/composition/application.contract.definition.ts', `export const contracts = defineContracts({
    schemaVersion: 1,
    id: 'application.contracts',
    contracts: [{
      id: 'platform.clock',
      owner: 'platform',
      version: '1.0.0',
      stability: 'stable',
      visibility: 'cross-module',
      categories: ['compile-time', 'behavioral'],
      source: 'src/ports/clock.ts',
      export: 'Clock',
      documentation: 'docs/contracts/clock.md',
      runtimeValidation: 'not-applicable',
      runtimeSchema: null,
      errorCodes: [],
      cancellation: 'not-applicable',
      timeout: 'not-applicable',
      concurrency: 'reentrant',
      idempotency: 'idempotent',
      securityClassification: 'internal',
      tenantScope: 'global',
      referenceSuite: 'tests/contracts/clock.test.ts',
      deprecation: null,
    }],
  });\n`);
  await file(root, 'src/composition/application.contract-provider.ts', `export const providers = defineContractProviders({
    schemaVersion: 1,
    id: 'application.contract-providers',
    providers: [{
      id: 'platform.clock.system',
      contract: 'platform.clock',
      contractMajor: 1,
      version: '1.0.0',
      kind: 'production',
      source: 'src/providers/system-clock.ts',
      export: 'SystemClock',
      runtime: 'universal',
      capabilities: ['wall-clock'],
      referenceSuite: 'tests/contracts/clock.test.ts',
      compositionServiceId: 'platform.clock.system',
    }],
  });\n`);
  return root;
}

describe('Forge contract governance', () => {
  it('deterministic contract and provider inventoryt builds', async () => {
    const root = await fixture();
    const first = await buildContractInventory(root);
    const second = await buildContractInventory(root);
    expect(first.issues).toEqual([]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.contracts[0]?.id).toBe('platform.clock');
    expect(first.providers[0]?.contractId).toBe('platform.clock');
  });

  it('publishes the documented contract command surface', () => {
    expect(CONTRACT_COMMANDS).toEqual(expect.arrayContaining([
      'contract:list',
      'contract:inspect',
      'contract:check',
      'contract:compat',
      'contract:providers',
      'contract:test',
      'contract:graph',
      'contract:why',
      'contract:docs',
      'deprecation:check',
    ]));
  });

  it('requires a proven implementation for stable contracts', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'src/composition/application.contract-provider.ts'), "export const providers = defineContractProviders({ schemaVersion: 1, id: 'application.contract-providers', providers: [] });\n", 'utf8');
    const codes = (await buildContractInventory(root)).issues.map(({ code }) => code);
    expect(codes).toContain('CONTRACT_PROVEN_IMPLEMENTATION_MISSING');
  });

  it('detects exported any, empty marker interfaces and container exposure', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'src/ports/clock.ts'), 'export interface Marker {}\nexport interface Clock { getContainer(): any; now(): Date; }\n', 'utf8');
    const codes = (await buildContractInventory(root)).issues.map(({ code }) => code);
    expect(codes).toContain('CONTRACT_ANY_EXPORTED');
    expect(codes).toContain('CONTRACT_MARKER_INTERFACE_EMPTY');
    expect(codes).toContain('CONTRACT_CONTAINER_EXPOSED');
  });

  it('generates deterministic artifacts and detects drift', async () => {
    const root = await fixture();
    const files = await generateContracts(root);
    expect(files).toContain('src/generated/contracts/contract-manifest.json');
    expect(await checkContractGeneration(root)).toEqual([]);
    const registry = path.join(root, 'src/generated/contracts/registry.ts');
    await writeFile(registry, `${await readFile(registry, 'utf8')}drift\n`, 'utf8');
    expect(await checkContractGeneration(root)).toContainEqual(expect.objectContaining({ code: 'CONTRACT_GENERATED_DRIFT' }));
  });

  it('treats a missing baseline manifest as first-adoption bootstrap', async () => {
    const root = await fixture();
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'contracts@example.test'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Contract Tests'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: root, stdio: 'ignore' });

    const result = await checkContractCompatibility(root, await buildContractInventory(root), 'HEAD');

    expect(result.compatible).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.changes).toContainEqual(expect.objectContaining({
      code: 'CONTRACT_ADDED',
      contractId: 'platform.clock',
    }));
  });

  it('classifies undeclared behavioral changes as breaking', async () => {
    const root = await fixture();
    const baselineInventory = await buildContractInventory(root);
    const baseline: ContractManifest = {
      schemaVersion: 1,
      fingerprint: baselineInventory.fingerprint,
      contracts: baselineInventory.contracts,
      providers: baselineInventory.providers,
    };
    const definition = path.join(root, 'src/composition/application.contract.definition.ts');
    await writeFile(definition, (await readFile(definition, 'utf8')).replace("timeout: 'not-applicable'", "timeout: 'bounded'"), 'utf8');
    const result = compareContractManifests(await buildContractInventory(root), baseline, 'baseline');
    expect(result.compatible).toBe(false);
    expect(result.changes).toContainEqual(expect.objectContaining({ code: 'CONTRACT_BREAKING_CHANGE_UNDECLARED' }));
  });
});
