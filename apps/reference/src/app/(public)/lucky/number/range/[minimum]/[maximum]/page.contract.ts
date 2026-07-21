import { definePageContract } from '@/platform/http/delivery-contract';

export const luckyNumberRangePageContract = definePageContract({
  kind: 'page',
  id: 'demo.lucky-number.range.page',
  route: '/lucky/number/range/[minimum]/[maximum]',
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
