import { defineRouteContract } from '@/platform/http/delivery-contract';

export const livenessRouteContract = defineRouteContract({
  kind: 'route-handler',
  id: 'platform.health.live',
  route: '/api/health/live',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'public',
  tenant: 'none',
  authorization: { GET: 'none' },
  cache: 'no-store',
  responsePolicy: 'health',
  csrf: 'none',
  idempotency: 'none',
  rateLimit: 'none',
  streaming: false,
  operations: {},
  presenters: { GET: 'Response.json' },
  responseSchemas: { GET: 'LivenessHttpDto@1' },
  errors: ['INTERNAL_ERROR'],
} as const);
