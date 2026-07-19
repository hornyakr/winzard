import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseDotenv } from 'dotenv';

import type { WinzardManifest } from '../manifest';
import { allKnownConfigurationDefinitions, configurationDefinitionsForManifest } from './catalog';
import { collectConfigurationConsumers } from './consumers';
import { configurationValidationLabel } from './metadata';
import type { ConfigurationDefinition, ConfigurationIssue } from './types';


async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function error(
  code: string,
  file: string,
  message: string,
  key?: string,
  owner?: string,
): ConfigurationIssue {
  return {
    severity: 'error',
    code,
    file,
    ...(key ? { key } : {}),
    ...(owner ? { owner } : {}),
    message,
  };
}

function warning(
  code: string,
  file: string,
  message: string,
  key?: string,
  owner?: string,
): ConfigurationIssue {
  return {
    severity: 'warning',
    code,
    file,
    ...(key ? { key } : {}),
    ...(owner ? { owner } : {}),
    message,
  };
}

function duplicateEnvironmentKeys(source: string): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const line of source.replaceAll('\r\n', '\n').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
    const key = match?.[1];
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

function safeSecretExample(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^<[^>]+>$/u.test(value.trim()) ||
    normalized.includes('password') ||
    normalized.includes('example') ||
    normalized.includes('generate-') ||
    normalized.includes('dev_only') ||
    normalized.includes('localhost');
}

async function checkEnvironmentExample(
  root: string,
  definitions: readonly ConfigurationDefinition[],
): Promise<readonly ConfigurationIssue[]> {
  if (definitions.length === 0) return [];
  const file = '.env.example';
  const source = await readOptional(path.join(root, file));
  if (source === null) {
    return [error(
      'CONFIG_ENV_EXAMPLE_MISSING',
      file,
      'Az aktív konfigurációs contracthoz kötelező a verziózott, secretmentes .env.example.',
    )];
  }

  const parsed = parseDotenv(source);
  const expected = new Map(definitions.map((definition) => [definition.key, definition]));
  const issues: ConfigurationIssue[] = duplicateEnvironmentKeys(source).map((key) => error(
    'CONFIG_ENV_KEY_DUPLICATE',
    file,
    `${key} többször szerepel a ${file} fájlban.`,
    key,
  ));
  for (const definition of definitions) {
    if (!(definition.key in parsed)) {
      issues.push(error(
        'CONFIG_ENV_EXAMPLE_DRIFT',
        file,
        `${definition.key} hiányzik a .env.example fájlból.`,
        definition.key,
        definition.owner,
      ));
      continue;
    }
    const value = parsed[definition.key] ?? '';
    if (definition.classification === 'secret' && !safeSecretExample(value)) {
      issues.push(error(
        'CONFIG_SECRET_EXPOSED',
        file,
        `${definition.key} .env.example értéke nem egyértelműen safe placeholder vagy lokális példa.`,
        definition.key,
        definition.owner,
      ));
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!expected.has(key)) {
      issues.push(error(
        'CONFIG_ENV_EXAMPLE_DRIFT',
        file,
        `${key} szerepel a .env.example fájlban, de nincs aktív konfigurációs definíciója.`,
        key,
      ));
    }
  }
  return issues;
}

async function checkTestEnvironment(
  root: string,
  definitions: readonly ConfigurationDefinition[],
): Promise<readonly ConfigurationIssue[]> {
  const file = '.env.test';
  const source = await readOptional(path.join(root, file));
  if (source === null) return [];
  const parsed = parseDotenv(source);
  const expected = new Map(definitions.map((definition) => [definition.key, definition]));
  const issues: ConfigurationIssue[] = duplicateEnvironmentKeys(source).map((key) => error(
    'CONFIG_ENV_KEY_DUPLICATE',
    file,
    `${key} többször szerepel a ${file} fájlban.`,
    key,
  ));
  for (const definition of definitions.filter(({ required }) => required)) {
    if (!(definition.key in parsed)) {
      issues.push(error(
        'CONFIG_ENV_TEST_DRIFT',
        file,
        `${definition.key} kötelező kulcs hiányzik a determinisztikus .env.test fixture-ből.`,
        definition.key,
        definition.owner,
      ));
    }
  }
  for (const [key, value] of Object.entries(parsed)) {
    const definition = expected.get(key);
    if (!definition) {
      issues.push(error(
        'CONFIG_ENV_TEST_DRIFT',
        file,
        `${key} nincs az aktív konfigurációs contractban.`,
        key,
      ));
    } else if (
      definition.classification === 'secret' &&
      value.trim() !== '' &&
      !safeSecretExample(value)
    ) {
      issues.push(error(
        'CONFIG_SECRET_EXPOSED',
        file,
        `${key} .env.test értéke nem egyértelműen izolált, safe tesztfixture.`,
        key,
        definition.owner,
      ));
    }
  }
  return issues;
}

type RecipeConfiguration = Readonly<{
  key?: unknown;
  owner?: unknown;
  required?: unknown;
  phase?: unknown;
  classification?: unknown;
  rebuildRequired?: unknown;
  restartRequired?: unknown;
  type?: unknown;
  example?: unknown;
  description?: unknown;
  defaultValue?: unknown;
  introduced?: unknown;
  deprecated?: unknown;
  removed?: unknown;
}>;

type RecipeMetadata = Readonly<{
  environment?: unknown;
  configuration?: unknown;
}>;

function recipeFieldMismatches(
  definition: ConfigurationDefinition,
  metadata: RecipeConfiguration,
  file: string,
): readonly ConfigurationIssue[] {
  const expected = {
    owner: definition.owner,
    required: definition.required,
    phase: definition.phase,
    classification: definition.classification,
    rebuildRequired: definition.rebuildRequired,
    restartRequired: definition.restartRequired,
    type: configurationValidationLabel(definition.validation),
    example: definition.example,
    description: definition.description,
    defaultValue: definition.defaultValue,
    introduced: definition.introduced,
    deprecated: definition.deprecated,
    removed: definition.removed,
  } as const;
  const issues: ConfigurationIssue[] = [];
  for (const [field, value] of Object.entries(expected)) {
    if (metadata[field as keyof RecipeConfiguration] !== value) {
      issues.push(error(
        'CONFIG_REFERENCE_DRIFT',
        file,
        `${definition.key}.${field} recipe metadata eltér az autoritatív Forge catalogtól.`,
        definition.key,
        definition.owner,
      ));
    }
  }
  return issues;
}

async function checkRecipeMetadata(
  root: string,
  definitions: readonly ConfigurationDefinition[],
): Promise<readonly ConfigurationIssue[]> {
  const issues: ConfigurationIssue[] = [];
  const byCapability = new Map<string, ConfigurationDefinition[]>();
  for (const definition of definitions) {
    if (definition.capability === 'application-shell') continue;
    const values = byCapability.get(definition.capability) ?? [];
    values.push(definition);
    byCapability.set(definition.capability, values);
  }

  for (const [capability, capabilityDefinitions] of byCapability) {
    const file = `recipes/${capability}/recipe.json`;
    const source = await readOptional(path.join(root, file));
    if (source === null) continue;
    let recipe: RecipeMetadata;
    try {
      recipe = JSON.parse(source) as RecipeMetadata;
    } catch {
      issues.push(error('CONFIG_RECIPE_INVALID', file, 'A recipe.json nem érvényes JSON.'));
      continue;
    }
    const environment = Array.isArray(recipe.environment)
      ? recipe.environment.filter((value): value is string => typeof value === 'string')
      : [];
    const expectedKeys = capabilityDefinitions.map(({ key }) => key).sort();
    if (JSON.stringify([...environment].sort()) !== JSON.stringify(expectedKeys)) {
      issues.push(error(
        'CONFIG_REFERENCE_DRIFT',
        file,
        `${capability} environment inventory eltér a Forge konfigurációs catalogtól.`,
      ));
    }
    if (!Array.isArray(recipe.configuration)) {
      issues.push(error(
        'CONFIG_REFERENCE_DRIFT',
        file,
        `${capability} recipe nem tartalmaz részletes configuration metadata tömböt.`,
      ));
      continue;
    }
    const metadataByKey = new Map<string, RecipeConfiguration>();
    for (const value of recipe.configuration) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        issues.push(error('CONFIG_RECIPE_INVALID', file, `${capability} configuration metadata eleme objektum legyen.`));
        continue;
      }
      const metadata = value as RecipeConfiguration;
      if (typeof metadata.key !== 'string' || metadata.key.trim() === '') {
        issues.push(error('CONFIG_RECIPE_INVALID', file, `${capability} configuration metadata key mezője kötelező.`));
        continue;
      }
      if (metadataByKey.has(metadata.key)) {
        issues.push(error(
          'CONFIG_REFERENCE_DRIFT',
          file,
          `${metadata.key} duplikált configuration metadata a recipe-ben.`,
          metadata.key,
        ));
        continue;
      }
      metadataByKey.set(metadata.key, metadata);
    }
    for (const metadataKey of metadataByKey.keys()) {
      if (!capabilityDefinitions.some(({ key }) => key === metadataKey)) {
        issues.push(error(
          'CONFIG_REFERENCE_DRIFT',
          file,
          `${metadataKey} recipe metadata nincs a Forge konfigurációs catalogban.`,
          metadataKey,
        ));
      }
    }
    for (const definition of capabilityDefinitions) {
      const metadata = metadataByKey.get(definition.key);
      if (!metadata) {
        issues.push(error(
          'CONFIG_REFERENCE_DRIFT',
          file,
          `${definition.key} részletes metadata hiányzik a recipe-ből.`,
          definition.key,
          definition.owner,
        ));
      } else {
        issues.push(...recipeFieldMismatches(definition, metadata, file));
      }
    }
  }

  return issues;
}

export async function checkConfigurationDrift(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly ConfigurationIssue[]> {
  const definitions = configurationDefinitionsForManifest(manifest);
  const consumers = await collectConfigurationConsumers(root, definitions);
  const recipeDefinitions = await exists(path.join(root, 'recipes'))
    ? allKnownConfigurationDefinitions
    : definitions;
  const issues: ConfigurationIssue[] = [
    ...(await checkEnvironmentExample(root, definitions)),
    ...(await checkTestEnvironment(root, definitions)),
    ...(await checkRecipeMetadata(root, recipeDefinitions)),
    ...Object.entries(consumers.undeclared).map(([key, files]) => error(
      'CONFIG_KEY_UNDECLARED',
      files[0] ?? 'src',
      `${key} közvetlen process.env használata nincs capability-owned contracthoz kötve.`,
      key,
    )),
  ];
  return issues.sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code));
}

export async function findUnusedConfiguration(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly ConfigurationIssue[]> {
  const definitions = configurationDefinitionsForManifest(manifest);
  const consumers = await collectConfigurationConsumers(root, definitions);
  return definitions
    .filter((definition) => (consumers.consumers.get(definition.key) ?? []).length === 0)
    .map((definition) => warning(
      'CONFIG_KEY_UNUSED',
      '.env.example',
      `${definition.key} aktív contract, de statikus consumer nem található. Dinamikus használat esetén dokumentált kivétel szükséges.`,
      definition.key,
      definition.owner,
    ));
}
