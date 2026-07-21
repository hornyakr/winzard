import { definePageContract } from '@/platform/http/delivery-contract';

export const homePageContract = definePageContract({
  kind: 'page',
  id: 'reference.home.page',
  route: '/',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'none',
  authentication: 'public',
  tenant: 'none',
  authorization: 'none',
  cache: 'public-static',
} as const);
