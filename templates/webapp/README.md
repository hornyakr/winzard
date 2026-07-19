# Webapp template

A `webapp` profil a minimal alkalmazás `presentation-contract` szerződésére Prisma/PostgreSQL és database readiness képességet telepít. Auth nincs benne; az külön recipe.

## Konfiguráció

Lokális fejlesztéshez másold a secretmentes contractot, majd adj meg saját PostgreSQL credentialt:

```bash
cp .env.example .env.local
pnpm forge env:check
pnpm forge config:list
pnpm forge config:inspect DATABASE_URL
pnpm forge config:reference --check
pnpm forge config:drift
```

A `DATABASE_URL` secret, process-start érték; nem kerülhet Gitbe, kliensbundle-be vagy diagnosztikai outputba. A pool- és timeoutértékek pozitív, korlátozott egész számok. Az `instrumentation.ts` induláskor az alkalmazás- és adatbázis-contractot is ellenőrzi.

A Prisma-lánc explicit:

```bash
pnpm db:validate
pnpm db:generate
pnpm typecheck
pnpm build
pnpm db:migrate:deploy
```

## Presentation contract

```bash
pnpm forge view:check
pnpm forge view:assets --check
pnpm forge make:view catalog/product/product-card --dry-run
```
