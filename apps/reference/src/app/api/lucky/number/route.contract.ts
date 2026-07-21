import { defineRouteContract } from '@/platform/http/delivery-contract';

export const luckyNumberApiContract = defineRouteContract({
  kind: 'route-handler',
  id: 'demo.lucky-number.api',
  route: '/api/lucky/number',
  methods: ['GET', 'POST'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: {
    GET: 'none',
    POST: 'demo.lucky-number.generate-custom-range',
  },
  cache: 'private-no-store',
  responsePolicy: 'api-private',
  csrf: 'same-origin',
  idempotency: 'none',
  rateLimit: 'none',
  bodyLimitBytes: 16_384,
  streaming: false,
  operations: {
    GET: 'demo.queries.getLuckyNumber',
    POST: 'demo.commands.generateLuckyNumber',
  },
  presenters: {
    GET: 'toLuckyNumberResponse',
    POST: 'toLuckyNumberResponse',
  },
  responseSchemas: {
    GET: 'LuckyNumberResponse@1',
    POST: 'LuckyNumberResponse@1',
  },
  errors: [
    'CONTENT_LENGTH_INVALID',
    'CSRF_VALIDATION_FAILED',
    'FORBIDDEN',
    'INTERNAL_ERROR',
    'INVALID_RANGE',
    'MALFORMED_JSON',
    'REQUEST_ABORTED',
    'REQUEST_TOO_LARGE',
    'UNSUPPORTED_CONTENT_ENCODING',
    'UNSUPPORTED_MEDIA_TYPE',
  ],
} as const);
