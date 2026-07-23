function defineTestingContract<const T>(definition: T): T {
  return definition;
}

export const testingDefinition = defineTestingContract({
  schemaVersion: 1,
  suites: [
    {
      id: 'minimal.unit',
      owner: 'template:minimal',
      layer: 'unit',
      runtime: 'node',
      command: 'pnpm test',
      include: ['tests/unit/**/*.test.ts'],
      sources: ['src/**/*.ts', 'src/**/*.tsx'],
      fixtures: [],
      capabilities: ['testing-core'],
      services: [],
      ciJob: 'verify / core',
      duration: 'fast',
      serial: false,
      productionBuild: false,
      healthcheck: null,
      network: 'blocked',
      coverage: false,
    },
  ],
  quarantine: [],
} as const);
