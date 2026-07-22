export const repositoryDefinition = {
  schemaVersion: 1,
  id: 'catalog.product',
  port: 'src/modules/catalog/product/application/ports/product.repository.ts#ProductRepository',
  adapter: 'src/modules/catalog/product/infrastructure/prisma-product.repository.ts#PrismaProductRepository',
  models: ['Product'],
  role: 'read-write',
  tenantScoped: true,
  softDelete: true,
  optimisticConcurrency: true,
  transaction: 'supported',
  queries: [
    {
      id: 'get-detail',
      bounded: true,
      tenantScoped: true,
      stableOrder: ['id'],
      requiredIndexes: ['products_pkey'],
    },
    {
      id: 'list-active',
      bounded: true,
      tenantScoped: true,
      stableOrder: ['createdAt', 'id'],
      requiredIndexes: ['products_tenant_status_created_idx'],
    },
  ],
} as const;
