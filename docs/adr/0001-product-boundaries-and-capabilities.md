# ADR-0001: Termékhatárok és opcionális képességek

- **Állapot:** elfogadva
- **Dátum:** 2026-07-17
- **Döntéshozók:** Winzard maintainerek
- **Érintett területek:** repository-szerkezet, build, környezeti konfiguráció, Forge, sablonok, recipe-k, CI

## Kontextus

A repository első változata egyetlen gyökérszintű Next.js alkalmazásként jött létre. Ugyanebben a csomagban jelent meg:

1. a Winzard fejlesztői eszköztár;
2. egy új alkalmazás kiinduló szerkezete;
3. a konvenciókat bemutató futtatható referenciaalkalmazás;
4. Prisma és PostgreSQL infrastruktúra;
5. egy későbbi autentikációs képesség környezeti szerződése.

Ez a felépítés a `webapp` profil követelményeit univerzális platformkövetelménnyé tette. A gyökérszintű `build` implicit Prisma-generálást futtatott, a globális env-séma adatbázis- és auth-változókat követelt, a Forge pedig minden projekttől Prisma schemát és database readiness route-ot várt el.

A `lucky-number` vertikális szelet ezzel szemben nem használ adatbázist vagy autentikációt. A példa értéke a réteghatárokban van: frameworkfüggetlen application query, explicit port, Node-adapter, composition root, valamint közös use case-t használó HTML- és JSON-delivery adapter.

A Prisma Config dokumentációja szerint minden Prisma CLI-parancs betölti a `prisma.config.ts` fájlt. Az `env("DATABASE_URL")` ezért olyan parancsokat is blokkolhat, amelyek ténylegesen nem igényelnek adatbázis-kapcsolatot, például a sima `prisma generate`. Opcionális változónál a konfiguráció közvetlen `process.env` hozzáférést és szükség esetén üres fallbacket használhat; az adatbázist ténylegesen igénylő belépési pontoknak külön kell validálniuk a kapcsolatot.

## Döntés

A Winzard három külön termékrészre bomlik.

### Winzard Forge

Telepíthetővé tehető fejlesztői eszköz és szabálymotor. Feladata:

- projektmanifest olvasása;
- capability-aware szerkezeti ellenőrzés;
- architekturális importszabályok ellenőrzése;
- később generálás, diagnosztika és drift detection.

A Forge nem feltételez automatikusan adatbázist, ORM-et, authot, liveness vagy readiness endpointot.

### Winzard Templates

Kihúzható alkalmazássablonok. Első profilok:

- `minimal`: Next.js App Router és Forge-kompatibilis alap;
- `webapp`: a minimal profil plusz Prisma/PostgreSQL és database readiness képesség.

A sablon határozza meg a fogyasztói projekt runtime-függőségeit. A repository gyökércsomagjának fejlesztési függőségei nem tekinthetők automatikusan egy generált projekt függőségeinek.

### Reference App

A konvenciók teljes, futtatható példája és E2E fixture-je. A `lucky-number` példa ide tartozik. A referenciaalkalmazás nem válik automatikusan a `minimal` vagy `webapp` sablon részévé.

## Repository-szerkezet

A célzott szerkezet:

```text
apps/
  reference/

packages/
  forge/
  config/

 templates/
  minimal/
  webapp/

recipes/
  prisma-postgresql/
  authentication/
  health-readiness/

docs/
  adr/
```

A fizikai szétválasztás első lépése nem jelenti a teljes package-publication workflow vagy recipe resolver elkészültét. Az egyes részek azonban már nem osztozhatnak implicit runtime-kötelezettségeken.

## Capability manifest

Minden ellenőrizhető alkalmazásprofil explicit manifesttel rendelkezik. A manifest lehet külön `winzard.json` fájl vagy a projekt `package.json#winzard` mezője.

Példa minimal projektre:

```json
{
  "schemaVersion": 1,
  "profile": "minimal",
  "capabilities": [
    "next-app",
    "forge",
    "presentation-contract"
  ]
}
```

Példa PostgreSQL webapp projektre:

```json
{
  "schemaVersion": 1,
  "profile": "webapp",
  "capabilities": [
    "next-app",
    "forge",
    "presentation-contract",
    "modular-application",
    "liveness",
    "prisma-postgresql",
    "database-readiness"
  ]
}
```

Elsőként támogatott képességek:

| Capability | Kötelező szerkezeti következmény |
| --- | --- |
| `next-app` | `src/app` és Next.js konfiguráció |
| `forge` | Winzard-manifest és ellenőrizhető projektgyökér |
| `presentation-contract` | View inventory, presentation architecture check és generált contractok |
| `modular-application` | `src/modules` és `src/composition` |
| `liveness` | no-store liveness Route Handler |
| `prisma-postgresql` | Prisma schema/config és adatbázis-env szerződés |
| `database-readiness` | readiness Route Handler; megköveteli a `prisma-postgresql` képességet |
| `authentication` | auth-adapter és saját auth env-szerződés |

Ismeretlen capability hibának számít. A capability-függőségek megsértése hibának számít.

## Build és parancsok

A core/reference build infrastruktúra-független:

```json
{
  "build": "next build apps/reference"
}
```

A Prisma-generálás explicit, profilhoz kötött parancs:

```text
pnpm db:generate:webapp
```

A referencia E2E neve explicit:

```text
pnpm test:e2e:reference
```

A globális `verify` a core ellenőrzéseket jelenti. Az adatbázisprofil külön `verify:database` parancsot és külön CI-jobot kap.

## Környezeti konfiguráció

A környezeti szerződések képességenként különülnek el.

```text
packages/config/src/app-env.ts
recipes/prisma-postgresql/files/src/platform/database/database-env.server.ts
recipes/authentication/files/src/platform/auth/auth-env.server.ts
```

Szabályok:

- az alkalmazáskonfiguráció nem követel adatbázis- vagy auth-változót;
- az adatbázisváltozókat kizárólag a database adapter validálja;
- az auth-változókat kizárólag az auth adapter validálja;
- nincs teljes környezetet modulbetöltéskor parse-oló globális singleton;
- a Prisma Config nem használ kötelező `env()` hívást olyan változóra, amely a `generate` parancsnál opcionális;
- migráció, readiness és runtime database client továbbra is fail-fast módon validálja a tényleges adatbázis-konfigurációt.

## CI

Két független ellenőrzési réteg készül.

### Core CI

Adatbázis-szolgáltatás nélkül fut:

1. install;
2. Next.js typegen;
3. TypeScript;
4. ESLint;
5. unit tesztek;
6. Forge architecture/capability check;
7. reference build;
8. reference E2E.

### Database CI

Csak a `webapp`/`prisma-postgresql` profilt ellenőrzi:

1. PostgreSQL indítása;
2. capability és env ellenőrzés;
3. Prisma schema validáció;
4. Prisma Client generálás;
5. migrációk telepítése;
6. később database integration tesztek.

A core job sikere nem függ PostgreSQL elérhetőségétől.

## Következmények

### Pozitív

- a minimal profil adatbázis és auth nélkül buildelhető;
- a lucky-number referencia a saját céljára használható anélkül, hogy sablonkövetelménnyé válna;
- a Forge szabályai deklaratív képességekből következnek;
- a database readiness csak database capability mellett jelenik meg;
- a buildhiba oka megszűnik: a Next.js build nem futtat implicit Prisma-generálást;
- a core és database hibák CI-ben külön azonosíthatók.

### Negatív

- átmenetileg több konfigurációs és fixture-fájl lesz;
- a template és recipe snapshotok között később drift detection szükséges;
- a Forge package publikálása és a template materializálása külön mérföldkő marad;
- a repository fejlesztési dependency-készlete nagyobb lehet, mint egy minimal fogyasztói projekté.

## Nem része ennek a döntésnek

Ezzel az ADR-rel nem készül el:

- teljes resource-generátor;
- általános recipe dependency resolver;
- auth implementáció;
- több ORM-et kezelő database abstraction;
- általános Playwright-platform;
- package release és npm publishing pipeline.

## Elfogadási feltételek

A döntés implementáltnak tekinthető, ha:

- a reference app az `apps/reference` alatt található;
- a Forge forrása a `packages/forge` alatt található;
- létezik `minimal` és `webapp` template manifest;
- a Prisma/PostgreSQL és auth saját recipe-határt kap;
- a root build nem futtat Prisma-parancsot;
- a root env-séma nem követel adatbázist vagy auth secretet;
- a Forge a manifest capability-jei alapján kapcsolja be a path- és health-ellenőrzéseket;
- a core CI PostgreSQL nélkül sikeresen lefut;
- a database CI külön jobban ellenőrzi a webapp profilt.

## Források

- Prisma Config API, különösen az opcionális környezeti változók kezelése: https://www.prisma.io/docs/orm/reference/prisma-config-reference
- Next.js CLI directory argument a `dev`, `build`, `start` és `typegen` parancsokhoz: https://nextjs.org/docs/app/api-reference/cli/next
