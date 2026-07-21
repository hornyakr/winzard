import { describe, expect, it } from 'vitest';

import {
  assertRouteMethod,
  defineActionContract,
  definePageContract,
  defineRouteContract,
  enforceServerActionContract,
} from '@/platform/http/delivery-contract';

describe('delivery contracts', () => {
  it('mélyen immutable route contractot hoz létre', () => {
    const contract = defineRouteContract({
      kind: 'route-handler',
      id: 'catalog.product.get',
      route: '/api/products/[productId]',
      methods: ['GET'],
      runtime: 'nodejs',
      requestContext: 'required',
      authentication: 'required',
      tenant: 'required',
      authorization: { GET: 'catalog.product.read' },
      cache: 'private-no-store',
      responsePolicy: 'api-private',
      csrf: 'none',
      idempotency: 'none',
      rateLimit: 'read-standard',
      streaming: false,
      operations: { GET: 'catalog.queries.getProduct' },
      presenters: { GET: 'presentProductHttp' },
      responseSchemas: { GET: 'ProductHttpDto@1' },
      errors: ['AUTHENTICATION_REQUIRED', 'PRODUCT_NOT_FOUND'],
    } as const);

    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.authorization)).toBe(true);
    expect(() => assertRouteMethod(contract, 'POST')).toThrow(/not declared/u);
  });

  it('elutasítja a nem konzisztens cache-, stream- és method map szerződést', () => {
    expect(() => defineRouteContract({
      kind: 'route-handler',
      id: 'catalog.product.invalid',
      route: '/api/products/[productId]',
      methods: ['GET'],
      runtime: 'nodejs',
      requestContext: 'required',
      authentication: 'required',
      tenant: 'none',
      authorization: { POST: 'catalog.product.read' },
      cache: 'public-static',
      responsePolicy: 'api-public',
      csrf: 'none',
      idempotency: 'none',
      rateLimit: 'read-standard',
      streaming: false,
      errors: [],
    } as never)).toThrow();
  });

  it('az autholt Page-et request context és privát cache nélkül nem engedi', () => {
    expect(() => definePageContract({
      kind: 'page',
      id: 'catalog.product.page',
      route: '/products/[productId]',
      methods: ['GET'],
      runtime: 'nodejs',
      requestContext: 'none',
      authentication: 'required',
      tenant: 'none',
      authorization: 'catalog.product.read',
      cache: 'public-static',
    } as const)).toThrow(/request context|public-static/u);
  });

  it('csak a deklarált Server Action exportot engedi', () => {
    const contract = defineActionContract({
      kind: 'server-action',
      id: 'catalog.product.update',
      actions: ['updateProductAction'],
      runtime: 'nodejs',
      requestContext: 'required',
      authentication: 'required',
      tenant: 'required',
      authorization: 'catalog.product.update',
      csrf: 'framework-origin-plus-session',
      idempotency: 'optional',
      rateLimit: 'write-standard',
      operation: 'catalog.commands.updateProduct',
      revalidation: ['/products'],
    } as const);

    expect(() => enforceServerActionContract(contract, 'deleteProductAction')).toThrow(
      /not declared/u,
    );
  });
});
