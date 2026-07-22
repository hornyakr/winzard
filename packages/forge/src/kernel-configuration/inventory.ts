import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

import {
  loadEnvironmentSnapshot,
  loadExplicitEnvironmentFile,
  type LoadEnvironmentOptions,
} from '../configuration/environment';
import type { EnvironmentSnapshot } from '../configuration/types';
import type { WinzardManifest } from '../manifest';
import { loadProjectManifest } from '../manifest';
import { scanKernelConfigurationSources } from './checks';
import { pathContained, resolveForgeProjectPaths } from './project-paths';
import type {
  KernelConfigurationDiff,
  KernelConfigurationDiffRecord,
  KernelConfigurationInventory,
  KernelConfigurationIssue,
  KernelConfigurationRecord,
} from './types';

const stages = new Set(['local', 'development', 'preview', 'staging', 'production']);
const releaseStages = new Set(['preview', 'staging', 'production']);
const locales = new Set(['hu', 'en']);
const portableId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const gitCommit = /^[0-9a-f]{7,64}$/u;
const bodySize = /^(?:[1-9]\d*)(?:kb|mb|gb)$/iu;

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function issue(
  area: KernelConfigurationIssue['area'],
  code: string,
  file: string,
  message: string,
  key?: string,
): KernelConfigurationIssue {
  return { severity: 'error', area, code, file, message, ...(key ? { key } : {}) };
}

function record(input: Omit<KernelConfigurationRecord, 'value'> & { value?: string }): KernelConfigurationRecord {
  return Object.freeze({ ...input, value: input.sensitive ? '[redacted]' : input.value ?? '-' });
}

function value(snapshot: EnvironmentSnapshot, key: string, fallback?: string): string | undefined {
  return snapshot.values[key] ?? fallback;
}

function safeRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/') || '.';
}

async function packageName(root: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { name?: unknown };
    return typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : path.basename(root);
  } catch {
    return path.basename(root);
  }
}

function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
  issues: KernelConfigurationIssue[],
  key: string,
): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  issues.push(issue(
    'runtime',
    'KERNEL_DEBUG_EXPOSES_INTERNALS',
    key,
    `${key} kizárólag true vagy false lehet.`,
    key,
  ));
  return fallback;
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  issues: KernelConfigurationIssue[],
  key: string,
  area: KernelConfigurationIssue['area'] = 'runtime',
): number {
  const input = raw ?? String(fallback);
  if (!/^\d+$/u.test(input)) {
    issues.push(issue(area, 'KERNEL_RUNTIME_MODE_AMBIGUOUS', key, `${key} egész szám legyen.`, key));
    return fallback;
  }
  const parsed = Number(input);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(issue(
      area,
      area === 'cache' ? 'KERNEL_CACHE_NAMESPACE_MISSING' : 'KERNEL_RUNTIME_MODE_AMBIGUOUS',
      key,
      `${key} ${minimum} és ${maximum} közötti safe integer legyen.`,
      key,
    ));
    return fallback;
  }
  return parsed;
}

function normalizedAuthority(value: string): string | null {
  const input = value.trim();
  if (!input || /[\u0000-\u0020\u007f,/@\\]/u.test(input)) return null;
  try {
    const url = new URL(`http://${input.startsWith('*.') ? input.slice(2) : input}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const hostname = url.hostname.endsWith('.') ? url.hostname.slice(0, -1) : url.hostname;
    if (!hostname) return null;
    return `${hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return null;
  }
}

function hostPatternValid(value: string): boolean {
  const input = value.trim();
  if (!input) return false;
  const wildcard = input.startsWith('*.');
  const authority = normalizedAuthority(input);
  if (!authority) return false;
  if (!wildcard) return true;
  const hostname = authority.split(':', 1)[0] ?? '';
  return hostname.split('.').length >= 2;
}

function canonicalOrigin(valueInput: string | undefined, stage: string): Readonly<{
  valid: boolean;
  authority: string | null;
}> {
  if (!valueInput) return { valid: false, authority: null };
  try {
    const url = new URL(valueInput);
    const valid = ['http:', 'https:'].includes(url.protocol) &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash &&
      !(stage === 'production' && url.protocol !== 'https:');
    return { valid, authority: valid ? normalizedAuthority(url.host) : null };
  } catch {
    return { valid: false, authority: null };
  }
}


function validServerActionEncryptionKey(value: string | undefined): boolean {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/u.test(value)) return false;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.byteLength === 32 && bytes.toString('base64') === value;
  } catch {
    return false;
  }
}

function validCidr(value: string): boolean {
  const [address = '', prefixRaw = ''] = value.split('/');
  const family = isIP(address);
  if (!family || !/^\d+$/u.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= (family === 4 ? 32 : 128);
}

export type KernelInventoryOptions = LoadEnvironmentOptions & Readonly<{
  snapshot?: EnvironmentSnapshot;
  runtimeMode?: 'web' | 'cli' | 'worker';
}>;

export async function buildKernelConfigurationInventory(
  root: string,
  options: KernelInventoryOptions = {},
): Promise<KernelConfigurationInventory> {
  const projectPaths = await resolveForgeProjectPaths(root);
  const manifestResult = await loadProjectManifest(projectPaths.applicationRoot);
  const manifest: WinzardManifest | null = manifestResult.manifest;
  const snapshot = options.snapshot ?? await loadEnvironmentSnapshot(projectPaths.applicationRoot, options);
  const issues: KernelConfigurationIssue[] = [
    ...projectPaths.issues,
    ...manifestResult.failures.map(({ code, file, message }) => issue('runtime', code, file, message)),
    ...snapshot.issues.map(({ code, file, key, message }) => issue('runtime', code, file, message, key)),
  ];
  const records: KernelConfigurationRecord[] = [];
  const profile = manifest?.profile ?? 'unknown';
  const packageIdentity = await packageName(projectPaths.applicationRoot);
  const appId = value(snapshot, 'APP_ID')?.trim() || packageIdentity;
  const appIdValid = portableId.test(appId);
  if (!appIdValid) {
    issues.push(issue('runtime', 'KERNEL_APPLICATION_ID_INVALID', 'APP_ID', 'APP_ID hordozható 1–128 karakteres azonosító legyen.', 'APP_ID'));
  }
  records.push(record({
    id: 'application-id', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: snapshot.sources.get('APP_ID')?.label ?? 'package.json#name',
    status: appIdValid ? (snapshot.values.APP_ID ? 'valid' : 'default') : 'invalid',
    value: appId, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  records.push(record({
    id: 'project-root', owner: 'kernel-configuration', lifecycle: 'source',
    source: 'repository', status: projectPaths.issues.length ? 'invalid' : 'valid',
    value: projectPaths.repositoryRelativeRoot, sensitive: false,
    rebuildRequired: false, restartRequired: false,
  }));

  const buildDirectoryInput = value(snapshot, 'NEXT_DIST_DIR', '.next') ?? '.next';
  const buildDirectory = path.resolve(projectPaths.applicationRoot, buildDirectoryInput);
  const buildContained = pathContained(projectPaths.applicationRoot, buildDirectory);
  if (!buildContained) {
    issues.push(issue(
      'path',
      'KERNEL_BUILD_DIR_OUTSIDE_PROJECT',
      'NEXT_DIST_DIR',
      'A buildkönyvtár az alkalmazásgyökéren kívülre mutat.',
      'NEXT_DIST_DIR',
    ));
  }
  records.push(record({
    id: 'build-dir', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('NEXT_DIST_DIR')?.label ?? 'default',
    status: buildContained ? 'valid' : 'invalid',
    value: safeRelative(projectPaths.applicationRoot, buildDirectory),
    sensitive: false, rebuildRequired: true, restartRequired: false,
  }));

  const stage = value(snapshot, 'APP_STAGE', 'local') ?? 'local';
  const nodeEnv = snapshot.nodeEnv;
  const stageValid = stages.has(stage);
  if (!stageValid) {
    issues.push(issue('runtime', 'KERNEL_STAGE_INVALID', 'APP_STAGE', `Nem támogatott APP_STAGE: ${stage}.`, 'APP_STAGE'));
  }
  if (releaseStages.has(stage) && nodeEnv !== 'production') {
    issues.push(issue(
      'runtime', 'KERNEL_ENVIRONMENT_STAGE_CONFLICT', 'process.env',
      `${stage} stage production NODE_ENV-et igényel.`, 'NODE_ENV',
    ));
  }
  records.push(record({
    id: 'environment', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: 'process.env / dotenv',
    status: stageValid && (!releaseStages.has(stage) || nodeEnv === 'production') ? 'valid' : 'invalid',
    value: `${nodeEnv}/${stage}`, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const region = value(snapshot, 'APP_REGION', 'local') ?? 'local';
  const regionValid = /^[a-z0-9][a-z0-9._-]{0,63}$/u.test(region);
  if (!regionValid) {
    issues.push(issue('runtime', 'KERNEL_STAGE_INVALID', 'APP_REGION', 'APP_REGION hordozható régióazonosító legyen.', 'APP_REGION'));
  }
  records.push(record({
    id: 'region', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: snapshot.sources.get('APP_REGION')?.label ?? 'default',
    status: regionValid ? (snapshot.values.APP_REGION ? 'valid' : 'default') : 'invalid',
    value: region, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const release = releaseStages.has(stage);
  const commit = value(snapshot, 'GIT_COMMIT')?.trim();
  const commitValid = commit !== undefined && gitCommit.test(commit);
  const buildId = (value(snapshot, 'BUILD_ID') ?? commit)?.trim();
  const buildIdValid = buildId !== undefined && portableId.test(buildId);
  const deploymentId = value(snapshot, 'DEPLOYMENT_ID')?.trim();
  const deploymentIdValid = deploymentId !== undefined && portableId.test(deploymentId);
  const sourceDateEpoch = value(snapshot, 'SOURCE_DATE_EPOCH')?.trim();
  const epochNumber = sourceDateEpoch === undefined ? undefined : Number(sourceDateEpoch);
  const sourceDateEpochValid = sourceDateEpoch !== undefined &&
    /^(0|[1-9]\d*)$/u.test(sourceDateEpoch) && Number.isSafeInteger(epochNumber);

  if (release && !commitValid) {
    issues.push(issue('build', 'KERNEL_BUILD_ID_MISSING', 'GIT_COMMIT', 'Release buildhez érvényes GIT_COMMIT szükséges.', 'GIT_COMMIT'));
  } else if (commit !== undefined && !commitValid) {
    issues.push(issue('build', 'KERNEL_BUILD_ID_MISSING', 'GIT_COMMIT', 'GIT_COMMIT 7–64 karakteres kisbetűs hexadecimális azonosító legyen.', 'GIT_COMMIT'));
  }
  if (buildId !== undefined && !buildIdValid) {
    issues.push(issue('build', 'KERNEL_BUILD_ID_MISSING', 'BUILD_ID', 'BUILD_ID nem hordozható azonosító.', 'BUILD_ID'));
  }
  if (release && !deploymentIdValid) {
    issues.push(issue('build', 'KERNEL_DEPLOYMENT_ID_MISSING', 'DEPLOYMENT_ID', 'Release stage-ben hordozható DEPLOYMENT_ID szükséges.', 'DEPLOYMENT_ID'));
  } else if (deploymentId !== undefined && !deploymentIdValid) {
    issues.push(issue('build', 'KERNEL_DEPLOYMENT_ID_MISSING', 'DEPLOYMENT_ID', 'DEPLOYMENT_ID nem hordozható azonosító.', 'DEPLOYMENT_ID'));
  }
  if (sourceDateEpoch !== undefined && !sourceDateEpochValid) {
    issues.push(issue('build', 'KERNEL_SOURCE_DATE_EPOCH_INVALID', 'SOURCE_DATE_EPOCH', 'SOURCE_DATE_EPOCH nem negatív safe integer Unix timestamp legyen.', 'SOURCE_DATE_EPOCH'));
  } else if (release && sourceDateEpoch === undefined) {
    issues.push(issue('build', 'KERNEL_SOURCE_DATE_EPOCH_INVALID', 'SOURCE_DATE_EPOCH', 'Release buildhez SOURCE_DATE_EPOCH szükséges.', 'SOURCE_DATE_EPOCH'));
  }

  records.push(record({
    id: 'build-id', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('BUILD_ID')?.label ?? snapshot.sources.get('GIT_COMMIT')?.label ?? 'default',
    status: buildIdValid ? 'valid' : release ? 'missing' : buildId === undefined ? 'default' : 'invalid',
    value: buildId ?? 'local', sensitive: false, rebuildRequired: true, restartRequired: false,
  }));
  records.push(record({
    id: 'deployment-id', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('DEPLOYMENT_ID')?.label ?? 'default',
    status: deploymentIdValid ? 'valid' : release ? 'missing' : deploymentId === undefined ? 'default' : 'invalid',
    value: deploymentId ?? 'local', sensitive: false, rebuildRequired: true, restartRequired: false,
  }));
  records.push(record({
    id: 'source-date-epoch', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('SOURCE_DATE_EPOCH')?.label ?? 'default',
    status: sourceDateEpoch === undefined ? (release ? 'missing' : 'default') : sourceDateEpochValid ? 'valid' : 'invalid',
    value: sourceDateEpoch ?? '-', sensitive: false, rebuildRequired: true, restartRequired: false,
  }));

  const serverActionEncryptionKey = value(snapshot, 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY')?.trim();
  const serverActionEncryptionKeyValid = validServerActionEncryptionKey(serverActionEncryptionKey);
  if (release && !serverActionEncryptionKeyValid) {
    issues.push(issue(
      'build',
      serverActionEncryptionKey ? 'KERNEL_SECRET_ROTATION_INVALID' : 'KERNEL_SECRET_PLACEHOLDER',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
      'Release buildhez pontosan 32 byte-os, canonical base64 Server Action titkosítási kulcs szükséges.',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    ));
  } else if (serverActionEncryptionKey && !serverActionEncryptionKeyValid) {
    issues.push(issue(
      'build',
      'KERNEL_SECRET_ROTATION_INVALID',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY pontosan 32 byte-os canonical base64 kulcs legyen.',
      'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    ));
  }
  records.push(record({
    id: 'server-action-encryption-key', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY')?.label ?? 'missing',
    status: serverActionEncryptionKeyValid
      ? 'valid'
      : serverActionEncryptionKey
        ? 'invalid'
        : release
          ? 'missing'
          : 'default',
    value: serverActionEncryptionKey ? 'present' : 'absent', sensitive: true,
    rebuildRequired: true, restartRequired: false,
  }));

  const standalone = parseBoolean(value(snapshot, 'NEXT_OUTPUT_STANDALONE'), false, issues, 'NEXT_OUTPUT_STANDALONE');
  records.push(record({
    id: 'artifact-output', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: snapshot.sources.get('NEXT_OUTPUT_STANDALONE')?.label ?? 'default',
    status: 'valid', value: standalone ? 'standalone' : 'default', sensitive: false,
    rebuildRequired: true, restartRequired: false,
  }));

  const verbose = parseBoolean(value(snapshot, 'KERNEL_VERBOSE_DIAGNOSTICS'), nodeEnv !== 'production', issues, 'KERNEL_VERBOSE_DIAGNOSTICS');
  const browserSourceMaps = parseBoolean(value(snapshot, 'PRODUCTION_BROWSER_SOURCE_MAPS'), false, issues, 'PRODUCTION_BROWSER_SOURCE_MAPS');
  const sourceMapWaiver = value(snapshot, 'PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER')?.trim();
  if (stage === 'production' && browserSourceMaps && !sourceMapWaiver) {
    issues.push(issue(
      'runtime', 'KERNEL_DEBUG_EXPOSES_INTERNALS', 'PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER',
      'Production browser source map csak explicit waiverrel engedélyezhető.',
      'PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER',
    ));
  }
  records.push(record({
    id: 'debug-policy', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: 'KERNEL_VERBOSE_DIAGNOSTICS / PRODUCTION_BROWSER_SOURCE_MAPS',
    status: stage === 'production' && browserSourceMaps && !sourceMapWaiver ? 'invalid' : 'valid',
    value: `verbose=${verbose};browser-source-maps=${browserSourceMaps};waiver=${sourceMapWaiver ? 'present' : 'absent'}`,
    sensitive: false, rebuildRequired: browserSourceMaps, restartRequired: verbose,
  }));

  const origin = canonicalOrigin(value(snapshot, 'APP_URL'), stage);
  if (!origin.valid) {
    issues.push(issue('host', 'KERNEL_TRUSTED_HOST_MISSING', 'APP_URL', 'APP_URL credentialmentes HTTP(S) canonical origin legyen; productionben HTTPS szükséges.', 'APP_URL'));
  }
  const trustedHosts = (value(snapshot, 'TRUSTED_HOSTS', origin.authority ?? '') ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  if (trustedHosts.length === 0) {
    issues.push(issue('host', 'KERNEL_TRUSTED_HOST_MISSING', 'TRUSTED_HOSTS', 'Legalább egy trusted host szükséges.', 'TRUSTED_HOSTS'));
  }
  if (trustedHosts.some((host) => !hostPatternValid(host))) {
    issues.push(issue('host', 'KERNEL_HOST_HEADER_INJECTION', 'TRUSTED_HOSTS', 'A trusted host lista hibás vagy túl széles mintát tartalmaz.', 'TRUSTED_HOSTS'));
  }
  if (origin.authority && !trustedHosts.some((host) => normalizedAuthority(host) === origin.authority)) {
    issues.push(issue('host', 'KERNEL_TRUSTED_HOST_MISSING', 'TRUSTED_HOSTS', 'A canonical APP_URL hostja szerepeljen a trusted host listában.', 'TRUSTED_HOSTS'));
  }
  records.push(record({
    id: 'trusted-hosts', owner: 'kernel-configuration', lifecycle: 'request-time',
    source: snapshot.sources.get('TRUSTED_HOSTS')?.label ?? 'canonical APP_URL',
    status: issues.some(({ area }) => area === 'host') ? 'invalid' : 'valid',
    value: `${trustedHosts.length} host pattern`, sensitive: false,
    rebuildRequired: false, restartRequired: true,
  }));

  const serverActionOrigins = (value(snapshot, 'SERVER_ACTION_ALLOWED_ORIGINS', origin.authority ?? '') ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  const actionBodyLimit = value(snapshot, 'SERVER_ACTION_BODY_SIZE_LIMIT', '1mb') ?? '1mb';
  const serverActionsValid = serverActionOrigins.length > 0 &&
    serverActionOrigins.every(hostPatternValid) && bodySize.test(actionBodyLimit);
  if (!serverActionsValid) {
    issues.push(issue(
      'host', 'KERNEL_HOST_HEADER_INJECTION', 'SERVER_ACTION_ALLOWED_ORIGINS',
      'A Server Action originlista és body limit legyen szűk, érvényes buildcontract.',
      'SERVER_ACTION_ALLOWED_ORIGINS',
    ));
  }
  records.push(record({
    id: 'server-actions', owner: 'kernel-configuration', lifecycle: 'build-time',
    source: 'SERVER_ACTION_ALLOWED_ORIGINS / SERVER_ACTION_BODY_SIZE_LIMIT',
    status: serverActionsValid ? 'valid' : 'invalid',
    value: `${serverActionOrigins.length} origin; body=${actionBodyLimit}`, sensitive: false,
    rebuildRequired: true, restartRequired: false,
  }));

  const enabledLocales = [...new Set((value(snapshot, 'ENABLED_LOCALES', 'hu,en') ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean))];
  const defaultLocale = value(snapshot, 'DEFAULT_LOCALE', 'hu') ?? 'hu';
  if (enabledLocales.some((locale) => !locales.has(locale))) {
    issues.push(issue('locale', 'KERNEL_LOCALE_UNSUPPORTED', 'ENABLED_LOCALES', 'Az enabled locale-lista nem támogatott értéket tartalmaz.', 'ENABLED_LOCALES'));
  }
  if (!enabledLocales.includes(defaultLocale)) {
    issues.push(issue('locale', 'KERNEL_LOCALE_DEFAULT_NOT_ENABLED', 'DEFAULT_LOCALE', 'A default locale nincs az enabled listában.', 'DEFAULT_LOCALE'));
  }
  records.push(record({
    id: 'locales', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: 'DEFAULT_LOCALE / ENABLED_LOCALES',
    status: enabledLocales.includes(defaultLocale) && enabledLocales.every((locale) => locales.has(locale)) ? 'valid' : 'invalid',
    value: `${defaultLocale} [${enabledLocales.join(',')}]`, sensitive: false,
    rebuildRequired: false, restartRequired: true,
  }));

  const proxyMode = value(snapshot, 'TRUSTED_PROXY_MODE', 'none') ?? 'none';
  const proxyCidrs = (value(snapshot, 'TRUSTED_PROXY_CIDRS', '') ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  const proxyHops = parseBoundedInteger(value(snapshot, 'TRUSTED_PROXY_HOPS'), 1, 1, 8, issues, 'TRUSTED_PROXY_HOPS');
  if (!['none', 'cidr', 'fixed-hops'].includes(proxyMode)) {
    issues.push(issue('proxy', 'KERNEL_TRUSTED_HEADER_UNSAFE', 'TRUSTED_PROXY_MODE', 'Ismeretlen trusted proxy mód.', 'TRUSTED_PROXY_MODE'));
  }
  if (proxyMode === 'cidr' && (proxyCidrs.length === 0 || proxyCidrs.some((cidr) => !validCidr(cidr)))) {
    issues.push(issue('proxy', 'KERNEL_TRUSTED_HEADER_UNSAFE', 'TRUSTED_PROXY_CIDRS', 'CIDR módhoz érvényes, explicit proxylista szükséges.', 'TRUSTED_PROXY_CIDRS'));
  }
  if (proxyCidrs.includes('0.0.0.0/0') || proxyCidrs.includes('::/0')) {
    issues.push(issue('proxy', 'KERNEL_TRUSTED_PROXY_TOO_BROAD', 'TRUSTED_PROXY_CIDRS', 'A teljes internetet lefedő proxy trust tiltott.', 'TRUSTED_PROXY_CIDRS'));
  }
  records.push(record({
    id: 'proxy-trust', owner: 'kernel-configuration', lifecycle: 'request-time',
    source: 'TRUSTED_PROXY_*', status: issues.some(({ area }) => area === 'proxy') ? 'invalid' : 'valid',
    value: proxyMode === 'fixed-hops' ? `${proxyMode} (${proxyHops} hop)` : `${proxyMode} (${proxyCidrs.length} CIDR)`,
    sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const schemaVersion = parseBoundedInteger(
    value(snapshot, 'CACHE_SCHEMA_VERSION'),
    1,
    1,
    Number.MAX_SAFE_INTEGER,
    issues,
    'CACHE_SCHEMA_VERSION',
    'cache',
  );
  const namespaceDeployment = deploymentIdValid ? deploymentId! : buildIdValid ? buildId! : 'local';
  const cacheNamespace = `${appId.toLowerCase().replace(/[^a-z0-9._:-]+/gu, '-')}:${stage}:v${schemaVersion}:${namespaceDeployment}`;
  records.push(record({
    id: 'cache-namespace', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: 'APP_ID / APP_STAGE / CACHE_SCHEMA_VERSION / DEPLOYMENT_ID',
    status: appIdValid && schemaVersion > 0 ? 'valid' : 'invalid',
    value: cacheNamespace, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const compositionHash = value(snapshot, 'COMPOSITION_HASH', 'auto') ?? 'auto';
  if (compositionHash !== 'auto' && !/^[a-f0-9]{64}$/u.test(compositionHash)) {
    issues.push(issue('composition', 'KERNEL_COMPOSITION_HASH_DRIFT', 'COMPOSITION_HASH', 'COMPOSITION_HASH auto vagy 64 karakteres SHA-256 legyen.', 'COMPOSITION_HASH'));
  }
  records.push(record({
    id: 'composition-fingerprint', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: snapshot.sources.get('COMPOSITION_HASH')?.label ?? 'default',
    status: compositionHash === 'auto' || /^[a-f0-9]{64}$/u.test(compositionHash) ? 'valid' : 'invalid',
    value: compositionHash, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const runtimeMode = options.runtimeMode ?? 'web';
  records.push(record({
    id: 'runtime-mode', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: 'explicit entrypoint', status: ['web', 'cli', 'worker'].includes(runtimeMode) ? 'valid' : 'invalid',
    value: runtimeMode, sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const workerConcurrency = parseBoundedInteger(value(snapshot, 'WORKER_CONCURRENCY'), 4, 1, 128, issues, 'WORKER_CONCURRENCY');
  const workerVisibility = parseBoundedInteger(value(snapshot, 'WORKER_VISIBILITY_TIMEOUT_MS'), 60_000, 1_000, 86_400_000, issues, 'WORKER_VISIBILITY_TIMEOUT_MS');
  const workerShutdown = parseBoundedInteger(value(snapshot, 'WORKER_SHUTDOWN_GRACE_MS'), 30_000, 1_000, 300_000, issues, 'WORKER_SHUTDOWN_GRACE_MS');
  const workerPoll = parseBoundedInteger(value(snapshot, 'WORKER_POLL_INTERVAL_MS'), 1_000, 10, 60_000, issues, 'WORKER_POLL_INTERVAL_MS');
  records.push(record({
    id: 'worker-runtime', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: 'WORKER_*', status: 'valid',
    value: `concurrency=${workerConcurrency};visibility=${workerVisibility};shutdown=${workerShutdown};poll=${workerPoll}`,
    sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  const writableRoot = value(snapshot, 'RUNTIME_WRITABLE_ROOT', '/tmp/winzard') ?? '/tmp/winzard';
  const writableResolved = path.resolve(projectPaths.applicationRoot, writableRoot);
  const writableInsideApplication = pathContained(projectPaths.applicationRoot, writableResolved);
  if (writableInsideApplication) {
    issues.push(issue('path', 'KERNEL_READ_ONLY_FILESYSTEM_VIOLATION', 'RUNTIME_WRITABLE_ROOT', 'A runtime írható root az application artifact alatt van.', 'RUNTIME_WRITABLE_ROOT'));
  }
  records.push(record({
    id: 'runtime-writable-root', owner: 'kernel-configuration', lifecycle: 'process-start',
    source: snapshot.sources.get('RUNTIME_WRITABLE_ROOT')?.label ?? 'default',
    status: writableInsideApplication ? 'invalid' : 'valid',
    value: pathContained(projectPaths.repositoryRoot, writableResolved)
      ? safeRelative(projectPaths.repositoryRoot, writableResolved)
      : '[external writable root]',
    sensitive: false, rebuildRequired: false, restartRequired: true,
  }));

  issues.push(...await scanKernelConfigurationSources(projectPaths.applicationRoot));
  const sortedRecords = Object.freeze(records.sort((left, right) => left.id.localeCompare(right.id)));
  const sortedIssues = Object.freeze(issues.sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code)));
  const canonical = sortedRecords.map(({ id, owner, lifecycle, source, status, value: output, rebuildRequired, restartRequired }) =>
    ({ id, owner, lifecycle, source, status, value: output, rebuildRequired, restartRequired }));
  return {
    schemaVersion: 1,
    profile,
    projectRoot: '.',
    repositoryRelativeRoot: projectPaths.repositoryRelativeRoot,
    records: sortedRecords,
    issues: sortedIssues,
    fingerprint: fingerprint(canonical),
  };
}

export function inspectKernelConfiguration(
  inventory: KernelConfigurationInventory,
  query: string,
): readonly KernelConfigurationRecord[] {
  const normalized = query.trim().toLowerCase();
  return inventory.records.filter((item) =>
    item.id.toLowerCase() === normalized ||
    item.owner.toLowerCase() === normalized ||
    item.source.toLowerCase().includes(normalized));
}

export async function diffKernelConfiguration(
  root: string,
  from: string,
  to: string,
): Promise<KernelConfigurationDiff> {
  const [fromSnapshot, toSnapshot] = await Promise.all([
    loadExplicitEnvironmentFile(root, from),
    loadExplicitEnvironmentFile(root, to),
  ]);
  const [fromInventory, toInventory] = await Promise.all([
    buildKernelConfigurationInventory(root, { snapshot: fromSnapshot }),
    buildKernelConfigurationInventory(root, { snapshot: toSnapshot }),
  ]);
  const toById = new Map(toInventory.records.map((item) => [item.id, item]));
  const records = fromInventory.records.map((fromRecord): KernelConfigurationDiffRecord => {
    const toRecord = toById.get(fromRecord.id);
    return {
      id: fromRecord.id,
      owner: fromRecord.owner,
      fromStatus: fromRecord.status,
      toStatus: toRecord?.status ?? 'missing',
      fromValue: fromRecord.sensitive ? '[redacted]' : fromRecord.value,
      toValue: toRecord?.sensitive ? '[redacted]' : toRecord?.value ?? '-',
      changed: fromRecord.status !== toRecord?.status || fromRecord.value !== toRecord?.value,
    };
  });
  return {
    from,
    to,
    records,
    issues: [...fromInventory.issues, ...toInventory.issues],
  };
}
