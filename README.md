# Winzard

A repository három külön termékrészt tartalmaz:

- **Winzard Forge:** capability-aware fejlesztői és architekturális eszköztár a `packages/forge` alatt;
- **Winzard Templates:** kihúzható `minimal` és `webapp` alkalmazássablonok a `templates` alatt;
- **Reference App:** a konvenciók futtatható példája az `apps/reference` alatt.

A referenciaalkalmazás nem igényel PostgreSQL-t, Prisma Client-generálást vagy autentikációs secretet.

## Core fejlesztés

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm verify:core
pnpm dev
```

A referenciaalkalmazás útvonalai:

```text
/
/lucky/number
/api/lucky/number
/api/health/live
```

## Opcionális PostgreSQL-profil

A `templates/webapp` és a `recipes/prisma-postgresql` tartalmazza az opcionális Prisma/PostgreSQL képességet.

```bash
export DATABASE_URL='postgresql://winzard:winzard_dev_only@127.0.0.1:5432/winzard?schema=public'
export DATABASE_POOL_MAX=10
export DATABASE_CONNECTION_TIMEOUT_MS=5000

docker compose -f templates/webapp/compose.yaml up -d postgres
pnpm verify:database
```

A root `build` kizárólag a referenciaalkalmazás Next.js buildjét futtatja. Prisma-parancs csak explicit `db:*:webapp` vagy `verify:database` parancsból indul.

## Dokumentáció

- [Setup dokumentáció](docs/public_documentation/winzard-setup.md)
- [Oldalkészítési dokumentáció](docs/public_documentation/winzard-page-creation.md)
- [ADR-0001: Termékhatárok és opcionális képességek](docs/adr/0001-product-boundaries-and-capabilities.md)
