import { definePageContract } from '@/platform/http/delivery-contract';

export const luckyNumberPageContract = definePageContract({
  kind: 'page',
  id: 'demo.lucky-number.page',
  route: '/lucky/number',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: 'none',
  cache: 'private-no-store',
  operation: 'demo.queries.getLuckyNumber',
  presenter: 'presentLuckyNumber',
} as const);
