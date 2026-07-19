import type { WinzardManifest } from '../manifest';
import { loadExplicitEnvironmentFile } from './environment';
import { buildConfigurationInventory } from './inventory';
import type { ConfigurationDiffRecord, ConfigurationIssue } from './types';

export type ConfigurationDiff = Readonly<{
  from: string;
  to: string;
  records: readonly ConfigurationDiffRecord[];
  issues: readonly ConfigurationIssue[];
}>;

export async function diffConfiguration(
  root: string,
  manifest: WinzardManifest,
  from: string,
  to: string,
): Promise<ConfigurationDiff> {
  const [fromSnapshot, toSnapshot] = await Promise.all([
    loadExplicitEnvironmentFile(root, from),
    loadExplicitEnvironmentFile(root, to),
  ]);
  const [fromInventory, toInventory] = await Promise.all([
    buildConfigurationInventory(root, manifest, { snapshot: fromSnapshot }),
    buildConfigurationInventory(root, manifest, { snapshot: toSnapshot }),
  ]);
  const toByKey = new Map(toInventory.records.map((record) => [record.definition.key, record]));
  const records = fromInventory.records.map((fromRecord): ConfigurationDiffRecord => {
    const toRecord = toByKey.get(fromRecord.definition.key);
    return {
      key: fromRecord.definition.key,
      owner: fromRecord.definition.owner,
      fromStatus: fromRecord.status,
      toStatus: toRecord?.status ?? 'missing',
      fromFingerprint: fromRecord.fingerprint,
      toFingerprint: toRecord?.fingerprint ?? null,
      changed: fromRecord.status !== toRecord?.status || fromRecord.fingerprint !== toRecord?.fingerprint,
    };
  });
  return {
    from,
    to,
    records,
    issues: [...fromInventory.issues, ...toInventory.issues],
  };
}
