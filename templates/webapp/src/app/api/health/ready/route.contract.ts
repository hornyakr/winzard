import { defineRouteContract } from '@/platform/http/delivery-contract';

export const readinessRouteContract = defineRouteContract({
  kind: 'route-handler',
  id: 'platform.health.ready',
  route: '/api/health/ready',
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
  operations: { GET: 'assertDatabaseReady' },
  presenters: { GET: 'Response.json' },
  responseSchemas: { GET: 'ReadinessHttpDto@1' },
  errors: ['DATABASE_UNAVAILABLE', 'INTERNAL_ERROR'],
} as const);
