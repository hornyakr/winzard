# Page creation implementáció

Ez a fejlesztési jegyzőkönyv a `docs/public_documentation/winzard-page-creation.md` specifikációhoz tartozó első futtatható vertikális szeletet rögzíti.

A példa az ADR-0001 alapján az `apps/reference` alkalmazásban található. Nem része a `minimal` vagy `webapp` fogyasztói sablonnak.

## Megvalósított scope

- `GetLuckyNumber` application query explicit porttal, DTO-val és hibatípussal;
- Node.js `crypto.randomInt()` alapú, `server-only` infrastruktúra-adapter;
- explicit `apps/reference/src/composition/demo.ts` composition root;
- request-time renderelt `/lucky/number` HTML-oldal;
- `no-store` `/api/lucky/number` JSON Route Handler;
- application-, adapter- és Route Handler unit tesztek;
- production reference E2E smoke teszt;
- TypeScript AST-alapú Forge architecture checkek;
- capability-aware projektellenőrzés.

## Ellenőrzés

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm forge check --project apps/reference
pnpm build
pnpm test:e2e:reference
```

A referencia E2E a production buildet `next start apps/reference` segítségével külön porton indítja, majd ellenőrzi a HTML-oldalt, a JSON-szerződést, a tartományt és a `no-store` cache headert.

## Infrastruktúra-határ

A lucky-number szelet nem importál Prisma-, PostgreSQL- vagy auth-kódot. A core CI ezért PostgreSQL service és `DATABASE_URL` nélkül fut.

A Prisma/PostgreSQL ellenőrzés külön történik:

```bash
pnpm verify:database
```

## Tudatosan későbbre hagyva

- dinamikus minimum/maximum route;
- query string alapú tartomány;
- `loading.tsx`, `not-found.tsx` és `error.tsx` példák;
- `forge route:list` és `forge route:inspect`;
- általános Playwright infrastruktúra.
