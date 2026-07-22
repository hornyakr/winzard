CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(200) NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "deletedAt" TIMESTAMPTZ(6),
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_tenant_slug_key" ON "products"("tenantId", "slug");
CREATE INDEX "products_tenant_status_created_idx" ON "products"("tenantId", "status", "createdAt" DESC);
CREATE INDEX "products_tenant_deleted_idx" ON "products"("tenantId", "deletedAt");
