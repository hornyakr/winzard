function defineTestingContract<const T>(definition: T): T {
  return definition;
}

export const testingDefinition = defineTestingContract({
  schemaVersion: 1,
  suites: [
    {
      id: 'catalog.unit',
      owner: 'team:catalog',
      layer: 'unit',
      runtime: 'node',
      command: 'vitest run',
      include: ['tests/unit/**/*.test.ts'],
      sources: ['src/**/*.ts'],
      fixtures: [],
      capabilities: ['testing-core'],
      services: [],
      ciJob: 'testing / unit',
      duration: 'fast',
      serial: false,
      productionBuild: false,
      healthcheck: null,
      network: 'blocked',
      coverage: true,
    },
    {
      id: 'catalog.http',
      owner: 'team:catalog',
      layer: 'application-http',
      runtime: 'node',
      command: 'tsx tests/e2e/catalog.smoke.ts',
      include: ['tests/e2e/**/*.smoke.ts'],
      sources: ['src/**/*.ts'],
      fixtures: [],
      capabilities: ['testing-core', 'next-app'],
      services: ['production-server'],
      ciJob: 'testing / application',
      duration: 'medium',
      serial: true,
      productionBuild: true,
      healthcheck: '/api/health/live',
      network: 'blocked',
      coverage: false,
    },
  ],
  quarantine: [],
} as const);
