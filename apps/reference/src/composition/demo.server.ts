import 'server-only';

import { GenerateLuckyNumber } from '@/modules/demo/lucky-number/application/commands/generate-lucky-number';
import { LuckyNumberPolicy } from '@/modules/demo/lucky-number/application/policies/lucky-number.policy';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';
import { luckyNumberRangeRules } from '@/modules/demo/lucky-number/application/rules/lucky-number-range-rule';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';
import { ValidatedRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/validated-random-integer-generator';

const nodeRandomIntegerGenerator = new NodeCryptoRandomIntegerGenerator();
const randomIntegerGenerator = new ValidatedRandomIntegerGenerator(nodeRandomIntegerGenerator);
const luckyNumberPolicy = new LuckyNumberPolicy();
const getLuckyNumber = new GetLuckyNumber(randomIntegerGenerator, luckyNumberRangeRules);

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
