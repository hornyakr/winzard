function defineTestingContract<const T>(definition: T): T {
  return definition;
}

export const testingDefinition = defineTestingContract({
  schemaVersion: 1,
  suites: [
    {
      id: 'webapp.unit',
      owner: 'template:webapp',
      layer: 'unit',
      runtime: 'node',
      command: 'pnpm test',
      include: ['tests/unit/**/*.test.ts'],
      sources: ['src/**/*.ts', 'src/**/*.tsx'],
      fixtures: [],
      capabilities: ['testing-core'],
      services: [],
      ciJob: 'verify / database',
      duration: 'fast',
      serial: false,
      productionBuild: false,
      healthcheck: null,
      network: 'blocked',
      coverage: false,
    },
    {
      id: 'webapp.database',
      owner: 'template:webapp',
      layer: 'integration',
      runtime: 'postgresql',
      command: 'pnpm test:integration',
      include: ['tests/integration/**/*.test.ts'],
      sources: ['src/platform/database/**/*.ts', 'src/platform/messaging/**/*.ts', 'prisma/**'],
      fixtures: [],
      capabilities: ['testing-core', 'testing-database', 'prisma-postgresql'],
      services: ['postgresql'],
      ciJob: 'testing / database-contract',
      duration: 'medium',
      serial: true,
      productionBuild: false,
      healthcheck: null,
      network: 'blocked',
      coverage: false,
    },
  ],
  quarantine: [],
} as const);
