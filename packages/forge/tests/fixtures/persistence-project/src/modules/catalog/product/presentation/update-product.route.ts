import type { ProductId, TenantId } from '../domain/product';
import type { UpdateProduct } from '../application/commands/update-product';
import { productIdSchema, updateProductSchema } from './product.schemas';

export type ProductActor = Readonly<{ id: string; tenantId: TenantId; canUpdateProducts: boolean }>;

export type UpdateProductRouteDependencies = Readonly<{
  resolveActor(request: Request): Promise<ProductActor>;
  updateProduct: UpdateProduct;
}>;

export function createUpdateProductRoute(dependencies: UpdateProductRouteDependencies) {
  return async function PATCH(request: Request, context: Readonly<{ params: Promise<{ productId: string }> }>): Promise<Response> {
    const actor = await dependencies.resolveActor(request);
    if (!actor.canUpdateProducts) return Response.json({ type: 'forbidden' }, { status: 403 });
    const params = await context.params;
    const productId = productIdSchema.parse(params.productId) as ProductId;
    const body = updateProductSchema.parse(await request.json());
    const result = await dependencies.updateProduct.execute({
      tenantId: actor.tenantId,
      productId,
      name: body.name,
      slug: body.slug,
      expectedVersion: body.expectedVersion,
    });
    if (result.kind === 'not-found') return Response.json({ type: 'not-found' }, { status: 404 });
    if (result.kind === 'conflict') return Response.json({ type: 'conflict' }, { status: 409 });
    return Response.json({ version: result.version }, { status: 200 });
  };
}
