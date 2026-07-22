import 'server-only';

import { generatedContractManifest } from '@/generated/contracts/registry';

type GeneratedContract = Readonly<{
  id: string;
  major: number;
  stability: 'experimental' | 'stable' | 'deprecated';
}>;

type GeneratedProvider = Readonly<{
  id: string;
  contractId: string;
  contractMajor: number;
  kind: 'production' | 'fake' | 'decorator';
  capabilities: readonly string[];
}>;

type GeneratedContractManifest = Readonly<{
  schemaVersion: 1;
  fingerprint: string;
  contracts: readonly GeneratedContract[];
  providers: readonly GeneratedProvider[];
}>;

export function validateContractRegistry(): void {
  const manifest = generatedContractManifest as GeneratedContractManifest;
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(manifest.fingerprint)) {
    throw new Error('CONTRACT_MANIFEST_INVALID');
  }
  const contractIds = new Set<string>();
  for (const contract of manifest.contracts) {
    if (contractIds.has(contract.id)) throw new Error(`CONTRACT_DUPLICATE_ID: ${contract.id}`);
    contractIds.add(contract.id);
  }
  const providerIds = new Set<string>();
  for (const provider of manifest.providers) {
    if (providerIds.has(provider.id)) throw new Error(`CONTRACT_PROVIDER_DUPLICATE_ID: ${provider.id}`);
    providerIds.add(provider.id);
    const contract = manifest.contracts.find(({ id }) => id === provider.contractId);
    if (!contract) throw new Error(`CONTRACT_PROVIDER_UNKNOWN: ${provider.contractId}`);
    if (contract.major !== provider.contractMajor) {
      throw new Error(`CONTRACT_PROVIDER_VERSION_INCOMPATIBLE: ${provider.id}`);
    }
    if (provider.capabilities.length === 0) {
      throw new Error(`CONTRACT_PROVIDER_CAPABILITY_UNTESTED: ${provider.id}`);
    }
  }
  for (const contract of manifest.contracts.filter(({ stability }) => stability === 'stable')) {
    if (!manifest.providers.some(({ contractId, contractMajor, kind }) => contractId === contract.id && contractMajor === contract.major && kind === 'production')) {
      throw new Error(`CONTRACT_PROVEN_IMPLEMENTATION_MISSING: ${contract.id}`);
    }
  }
}
