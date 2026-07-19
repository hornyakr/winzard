import type { WinzardManifest } from '../manifest';
import type { ConfigurationDefinition } from './types';

const introduced = '0.1.0';

const applicationDefinitions: readonly ConfigurationDefinition[] = [
  {
    key: 'APP_URL',
    owner: 'application-shell',
    capability: 'application-shell',
    description: 'Az alkalmazás megbízható canonical originje szerveroldali URL-generáláshoz.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'url', protocols: ['http:', 'https:'], originOnly: true },
    example: 'http://localhost:3000',
    introduced,
  },
  {
    key: 'APP_NAME',
    owner: 'application-shell',
    capability: 'application-shell',
    description: 'Az alkalmazás szerveroldali, nem üres megjelenítési neve.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'string', minimumLength: 1, maximumLength: 128 },
    example: 'Atlas',
    introduced,
  },
  {
    key: 'APP_STAGE',
    owner: 'application-shell',
    capability: 'application-shell',
    description: 'A deployment operációs stage-e; nem helyettesíti a NODE_ENV értéket.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'enum', values: ['local', 'preview', 'staging', 'production'] },
    example: 'local',
    introduced,
  },
  {
    key: 'LOG_LEVEL',
    owner: 'observability',
    capability: 'application-shell',
    description: 'A process-szintű strukturált naplózás minimális súlyossága.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'enum', values: ['debug', 'info', 'warn', 'error'] },
    example: 'info',
    introduced,
  },
  {
    key: 'NEXT_PUBLIC_APP_NAME',
    owner: 'public-ui',
    capability: 'application-shell',
    description: 'A böngészőbundle-be beágyazható publikus alkalmazásnév.',
    required: true,
    phase: 'public-client',
    classification: 'public',
    rebuildRequired: true,
    restartRequired: false,
    validation: { kind: 'string', minimumLength: 1, maximumLength: 128 },
    example: 'Atlas',
    introduced,
  },
];

const databaseDefinitions: readonly ConfigurationDefinition[] = [
  {
    key: 'DATABASE_URL',
    owner: 'prisma-postgresql',
    capability: 'prisma-postgresql',
    description: 'A PostgreSQL runtime kapcsolat credentialt is tartalmazó DSN-je.',
    required: true,
    phase: 'process-start',
    classification: 'secret',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'postgres-url' },
    example: 'postgresql://user:password@localhost:5432/atlas',
    introduced,
  },
  {
    key: 'DATABASE_POOL_MAX',
    owner: 'prisma-postgresql',
    capability: 'prisma-postgresql',
    description: 'Egy process maximális adatbázis-kapcsolatszáma.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'integer', minimum: 1, maximum: 100 },
    example: '10',
    introduced,
  },
  {
    key: 'DATABASE_CONNECTION_TIMEOUT_MS',
    owner: 'prisma-postgresql',
    capability: 'prisma-postgresql',
    description: 'Adatbázis-kapcsolódási timeout ezredmásodpercben.',
    required: true,
    phase: 'process-start',
    classification: 'internal',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'integer', minimum: 100, maximum: 60_000 },
    example: '5000',
    introduced,
  },
];

const authenticationDefinitions: readonly ConfigurationDefinition[] = [
  {
    key: 'AUTH_SECRET',
    owner: 'authentication',
    capability: 'authentication',
    description: 'Az authentication capability nagy entrópiájú szerveroldali signing secretje.',
    required: true,
    phase: 'process-start',
    classification: 'secret',
    rebuildRequired: false,
    restartRequired: true,
    validation: { kind: 'secret', minimumLength: 32 },
    example: '<generate-at-least-32-random-characters>',
    introduced,
  },
];

export const allKnownConfigurationDefinitions = Object.freeze([
  ...applicationDefinitions,
  ...databaseDefinitions,
  ...authenticationDefinitions,
].sort((left, right) => left.key.localeCompare(right.key)));

export function configurationDefinitionsForManifest(
  manifest: WinzardManifest,
): readonly ConfigurationDefinition[] {
  const capabilities = new Set(manifest.capabilities);
  return allKnownConfigurationDefinitions.filter((definition) =>
    definition.capability === 'application-shell'
      ? capabilities.has('next-app')
      : capabilities.has(definition.capability));
}

export function configurationDefinitionByKey(
  manifest: WinzardManifest,
  key: string,
): ConfigurationDefinition | null {
  return configurationDefinitionsForManifest(manifest).find((definition) => definition.key === key) ?? null;
}
