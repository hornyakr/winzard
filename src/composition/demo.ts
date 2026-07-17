import 'server-only';

import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';

const randomIntegerGenerator = new NodeCryptoRandomIntegerGenerator();

export const demoModule = Object.freeze({
  queries: Object.freeze({
    getLuckyNumber: new GetLuckyNumber(randomIntegerGenerator),
  }),
});
