# Prisma PostgreSQL recipe

A recipe a `prisma-postgresql` capability és a hozzá tartozó, adaptertulajdonú konfigurációs szerződés forrása.

## Tulajdonolt konfiguráció

| Kulcs | Kötelező | Fázis | Besorolás | Validáció |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | igen | process-start | secret | PostgreSQL DSN hosttal és adatbázisnévvel |
| `DATABASE_POOL_MAX` | igen | process-start | internal | egész szám 1–100 között |
| `DATABASE_CONNECTION_TIMEOUT_MS` | igen | process-start | internal | egész szám 100–60000 között |

A `prisma.config.ts` generate-kompatibilis: a config betöltése önmagában nem kényszerít élő adatbázis-kapcsolatot. A tényleges runtime, migration és readiness műveletek külön fail-fast validálják a `DATABASE_URL` értéket.

Ellenőrzés:

```bash
pnpm forge env:check
pnpm forge config:inspect DATABASE_URL
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
```
