import 'server-only';

import { GenerateLuckyNumber } from '@/modules/demo/lucky-number/application/commands/generate-lucky-number';
import { LuckyNumberPolicy } from '@/modules/demo/lucky-number/application/policies/lucky-number.policy';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';

const randomIntegerGenerator = new NodeCryptoRandomIntegerGenerator();
const luckyNumberPolicy = new LuckyNumberPolicy();
const getLuckyNumber = new GetLuckyNumber(randomIntegerGenerator);

export const demoModule = Object.freeze({
  queries: Object.freeze({
    getLuckyNumber,
  }),
  commands: Object.freeze({
    generateLuckyNumber: new GenerateLuckyNumber(getLuckyNumber, luckyNumberPolicy),
  }),
  policies: Object.freeze({
    luckyNumber: luckyNumberPolicy,
  }),
});
