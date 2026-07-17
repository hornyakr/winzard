# Page creation implementáció

Ez a fejlesztési jegyzőkönyv a `docs/public_documentation/winzard-page-creation.md` specifikációhoz tartozó első futtatható vertikális szeletet rögzíti.

## Megvalósított scope

- `GetLuckyNumber` application query explicit porttal, DTO-val és hibatípussal;
- Node.js `crypto.randomInt()` alapú, `server-only` infrastruktúra-adapter;
- explicit `src/composition/demo.ts` composition root;
- request-time renderelt `/lucky/number` HTML-oldal;
- `no-store` `/api/lucky/number` JSON Route Handler;
- application-, adapter- és Route Handler unit tesztek;
- dependency-mentes production E2E smoke teszt;
- TypeScript AST-alapú Forge architecture checkek;
- CI-integráció a build utáni E2E ellenőrzéshez.

## Érvényesített architekturális szabályok

A `pnpm forge check` hibát jelez, ha:

- `src/app/**` közvetlen Prisma-, PostgreSQL- vagy adatbáziskliens-importot használ;
- szerveroldali App Router fájl saját `/api` végpontot hív `fetch()` segítségével;
- `application/**` Next.js-, React-, Node-, ORM-, infrastructure-, presentation-, composition- vagy app-függést vesz fel;
- Client Component szerveroldali, composition-, infrastructure-, adatbázis- vagy `*.server` modult importál;
- composition rootból hiányzik a `server-only` határ;
- Node.js runtime API-t használó infrastruktúra-adapterből hiányzik a `server-only` határ.

## Ellenőrzés

```bash
pnpm typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm forge check
pnpm build
pnpm test:e2e
```

A `test:e2e` a production build standalone szerverét külön porton elindítja, majd ellenőrzi a HTML-oldalt, a JSON-szerződést, a tartományt és a `no-store` cache headert.

## Tudatosan későbbre hagyva

- dinamikus minimum/maximum route;
- query string alapú tartomány;
- `loading.tsx`, `not-found.tsx` és `error.tsx` példák;
- `forge route:list` és `forge route:inspect`;
- általános Playwright infrastruktúra.

Ezek a nyilvános dokumentációban opcionális vagy külön CLI-fejlesztési scope-ként szerepelnek, ezért nem képezik az első oldal minimális vertikális szeletének részét.
