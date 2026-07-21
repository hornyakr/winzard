import 'server-only';

import { demoActorResolver } from '@/modules/demo/lucky-number/presentation/lucky-number.actor.server';
import {
  createRequestContextFactory,
  defaultRequestContextResolvers,
  nextRequestContextSource,
  routeContextSource,
  toApplicationContext,
} from '@/platform/http/request-context.server';

const createReferenceRequestContext = createRequestContextFactory(
  defaultRequestContextResolvers(demoActorResolver),
);

export async function createRouteRequestContext(request: Request) {
  return createReferenceRequestContext(routeContextSource(request));
}

export async function createPageRequestContext() {
  return createReferenceRequestContext(await nextRequestContextSource());
}

export async function createActionRequestContext() {
  return createReferenceRequestContext(await nextRequestContextSource());
}

export { toApplicationContext };
