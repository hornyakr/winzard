import type { WinzardCapability } from '../manifest';

export type ConfigurationPhase =
  | 'source'
  | 'build-time'
  | 'process-start'
  | 'request-time'
  | 'public-client';

export type ConfigurationClassification = 'public' | 'internal' | 'secret';

export type ConfigurationValidation =
  | Readonly<{ kind: 'string'; minimumLength?: number; maximumLength?: number }>
  | Readonly<{ kind: 'url'; protocols?: readonly string[]; originOnly?: boolean }>
  | Readonly<{ kind: 'enum'; values: readonly string[] }>
  | Readonly<{ kind: 'csv-enum'; values: readonly string[]; minimumItems?: number }>
  | Readonly<{ kind: 'integer'; minimum?: number; maximum?: number }>
  | Readonly<{ kind: 'boolean' }>
  | Readonly<{ kind: 'postgres-url' }>
  | Readonly<{ kind: 'json'; maximumBytes?: number }>
  | Readonly<{ kind: 'secret'; minimumLength: number }>;

export type ConfigurationDefinition = Readonly<{
  key: string;
  owner: string;
  capability: WinzardCapability | 'application-shell';
  description: string;
  required: boolean;
  phase: ConfigurationPhase;
  classification: ConfigurationClassification;
  rebuildRequired: boolean;
  restartRequired: boolean;
  validation: ConfigurationValidation;
  example: string;
  defaultValue?: string;
  introduced: string;
  deprecated?: string;
  removed?: string;
}>;

export type ConfigurationSource = Readonly<{
  kind: 'process.env' | 'dotenv' | 'default' | 'missing';
  label: string;
  file?: string;
  precedence: number;
}>;

export type EnvironmentSnapshotIssue = Readonly<{
  code: string;
  file: string;
  key?: string;
  message: string;
}>;

export type EnvironmentSnapshot = Readonly<{
  nodeEnv: string;
  values: Readonly<Record<string, string | undefined>>;
  sources: ReadonlyMap<string, ConfigurationSource>;
  loadedFiles: readonly string[];
  issues: readonly EnvironmentSnapshotIssue[];
}>;

export type ConfigurationStatus = 'valid' | 'missing' | 'empty' | 'invalid' | 'default';

export type ConfigurationIssueSeverity = 'error' | 'warning';

export type ConfigurationIssue = Readonly<{
  severity: ConfigurationIssueSeverity;
  code: string;
  file: string;
  key?: string;
  owner?: string;
  message: string;
  remediation?: string;
}>;

export type ConfigurationRecord = Readonly<{
  definition: ConfigurationDefinition;
  status: ConfigurationStatus;
  source: ConfigurationSource;
  present: boolean;
  empty: boolean;
  valid: boolean;
  fingerprint: string | null;
  comparisonFingerprint: string | null;
  length: number | null;
  consumers: readonly string[];
  issues: readonly ConfigurationIssue[];
}>;

export type ConfigurationInventory = Readonly<{
  root: string;
  nodeEnv: string;
  loadedFiles: readonly string[];
  records: readonly ConfigurationRecord[];
  undeclaredConsumers: Readonly<Record<string, readonly string[]>>;
  issues: readonly ConfigurationIssue[];
}>;

export type ConfigurationDiffRecord = Readonly<{
  key: string;
  owner: string;
  fromStatus: ConfigurationStatus;
  toStatus: ConfigurationStatus;
  fromFingerprint: string | null;
  toFingerprint: string | null;
  changed: boolean;
}>;

export type SecretIssue = ConfigurationIssue;
