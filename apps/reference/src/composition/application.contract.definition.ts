import 'server-only';

import { defineContracts } from '@/platform/contracts/contract';

export const applicationContracts = defineContracts({
  schemaVersion: 1,
  id: 'demo.contracts',
  contracts: [
    {
      id: 'demo.random-integer-generator',
      owner: 'demo.lucky-number',
      version: '1.0.0',
      stability: 'stable',
      visibility: 'module',
      categories: ['compile-time', 'behavioral'],
      source: 'src/modules/demo/lucky-number/application/ports/random-integer-generator.ts',
      export: 'RandomIntegerGenerator',
      documentation: 'docs/80-winzard/contracts/demo-random-integer-generator.md',
      runtimeValidation: 'not-applicable',
      runtimeSchema: null,
      errorCodes: ['RANGE_ERROR'],
      cancellation: 'not-applicable',
      timeout: 'not-applicable',
      concurrency: 'reentrant',
      idempotency: 'idempotent',
      securityClassification: 'internal',
      tenantScope: 'not-applicable',
      referenceSuite: 'tests/unit/contracts/random-integer-generator.test.ts',
      deprecation: null,
    },
  ],
});
