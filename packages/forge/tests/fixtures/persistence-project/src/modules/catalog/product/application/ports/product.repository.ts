import type { Product, ProductId, TenantId } from '../../domain/product';

export type ProductDetailDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  price: Readonly<{ amountMinor: number; currency: string }>;
  status: string;
  version: number;
  updatedAt: string;
}>;

export interface ProductReadRepository {
  getDetail(tenantId: TenantId, productId: ProductId): Promise<ProductDetailDto | null>;
}

export interface ProductRepository {
  load(tenantId: TenantId, productId: ProductId): Promise<Product | null>;
  save(product: Product, options: Readonly<{ expectedVersion: number }>): Promise<
    | Readonly<{ kind: 'saved'; version: number }>
    | Readonly<{ kind: 'conflict' }>
  >;
  softDelete(tenantId: TenantId, productId: ProductId, expectedVersion: number, deletedAt: Date): Promise<
    | Readonly<{ kind: 'deleted'; version: number }>
    | Readonly<{ kind: 'conflict' }>
  >;
}
