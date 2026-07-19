import { createHash } from 'node:crypto';

import type { WinzardManifest } from '../manifest';
import { configurationDefinitionsForManifest } from './catalog';
import { collectConfigurationConsumers } from './consumers';
import { loadEnvironmentSnapshot, type LoadEnvironmentOptions } from './environment';
import type {
  ConfigurationDefinition,
  ConfigurationInventory,
  ConfigurationIssue,
  ConfigurationRecord,
  ConfigurationSource,
  ConfigurationStatus,
  EnvironmentSnapshot,
} from './types';

const UNSAFE_SECRET_VALUES = new Set([
  'secret',
  'password',
  'changeme',
  'development-secret',
  'default-secret',
  'test-secret',
  '<secret>',
]);

function isUnsafeSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return UNSAFE_SECRET_VALUES.has(normalized) ||
    /^<.*>$/u.test(value.trim()) ||
    normalized.includes('development-secret') ||
    normalized.includes('default-secret') ||
    new Set(value).size < 8;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function issue(
  definition: ConfigurationDefinition,
  code: string,
  message: string,
  source: ConfigurationSource,
): ConfigurationIssue {
  return {
    severity: 'error',
    code,
    file: source.file ?? source.label,
    key: definition.key,
    owner: definition.owner,
    message,
  };
}

function validateValue(
  definition: ConfigurationDefinition,
  value: string,
  source: ConfigurationSource,
): readonly ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const validation = definition.validation;

  if (value.trim() === '') {
    issues.push(issue(definition, 'CONFIG_KEY_EMPTY', `${definition.key} nem lehet üres.`, source));
    return issues;
  }

  switch (validation.kind) {
    case 'string': {
      const trimmed = value.trim();
      if (validation.minimumLength !== undefined && trimmed.length < validation.minimumLength) {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} legalább ${validation.minimumLength} karakter legyen.`, source));
      }
      if (validation.maximumLength !== undefined && trimmed.length > validation.maximumLength) {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} legfeljebb ${validation.maximumLength} karakter lehet.`, source));
      }
      break;
    }
    case 'url': {
      try {
        const url = new URL(value);
        if (validation.protocols && !validation.protocols.includes(url.protocol)) {
          issues.push(issue(definition, 'CONFIG_URL_PROTOCOL_FORBIDDEN', `${definition.key} protokollja nem engedélyezett: ${url.protocol}.`, source));
        }
        if (
          validation.originOnly &&
          (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '')
        ) {
          issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} csak credentialmentes origint tartalmazhat.`, source));
        }
      } catch {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} érvényes URL legyen.`, source));
      }
      break;
    }
    case 'enum':
      if (!validation.values.includes(value)) {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} megengedett értékei: ${validation.values.join(', ')}.`, source));
      }
      break;
    case 'integer': {
      if (!/^-?\d+$/u.test(value.trim())) {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} egész szám legyen.`, source));
        break;
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) {
        issues.push(issue(definition, 'CONFIG_NUMBER_OUT_OF_RANGE', `${definition.key} safe integer tartományon kívül esik.`, source));
      } else if (validation.minimum !== undefined && parsed < validation.minimum) {
        issues.push(issue(definition, 'CONFIG_NUMBER_OUT_OF_RANGE', `${definition.key} legalább ${validation.minimum} legyen.`, source));
      } else if (validation.maximum !== undefined && parsed > validation.maximum) {
        issues.push(issue(definition, 'CONFIG_NUMBER_OUT_OF_RANGE', `${definition.key} legfeljebb ${validation.maximum} lehet.`, source));
      }
      break;
    }
    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        issues.push(issue(definition, 'CONFIG_BOOLEAN_INVALID', `${definition.key} kizárólag true vagy false lehet.`, source));
      }
      break;
    case 'postgres-url': {
      try {
        const url = new URL(value);
        if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
          issues.push(issue(definition, 'CONFIG_URL_PROTOCOL_FORBIDDEN', `${definition.key} PostgreSQL DSN legyen.`, source));
        }
        if (!url.hostname || !url.pathname || url.pathname === '/') {
          issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} hostot és adatbázisnevet igényel.`, source));
        }
      } catch {
        issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} érvényes PostgreSQL DSN legyen.`, source));
      }
      break;
    }
    case 'json':
      if (validation.maximumBytes !== undefined && Buffer.byteLength(value, 'utf8') > validation.maximumBytes) {
        issues.push(issue(definition, 'CONFIG_JSON_TOO_LARGE', `${definition.key} JSON értéke túl nagy.`, source));
      } else {
        try {
          JSON.parse(value);
        } catch {
          issues.push(issue(definition, 'CONFIG_KEY_INVALID', `${definition.key} érvényes JSON legyen.`, source));
        }
      }
      break;
    case 'secret': {
      if (value.length < validation.minimumLength) {
        issues.push(issue(definition, 'CONFIG_SECRET_TOO_SHORT', `${definition.key} legalább ${validation.minimumLength} karakter legyen.`, source));
      }
      if (isUnsafeSecret(value)) {
        issues.push(issue(definition, 'CONFIG_DEFAULT_UNSAFE', `${definition.key} placeholder, ismert gyenge default vagy alacsony változatosságú értéket tartalmaz.`, source));
      }
      break;
    }
  }

  return issues;
}

function recordForDefinition(
  definition: ConfigurationDefinition,
  snapshot: EnvironmentSnapshot,
  consumers: readonly string[],
): ConfigurationRecord {
  const supplied = snapshot.values[definition.key];
  const usesDefault = supplied === undefined && definition.defaultValue !== undefined;
  const value = usesDefault ? definition.defaultValue : supplied;
  const source: ConfigurationSource = usesDefault
    ? { kind: 'default', label: 'schema default', precedence: Number.MAX_SAFE_INTEGER }
    : snapshot.sources.get(definition.key) ?? {
      kind: 'missing',
      label: 'missing',
      precedence: Number.MAX_SAFE_INTEGER,
    };

  const issues: ConfigurationIssue[] = [];
  if (value === undefined) {
    if (definition.required) {
      issues.push(issue(definition, 'CONFIG_KEY_MISSING', `${definition.key} kötelező az aktív ${definition.owner} contracthoz.`, source));
    }
  } else {
    issues.push(...validateValue(definition, value, source));
    if (definition.key === 'APP_URL' && snapshot.values.APP_STAGE === 'production') {
      try {
        if (new URL(value).protocol !== 'https:') {
          issues.push(issue(
            definition,
            'CONFIG_URL_PROTOCOL_FORBIDDEN',
            'APP_URL production stage-ben kizárólag HTTPS origin lehet.',
            source,
          ));
        }
      } catch {
        // The base URL validation already reports malformed values.
      }
    }
  }

  let status: ConfigurationStatus;
  if (value === undefined) status = 'missing';
  else if (value.trim() === '') status = 'empty';
  else if (issues.length > 0) status = 'invalid';
  else if (usesDefault) status = 'default';
  else status = 'valid';

  return {
    definition,
    status,
    source,
    present: value !== undefined,
    empty: value !== undefined && value.trim() === '',
    valid: issues.length === 0 && (value !== undefined || !definition.required),
    fingerprint: value === undefined ? null : fingerprint(value),
    length: value?.length ?? null,
    consumers,
    issues,
  };
}

export type BuildConfigurationInventoryOptions = LoadEnvironmentOptions & Readonly<{
  snapshot?: EnvironmentSnapshot;
}>;

export async function buildConfigurationInventory(
  root: string,
  manifest: WinzardManifest,
  options: BuildConfigurationInventoryOptions = {},
): Promise<ConfigurationInventory> {
  const definitions = configurationDefinitionsForManifest(manifest);
  const snapshot = options.snapshot ?? await loadEnvironmentSnapshot(root, options);
  const consumerInventory = await collectConfigurationConsumers(root, definitions);
  const records = definitions.map((definition) => recordForDefinition(
    definition,
    snapshot,
    consumerInventory.consumers.get(definition.key) ?? [],
  ));
  const issues: ConfigurationIssue[] = [
    ...snapshot.issues.map((snapshotIssue): ConfigurationIssue => ({
      severity: 'error',
      ...snapshotIssue,
    })),
    ...records.flatMap(({ issues: recordIssues }) => recordIssues),
    ...Object.entries(consumerInventory.undeclared).map(([key, files]): ConfigurationIssue => ({
      severity: 'error',
      code: 'CONFIG_KEY_UNDECLARED',
      file: files[0] ?? 'src',
      key,
      message: `${key} közvetlenül használt, de nincs aktív capability-konfigurációs definíciója.`,
      remediation: 'Add a capability-owned definition or remove the direct process.env access.',
    })),
  ];

  return {
    root,
    nodeEnv: snapshot.nodeEnv,
    loadedFiles: snapshot.loadedFiles,
    records: Object.freeze(records),
    undeclaredConsumers: consumerInventory.undeclared,
    issues: Object.freeze(issues.sort((left, right) =>
      left.file.localeCompare(right.file) || left.code.localeCompare(right.code))),
  };
}

export function redactConfigurationRecord(record: ConfigurationRecord): Record<string, unknown> {
  return {
    key: record.definition.key,
    owner: record.definition.owner,
    required: record.definition.required,
    phase: record.definition.phase,
    classification: record.definition.classification,
    rebuildRequired: record.definition.rebuildRequired,
    restartRequired: record.definition.restartRequired,
    status: record.status,
    source: record.source.label,
    present: record.present,
    empty: record.empty,
    length: record.length,
    fingerprint: record.fingerprint,
    consumers: record.consumers,
    issues: record.issues,
  };
}
