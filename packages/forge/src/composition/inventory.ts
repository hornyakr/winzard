import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { configurationDefinitionsForManifest } from '../configuration/catalog';
import { loadProjectManifest } from '../manifest';

import {
  COMPOSITION_KINDS,
  COMPOSITION_LIFETIMES,
  COMPOSITION_RUNTIMES,
  COMPOSITION_VISIBILITIES,
  type CompositionDefinitionRecord,
  type CompositionInventory,
  type CompositionInventoryOptions,
  type CompositionIssue,
  type CompositionIssueArea,
  type CompositionKind,
  type CompositionLifetime,
  type CompositionRootRecord,
  type CompositionRuntime,
  type CompositionServiceRecord,
  type CompositionVisibility,
} from './types';
import {
  isCompositionJsonObject,
  parseCompositionDefinitions,
  type CompositionJsonLiteral,
  type CompositionJsonObject,
  type ParsedCompositionDefinition,
} from './ast';
import { compositionFingerprint } from './fingerprint';

const DEFINITION_FILE = /(?:^|\/)(?:composition(?:\.[\w-]+)?|[\w-]+\.composition)\.definition\.ts$/u;
const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'generated', 'node_modules']);
const SERVICE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const CONFIG_KEY = /^[A-Z][A-Z0-9_]*$/u;

function projectPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function collect(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const output: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(current));
    else if (entry.isFile()) output.push(current);
  }
  return Object.freeze(output.sort());
}

function issue(
  area: CompositionIssueArea,
  code: string,
  file: string,
  message: string,
  serviceId?: string,
  severity: CompositionIssue['severity'] = 'error',
): CompositionIssue {
  return Object.freeze({
    severity,
    area,
    code,
    file,
    message,
    ...(serviceId ? { serviceId } : {}),
  });
}

function stringValue(value: CompositionJsonObject, key: string, fallback = ''): string {
  return typeof value[key] === 'string' ? value[key] as string : fallback;
}

function nullableString(value: CompositionJsonObject, key: string): string | null {
  return typeof value[key] === 'string' && value[key] !== '' ? value[key] as string : null;
}

function booleanValue(value: CompositionJsonObject, key: string): boolean {
  return value[key] === true;
}

function integerValue(value: CompositionJsonObject, key: string, fallback = 0): number {
  return Number.isInteger(value[key]) ? Number(value[key]) : fallback;
}

function stringArray(value: CompositionJsonObject, key: string): readonly string[] {
  const item = value[key];
  if (!Array.isArray(item)) return Object.freeze([]);
  return Object.freeze(item.filter((entry): entry is string => typeof entry === 'string'));
}

function objectArray(value: CompositionJsonObject, key: string): readonly CompositionJsonObject[] {
  const item = value[key];
  if (!Array.isArray(item)) return Object.freeze([]);
  return Object.freeze(item.filter((entry): entry is CompositionJsonObject => isCompositionJsonObject(entry as CompositionJsonLiteral)));
}

function enumValue<T extends string>(
  value: CompositionJsonObject,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const item = value[key];
  return typeof item === 'string' && allowed.includes(item as T) ? item as T : fallback;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function decodeDefinition(
  file: string,
  parsed: ParsedCompositionDefinition,
): Readonly<{
  definition: CompositionDefinitionRecord | null;
  roots: readonly CompositionRootRecord[];
  services: readonly CompositionServiceRecord[];
  issues: readonly CompositionIssue[];
}> {
  const value = parsed.value;
  const issues: CompositionIssue[] = [];
  const definitionId = stringValue(value, 'id');
  const capability = stringValue(value, 'capability');
  if (value.schemaVersion !== 1) {
    issues.push(issue('contract', 'COMPOSITION_SCHEMA_VERSION', file, 'Csak az 1-es composition schema támogatott.'));
  }
  if (!SERVICE_ID.test(definitionId)) {
    issues.push(issue('contract', 'COMPOSITION_DEFINITION_ID_INVALID', file, `Érvénytelen composition definition ID: ${definitionId || '-'}.`));
  }
  if (!capability) {
    issues.push(issue('contract', 'COMPOSITION_CAPABILITY_MISSING', file, 'A composition definition capability mezője kötelező.'));
  }

  const roots: CompositionRootRecord[] = objectArray(value, 'roots').map((root) => Object.freeze({
    id: stringValue(root, 'id'),
    definitionId,
    definitionFile: file,
    source: stringValue(root, 'source'),
    exportName: stringValue(root, 'export'),
    runtime: enumValue(root, 'runtime', COMPOSITION_RUNTIMES, 'nodejs') as CompositionRuntime,
    services: unique(stringArray(root, 'services')),
  }));

  const services: CompositionServiceRecord[] = objectArray(value, 'services').map((service) => Object.freeze({
    id: stringValue(service, 'id'),
    definitionId,
    definitionFile: file,
    capability,
    kind: enumValue(service, 'kind', COMPOSITION_KINDS, 'application') as CompositionKind,
    implementation: stringValue(service, 'implementation'),
    port: nullableString(service, 'port'),
    source: stringValue(service, 'source'),
    exportName: nullableString(service, 'export'),
    lifetime: enumValue(service, 'lifetime', COMPOSITION_LIFETIMES, 'process') as CompositionLifetime,
    runtime: enumValue(service, 'runtime', COMPOSITION_RUNTIMES, 'universal') as CompositionRuntime,
    visibility: enumValue(service, 'visibility', COMPOSITION_VISIBILITIES, 'private') as CompositionVisibility,
    dependencies: unique(stringArray(service, 'dependencies')),
    decorators: Object.freeze([...stringArray(service, 'decorators')]),
    aliases: unique(stringArray(service, 'aliases')),
    tags: unique(stringArray(service, 'tags')),
    priority: integerValue(service, 'priority'),
    configKeys: unique(stringArray(service, 'configKeys')),
    secretKeys: unique(stringArray(service, 'secretKeys')),
    disposable: booleanValue(service, 'disposable'),
    requestState: booleanValue(service, 'requestState'),
  }));

  for (const root of roots) {
    if (!SERVICE_ID.test(root.id)) {
      issues.push(issue('contract', 'COMPOSITION_ROOT_ID_INVALID', file, `Érvénytelen composition root ID: ${root.id || '-'}.`));
    }
    if (!root.source || !root.exportName) {
      issues.push(issue('contract', 'COMPOSITION_ROOT_SOURCE_INVALID', file, `A ${root.id || 'névtelen'} root source és export mezője kötelező.`));
    }
  }
  for (const service of services) {
    if (!SERVICE_ID.test(service.id)) {
      issues.push(issue('contract', 'COMPOSITION_SERVICE_ID_INVALID', file, `Érvénytelen service ID: ${service.id || '-'}.`, service.id || undefined));
    }
    if (!service.implementation || !service.source) {
      issues.push(issue('contract', 'COMPOSITION_SERVICE_SOURCE_INVALID', file, `A ${service.id || 'névtelen'} service implementation és source mezője kötelező.`, service.id || undefined));
    }
    for (const key of [...service.configKeys, ...service.secretKeys]) {
      if (!CONFIG_KEY.test(key)) {
        issues.push(issue('security', 'COMPOSITION_CONFIG_KEY_INVALID', file, `A konfigurációs kulcs nem kanonikus: ${key}.`, service.id));
      }
    }
  }

  const definition = definitionId && capability
    ? Object.freeze({
        id: definitionId,
        capability,
        file,
        exportName: parsed.exportName,
        roots: Object.freeze(roots.map(({ id }) => id).sort()),
        services: Object.freeze(services.map(({ id }) => id).sort()),
      })
    : null;
  return Object.freeze({ definition, roots: Object.freeze(roots), services: Object.freeze(services), issues: Object.freeze(issues) });
}

function lifetimeRank(lifetime: CompositionLifetime): number {
  switch (lifetime) {
    case 'static':
    case 'external':
      return 0;
    case 'process':
      return 1;
    case 'request':
      return 2;
    case 'operation':
      return 3;
  }
}

function graphIssues(
  roots: readonly CompositionRootRecord[],
  services: readonly CompositionServiceRecord[],
): readonly CompositionIssue[] {
  const issues: CompositionIssue[] = [];
  const servicesById = new Map<string, CompositionServiceRecord>();
  const aliases = new Map<string, string>();
  for (const service of services) {
    if (servicesById.has(service.id)) {
      issues.push(issue('binding', 'COMPOSITION_DUPLICATE_SERVICE_ID', service.definitionFile, `Duplikált service ID: ${service.id}.`, service.id));
    } else {
      servicesById.set(service.id, service);
    }
    for (const alias of service.aliases) {
      const owner = aliases.get(alias);
      if (owner && owner !== service.id) {
        issues.push(issue('binding', 'COMPOSITION_BINDING_AMBIGUOUS', service.definitionFile, `Az alias több service-hez tartozik: ${alias} (${owner}, ${service.id}).`, service.id));
      } else {
        aliases.set(alias, service.id);
      }
    }
  }
  const rootsById = new Set<string>();
  for (const root of roots) {
    if (rootsById.has(root.id)) {
      issues.push(issue('contract', 'COMPOSITION_DUPLICATE_ROOT_ID', root.definitionFile, `Duplikált composition root ID: ${root.id}.`));
    }
    rootsById.add(root.id);
    for (const serviceId of root.services) {
      if (!servicesById.has(serviceId)) {
        issues.push(issue('binding', 'COMPOSITION_UNKNOWN_SERVICE_REFERENCE', root.definitionFile, `A ${root.id} root ismeretlen service-re hivatkozik: ${serviceId}.`));
      }
    }
  }

  for (const service of services) {
    for (const dependencyId of service.dependencies) {
      const dependency = servicesById.get(dependencyId);
      if (!dependency) {
        issues.push(issue('binding', 'COMPOSITION_BINDING_MISSING', service.definitionFile, `A ${service.id} dependency-je hiányzik: ${dependencyId}.`, service.id));
        continue;
      }
      if (lifetimeRank(service.lifetime) < lifetimeRank(dependency.lifetime)) {
        issues.push(issue('lifetime', 'COMPOSITION_LIFETIME_MISMATCH', service.definitionFile, `${service.id} (${service.lifetime}) nem függhet hosszabb scope-ot igénylő ${dependency.id} (${dependency.lifetime}) service-től.`, service.id));
      }
      if (
        (service.runtime === 'edge' && dependency.runtime === 'nodejs') ||
        (service.runtime === 'universal' && dependency.runtime !== 'universal')
      ) {
        issues.push(issue('runtime', 'COMPOSITION_RUNTIME_MISMATCH', service.definitionFile, `${service.id} (${service.runtime}) nem függhet ${dependency.id} (${dependency.runtime}) service-től.`, service.id));
      }
    }
    if (service.lifetime === 'process' && service.requestState) {
      issues.push(issue('lifetime', 'COMPOSITION_REQUEST_STATE_IN_SINGLETON', service.definitionFile, `A process lifetime-ú ${service.id} request-state-et deklarál.`, service.id));
    }
    if (service.lifetime === 'operation' && service.visibility === 'public') {
      issues.push(issue('lifetime', 'COMPOSITION_TRANSIENT_EXPORTED_AS_SHARED', service.definitionFile, `Az operation lifetime-ú ${service.id} nem exportálható megosztott public service-ként.`, service.id));
    }
    if (service.kind === 'decorator' && service.dependencies.length !== 1) {
      issues.push(issue('contract', 'COMPOSITION_DECORATOR_CONTRACT_INVALID', service.definitionFile, `A ${service.id} decorator pontosan egy wrapelt dependency-t deklaráljon.`, service.id));
    }
    for (const decoratorId of service.decorators) {
      const decorator = servicesById.get(decoratorId);
      if (!decorator || decorator.kind !== 'decorator' || decorator.port !== service.port) {
        issues.push(issue('contract', 'COMPOSITION_DECORATOR_CONTRACT_INVALID', service.definitionFile, `A ${service.id} decorator lánca hibás: ${decoratorId}.`, service.id));
      }
    }
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    const status = state.get(id) ?? 0;
    if (status === 2) return;
    if (status === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const key = [...new Set(cycle)].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        const service = servicesById.get(id);
        issues.push(issue('binding', 'COMPOSITION_CYCLE', service?.definitionFile ?? 'composition graph', `Ciklikus service graph: ${cycle.join(' → ')}.`, id));
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const dependency of servicesById.get(id)?.dependencies ?? []) {
      if (servicesById.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of [...servicesById.keys()].sort()) visit(id);
  return Object.freeze(issues);
}

async function sourceIssues(
  root: string,
  roots: readonly CompositionRootRecord[],
  services: readonly CompositionServiceRecord[],
  sourceFiles: readonly string[],
): Promise<readonly CompositionIssue[]> {
  const issues: CompositionIssue[] = [];
  const sourceCache = new Map<string, string>();
  const source = async (relative: string): Promise<string | null> => {
    if (sourceCache.has(relative)) return sourceCache.get(relative) ?? null;
    const absolute = path.join(root, relative);
    if (!await exists(absolute)) return null;
    const value = await readFile(absolute, 'utf8');
    sourceCache.set(relative, value);
    return value;
  };
  for (const item of roots) {
    const content = await source(item.source);
    if (content === null) {
      issues.push(issue('contract', 'COMPOSITION_ROOT_SOURCE_MISSING', item.definitionFile, `A composition root forrása hiányzik: ${item.source}.`));
      continue;
    }
    if (!/import\s+['"]server-only['"]/u.test(content)) {
      issues.push(issue('security', 'COMPOSITION_MISSING_SERVER_ONLY', item.source, 'A composition rootból hiányzik az explicit server-only határ.'));
    }
    const exported = new RegExp(`\\bexport\\s+(?:const|let|var|class|(?:async\\s+)?function)\\s+${item.exportName}\\b|\\bexport\\s*\\{[^}]*\\b${item.exportName}\\b`, 'u');
    if (!exported.test(content)) {
      issues.push(issue('contract', 'COMPOSITION_ROOT_EXPORT_MISSING', item.source, `A composition root exportja nem található: ${item.exportName}.`));
    }
  }
  for (const item of services) {
    const content = await source(item.source);
    if (content === null) {
      issues.push(issue('contract', 'COMPOSITION_SERVICE_SOURCE_MISSING', item.definitionFile, `A service forrása hiányzik: ${item.source}.`, item.id));
      continue;
    }
    if (item.exportName) {
      const exported = new RegExp(`\\bexport\\s+(?:const|let|var|class|(?:async\\s+)?function|interface|type)\\s+${item.exportName}\\b|\\bexport\\s*\\{[^}]*\\b${item.exportName}\\b`, 'u');
      if (!exported.test(content)) {
        issues.push(issue('contract', 'COMPOSITION_SERVICE_EXPORT_MISSING', item.source, `A deklarált service export nem található: ${item.exportName}.`, item.id));
      }
    }
  }
  for (const absolute of sourceFiles) {
    const file = projectPath(root, absolute);
    if (!SOURCE_FILE.test(file) || file.includes('/generated/')) continue;
    const content = await readFile(absolute, 'utf8');
    const applicationCode = file.includes('/application/') || file.includes('/domain/');
    if (applicationCode && /\b(?:container|serviceLocator|services)\s*\.\s*(?:get|resolve)\s*(?:<|\()/u.test(content)) {
      issues.push(issue('security', 'COMPOSITION_SERVICE_LOCATOR_USAGE', file, 'Az application/domain réteg generikus service locatort használ.'));
    }
    if (applicationCode && /\bconfig\s*\.\s*get\s*\(/u.test(content)) {
      issues.push(issue('security', 'COMPOSITION_PARAMETER_BAG_USAGE', file, 'Az application/domain réteg stringkulcsos parameter baget használ.'));
    }
  }
  return Object.freeze(issues);
}

async function configurationReferenceIssues(
  root: string,
  services: readonly CompositionServiceRecord[],
): Promise<readonly CompositionIssue[]> {
  const referencedKeys = new Set(
    services.flatMap((service) => [...service.configKeys, ...service.secretKeys]),
  );
  if (referencedKeys.size === 0) return Object.freeze([]);

  const manifestResult = await loadProjectManifest(root);
  if (!manifestResult.manifest) {
    return Object.freeze(manifestResult.failures.map(({ file, message }) =>
      issue('security', 'COMPOSITION_CONFIG_MANIFEST_INVALID', file, message)));
  }

  const definitions = new Map(
    configurationDefinitionsForManifest(manifestResult.manifest)
      .map((definition) => [definition.key, definition] as const),
  );
  const issues: CompositionIssue[] = [];
  for (const service of services) {
    const configSet = new Set(service.configKeys);
    for (const key of service.configKeys) {
      const definition = definitions.get(key);
      if (!definition) {
        issues.push(issue('security', 'COMPOSITION_CONFIG_MISSING', service.definitionFile, `A ${service.id} nem deklarált konfigurációs kulcsot használ: ${key}.`, service.id));
      } else if (definition.classification === 'secret') {
        issues.push(issue('security', 'COMPOSITION_SECRET_EXPOSED', service.definitionFile, `A ${service.id} secret kulcsot configKeys mezőben deklarál: ${key}.`, service.id));
      }
    }
    for (const key of service.secretKeys) {
      const definition = definitions.get(key);
      if (!definition) {
        issues.push(issue('security', 'COMPOSITION_CONFIG_MISSING', service.definitionFile, `A ${service.id} nem deklarált secret kulcsot használ: ${key}.`, service.id));
      } else if (definition.classification !== 'secret') {
        issues.push(issue('security', 'COMPOSITION_SECRET_CLASSIFICATION_INVALID', service.definitionFile, `A ${service.id} nem secret konfigurációt secretKeys mezőben deklarál: ${key}.`, service.id));
      }
      if (configSet.has(key)) {
        issues.push(issue('security', 'COMPOSITION_SECRET_EXPOSED', service.definitionFile, `A ${service.id} ugyanazt a kulcsot config- és secret-dependencyként is deklarálja: ${key}.`, service.id));
      }
    }
  }
  return Object.freeze(issues);
}

export async function buildCompositionInventory(
  root = process.cwd(),
  options: CompositionInventoryOptions = {},
): Promise<CompositionInventory> {
  const absoluteRoot = path.resolve(root);
  const files = await collect(path.join(absoluteRoot, 'src'));
  const definitionFiles = files.filter((file) => DEFINITION_FILE.test(projectPath(absoluteRoot, file)));
  const definitions: CompositionDefinitionRecord[] = [];
  const roots: CompositionRootRecord[] = [];
  const services: CompositionServiceRecord[] = [];
  const issues: CompositionIssue[] = [];
  for (const absolute of definitionFiles) {
    const file = projectPath(absoluteRoot, absolute);
    const source = await readFile(absolute, 'utf8');
    try {
      const parsed = parseCompositionDefinitions(file, source);
      if (parsed.length === 0) {
        issues.push(issue('contract', 'COMPOSITION_DEFINITION_EXPORT_MISSING', file, 'A definition fájl nem exportál defineComposition contractot.'));
      }
      for (const item of parsed) {
        const decoded = decodeDefinition(file, item);
        if (decoded.definition) definitions.push(decoded.definition);
        roots.push(...decoded.roots);
        services.push(...decoded.services);
        issues.push(...decoded.issues);
      }
    } catch (error) {
      issues.push(issue('contract', 'COMPOSITION_DEFINITION_INVALID', file, error instanceof Error ? error.message : String(error)));
    }
  }
  if (definitionFiles.length === 0) {
    issues.push(issue('contract', 'COMPOSITION_DEFINITION_MISSING', 'src/composition', 'Nem található composition.definition.ts fájl.'));
  }
  issues.push(...graphIssues(roots, services));
  issues.push(...await sourceIssues(absoluteRoot, roots, services, files));
  if (options.resolveConfig) {
    issues.push(...await configurationReferenceIssues(absoluteRoot, services));
  }
  const orderedDefinitions = Object.freeze([...definitions].sort((left, right) => left.id.localeCompare(right.id)));
  const orderedRoots = Object.freeze([...roots].sort((left, right) => left.id.localeCompare(right.id)));
  const orderedServices = Object.freeze([...services].sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({
    schemaVersion: 1,
    projectRoot: '.',
    definitions: orderedDefinitions,
    roots: orderedRoots,
    services: orderedServices,
    issues: Object.freeze([...issues].sort((left, right) =>
      left.file.localeCompare(right.file) || left.code.localeCompare(right.code) ||
      (left.serviceId ?? '').localeCompare(right.serviceId ?? ''))),
    fingerprint: compositionFingerprint(orderedRoots, orderedServices),
  });
}

export function inspectComposition(
  inventory: CompositionInventory,
  query: string,
): readonly CompositionServiceRecord[] {
  const normalized = query.trim();
  return Object.freeze(inventory.services.filter((service) =>
    service.id === normalized ||
    service.port === normalized ||
    service.implementation === normalized ||
    service.aliases.includes(normalized) ||
    service.tags.includes(normalized) ||
    service.source === normalized));
}

export function compositionWhy(
  inventory: CompositionInventory,
  target: string,
): readonly string[] {
  const services = new Map(inventory.services.map((service) => [service.id, service]));
  const queue: Array<readonly [string, readonly string[]]> = inventory.roots
    .flatMap((root) => root.services.map((service) => [service, [root.id, service]] as const));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const [id, chain] = current;
    if (id === target || services.get(id)?.aliases.includes(target)) return chain;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const dependency of services.get(id)?.dependencies ?? []) {
      queue.push([dependency, [...chain, dependency]]);
    }
  }
  return Object.freeze([]);
}
