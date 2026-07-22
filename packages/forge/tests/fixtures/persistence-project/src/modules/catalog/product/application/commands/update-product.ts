import type { ProductId, TenantId } from '../../domain/product';
import type { ProductRepository } from '../ports/product.repository';

export type UpdateProductInput = Readonly<{
  tenantId: TenantId;
  productId: ProductId;
  name: string;
  slug: string;
  expectedVersion: number;
}>;

export type UpdateProductResult =
  | Readonly<{ kind: 'updated'; version: number }>
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'conflict' }>;

export class UpdateProduct {
  constructor(private readonly products: ProductRepository) {}

  async execute(input: UpdateProductInput): Promise<UpdateProductResult> {
    const product = await this.products.load(input.tenantId, input.productId);
    if (!product) return Object.freeze({ kind: 'not-found' });
    if (product.snapshot.version !== input.expectedVersion) return Object.freeze({ kind: 'conflict' });
    product.rename(input.name, input.slug);
    const saved = await this.products.save(product, { expectedVersion: input.expectedVersion });
    return saved.kind === 'saved'
      ? Object.freeze({ kind: 'updated', version: saved.version })
      : Object.freeze({ kind: 'conflict' });
  }
}
