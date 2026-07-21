import { definePageContract } from '@/platform/http/delivery-contract';

export const homePageContract = definePageContract({
  kind: 'page',
  id: 'webapp.home.page',
  route: '/',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'none',
  authentication: 'public',
  tenant: 'none',
  authorization: 'none',
  cache: 'public-static',
} as const);
