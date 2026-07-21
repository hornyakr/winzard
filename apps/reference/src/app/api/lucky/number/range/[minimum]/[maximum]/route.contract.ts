import { defineRouteContract } from '@/platform/http/delivery-contract';

export const luckyNumberRangeApiContract = defineRouteContract({
  kind: 'route-handler',
  id: 'demo.lucky-number.range.api',
  route: '/api/lucky/number/range/[minimum]/[maximum]',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: { GET: 'none' },
  cache: 'private-no-store',
  responsePolicy: 'api-private',
  csrf: 'none',
  idempotency: 'none',
  rateLimit: 'none',
  streaming: false,
  operations: { GET: 'demo.queries.getLuckyNumber' },
  presenters: { GET: 'toLuckyNumberResponse' },
  responseSchemas: { GET: 'LuckyNumberResponse@1' },
  errors: ['INTERNAL_ERROR', 'INVALID_RANGE'],
} as const);
