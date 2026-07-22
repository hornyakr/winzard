import 'server-only';

import { defineContractProviders } from '@/platform/contracts/contract';

export const applicationContractProviders = defineContractProviders({
  schemaVersion: 1,
  id: 'demo.contract-providers',
  providers: [
    {
      id: 'demo.random.node-crypto',
      contract: 'demo.random-integer-generator',
      contractMajor: 1,
      version: '1.0.0',
      kind: 'production',
      source: 'src/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator.ts',
      export: 'NodeCryptoRandomIntegerGenerator',
      runtime: 'nodejs',
      capabilities: ['random-integer-inclusive'],
      referenceSuite: 'tests/unit/contracts/random-integer-generator.test.ts',
      compositionServiceId: 'demo.lucky-number.random.node',
    },
    {
      id: 'demo.random.validated',
      contract: 'demo.random-integer-generator',
      contractMajor: 1,
      version: '1.0.0',
      kind: 'decorator',
      source: 'src/modules/demo/lucky-number/infrastructure/random/validated-random-integer-generator.ts',
      export: 'ValidatedRandomIntegerGenerator',
      runtime: 'nodejs',
      capabilities: ['range-postcondition'],
      referenceSuite: 'tests/unit/contracts/random-integer-generator.test.ts',
      compositionServiceId: 'demo.lucky-number.random.validated',
    },
  ],
});
