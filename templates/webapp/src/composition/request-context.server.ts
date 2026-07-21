import 'server-only';

import {
  createRequestContextFactory,
  defaultRequestContextResolvers,
  nextRequestContextSource,
  routeContextSource,
  toApplicationContext,
} from '@/platform/http/request-context.server';

const createApplicationRequestContext = createRequestContextFactory(
  defaultRequestContextResolvers(),
);

export async function createRouteRequestContext(request: Request) {
  return createApplicationRequestContext(routeContextSource(request));
}

export async function createPageRequestContext() {
  return createApplicationRequestContext(await nextRequestContextSource());
}

export async function createActionRequestContext() {
  return createApplicationRequestContext(await nextRequestContextSource());
}

export { toApplicationContext };
