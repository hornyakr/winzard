export type KernelConfigurationIssueSeverity = 'error' | 'warning';
export type KernelConfigurationIssueArea =
  | 'path'
  | 'build'
  | 'runtime'
  | 'locale'
  | 'proxy'
  | 'host'
  | 'cache'
  | 'composition'
  | 'security'
  | 'reproducibility';

export type KernelConfigurationIssue = Readonly<{
  severity: KernelConfigurationIssueSeverity;
  area: KernelConfigurationIssueArea;
  code: string;
  file: string;
  message: string;
  key?: string;
  remediation?: string;
}>;

export type KernelConfigurationRecord = Readonly<{
  id: string;
  owner: string;
  lifecycle: 'source' | 'build-time' | 'process-start' | 'request-time';
  source: string;
  status: 'valid' | 'missing' | 'invalid' | 'default';
  value: string;
  sensitive: boolean;
  rebuildRequired: boolean;
  restartRequired: boolean;
}>;

export type KernelConfigurationInventory = Readonly<{
  schemaVersion: 1;
  profile: string;
  projectRoot: string;
  repositoryRelativeRoot: string;
  records: readonly KernelConfigurationRecord[];
  issues: readonly KernelConfigurationIssue[];
  fingerprint: string;
}>;

export type KernelConfigurationDiffRecord = Readonly<{
  id: string;
  owner: string;
  fromStatus: KernelConfigurationRecord['status'];
  toStatus: KernelConfigurationRecord['status'];
  fromValue: string;
  toValue: string;
  changed: boolean;
}>;

export type KernelConfigurationDiff = Readonly<{
  from: string;
  to: string;
  records: readonly KernelConfigurationDiffRecord[];
  issues: readonly KernelConfigurationIssue[];
}>;

export type ArtifactFileRecord = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
}>;

export type ArtifactManifest = Readonly<{
  schemaVersion: 1;
  artifact: string;
  files: readonly ArtifactFileRecord[];
  sha256: string;
}>;

export type ArtifactComparison = Readonly<{
  equal: boolean;
  added: readonly string[];
  removed: readonly string[];
  changed: readonly string[];
}>;
