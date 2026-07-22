# Prisma PostgreSQL recipe

A recipe a `prisma-postgresql` capability és a hozzá tartozó, adaptertulajdonú konfigurációs, schema- és kliensszerződés forrása.

## Tulajdonolt konfiguráció

| Kulcs | Kötelező | Fázis | Besorolás | Validáció |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | igen | process-start | secret | PostgreSQL DSN hosttal és adatbázisnévvel |
| `DATABASE_POOL_MAX` | igen | process-start | internal | egész szám 1–100 között |
| `DATABASE_CONNECTION_TIMEOUT_MS` | igen | process-start | internal | egész szám 100–60000 között |

A `prisma.config.ts` generate-kompatibilis: a config betöltése önmagában nem kényszerít élő adatbázis-kapcsolatot. A tényleges runtime, migration és readiness műveletek külön fail-fast validálják a `DATABASE_URL` értéket.

A Prisma Client kizárólag infrastruktúra-adapterből és composition rootból importálható. Az application portok providerfüggetlenek; a repositoryk statikus `*.repository.definition.ts` contracttal tehetők Forge által ellenőrizhetővé.

## Ellenőrzés

```bash
pnpm forge env:check
pnpm forge config:inspect DATABASE_URL
pnpm forge database:about
pnpm forge database:check
pnpm forge schema:list
pnpm forge schema:docs --check
pnpm forge migration:check
pnpm forge repository:check
pnpm forge query:plans
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
```

A `schema:docs` a `docs/90-generated/persistence` könyvtárban determinisztikus schema-, repository-, migration- és query-plan evidence-et kezel. A migrációkat alkalmazás után módosítani tilos; destruktív SQL-hez adjacent `migration.approval.json` szükséges.
