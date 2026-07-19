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

## Template- és presentation-diagnosztika

```bash
pnpm forge view:list --project apps/reference
pnpm forge view:inspect LuckyNumberView --project apps/reference
pnpm forge view:check --project apps/reference
pnpm forge view:contracts --check --project apps/reference
pnpm forge view:assets --check --project apps/reference
pnpm forge make:view catalog/product/product-card --dry-run --project apps/reference
```

A `presentation-contract` capability explicit view modelleket, minimális Server/Client határt, biztonságos asset- és URL-kezelést, valamint generált view-contract bizonyítékot tesz ellenőrizhetővé.

## Konfigurációs platform és diagnosztika

A Forge capability-nként tulajdonolt, típusos konfigurációs contractot tart fenn. A nyers envértékek Next.js-kompatibilis precedencia szerint töltődnek, a diagnosztika pedig kizárólag redaktált státuszt, forrást és fingerprintet jelenít meg.

```bash
pnpm forge env:check --project apps/reference
pnpm forge config:list --project apps/reference
pnpm forge config:inspect APP_STAGE --project apps/reference
pnpm forge config:reference --check --project apps/reference
pnpm forge config:drift --project templates/webapp
pnpm forge config:diff --from=staging --to=production --project <PROJECT>
pnpm forge config:doctor --project <PROJECT>
pnpm forge secrets:check --project .
```

A teljes konfigurációs ellenőrzés:

```bash
pnpm verify:configuration
```

## Kitelepített projekt-dokumentáció

A `project-documentation` és `ai-delivery` recipe a generált alkalmazás saját Project Vaultját, publikus Winzard consumer contractját, dokumentációs ellenőrzéseit és AI-delivery adaptereit biztosítja.

```bash
pnpm forge docs:init --project <PROJECT> --prefix=ATLAS --ai
pnpm forge docs:check --project <PROJECT>
pnpm forge context:build ATLAS-TASK-0001 --project <PROJECT>
pnpm forge handoff:new ATLAS-TASK-0001 --project <PROJECT>
```

A kitelepített projekt nem kapja meg a Winzard belső roadmapjét, taskjait, handoffjait vagy nem publikus ADR-jeit. Csak a verziózott, read-only `docs/80-winzard` consumer documentation pack kerül ki.

## Opcionális PostgreSQL-profil

A `templates/webapp` és a `recipes/prisma-postgresql` tartalmazza az opcionális Prisma/PostgreSQL képességet.

```bash
export APP_URL='http://localhost:3000'
export APP_NAME='Winzard Webapp'
export APP_STAGE='local'
export LOG_LEVEL='error'
export NEXT_PUBLIC_APP_NAME='Winzard Webapp'
export DATABASE_URL='postgresql://winzard:winzard_dev_only@127.0.0.1:5432/winzard?schema=public'
export DATABASE_POOL_MAX=10
export DATABASE_CONNECTION_TIMEOUT_MS=5000

docker compose -f templates/webapp/compose.yaml up -d postgres
pnpm verify:database
```

A root `build` kizárólag a referenciaalkalmazás Next.js buildjét futtatja. Prisma-parancs csak explicit `db:*:webapp` vagy `verify:database` parancsból indul.

## Dokumentáció

- [Konfiguráció Winzard alkalmazásokban](docs/public_documentation/winzard-configuration.md)
- [Normatív capability- és setup-kiegészítés](docs/public_documentation/winzard-setup-capabilities.md)
- [Setup dokumentáció](docs/public_documentation/winzard-setup.md)
- [Oldalkészítési dokumentáció](docs/public_documentation/winzard-page-creation.md)
- [Routing és URL-kezelés Winzardban](docs/public_documentation/winzard-routing.md)
- [Controller- és delivery adapterek](docs/public_documentation/winzard-controller.md)
- [Sablonok, nézetek és UI-kompozíció](docs/public_documentation/winzard-templates.md)
- [Winzard alkalmazásplatform Next.js fölött](docs/public_documentation/winzard-application-platform.md)
- [Humán és AI dokumentáció Winzard projektekben](docs/public_documentation/winzard-human-ai-documentation.md)
- [Kitelepített projekt-dokumentációs CLI referencia](docs/public_documentation/winzard-project-documentation-cli.md)
- [ADR-0001: Termékhatárok és opcionális képességek](docs/adr/0001-product-boundaries-and-capabilities.md)
