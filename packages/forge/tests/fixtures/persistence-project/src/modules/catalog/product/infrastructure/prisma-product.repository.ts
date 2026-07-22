import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';

import type {
  ProductDetailDto,
  ProductReadRepository,
  ProductRepository,
} from '../application/ports/product.repository';
import { Product, type ProductId, type ProductStatus, type TenantId } from '../domain/product';

function status(value: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'): ProductStatus {
  if (value === 'ACTIVE') return 'active';
  if (value === 'ARCHIVED') return 'archived';
  return 'draft';
}

function persistenceStatus(value: ProductStatus): 'DRAFT' | 'ACTIVE' | 'ARCHIVED' {
  if (value === 'active') return 'ACTIVE';
  if (value === 'archived') return 'ARCHIVED';
  return 'DRAFT';
}

export class PrismaProductReadRepository implements ProductReadRepository {
  constructor(private readonly database: PrismaClient) {}

  async getDetail(tenantId: TenantId, productId: ProductId): Promise<ProductDetailDto | null> {
    const record = await this.database.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        priceMinor: true,
        currency: true,
        status: true,
        version: true,
        updatedAt: true,
      },
    });
    if (!record) return null;
    return Object.freeze({
      id: record.id,
      name: record.name,
      slug: record.slug,
      price: Object.freeze({ amountMinor: record.priceMinor, currency: record.currency }),
      status: status(record.status),
      version: record.version,
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly database: PrismaClient) {}

  async load(tenantId: TenantId, productId: ProductId): Promise<Product | null> {
    const record = await this.database.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        priceMinor: true,
        currency: true,
        status: true,
        version: true,
        deletedAt: true,
      },
    });
    if (!record) return null;
    return Product.restore({
      id: record.id as ProductId,
      tenantId: record.tenantId as TenantId,
      name: record.name,
      slug: record.slug,
      priceMinor: record.priceMinor,
      currency: record.currency,
      status: status(record.status),
      version: record.version,
      deletedAt: record.deletedAt,
    });
  }

  async save(product: Product, options: Readonly<{ expectedVersion: number }>) {
    const state = product.snapshot;
    const result = await this.database.product.updateMany({
      where: { id: state.id, tenantId: state.tenantId, deletedAt: null, version: options.expectedVersion },
      data: {
        name: state.name,
        slug: state.slug,
        priceMinor: state.priceMinor,
        currency: state.currency,
        status: persistenceStatus(state.status),
        version: { increment: 1 },
      },
    });
    return result.count === 1
      ? Object.freeze({ kind: 'saved' as const, version: options.expectedVersion + 1 })
      : Object.freeze({ kind: 'conflict' as const });
  }

  async softDelete(tenantId: TenantId, productId: ProductId, expectedVersion: number, deletedAt: Date) {
    const result = await this.database.product.updateMany({
      where: { id: productId, tenantId, deletedAt: null, version: expectedVersion },
      data: { deletedAt, version: { increment: 1 } },
    });
    return result.count === 1
      ? Object.freeze({ kind: 'deleted' as const, version: expectedVersion + 1 })
      : Object.freeze({ kind: 'conflict' as const });
  }
}
