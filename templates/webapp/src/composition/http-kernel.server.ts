import 'server-only';

import type { HttpMethod, RouteDeliveryContract } from '@/platform/http/delivery-contract';
import {
  withRouteLifecycle as withPlatformRouteLifecycle,
  type HttpKernelDependencies,
  type HttpKernelHandler,
} from '@/platform/http/http-kernel.server';

import { createRouteRequestContext } from './request-context.server';

export function withRouteLifecycle<C>(
  contract: RouteDeliveryContract,
  method: HttpMethod,
  handler: HttpKernelHandler<C>,
  dependencyOverrides?: Partial<HttpKernelDependencies>,
): (request: Request, context: C) => Promise<Response> {
  return withPlatformRouteLifecycle(contract, method, handler, {
    createRequestContext: createRouteRequestContext,
    ...dependencyOverrides,
  });
}
