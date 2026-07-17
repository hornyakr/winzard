import 'server-only';

import { LuckyNumberPolicy } from '@/modules/demo/lucky-number/application/policies/lucky-number.policy';
import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';

const randomIntegerGenerator = new NodeCryptoRandomIntegerGenerator();

export const demoModule = Object.freeze({
  queries: Object.freeze({
    getLuckyNumber: new GetLuckyNumber(randomIntegerGenerator),
  }),
  policies: Object.freeze({
    luckyNumber: new LuckyNumberPolicy(),
  }),
});
