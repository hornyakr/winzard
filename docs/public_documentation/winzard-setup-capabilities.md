---
title: "Winzard termékhatárok, profilok és opcionális capability-k"
description: "A Winzard setup dokumentáció normatív kiegészítése a Forge, a template-ek, a referenciaalkalmazás és az opcionális infrastruktúrák szétválasztásához."
status: "accepted-specification"
document_version: "0.3.0"
last_verified: "2026-07-19"
supersedes:
  - "winzard-setup.md azon részei, amelyek a PostgreSQL-t, a Prismát vagy az AUTH_SECRET változót minden projektre kötelezőként kezelik"
architecture_decision: "ADR-0001"
---

# Winzard termékhatárok, profilok és opcionális capability-k

## 1. A dokumentum státusza

Ez a dokumentum a [Winzard setup dokumentáció](winzard-setup.md) normatív kiegészítése. Az [ADR-0001](../adr/0001-product-boundaries-and-capabilities.md) döntését alkalmazza a telepítési, build-, környezeti, Forge- és CI-szerződésekre.

Az itt szereplő szabályok elsőbbséget élveznek minden olyan korábbi példával szemben, amely:

- minden Winzard projekthez kötelező PostgreSQL-t ír elő;
- a root `build` részeként implicit `prisma generate` parancsot futtat;
- minden környezetben megköveteli a `DATABASE_URL` változót;
- autentikációs implementáció nélkül megköveteli az `AUTH_SECRET` változót;
- minden projekttől Prisma schemát, Docker Compose fájlt vagy database readiness endpointot vár;
- a lucky-number referencia E2E tesztet fogyasztói projektkövetelménynek tekinti.

> [!IMPORTANT]
> A Winzard core nem adatbázis-framework és nem kész webalkalmazás. A projekt külön fejlesztői eszközt, kihúzható sablonokat és futtatható referenciaalkalmazást tartalmaz.

---

## 2. A három külön termékrész

### 2.1. Winzard Forge

A Winzard Forge telepíthetővé tehető fejlesztői eszköz és szabálymotor.

Feladata:

- projektmanifest olvasása;
- capability-k validálása;
- capability-függőségek ellenőrzése;
- architekturális importszabályok érvényesítése;
- projektstruktúra ellenőrzése;
- később generálás, recipe-kezelés és drift detection.

A Forge nem feltételez automatikusan:

- Next.js alkalmazást;
- moduláris application réteget;
- adatbázist;
- Prisma ORM-et;
- PostgreSQL-t;
- autentikációt;
- liveness vagy readiness endpointot.

Ezeket kizárólag a manifestben deklarált capability-k kapcsolják be.

### 2.2. Winzard Templates

A template egy új fogyasztói alkalmazás kihúzható kiindulópontja.

A template saját maga határozza meg:

- a runtime dependency-ket;
- a development dependency-ket;
- a projektmanifestet;
- a kezdeti fájlstruktúrát;
- az elérhető scripteket;
- az env mintát;
- az alap CI-szerződést.

A Winzard repository root `package.json` fájlja nem másolandó automatikusan egy generált projektbe. A repository fejlesztési és fixture-függőségei nem azonosak a template fogyasztói függőségeivel.

### 2.3. Reference App

A referenciaalkalmazás futtatható dokumentációs és architekturális példa.

Feladata:

- teljes vertikális szeletek bemutatása;
- Forge architecture fixture biztosítása;
- reference E2E futtatása;
- későbbi generator golden output ellenőrzése;
- upgrade és recipe smoke tesztek futtatása.

A referenciaalkalmazás tartalma nem kerül automatikusan a template-ekbe.

A jelenlegi repositoryban:

```text
apps/reference/
```

A jelenlegi első vertikális szelet:

```text
/lucky/number
/api/lucky/number
```

Ez a példa nem igényel adatbázist vagy autentikációt.

---

## 3. Repository-szerkezet

A támogatott célstruktúra:

```text
apps/
  reference/
    src/app/
    src/modules/demo/
    src/composition/
    tests/

packages/
  forge/
    src/
    tests/
  config/
    src/
    tests/

templates/
  minimal/
  webapp/

recipes/
  prisma-postgresql/
  health-readiness/
  authentication/

docs/
  adr/
  development/
  public_documentation/
```

A fizikai szétválasztás nem jelenti azt, hogy a következő elemek már elkészültek:

- npm publication;
- template materializer;
- teljes `create-winzard` CLI;
- recipe dependency resolver;
- template–recipe drift engine.

Ezek külön mérföldkövek.

---

## 4. Capability manifest

### 4.1. Manifestforrás

A Forge az alábbi sorrendben keres manifestet:

1. `winzard.json`;
2. `package.json#winzard`.

A projektnek pontosan egy értelmezhető, támogatott szerződést kell adnia.

### 4.2. Minimális manifest

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

### 4.3. Webapp manifest

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

### 4.4. Manifestvalidáció

A Forge hibát ad, ha:

- a `schemaVersion` nem támogatott;
- a `profile` hiányzik vagy üres;
- a `capabilities` nem tömb;
- ismeretlen capability szerepel;
- ugyanaz a capability többször szerepel;
- egy capability kötelező függősége hiányzik;
- egy aktív capability kötelező fájlja hiányzik.

A capability sorrendje nem hordoz üzleti jelentést. A generátor stabil, determinisztikus sorrendet használhat a kimenethez.

---

## 5. Elsőként támogatott capability-k

| Capability | Jelentés | Kötelező következmény |
|---|---|---|
| `next-app` | Next.js App Router alkalmazás | `src/app`, Next.js és TypeScript konfiguráció. |
| `forge` | Forge-kompatibilis projekt | Érvényes Winzard manifest. |
| `presentation-contract` | Nézeti és UI-kompozíciós szerződés | View inventory, presentation architecture check és generált view-contract bizonyíték. |
| `modular-application` | Elkülönített application architektúra | `src/modules` és `src/composition`. |
| `liveness` | Folyamat-életjelzés | `no-store` liveness Route Handler. |
| `prisma-postgresql` | Prisma 7 és PostgreSQL adapter | Prisma schema/config, database env, database adapter. |
| `database-readiness` | Adatbázis-függő readiness | Readiness route és readiness adapter. |
| `authentication` | Auth adapter telepítve | Auth env contract és auth adapter. |

### 5.1. Capability-függőségek

```text
presentation-contract
  -> next-app
  -> forge

database-readiness
  -> prisma-postgresql

authentication
  -> next-app
  -> forge
```

A `database-readiness` önmagában érvénytelen. A Forge `CAPABILITY_DEPENDENCY_MISSING` hibát ad.

### 5.2. Amit a capability nem jelent

A `prisma-postgresql` nem engedi meg, hogy:

- a `page.tsx` közvetlenül Prisma Clientet importáljon;
- Client Component Prisma modellt kapjon;
- az application réteg ORM-típust exportáljon;
- a migráció automatikusan minden webpéldány indulásakor fusson.

Az `authentication` nem jelenti azt, hogy minden route automatikusan védett. Az auth adapter mellett külön policy és use-case szintű authorizáció szükséges.

A `presentation-contract` nem teszi a statikus elemzést runtime biztonsági kontrollá. A `view:check` a forrásszintű veszélyes mintákat, a view modellek és a Server/Client határ szerződését ellenőrzi; a production CSP, authorizáció, sanitizer review, accessibility és visual-regression kapuk továbbra is külön release-bizonyítékot igényelnek.

---

## 6. Application profile-ok

### 6.1. `minimal`

Tartalmazza:

- Next.js App Router;
- TypeScript;
- `src/app`;
- ESLint;
- Forge manifest;
- `presentation-contract` capability és Forge view-diagnosztika.

Nem tartalmaz alapértelmezetten:

- Prisma vagy más ORM;
- PostgreSQL driver;
- `prisma/` könyvtár;
- `compose.yaml`;
- `DATABASE_URL`;
- database readiness endpoint;
- auth adapter;
- `AUTH_SECRET`;
- reference demo;
- lucky-number E2E.

A minimal projektnek adatbázis és secret nélkül kell buildelnie.

### 6.2. `webapp`

A jelenlegi webapp template tartalmazza:

- a minimal képességeit;
- moduláris application struktúrát;
- liveness endpointot;
- Prisma/PostgreSQL adaptert;
- database readiness endpointot.

Az authentication külön recipe. A `webapp` profil önmagában nem követel `AUTH_SECRET` értéket.

### 6.3. `api`

Az API profil adatbázissal és adatbázis nélkül is értelmezhető.

```bash
create-winzard my-api --profile=api --database=none
create-winzard my-api --profile=api --database=postgresql
```

Az API-profil Route Handlerei delivery adapterek. Közvetlen ORM-hívás bennük továbbra is tiltott.

### 6.4. Reference profil

A reference profil a repository belső fixture-je. Nem fogyasztói bootstrap preset.

A referenciaalkalmazás manifestje jelenleg:

```json
{
  "schemaVersion": 1,
  "profile": "reference",
  "capabilities": [
    "next-app",
    "forge",
    "presentation-contract",
    "modular-application",
    "liveness"
  ]
}
```

---

## 7. Infrastruktúra-független build

### 7.1. Kötelező alapszabály

```json
{
  "scripts": {
    "build": "next build"
  }
}
```

A core build nem futtathat implicit módon:

```text
prisma generate
prisma migrate deploy
prisma db seed
docker compose up
forge env:check
külső API health check
```

### 7.2. Miért külön művelet a Prisma-generálás?

A Prisma Client-generálás:

- csak Prisma capability mellett értelmezhető;
- schema- és generatorfüggő;
- nem igényel élő adatbázist;
- nem lehet minden Next.js alkalmazás build-előfeltétele.

Explicit parancs:

```bash
pnpm db:generate
```

Repository webapp fixture esetén:

```bash
pnpm db:generate:webapp
```

### 7.3. Reference build

A repository jelenlegi root buildje:

```bash
next build apps/reference
```

Ez PostgreSQL service, `DATABASE_URL`, Prisma Client és auth secret nélkül fut.

### 7.4. Fogyasztói webapp build

Egy Prisma Clientet ténylegesen importáló webapp deployment pipeline külön futtatja:

```bash
pnpm db:generate
pnpm build
```

A két lépés explicit marad. A `build` script önmagában nem módosul adatbázis-specifikus wrapperré.

---

## 8. Környezeti konfiguráció capability szerint

### 8.1. Általános app env

```ts
import { z } from 'zod';

export const appEnvironmentSchema = z.object({
  APP_URL: z.url(),
  APP_NAME: z.string().trim().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1),
});

export function parseAppEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  return appEnvironmentSchema.parse(input);
}
```

A parser tiszta függvény. Nem parse-olja automatikusan a teljes `process.env` objektumot a modul betöltésekor.

### 8.2. Database env

Csak `prisma-postgresql` capability mellett:

```ts
import 'server-only';

import { z } from 'zod';

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//u),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100),
  DATABASE_CONNECTION_TIMEOUT_MS:
    z.coerce.number().int().positive(),
});

export function getDatabaseEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined> =
    process.env,
) {
  return databaseEnvironmentSchema.parse(input);
}
```

A database adapter vagy explicit env check hívja meg.

### 8.3. Auth env

Csak `authentication` capability mellett:

```ts
import 'server-only';

import { z } from 'zod';

export const authEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32),
});

export function getAuthEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined> =
    process.env,
) {
  return authEnvironmentSchema.parse(input);
}
```

Auth implementáció nélkül az `AUTH_SECRET` nem szerepel a core vagy webapp alapsémában.

### 8.4. Példa minimal env

A minimal profilnak nem kötelező `.env` fájl, ha nincs konfigurálható értéke.

Opcionális minta:

```dotenv
APP_URL=http://localhost:3000
APP_NAME=Winzard
LOG_LEVEL=debug
NEXT_PUBLIC_APP_NAME=Winzard
```

### 8.5. Példa database env

```dotenv
DATABASE_URL=postgresql://winzard:winzard_dev_only@localhost:5432/winzard?schema=public
DATABASE_POOL_MAX=10
DATABASE_CONNECTION_TIMEOUT_MS=5000
```

### 8.6. Példa auth env

```dotenv
AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
```

A secret nem kerülhet Gitbe vagy `NEXT_PUBLIC_` változóba.

---

## 9. Prisma Config és a `DATABASE_URL`

### 9.1. A korábbi hiba oka

Minden Prisma CLI-parancs betölti a `prisma.config.ts` fájlt. Ezért az alábbi konfiguráció már a betöltéskor hibázhat:

```ts
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

A `prisma generate` önmagában nem igényel adatbázis-kapcsolatot, mégis elbukhat a kötelező `env()` hívás miatt.

### 9.2. Támogatott konfiguráció

```ts
import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
```

### 9.3. Hol kötelező mégis az URL?

Fail-fast validáció szükséges:

- `prisma migrate deploy` előtt;
- `prisma migrate status` előtt;
- database client létrehozásakor;
- database readiness ellenőrzéskor;
- database integration teszt előtt.

Nem szükséges:

- core buildhez;
- reference buildhez;
- Forge AST architecture checkhez;
- adatbázis nélküli minimal projekthez.

### 9.4. Forge-szabály

`prisma-postgresql` capability mellett a Forge hibát ad, ha:

- a Prisma Config eager `env('DATABASE_URL')` hívást használ;
- nincs `process.env.DATABASE_URL` alapú opcionális konfiguráció;
- hiányzik a Prisma schema;
- hiányzik a database env contract.

---

## 10. Capability-aware Forge

### 10.1. Projekt megadása

```bash
pnpm forge check --project apps/reference
pnpm forge check --project templates/minimal
pnpm forge check --project templates/webapp
```

### 10.2. Core architecture szabályok

A Forge capability-től függetlenül ellenőrizheti:

- application réteg Next.js-, React-, Node- vagy infrastruktúra-importját;
- közvetlen ORM-importot az App Routerben;
- saját `/api` endpoint HTTP-hívását Server Componentből;
- Client Component szerveroldali importját;
- composition root `server-only` határát;
- Node runtime adapter `server-only` határát.

### 10.3. Feltételes fájlellenőrzések

Minimal manifest esetén nem kötelező:

```text
prisma/schema.prisma
prisma.config.ts
src/platform/database/
src/platform/auth/
src/app/api/health/live/
src/app/api/health/ready/
.env.example
compose.yaml
```

Webapp database manifest esetén kötelező lehet:

```text
prisma/schema.prisma
prisma.config.ts
src/platform/database/database-env.server.ts
src/app/api/health/ready/route.ts
```

### 10.4. Feltételes env check

```bash
pnpm forge env:check --project templates/webapp
```

A parancs csak az aktív capability-k változóit kéri számon.

### 10.5. Presentation-contract parancsok

```bash
pnpm forge view:list --project apps/reference
pnpm forge view:inspect LuckyNumberView --project apps/reference
pnpm forge view:check --project apps/reference
pnpm forge view:contracts --check --project apps/reference
pnpm forge view:assets --check --project apps/reference
pnpm forge make:view catalog/product/product-card --dry-run --project apps/reference
```

A `view:contracts` és `view:assets` determinisztikus, verziózott bizonyítékot ad a Page, Layout, `template.tsx`, loading/error/not-found boundaryk, Server/Client komponensek, view modellek, route builderek, assetek és kapcsolódó tesztek állapotáról.

---

## 11. Template- és recipe-határok

### 11.1. Minimal template

```text
templates/minimal/
```

A template saját `package.json` fájlja nem tartalmaz Prisma-, PostgreSQL- vagy auth-függőséget.

### 11.2. Webapp template

```text
templates/webapp/
```

Tartalmazhat:

- Prisma/PostgreSQL függőségeket;
- Prisma schemát és migrációs baseline-t;
- database env contractot;
- readiness endpointot;
- Docker Compose PostgreSQL szolgáltatást.

Nem tartalmaz automatikusan auth secretet.

### 11.3. Prisma/PostgreSQL recipe

```text
recipes/prisma-postgresql/
```

Tulajdona:

- Prisma runtime és development dependency-k;
- Prisma Config;
- Prisma schema;
- database env contract;
- database client adapter.

### 11.4. Health readiness recipe

```text
recipes/health-readiness/
```

Megköveteli:

```text
prisma-postgresql
```

Tulajdona:

- database readiness service;
- readiness Route Handler;
- `no-store` response policy.

### 11.5. Authentication recipe

```text
recipes/authentication/
```

Tulajdona:

- auth env contract;
- később auth adapter és wiring;
- `AUTH_SECRET` követelmény.

A jelenlegi recipe csak a szerződést rögzíti; teljes auth runtime nincs implementálva.

---

## 12. CI-szétválasztás

### 12.1. Core job

A core job nem indít PostgreSQL-t és nem kap database env változókat.

```text
install
typegen
typecheck
lint
unit tests
routing, delivery és view contract ellenőrzés
forge reference check
reference build
reference E2E
```

A core job bizonyítja, hogy:

- a reference app adatbázis nélkül buildel;
- a Forge architecture check nem igényel Prismát;
- a presentation-contract inventory és generált dokumentáció driftmentes;
- a lucky-number szelet nem szivárogtat infrastruktúrafüggést;
- nincs rejtett `DATABASE_URL` előfeltétel.

### 12.2. Database job

```text
start PostgreSQL
forge webapp capability check
forge database env check
prisma validate
prisma generate
prisma migrate deploy
```

A job kizárólag a `templates/webapp` adatbázisprofilját teszteli.

### 12.3. Auth job

A későbbi auth job külön fixture-ben fut:

```text
forge authentication capability check
forge auth env check
auth integration tests
```

A core job nem kap auth secretet.

### 12.4. Root parancsok

```json
{
  "scripts": {
    "verify": "pnpm verify:core",
    "verify:core": "...",
    "verify:database": "...",
    "test:e2e:reference": "..."
  }
}
```

A `test:e2e:reference` név jelzi, hogy a teszt nem fogyasztói template-követelmény.

---

## 13. Onboarding

### 13.1. Repository core fejlesztés

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm verify:core
pnpm dev
```

Nem szükséges:

```text
.env
Docker
PostgreSQL
DATABASE_URL
AUTH_SECRET
prisma generate
```

### 13.2. Webapp database fixture

```bash
export DATABASE_URL='postgresql://winzard:winzard_dev_only@127.0.0.1:5432/winzard?schema=public'
export DATABASE_POOL_MAX=10
export DATABASE_CONNECTION_TIMEOUT_MS=5000

docker compose -f templates/webapp/compose.yaml up -d postgres
pnpm verify:database
```

### 13.3. Minimal template ellenőrzése

```bash
pnpm forge check --project templates/minimal
```

Az ellenőrzésnek Prisma nélkül kell sikerülnie.

### 13.4. Reference app ellenőrzése

```bash
pnpm forge check --project apps/reference
pnpm build
pnpm test:e2e:reference
```

---

## 14. Migráció a korábbi root alkalmazásból

### 14.1. Reference kód áthelyezése

```text
src/app/
src/modules/demo/
src/composition/demo.ts
tools/e2e/lucky-number.smoke.ts
```

átkerül:

```text
apps/reference/src/app/
apps/reference/src/modules/demo/
apps/reference/src/composition/demo.ts
apps/reference/tests/e2e/
```

### 14.2. Forge áthelyezése

```text
tools/forge/
```

átkerül:

```text
packages/forge/
```

### 14.3. Database infrastruktúra áthelyezése

A rootból eltávolítandó:

```text
prisma/
prisma.config.ts
compose.yaml
src/platform/database/
src/app/api/health/ready/
```

A támogatott példány:

```text
templates/webapp/
recipes/prisma-postgresql/
recipes/health-readiness/
```

### 14.4. Auth env áthelyezése

A globális app env sémából eltávolítandó:

```text
AUTH_SECRET
```

A saját helye:

```text
recipes/authentication/files/src/platform/auth/auth-env.server.ts
```

### 14.5. Scriptnevek

Korábbi:

```json
{
  "build": "pnpm db:generate && next build",
  "test:e2e": "tsx tools/e2e/lucky-number.smoke.ts",
  "verify": "...database... && ...reference..."
}
```

Új:

```json
{
  "build": "next build apps/reference",
  "test:e2e:reference": "tsx apps/reference/tests/e2e/lucky-number.smoke.ts",
  "verify": "pnpm verify:core",
  "verify:database": "..."
}
```

---

## 15. Elfogadási feltételek

A capability-refaktor akkor tekinthető késznek, ha:

- [x] ADR rögzíti a három termékrészt;
- [x] a reference app az `apps/reference` alatt található;
- [x] a Forge a `packages/forge` alatt található;
- [x] létezik minimal és webapp template;
- [x] Prisma/PostgreSQL és auth külön recipe-határt kapott;
- [x] a root build nem futtat Prisma-parancsot;
- [x] a core env nem követel database vagy auth változót;
- [x] a Forge capability manifestből kapcsolja be a szabályokat;
- [x] a core CI PostgreSQL nélkül fut;
- [x] a database CI külön jobban fut;
- [x] a lucky-number reference E2E külön nevet kapott;
- [x] mindkét CI-job sikeres.

---

## 16. Tudatosan későbbre hagyott elemek

Nem része ennek a szeletnek:

- teljes resource-generátor;
- teljes recipe dependency resolver;
- template materializer;
- `create-winzard` stabil kiadása;
- auth runtime;
- több ORM-et kezelő általános adatbázis-abstrakció;
- általános Playwright-platform;
- npm publishing pipeline;
- template–recipe drift engine.

---

## 17. Források

- [ADR-0001 — Termékhatárok és opcionális capability-k](../adr/0001-product-boundaries-and-capabilities.md)
- [Prisma Config reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Next.js CLI reference](https://nextjs.org/docs/app/api-reference/cli/next)
- [Winzard setup dokumentáció](winzard-setup.md)
- [Winzard page creation dokumentáció](winzard-page-creation.md)
