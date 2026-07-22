---
title: "Adatbázisok és Prisma ORM Winzard alkalmazásokban"
description: "A Winzard persistence-platform implementált Prisma/PostgreSQL szerződése, repository-határai, migrációs governance-e és Forge diagnosztikája."
status: "implemented-draft"
document_version: "0.1.0"
last_verified: "2026-07-22"
nextjs_baseline: "16.2.10"
prisma_baseline: "7.8.0"
postgresql_baseline: "18.4"
---

# Adatbázisok és Prisma ORM Winzard alkalmazásokban

## Alapelv

A Prisma ORM persistence adapter. Nem domainmodell, application service, delivery contract vagy kliensoldali DTO. A `src/app/**`, a React view-k és az application réteg nem importálhatja közvetlenül a Prisma Clientet.

A kanonikus adatfolyam:

```text
Page / Route Handler / Server Action
  → műveletspecifikus Zod schema
  → actor, tenant és request context
  → application query vagy command
  → repository / transaction port
  → Prisma/PostgreSQL infrastruktúra-adapter
  → explicit domain result vagy DTO
  → presenter
  → HTML, RSC vagy HTTP response
```

A persistence-, domain-, operation-, application DTO- és presentation modellek külön contractok. A generated Prisma típus nem exportálható automatikusan application portként vagy Client Component propként.

## Opcionális capability

A PostgreSQL-integráció kizárólag a `prisma-postgresql` capability mellett kötelező. A `minimal` template és a referenciaalkalmazás továbbra is adatbázis, `DATABASE_URL`, migráció és Prisma Client-generálás nélkül buildelhető.

A capability tulajdonolja:

```text
prisma.config.ts
prisma/schema.prisma
prisma/migrations/**
src/platform/database/database-env.server.ts
src/platform/database/client.ts
DATABASE_URL
DATABASE_POOL_MAX
DATABASE_CONNECTION_TIMEOUT_MS
```

A `database-readiness` megköveteli a `prisma-postgresql` capability-t.

## Repository contract

Az application saját, üzleti jelentésű portot határoz meg. Tilos Prisma `where`, `data`, generated model vagy `TransactionClient` típust az application boundaryn keresztülvinni.

A Forge statikus repository-definíciót használ:

```ts
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
      id: 'list-active',
      bounded: true,
      tenantScoped: true,
      stableOrder: ['createdAt', 'id'],
      requiredIndexes: ['products_tenant_status_created_idx'],
    },
  ],
} as const;
```

A definíció evidence, nem runtime registry és nem service locator. A tényleges dependency injection explicit composition rootban történik.

## Schema és query governance

A Prisma schema a tárolási modell source of truthja. Minden modellnél vizsgálandó:

- primary key és tenant-integritás;
- nullability és default;
- adatbázis-native típus;
- unique constraint és index;
- reláció és referential action;
- migration- és rollout-hatás;
- publikus adatszivárgási kockázat.

Listázásnál kötelező a felső korlát és a stabil tie-breaker. A Forge hibát vagy figyelmeztetést jelez többek között unsafe raw SQL, korlátlan `findMany`, teljes relation `include`, közvetlen delivery/application ORM-import és tranzakción belüli külső I/O esetén.

## Migrációk

A schema source of truthja:

```text
prisma/schema.prisma
+ prisma/migrations/**/migration.sql
+ explicit provider-specifikus SQL artifactok
```

Ajánlott fejlesztői folyamat:

```text
schema change
→ prisma migrate dev --create-only
→ SQL review
→ local apply
→ integration és upgrade test
→ commit
→ production migrate deploy
→ smoke és monitoring
```

Alkalmazott migration fájl módosítása tilos. A Forge SHA-256 migration manifestet generál. Destruktív SQL-hez adjacent `migration.approval.json`, rollout- és rollback/roll-forward terv szükséges.

## Tranzakció és konkurencia

A transaction boundary az application command tulajdona, a Prisma transaction az infrastruktúrában valósul meg. Interactive transaction alatt hosszú számítás, email, queue publish vagy külső HTTP-hívás nem végezhető.

Optimistic concurrency esetén a write adapter `updateMany` műveletet használ tenant-, rekord- és version-filterrel, majd atomikusan növeli a verziót. A nulla módosított sor explicit conflict result, nem 500-as hiba.

## Readiness

A readiness rövid, read-only, timeoutos lekérdezést futtat:

```ts
await database.$queryRaw<readonly { ready: number }[]>`SELECT 1 AS ready`;
```

A readiness nem futtat migrációt, nem ír adatot, nem használ unsafe raw SQL-t, és `no-store` választ ad.

## Forge parancsok

```bash
pnpm forge database:about --project <PROJECT>
pnpm forge database:check --project <PROJECT>
pnpm forge database:connections --project <PROJECT>
pnpm forge database:readiness --project <PROJECT>

pnpm forge schema:list --project <PROJECT>
pnpm forge schema:inspect Product --project <PROJECT>
pnpm forge schema:check --project <PROJECT>
pnpm forge schema:diff --from old.prisma --to prisma/schema.prisma --project <PROJECT>
pnpm forge schema:docs --project <PROJECT>
pnpm forge schema:docs --check --project <PROJECT>

pnpm forge migration:list --project <PROJECT>
pnpm forge migration:inspect <ID> --project <PROJECT>
pnpm forge migration:check --project <PROJECT>
pnpm forge migration:plan --project <PROJECT>
pnpm forge migration:drift --project <PROJECT>

pnpm forge repository:list --project <PROJECT>
pnpm forge repository:inspect catalog.product --project <PROJECT>
pnpm forge repository:check --project <PROJECT>
pnpm forge query:plans --project <PROJECT>
```

Minden parancs támogatja a `--json` kimenetet. A statikus parancsok nem igényelnek élő adatbázist és nem hajtanak végre migrációt.

## Generált evidence

A `schema:docs` a következő artifactokat kezeli:

```text
docs/90-generated/persistence/schema.md
docs/90-generated/persistence/repositories.md
docs/90-generated/persistence/query-plans.md
docs/90-generated/persistence/migration-manifest.json
```

A `--check` mód drift esetén hibával áll le.

## Biztonsági határ

Kötelező:

- least-privilege runtime és migration role;
- TLS és secret manager;
- tenant scope authoritative actor/session forrásból;
- raw SQL adatérték-paraméterezés;
- identifier allowlist;
- connection-, statement-, lock- és transaction timeout;
- PII- és secretredakció;
- valós PostgreSQL integration teszt constrainthez, lockhoz és tranzakcióhoz.

A Prisma type safety nem authorizációs vagy security boundary.

## Jelenlegi implementációs határ

A persistence-platform v1 statikus schema-, migration-, repository- és query-plan inventoryt, Forge diagnosztikát, generált evidence-et, recipe-integrációt és Product referencia-fixture-t biztosít.

Nem része:

- automatikus resource-generátor;
- RLS capability;
- read-replica runtime;
- TypedSQL registry;
- automatikus production execution-plan futtatás;
- adatbázis-semleges ORM absztrakció;
- production migráció automatikus alkalmazásindításkor.
