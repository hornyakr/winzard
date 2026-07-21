import { defineActionContract } from '@/platform/http/delivery-contract';

export const luckyNumberActionContract = defineActionContract({
  kind: 'server-action',
  id: 'demo.lucky-number.generate.action',
  actions: ['generateLuckyNumberAction'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: 'demo.lucky-number.generate-custom-range',
  csrf: 'framework-origin-plus-session',
  idempotency: 'none',
  rateLimit: 'none',
  operation: 'demo.commands.generateLuckyNumber',
  revalidation: [],
} as const);
