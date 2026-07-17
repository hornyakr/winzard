---
title: "A Winzard telepítése és beállítása"
description: "Új és meglévő Winzard alkalmazások teljes fejlesztői környezetének létrehozása, ellenőrzése és futtatása."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-16"
source_basis: "Symfony Docs — Installing & Setting up the Symfony Framework"
---

# A Winzard telepítése és beállítása

## A dokumentum célja

Ez a dokumentum a Symfony **„Installing & Setting up the Symfony Framework”** oldalának Winzard-specifikus, önálló szakmai átültetése. Nem szó szerinti fordítás: a Symfony telepítési dokumentációjának funkcionális felépítését követi, de minden fogalmat, parancsot, fájlt és biztonsági szabályt a Winzard célarchitektúrájához igazít.

A dokumentum célja, hogy egy fejlesztő:

1. ellenőrizni tudja a gépe alkalmasságát;
2. létre tudjon hozni egy új Winzard alkalmazást;
3. be tudjon üzemelni egy már létező projektet;
4. el tudja indítani a helyi infrastruktúrát és a Next.js alkalmazást;
5. helyesen tudja kezelni a környezeti változókat, a Prisma Clientet és az adatbázis-migrációkat;
6. ellenőrizni tudja a projekt architektúráját, típusait, tesztjeit és függőségeit;
7. meg tudja különböztetni a fejlesztési, CI-, staging- és production workflow-kat.

A Winzardban a Next.js App Router a HTTP-, rendering- és UI-adapter. Az üzleti architektúra a `src/modules`, `src/platform` és `src/composition` rétegekben helyezkedik el. Az `app` könyvtár nem válhat közvetlen adatbázis-hozzáférési vagy üzleti logikai réteggé.

> [!IMPORTANT]
> A dokumentumban szereplő `create-winzard` és `forge` parancsok egy része **cél-CLI szerződés**. A dokumentáció előbb készül el, mint a teljes implementáció. Ahol egy parancs még nem tekinthető megvalósítottnak, a dokumentum külön megadja a használható manuális megfelelőjét is.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Technikai követelmények](#2-technikai-követelmények)
3. [A fejlesztői eszközlánc telepítése](#3-a-fejlesztői-eszközlánc-telepítése)
4. [A követelmények ellenőrzése](#4-a-követelmények-ellenőrzése)
5. [Új Winzard alkalmazás létrehozása](#5-új-winzard-alkalmazás-létrehozása)
6. [Manuális projekt-bootstrap](#6-manuális-projekt-bootstrap)
7. [A létrehozott projekt szerkezete](#7-a-létrehozott-projekt-szerkezete)
8. [Környezeti konfiguráció](#8-környezeti-konfiguráció)
9. [PostgreSQL és Prisma beállítása](#9-postgresql-és-prisma-beállítása)
10. [Meglévő Winzard projekt beüzemelése](#10-meglévő-winzard-projekt-beüzemelése)
11. [Winzard alkalmazás futtatása](#11-winzard-alkalmazás-futtatása)
12. [Docker-integráció](#12-docker-integráció)
13. [Csomagok telepítése és eltávolítása](#13-csomagok-telepítése-és-eltávolítása)
14. [Winzard recipe-k és presetek](#14-winzard-recipe-k-és-presetek)
15. [Biztonsági sérülékenységek ellenőrzése](#15-biztonsági-sérülékenységek-ellenőrzése)
16. [Verzió- és támogatási politika](#16-verzió--és-támogatási-politika)
17. [Referenciaalkalmazás](#17-referenciaalkalmazás)
18. [Az első modul létrehozása](#18-az-első-modul-létrehozása)
19. [Projektellenőrzések és CI](#19-projektellenőrzések-és-ci)
20. [Hibaelhárítás](#20-hibaelhárítás)
21. [Symfony–Winzard parancsmegfeleltetés](#21-symfonywinzard-parancsmegfeleltetés)
22. [Függelékek](#22-függelékek)
23. [Források és attribúció](#23-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott vagy biztonsági, reprodukálhatósági, illetve architekturális hibát okozhat;
- **TILOS / MUST NOT**: a megoldás nem használható Winzard-kompatibilis projektben;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni kell;
- **OPCIONÁLIS / MAY**: a projekt igénye szerint használható.

### 1.2. Fő komponensek

| Fogalom                  | Jelentés                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Winzard alkalmazás**   | A Next.js delivery réteget és a Winzard belső platformkonvencióit együtt tartalmazó alkalmazás.       |
| **`create-winzard`**     | Új projekt létrehozására szolgáló, tervezett bootstrap CLI.                                           |
| **`forge`**              | Projektlokális generáló, ellenőrző és diagnosztikai CLI.                                              |
| **Application profile**  | Az új projekt kezdő képességkészlete, például `webapp`, `api` vagy `minimal`.                         |
| **Resource profile**     | Egy erőforrás generálási mélysége, például `reference`, `crud`, `workflow`, `report` vagy `external`. |
| **Recipe**               | Egy csomag vagy képesség determinisztikus, diffelhető projektbe integrálási leírása.                  |
| **Preset**               | Több összetartozó csomagot és recipe-t összefogó telepítési profil.                                   |
| **Composition root**     | Az a szerveroldali réteg, ahol a portok konkrét adaptereket kapnak.                                   |
| **Generated code**       | A `forge` vagy a Prisma által determinisztikusan újra előállítható kód.                               |
| **Developer-owned code** | Egyszer létrehozott, utána kézzel karbantartott domain-, use-case-, policy- és adapterkód.            |

### 1.3. Parancsjelölések

A példákban:

```text
$ parancs
```

a terminálban futtatandó parancsot jelenti. A `$` karaktert nem kell begépelni.

A `<PROJECT_NAME>`, `<VERSION>` és hasonló elemek helyőrzők. Ezeket tényleges értékre kell cserélni.

### 1.4. A CLI-k státusza

A dokumentum három státuszt használ:

| Státusz                | Jelentés                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Upstream parancs**   | A Node.js, pnpm, Next.js, Prisma, Git vagy Docker jelenleg is használható parancsa. |
| **Winzard célparancs** | A `forge` vagy `create-winzard` elvárt, implementálandó nyilvános felülete.         |
| **Manuális megfelelő** | A célparancs hiányában közvetlenül végrehajtható lépéssor.                          |

---

## 2. Technikai követelmények

### 2.1. Támogatott operációs rendszerek

A Winzard fejlesztői környezet támogatási sorrendje:

1. Linux;
2. macOS;
3. Windows 11 WSL2 környezetben;
4. natív Windows, korlátozott támogatással.

A Next.js támogatja a macOS, Windows — beleértve a WSL-t — és Linux rendszereket. A Winzard ettől szigorúbb konvenciót alkalmazhat, mert a projektben POSIX shell parancsok, Docker, fájlfigyelés és platformfüggetlen CI is szerepelhet.

#### Windows-ajánlás

Windows alatt AJÁNLOTT:

- WSL2 használata;
- a projektet a Linux fájlrendszerben, például `~/projects/winzard-app` alatt tárolni;
- a Node.js-t és a pnpm-et a WSL disztribúción belül telepíteni;
- Docker Desktop WSL2 backendet használni;
- a projektet nem a `/mnt/c/...` útvonalon tartani, ha fájlfigyelési vagy teljesítményprobléma jelentkezik.

Natív Windows használatakor különösen figyelni kell:

- a CRLF/LF sorvégekre;
- a shell script kompatibilitására;
- a fájlútvonalak hosszára;
- a kis- és nagybetű-érzékenység különbségére;
- a Docker és a host közötti hálózati címzésre.

### 2.2. Kötelező szoftverek

#### Node.js

A Winzard alapértelmezett fejlesztési és production runtime-ja:

```text
Node.js 24.x LTS
```

Indoklás:

- a Next.js aktuális dokumentációja legalább Node.js 20.9-et kér;
- a pnpm 11 Node.js 22 vagy újabb környezetet igényel, ha nem standalone binárisból fut;
- a Prisma aktuális kiadása támogatja a Node.js 24-et;
- 2026. július 16-án a Node.js 24 támogatott LTS ág.

A projekt KÖTELEZŐEN rögzítse az elvárt Node főverziót legalább az alábbiak egyikével:

```text
.node-version
.nvmrc
.tool-versions
mise.toml
package.json#engines
package.json#devEngines
```

Ajánlott `.node-version`:

```text
24
```

Ajánlott `package.json` részlet:

```json
{
  "engines": {
    "node": ">=24 <25"
  }
}
```

> [!WARNING]
> Nem támogatott Node.js főverzió használata csak azért, mert a Next.js önmagában elindul rajta. A teljes kompatibilitási metszetet a Next.js, a Prisma, a pnpm és a Winzard eszközök együtt határozzák meg.

#### pnpm

A Winzard kizárólagos alapértelmezett package managere:

```text
pnpm 11.x
```

A konkrét pnpm verziót a projekt `packageManager` mezője KÖTELEZŐEN pontosan rögzíti:

```json
{
  "packageManager": "pnpm@<PINNED_PNPM_VERSION>"
}
```

A `pnpm-lock.yaml` fájlt KÖTELEZŐ verziókezelésbe tenni.

#### Git

Kötelező egy jelenleg támogatott Git kliens. A projekt setupja ellenőrizze legalább:

```bash
git --version
git config --get core.autocrlf
```

Ajánlott sorvég-konvenció:

```gitattributes
* text=auto eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
```

#### PostgreSQL

A Winzard elsődleges adatbázisa:

```text
PostgreSQL 18
```

A fejlesztői gépen a PostgreSQL lehet:

- Docker Compose szolgáltatás;
- helyi natív telepítés;
- távoli fejlesztői adatbázis;
- támogatott menedzselt PostgreSQL szolgáltatás.

A dokumentáció alapértelmezett és legjobban reprodukálható útja a Docker Compose.

#### Docker és Docker Compose

Docker OPCIONÁLIS az alkalmazáskód futtatásához, de AJÁNLOTT a helyi infrastruktúrához.

Követelmény:

- Docker Engine vagy Docker Desktop;
- Docker Compose v2, a `docker compose` parancsformával.

Ellenőrzés:

```bash
docker --version
docker compose version
```

A régi, különálló `docker-compose` parancs nem része a Winzard normatív példáinak.

### 2.3. Ajánlott hardver

Fejlesztői minimum:

| Erőforrás    |       Minimum |                Ajánlott |
| ------------ | ------------: | ----------------------: |
| Memória      |          8 GB |         16 GB vagy több |
| Szabad lemez |         10 GB |         25 GB vagy több |
| CPU          | 4 logikai mag | 8 logikai mag vagy több |

A nagyobb igény fő forrásai:

- Next.js fejlesztői bundler;
- TypeScript typecheck;
- Prisma generálás;
- Docker Desktop;
- PostgreSQL;
- Playwright böngészők;
- párhuzamos tesztfuttatás.

### 2.4. Támogatott böngészők

A Winzard alapértelmezésben a Next.js aktuális modern böngészőtámogatását követi. A setup dokumentáció ellenőrzési időpontjában ez legalább:

- Chrome 111+;
- Edge 111+;
- Firefox 111+;
- Safari 16.4+.

A projekt ettől szigorúbb `browserslist` vagy termékkövetelményt definiálhat.

### 2.5. Ajánlott fejlesztői eszközök

- Visual Studio Code vagy más TypeScript Language Service-t használó IDE;
- a repository workspace TypeScript-verziója;
- ESLint integráció;
- EditorConfig;
- Docker-integráció;
- Prisma nyelvi támogatás;
- Playwright-integráció;
- Git blame és diff támogatás.

VS Code esetén KÖTELEZŐEN a workspace TypeScript-verziót kell kiválasztani, nem az editor beépített, eltérő verzióját.

---

## 3. A fejlesztői eszközlánc telepítése

### 3.1. Node.js telepítése

A Node.js 24 LTS telepíthető:

- a hivatalos Node.js telepítőből;
- operációsrendszer-kompatibilis verziókezelővel;
- vállalati eszközmenedzsmentből;
- reprodukálható fejlesztői konténerből.

A Winzard nem ír elő egyetlen Node verziókezelőt, de a repository által rögzített verziót használni kell.

Ellenőrzés:

```bash
node --version
```

Elvárt főverzió:

```text
v24.x.x
```

Az npm a Node telepítésével együtt érkezik, de a projekt függőségeit nem npm-mel kell kezelni.

### 3.2. Corepack és pnpm telepítése

A pnpm hivatalos dokumentációja a Corepack használata előtt a Corepack frissítését ajánlja.

```bash
npm install --global corepack@latest
corepack enable pnpm
```

Meglévő projektben a `packageManager` mező alapján:

```bash
corepack install
pnpm --version
```

Új Winzard platformrepo kezdeti rögzítésekor:

```bash
corepack use pnpm@latest-11
```

Ez a parancs módosítja a `package.json` `packageManager` mezőjét. Már létező alkalmazásban nem szabad önkényesen új pnpm verzióra átírni; előbb külön dependency/toolchain frissítési feladat szükséges.

> [!IMPORTANT]
> A `next`, `prisma`, `tsx`, `vitest`, `playwright` és `forge` eszközöket nem kell globálisan telepíteni. A projektlokális verziót `pnpm` scripten vagy `pnpm exec` parancson keresztül kell futtatni.

### 3.3. Git telepítése és konfigurálása

Ellenőrzés:

```bash
git --version
```

Ajánlott globális beállítások POSIX környezetben:

```bash
git config --global core.autocrlf input
git config --global init.defaultBranch main
```

Natív Windows alatt a szervezet Git-konvenciója az irányadó, de a repository `.gitattributes` fájlja legyen a végső forrás.

### 3.4. Docker telepítése

macOS és Windows alatt a Docker Desktop a legegyszerűbb út, és tartalmazza a Docker Engine, CLI és Compose komponenseket.

Linuxon használható:

- Docker Engine;
- Docker CLI;
- Docker Compose plugin.

Ellenőrzés:

```bash
docker version
docker compose version
docker run --rm hello-world
```

A `hello-world` konténer csak a telepítés ellenőrzésére szolgál, utána automatikusan leáll.

---

## 4. A követelmények ellenőrzése

### 4.1. Winzard célparancs

A Symfony `check:requirements` parancsának Winzard megfelelője:

```bash
pnpm forge doctor
```

A `forge doctor` célzott ellenőrzései:

1. operációs rendszer és architektúra;
2. Node.js verzió;
3. pnpm verzió és `packageManager` egyezés;
4. Git elérhetőség;
5. Docker és Compose elérhetőség, ha a projekt Docker-profilt használ;
6. kötelező portok foglaltsága;
7. `.env` megléte;
8. környezeti schema validitása;
9. PostgreSQL elérhetőség;
10. Prisma schema validitása;
11. Prisma Client generáltsága és frissessége;
12. migrációs állapot;
13. írhatósági ellenőrzés a generált és cache könyvtárakon;
14. architekturális konfiguráció megléte;
15. projektverziók és lockfile-konzisztencia.

A parancs géppel feldolgozható módja:

```bash
pnpm forge doctor --json
```

Elvárt exit code-ok:

| Kód | Jelentés                                   |
| --: | ------------------------------------------ |
| `0` | Minden kötelező ellenőrzés sikeres.        |
| `1` | Egy vagy több projektkövetelmény hibás.    |
| `2` | Hibás CLI használat.                       |
| `3` | Környezeti vagy rendszerfüggőség hiányzik. |
| `4` | Projekt- vagy generálási drift található.  |

### 4.2. Manuális ellenőrzés

Amíg a `forge doctor` nem érhető el teljesen:

```bash
node --version
pnpm --version
git --version
docker --version
docker compose version
pnpm exec next info
pnpm exec prisma version
pnpm exec prisma validate
```

Adatbázis-elérhetőség:

```bash
docker compose ps
docker compose exec postgres pg_isready \
  --username=winzard \
  --dbname=winzard
```

Migrációs állapot:

```bash
pnpm exec prisma migrate status
```

Projektellenőrzés:

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

---

## 5. Új Winzard alkalmazás létrehozása

### 5.1. Ajánlott cél-CLI

A tervezett elsődleges projektlétrehozó parancs:

```bash
pnpm dlx create-winzard@latest my-project \
  --profile=webapp \
  --database=postgresql
```

Majd:

```bash
cd my-project
pnpm dev
```

> [!WARNING]
> A fenti `create-winzard` parancs csak akkor használható ténylegesen, amikor a csomag publikálva és a repository által támogatott. Addig a [manuális projekt-bootstrap](#6-manuális-projekt-bootstrap) az irányadó.

### 5.2. Alkalmazásprofilok

#### `webapp`

A teljes, általános Winzard alkalmazásprofil.

Tartalma:

- Next.js App Router;
- TypeScript;
- `src/` könyvtár;
- ESLint;
- Tailwind CSS;
- Turbopack;
- Prisma és PostgreSQL adapter;
- Zod környezeti és transport validáció;
- `server-only` határjelölés;
- moduláris domain/application struktúra;
- composition root;
- policy és actor alapok;
- admin route group;
- Vitest;
- Playwright;
- `forge` CLI;
- Docker Compose PostgreSQL szolgáltatás;
- health endpoint skeleton;
- referencia `.env.example`;
- CI workflow skeleton.

Parancs:

```bash
pnpm dlx create-winzard@latest my-project --profile=webapp
```

#### `minimal`

A legkisebb támogatott Winzard alkalmazásmag.

Tartalma:

- Next.js App Router;
- TypeScript;
- alap `src/app`;
- `src/modules`, `src/platform`, `src/composition`;
- Zod;
- `server-only`;
- `forge check`;
- tesztelési minimum.

Nem tartalmaz alapértelmezett:

- adatbázis-adaptert;
- admin UI-t;
- auth providert;
- Playwright böngészőket;
- Docker Compose fájlt.

Parancs:

```bash
pnpm dlx create-winzard@latest my-project --profile=minimal
```

#### `api`

HTTP API-központú profil.

Tartalma:

- Next.js App Router;
- Route Handler alapok;
- application és domain réteg;
- Prisma/PostgreSQL;
- request/response schema;
- policy;
- rate-limit port;
- OpenAPI adapter számára előkészített struktúra;
- minimális vagy semmilyen felhasználói UI.

Parancs:

```bash
pnpm dlx create-winzard@latest my-service --profile=api
```

> [!NOTE]
> Az `api` profil sem engedi, hogy a Route Handler közvetlenül Prisma-hívásokat tartalmazzon. A Route Handler nyilvános HTTP-adapter, amely use case-t hív.

### 5.3. Tervezett CLI opciók

| Opció                            | Jelentés                                                                |
| -------------------------------- | ----------------------------------------------------------------------- |
| `--profile=webapp\|minimal\|api` | Kezdő alkalmazásprofil.                                                 |
| `--database=postgresql`          | Adatbázis-adapter. Az első stabil verzióban csak PostgreSQL támogatott. |
| `--version=<channel-or-version>` | Winzard verziócsatorna vagy konkrét verzió.                             |
| `--with-docker`                  | Docker Compose infrastruktúra létrehozása.                              |
| `--without-docker`               | Dockerfájlok kihagyása.                                                 |
| `--with-example=product`         | Referenciamodul hozzáadása.                                             |
| `--with-worker`                  | Külön worker entrypoint és outbox/queue port létrehozása.               |
| `--no-install`                   | Fájlok létrehozása dependency install nélkül.                           |
| `--no-git`                       | Git repository inicializálásának kihagyása.                             |
| `--dry-run`                      | Tervezett fájlműveletek megjelenítése írás nélkül.                      |
| `--json`                         | Géppel feldolgozható kimenet.                                           |
| `--yes`                          | Interaktív kérdések elfogadása alapértékekkel.                          |

### 5.4. A projektlétrehozó elvárt működése

A `create-winzard` KÖTELEZŐEN:

1. validálja a projekt nevét és célkönyvtárát;
2. ne írjon felül nem üres könyvtárat explicit engedély nélkül;
3. oldja fel a kívánt Winzard verziót;
4. másolja a kiválasztott template-et;
5. írja át a projektnevet és namespace-eket;
6. rögzítse a Node és pnpm verziót;
7. állítsa be a `packageManager` mezőt;
8. hozza létre a `pnpm-lock.yaml` fájlt dependency install esetén;
9. hozza létre a `.env.example` fájlt;
10. ne generáljon valós secretet verziókezelt fájlba;
11. konfigurálja a Prisma kimeneti könyvtárát;
12. telepítse vagy előkészítse a `forge` CLI-t;
13. opcionálisan inicializálja a Git repositoryt;
14. fusson le legalább a config-, schema- és typecheck minimum;
15. hiba esetén ne hagyjon félkész, sikeresnek látszó állapotot;
16. a végén egyértelmű következő lépéseket írjon ki.

### 5.5. Verzióválasztás

Tervezett parancsok:

```bash
# aktuális stabil Winzard
pnpm dlx create-winzard@latest my-project --version=stable

# jövőbeli LTS ág
pnpm dlx create-winzard@latest my-project --version=lts

# előzetes, nem production csatorna
pnpm dlx create-winzard@latest my-project --version=next

# konkrét verzió
pnpm dlx create-winzard@latest my-project --version=1.4.2
```

Amíg nincs hivatalos LTS kiadás, a `--version=lts` parancsnak hibával és magyarázattal kell leállnia; nem szabad csendben a stable csatornára esnie.

---

## 6. Manuális projekt-bootstrap

Ez a fejezet a `create-winzard` implementáció elkészülte előtt is végrehajtható.

### 6.1. Next.js projekt létrehozása

```bash
pnpm create next-app@latest my-project \
  --ts \
  --eslint \
  --tailwind \
  --app \
  --src-dir \
  --turbopack \
  --import-alias="@/*" \
  --use-pnpm \
  --empty
```

Belépés:

```bash
cd my-project
```

A Next.js aktuális `create-next-app` parancsa támogatja a fenti TypeScript-, ESLint-, Tailwind-, App Router-, `src`-, Turbopack- és importalias-opciókat.

### 6.2. ESM bekapcsolása

A Prisma 7 ESM-first működése miatt a `package.json` tartalmazza:

```json
{
  "type": "module"
}
```

A módosítás után minden saját Node.js scriptet, Prisma seedet és `forge` belépési pontot ESM-kompatibilisen kell írni.

### 6.3. Alap runtime függőségek

```bash
pnpm add \
  zod \
  server-only \
  @prisma/client \
  @prisma/adapter-pg \
  pg
```

A csomagok szerepe:

| Csomag               | Feladat                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `zod`                | Környezeti, transport- és műveletspecifikus schema validáció.      |
| `server-only`        | Szerveroldali modulok kliensoldali importjának buildidejű tiltása. |
| `@prisma/client`     | Prisma Client runtime.                                             |
| `@prisma/adapter-pg` | PostgreSQL driver adapter Prisma 7-hez.                            |
| `pg`                 | PostgreSQL Node.js driver és connection pool.                      |

### 6.4. Alap fejlesztői függőségek

```bash
pnpm add --save-dev \
  prisma \
  dotenv \
  tsx \
  @types/pg
```

Tesztelési teljes profil:

```bash
pnpm add --save-dev \
  vitest \
  @vitest/coverage-v8 \
  @playwright/test
```

A Playwright böngészők telepítése:

```bash
pnpm exec playwright install
```

Linux CI vagy tiszta Linux gép esetén szükség lehet:

```bash
pnpm exec playwright install --with-deps
```

### 6.5. Könyvtárstruktúra létrehozása

```bash
mkdir -p \
  src/modules \
  src/platform/auth \
  src/platform/cache \
  src/platform/config \
  src/platform/database \
  src/platform/events \
  src/platform/result \
  src/composition \
  src/generated \
  tools/forge/commands \
  tools/forge/generators \
  tools/forge/schema \
  tools/forge/templates \
  tools/forge/checks \
  prisma/migrations \
  tests/integration \
  tests/e2e
```

A `mkdir -p` POSIX parancs. Natív PowerShell alatt a könyvtárak létrehozhatók `New-Item -ItemType Directory -Force` használatával, de a Winzard kanonikus fejlesztői környezete POSIX vagy WSL2.

### 6.6. Ajánlott `package.json` scriptek

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "pnpm run db:generate && next build",
    "start": "next start",

    "typegen": "next typegen",
    "typecheck": "pnpm run typegen && tsc --noEmit",

    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",

    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",

    "db:validate": "prisma validate",
    "db:format": "prisma format",
    "db:generate": "prisma generate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:migrate:status": "prisma migrate status",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",

    "forge": "tsx tools/forge/cli.ts",
    "check:architecture": "pnpm forge check",
    "check:security": "pnpm audit --audit-level high",

    "verify": "pnpm run db:validate && pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
  }
}
```

> [!NOTE]
> A `build` script explicit `db:generate` lépése szándékos. Prisma 7 alatt a `migrate dev` már nem garantálja a kliens automatikus generálását.

### 6.7. Első Git commit előtti minimum

```bash
pnpm db:validate
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Csak sikeres ellenőrzések után:

```bash
git add .
git commit -m "chore: bootstrap Winzard application"
```

---

## 7. A létrehozott projekt szerkezete

Egy `webapp` profil elvárt kezdő szerkezete:

```text
my-project/
├── .env.example
├── .gitattributes
├── .gitignore
├── .node-version
├── compose.yaml
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── prisma.config.ts
├── tsconfig.json
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│
├── public/
│
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   ├── api/
│   │   │   └── health/
│   │   │       ├── live/route.ts
│   │   │       └── ready/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── modules/
│   │
│   ├── platform/
│   │   ├── auth/
│   │   ├── cache/
│   │   ├── config/
│   │   ├── database/
│   │   ├── events/
│   │   └── result/
│   │
│   ├── composition/
│   │
│   └── generated/
│       └── prisma/
│
├── tools/
│   └── forge/
│       ├── cli.ts
│       ├── commands/
│       ├── generators/
│       ├── schema/
│       ├── templates/
│       └── checks/
│
└── tests/
    ├── integration/
    └── e2e/
```

### 7.1. Írható és generált könyvtárak

Fejlesztés és build közben írhatónak kell lennie:

```text
.next/
node_modules/
src/generated/
coverage/
test-results/
playwright-report/
```

Ezek közül:

- `.next/` nincs verziókezelésben;
- `node_modules/` nincs verziókezelésben;
- `coverage/`, `test-results/`, `playwright-report/` nincs verziókezelésben;
- `src/generated/prisma/` kezelése projektpolitika kérdése.

Winzard alapértelmezett politika:

- a Prisma generált kliens **nem kerül commitba**;
- CI és production build előtt mindig lefut a `prisma generate`;
- a `forge` által generált, stabil contract- vagy registryfájlok commitolhatók, ha a drift check erre épül;
- minden generált fájl fejlécben jelzi a generátort és a schema hashét.

### 7.2. Függőségi irány

```text
app / presentation
        |
        v
   application
        |
        v
      domain

infrastructure ---> application ports / domain

composition root ---> application + infrastructure
```

Kötelező szabályok:

- `domain` nem importálhat Next.js-, React-, Prisma- vagy UI-kódot;
- `application` nem importálhat konkrét Prisma repositoryt;
- `infrastructure` implementálja a portokat;
- `composition` köti össze a konkrét implementációkat;
- `app` és `presentation` use case-eket és DTO-kat hív;
- Client Component nem importálhat szerveroldali application/infrastructure modult;
- `src/app/**` alatt közvetlen `prisma.*` hívás tiltott;
- Prisma által generált modell nem lehet publikus kliens DTO.

---

## 8. Környezeti konfiguráció

### 8.1. Környezeti fájlok

A Winzard alapértelmezett konvenciója:

| Fájl           | Commitolható              | Feladat                                                                        |
| -------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `.env.example` | Igen                      | Minden támogatott változó dokumentált, titok nélküli mintája.                  |
| `.env`         | Nem                       | Helyi fejlesztői környezet kanonikus értékei, a Next.js és Prisma CLI számára. |
| `.env.local`   | Nem                       | Opcionális, kizárólag Next.js-specifikus helyi felülírás.                      |
| `.env.test`    | Nem vagy sanitizált minta | Tesztkörnyezet értékei.                                                        |
| production env | Nem fájlban               | Deployment platform secret/config store-jából.                                 |

> [!IMPORTANT]
> Az adatbázis-kapcsolatot ne csak `.env.local` tartalmazza, mert a Prisma CLI `dotenv/config` alapbeállításban a `.env` fájlt tölti be. A Next.js és a Prisma eltérő értékkészlete rejtett hibákat okozna.

### 8.2. `.gitignore`

Minimum:

```gitignore
# dependencies
/node_modules

# next
/.next
/out
/next-env.d.ts

# environment
.env
.env.*
!.env.example

# generated/runtime
/coverage
/test-results
/playwright-report

# local tooling
.DS_Store
*.log
```

Ha `.env.test.example` fájlt is commitolni kell:

```gitignore
!.env.test.example
```

### 8.3. `.env.example`

Példa:

```dotenv
# Application
APP_URL=http://localhost:3000
APP_NAME=Winzard
LOG_LEVEL=debug

# Browser-safe, build-time value
NEXT_PUBLIC_APP_NAME=Winzard

# Database
DATABASE_URL=postgresql://winzard:winzard_dev_only@localhost:5432/winzard?schema=public

# Authentication adapter
AUTH_SECRET=replace-with-a-long-random-secret

# Optional integrations
# REDIS_URL=redis://localhost:6379
# SENTRY_DSN=
```

Helyi fájl létrehozása:

```bash
cp .env.example .env
```

Secret generálása például:

```bash
openssl rand -base64 48
```

A generált értéket kizárólag a nem verziókezelt `.env` fájlba vagy secret store-ba szabad tenni.

### 8.4. Szerver- és kliensváltozók

A Next.js csak a `NEXT_PUBLIC_` előtagú változókat teszi elérhetővé a böngésző bundle-ben.

Következmények:

- `DATABASE_URL`, `AUTH_SECRET`, privát API-kulcs vagy encryption key soha nem kaphat `NEXT_PUBLIC_` előtagot;
- `NEXT_PUBLIC_` változó értéke buildidőben beégethető;
- ugyanaz a build artifact nem feltétlenül reagál a később megváltoztatott public env értékre;
- runtime secretet szerveroldali kódból kell olvasni.

### 8.5. Környezeti schema

Ajánlott fájl:

```text
src/platform/config/env.server.ts
```

Példa:

```ts
import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  APP_URL: z.string().url(),
  APP_NAME: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
});

const parsed = serverEnvironmentSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid server environment: ${parsed.error.message}`);
}

export const serverEnvironment = parsed.data;
```

Kliensoldali schema külön fájlban:

```text
src/platform/config/env.public.ts
```

```ts
import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1),
});

export const publicEnvironment = publicEnvironmentSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});
```

A két schema szétválasztása csökkenti annak kockázatát, hogy szerversecret kliensoldali importláncba kerüljön.

### 8.6. Konfigurációs prioritás

Ajánlott sorrend:

1. deployment platform által adott runtime environment;
2. helyi `.env.local` Next.js-felülírás, ahol indokolt;
3. helyi `.env`;
4. kódbeli, kizárólag nem érzékeny default.

Secretnek nem lehet kódbeli defaultja.

### 8.7. Környezeti drift ellenőrzése

Tervezett parancs:

```bash
pnpm forge env:check
```

Ellenőrzések:

- minden kötelező változó dokumentált-e `.env.example` fájlban;
- nincs-e ismeretlen változó;
- nincs-e secret `NEXT_PUBLIC_` névvel;
- megfelelnek-e az értékek a Zod schemának;
- nincs-e `.env` staged állapotban;
- a CI-required és local-only változók külön vannak-e jelölve.

---

## 9. PostgreSQL és Prisma beállítása

### 9.1. Prisma inicializálása

Ha a manuális bootstrap során még nincs Prisma konfiguráció:

```bash
pnpm exec prisma init \
  --datasource-provider postgresql \
  --output ../src/generated/prisma
```

A parancs létrehozza legalább:

```text
prisma/schema.prisma
prisma.config.ts
```

A generált fájlokat a Winzard konvencióihoz kell igazítani.

### 9.2. `prisma.config.ts`

Ajánlott konfiguráció:

```ts
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

Feladatok:

- a Prisma schema helyének rögzítése;
- migrációs könyvtár rögzítése;
- seed parancs rögzítése;
- `DATABASE_URL` betöltése.

### 9.3. `prisma/schema.prisma`

Kezdő fájl:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Prisma 7-ben a `prisma-client` generator `output` mezője kötelező.

### 9.4. Prisma Client példány

Ajánlott fájl:

```text
src/platform/database/client.ts
```

```ts
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { serverEnvironment } from "@/platform/config/env.server";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: serverEnvironment.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

Célok:

- egyetlen Prisma Client példány fejlesztői hot reload mellett;
- szerveroldali importhatár;
- validált konfiguráció;
- PostgreSQL driver adapter használata;
- központi infrastruktúra-beléptetési pont.

> [!WARNING]
> A `db` objektumot csak infrastructure és composition kód importálhatja. `page.tsx`, Client Component vagy domain kód nem.

### 9.5. Prisma Client generálása

```bash
pnpm db:generate
```

Kötelező újragenerálni:

- schema módosítás után;
- generator beállítás módosítása után;
- új branch vagy dependency verzió váltása után;
- production build előtt.

### 9.6. Első migráció

Egy minimális modell hozzáadása után:

```bash
pnpm db:migrate:dev --name init
pnpm db:generate
```

A `migrate dev`:

- kizárólag fejlesztői adatbázison használható;
- shadow database segítségével driftet vizsgál;
- létrehozza és alkalmazza a migrációt;
- Prisma 7 alatt nem helyettesíti az explicit `prisma generate` vagy `prisma db seed` futtatást.

### 9.7. Migrációs szabályok

KÖTELEZŐ:

- minden tartós schema változás migrációval történjen;
- a generált SQL-t commit előtt át kell nézni;
- alkalmazott migrációt utólag nem szabad csendben átírni;
- destructive változásnál külön adatmentési és rollout terv kell;
- production környezetben kizárólag `prisma migrate deploy` használható;
- a migráció fusson az alkalmazás új verziójának élesítése előtt vagy a deployment kontrollált lépéseként.

TILOS production környezetben:

```bash
prisma migrate dev
prisma migrate reset
prisma db push
```

A `db push` csak eldobható prototípusban engedélyezhető külön döntéssel; Winzard normatív alkalmazásfejlesztésben nem része a migrációs workflow-nak.

### 9.8. Meglévő migrációk alkalmazása

Friss checkout vagy CI/staging környezet:

```bash
pnpm db:migrate:deploy
```

Állapotellenőrzés:

```bash
pnpm db:migrate:status
```

### 9.9. Seed

`prisma.config.ts`:

```ts
migrations: {
  path: 'prisma/migrations',
  seed: 'tsx prisma/seed.ts',
},
```

Futtatás:

```bash
pnpm db:seed
```

Prisma 7-ben a seed explicit parancs; a migráció vagy reset nem futtatja automatikusan.

A seed legyen:

- ismételten futtatható vagy egyértelműen egyszeri;
- determinisztikus;
- környezetérzékeny;
- production esetén külön engedélyezett;
- secretet és valós személyes adatot nem tartalmazó.

Ajánlott seed módok:

```bash
pnpm db:seed -- --profile=reference
pnpm db:seed -- --profile=test
```

A seed scriptnek ismeretlen profilt hibával kell elutasítania.

### 9.10. Adatbázis reset

Fejlesztői, teljes adatvesztéssel járó művelet:

```bash
pnpm exec prisma migrate reset
pnpm db:generate
pnpm db:seed
```

> [!DANGER]
> A reset minden adatot törölhet. A Winzard későbbi `forge db:reset` wrapperének interaktív megerősítést, környezetellenőrzést és production tiltást kell tartalmaznia.

### 9.11. Prisma Studio

```bash
pnpm db:studio
```

A Prisma Studio fejlesztői diagnosztikai eszköz. Nem helyettesíti:

- az admin UI-t;
- az application use case-eket;
- a policy ellenőrzést;
- az audittal ellátott üzleti műveleteket.

Production adatbázishoz alapértelmezésben nem szabad közvetlenül használni.

---

## 10. Meglévő Winzard projekt beüzemelése

### 10.1. Gyors onboarding

```bash
git clone <REPOSITORY_URL>
cd <PROJECT_DIRECTORY>

corepack install
pnpm install --frozen-lockfile

cp .env.example .env
# szerkeszd a .env fájlt

docker compose up --detach postgres

pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed

pnpm forge doctor
pnpm forge check

pnpm dev
```

### 10.2. Részletes folyamat

#### 1. Repository klónozása

```bash
mkdir -p ~/projects
cd ~/projects
git clone <REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

#### 2. Branch és submodule ellenőrzése

```bash
git status
git branch --show-current
git submodule update --init --recursive
```

A submodule parancs csak akkor szükséges, ha a repository ténylegesen használ submodule-t.

#### 3. Node és pnpm verzió

```bash
cat .node-version
node --version

corepack install
pnpm --version
```

Eltérés esetén előbb az eszközverziót kell javítani; nem szabad a repository verziófájlját lokálisan átírni.

#### 4. Függőségek telepítése

```bash
pnpm install --frozen-lockfile
```

A `--frozen-lockfile` biztosítja, hogy a telepítés ne írja át csendben a lockfile-t. CI-ben a pnpm jelenlegi működése lockfile-eltérésnél eleve hibát ad, de a flag lokálisan is egyértelművé teszi a szándékot.

Ha a telepítés lockfile-eltérés miatt hibázik:

- ne töröld automatikusan a lockfile-t;
- ellenőrizd a Node és pnpm verziót;
- ellenőrizd, hogy a megfelelő branch van-e checkoutolva;
- csak tudatos dependency változtatásnál futtass nem frozen installt.

#### 5. Környezeti fájl

```bash
cp .env.example .env
```

Ezután töltsd ki a projekt README-je vagy secret manager alapján.

Soha ne másolj production secretet helyi fájlba, ha nincs rá kifejezett, auditált folyamat.

#### 6. Infrastruktúra indítása

```bash
docker compose up --detach postgres
docker compose ps
```

Várd meg a `healthy` állapotot:

```bash
docker compose exec postgres pg_isready \
  --username=winzard \
  --dbname=winzard
```

#### 7. Prisma Client

```bash
pnpm db:generate
```

#### 8. Migráció

Friss, meglévő migrációs történet alkalmazása:

```bash
pnpm db:migrate:deploy
```

Fejlesztőként `migrate dev` csak akkor kell, amikor új schema változáshoz migrációt készítesz.

#### 9. Seed

```bash
pnpm db:seed
```

Ha a projekt nem igényel seedet, a parancsot a project-specific setup dokumentáció kihagyhatja.

#### 10. Projektinformáció

Symfony `bin/console about` megfelelő célparancsa:

```bash
pnpm forge about
```

Elvárt információk:

- projekt neve;
- Winzard platformverzió;
- generatorverzió;
- Node és pnpm verzió;
- Next.js, React, Prisma verzió;
- aktív application profile;
- aktív környezet;
- adatbázis provider;
- migrációs állapot;
- ismert modulok;
- resource manifestek száma;
- generált kód drift állapota;
- Docker szolgáltatások állapota.

#### 11. Teljes ellenőrzés

```bash
pnpm forge doctor
pnpm verify
```

#### 12. Fejlesztői szerver

```bash
pnpm dev
```

Alapértelmezett cím:

```text
http://localhost:3000
```

---

## 11. Winzard alkalmazás futtatása

### 11.1. Helyi fejlesztői szerver

```bash
pnpm dev
```

A Next.js fejlesztői szerver:

- Hot Module Replacementet;
- fejlesztői hibajelentést;
- route fordítást;
- Server és Client Component bundlingot;
- Turbopack alapértelmezett bundlert

biztosít.

A folyamat a terminált foglalja. Leállítás:

```text
Ctrl+C
```

### 11.2. Másik port

```bash
pnpm exec next dev --port 3001
```

Vagy:

```bash
PORT=3001 pnpm dev
```

PowerShellben:

```powershell
$env:PORT=3001
pnpm dev
```

> [!IMPORTANT]
> A `PORT` értéket ne `.env` fájlban konfiguráld. A Next.js HTTP-szerverének indulása megelőzi az alkalmazásszintű környezeti fájlok betöltését; használd a CLI `--port` opcióját vagy a folyamat környezetét.

### 11.3. Hálózati elérés

A fejlesztői szerver alapértelmezett hostja a Next.js aktuális CLI szerint `0.0.0.0`, de hálózati megosztásnál explicit érték ajánlott:

```bash
pnpm exec next dev --hostname 0.0.0.0 --port 3000
```

Hálózati elérés csak megbízható fejlesztői hálózaton és megfelelő tűzfal mellett engedélyezhető.

### 11.4. Fejlesztői HTTPS

```bash
pnpm exec next dev --experimental-https
```

Saját kulcs és tanúsítvány esetén:

```bash
pnpm exec next dev \
  --experimental-https \
  --experimental-https-key ./certs/local-key.pem \
  --experimental-https-cert ./certs/local-cert.pem
```

A `certs/` privát kulcsait nem szabad commitolni.

### 11.5. Webpack fallback

Turbopack a Next.js aktuális alapértelmezett bundlere. Ha egy integráció kizárólag Webpack pluginnal működik:

```bash
pnpm exec next dev --webpack
```

Production build fallback:

```bash
pnpm exec next build --webpack
```

Az eltérést ADR-ben vagy project-specific dokumentációban indokolni kell.

### 11.6. Production build helyi ellenőrzése

```bash
pnpm build
pnpm start
```

Ez nem ugyanaz, mint a `pnpm dev`. A production build:

- optimalizált artifactot készít;
- feltárhat csak buildkor jelentkező server/client hibákat;
- ellenőrzi a route-okat;
- prerenderelési hibákat jelezhet;
- a `next start` előtt kötelező.

### 11.7. Next.js diagnosztika

```bash
pnpm exec next info
pnpm exec next info --verbose
```

Route típusgenerálás:

```bash
pnpm typegen
```

Build debug:

```bash
pnpm exec next build --debug
```

### 11.8. Health endpointok

Ajánlott:

```text
GET /api/health/live
GET /api/health/ready
```

#### Liveness

A folyamat él-e:

```json
{
  "status": "ok"
}
```

Nem végez lassú adatbázis-lekérdezést.

#### Readiness

Képes-e forgalmat fogadni:

- környezeti config valid;
- adatbázis elérhető;
- kötelező migrációk alkalmazva;
- kritikus adapterek inicializálhatók.

A readiness válasz nem tartalmazhat:

- connection stringet;
- secretet;
- stack trace-t;
- belső infrastruktúra-részleteket anonim kliensnek.

### 11.9. Production futtatási elvek

Production környezetben:

- `next dev` TILOS;
- build és runtime lépés különválasztandó;
- az env változókat a platform adja;
- a migráció kontrollált deployment lépés;
- az alkalmazás reverse proxy vagy platform load balancer mögött fut;
- a folyamatnak kezelnie kell a leállítási jeleket;
- a log stdout/stderr irányba strukturáltan menjen;
- health checkek legyenek konfigurálva;
- az adatbázis connection pool mérete igazodjon a példányszámhoz.

---

## 12. Docker-integráció

### 12.1. Ajánlott fejlesztői modell

Mac és Windows fejlesztésnél a Winzard alapértelmezés szerint a hoston futtatja a Node.js/Next.js fejlesztői folyamatot, az állapottartó infrastruktúrát pedig Docker Compose-ban. Ez egyszerűbb fájlfigyelést, közvetlen IDE-integrációt és kisebb fejlesztői konténerkomplexitást ad.

Winzard alapértelmezett modell:

```text
Host:
  Node.js
  pnpm
  Next.js dev server
  forge CLI

Docker Compose:
  PostgreSQL
  opcionális Redis
  opcionális mail catcher
  opcionális object storage emulator
```

Előny:

- gyorsabb fájlfigyelés;
- jobb IDE-integráció;
- reprodukálható infrastruktúra;
- kisebb fejlesztői Dockerfile-komplexitás.

### 12.2. Példa `compose.yaml`

```yaml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: winzard
      POSTGRES_USER: winzard
      POSTGRES_PASSWORD: winzard_dev_only
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - winzard_postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U winzard -d winzard"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 5s
    restart: unless-stopped

volumes:
  winzard_postgres_data:
```

> [!IMPORTANT]
> A hivatalos `postgres:18` image tartós adatkötetének célpontja `/var/lib/postgresql`. PostgreSQL 17 és korábbi hivatalos image-eknél a megszokott célpont `/var/lib/postgresql/data`. Az image főverziójának módosításakor a volume-elrendezést és az adatfrissítési eljárást külön ellenőrizni kell.

> [!WARNING]
> A fenti jelszó kizárólag helyi fejlesztői példa. Productionben tilos használni.

### 12.3. Szolgáltatások indítása

Csak PostgreSQL:

```bash
docker compose up --detach postgres
```

Minden szolgáltatás:

```bash
docker compose up --detach
```

Állapot:

```bash
docker compose ps
```

Log:

```bash
docker compose logs --follow postgres
```

Leállítás:

```bash
docker compose stop
```

Leállítás és konténerek eltávolítása:

```bash
docker compose down
```

### 12.4. Adatvolume törlése

```bash
docker compose down --volumes
```

> [!DANGER]
> Ez a helyi PostgreSQL volume teljes tartalmát törli. A parancsot csak szándékos adatbázis-reset esetén használd.

### 12.5. Host–container connection string

Ha a Next.js a hoston fut és a PostgreSQL konténer portja ki van publikálva:

```dotenv
DATABASE_URL=postgresql://winzard:winzard_dev_only@localhost:5432/winzard?schema=public
```

Ha a Next.js is ugyanabban a Compose hálózatban fut:

```dotenv
DATABASE_URL=postgresql://winzard:winzard_dev_only@postgres:5432/winzard?schema=public
```

A `localhost` a konténeren belül magát a konténert jelenti, nem a `postgres` szolgáltatást.

### 12.6. Production Docker build

A Next.js támogatja a Docker deploymentet és a standalone outputot.

Ajánlott `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

Production image elvek:

1. többfázisú build;
2. pontos Node főverzió;
3. Corepack/pnpm verzió pin;
4. `pnpm install --frozen-lockfile`;
5. `prisma generate` build előtt;
6. `next build`;
7. csak szükséges runtime artifactok másolása;
8. nem root felhasználó;
9. read-only root filesystem, ahol lehetséges;
10. health check;
11. secret nem kerül image layerbe;
12. migráció nem indul kontrollálatlanul minden alkalmazáspéldányban.

### 12.7. Migráció konténeres deploymentnél

Ajánlott sorrend:

```text
CI build
  -> image elkészítése
  -> image scan
  -> migration job: prisma migrate deploy
  -> application rollout
  -> readiness check
```

Nem ajánlott, hogy minden webpéldány induláskor párhuzamosan migrációt próbáljon futtatni.

---

## 13. Csomagok telepítése és eltávolítása

### 13.1. Runtime dependency

```bash
pnpm add <PACKAGE_NAME>
```

Példa:

```bash
pnpm add date-fns
```

Runtime dependency az, amelyre a buildelt vagy futó alkalmazásnak szüksége van.

### 13.2. Development dependency

```bash
pnpm add --save-dev <PACKAGE_NAME>
```

Példa:

```bash
pnpm add --save-dev @types/node
```

Fejlesztői dependency tipikusan:

- lint;
- test runner;
- code generator;
- type package;
- local CLI;
- build tooling.

### 13.3. Csomag eltávolítása

```bash
pnpm remove <PACKAGE_NAME>
```

Eltávolítás után ellenőrizni kell:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ha recipe vagy preset telepítette, a `forge recipe:remove` használata szükséges lehet, hogy a konfigurációs fájlok és registryk is konzisztensen változzanak.

### 13.4. Függőség eredetének vizsgálata

```bash
pnpm why <PACKAGE_NAME>
```

Példa:

```bash
pnpm why zod
```

### 13.5. Elavult csomagok

```bash
pnpm outdated
```

Interaktív frissítés előtt:

```bash
pnpm update --interactive
```

Főverzió frissítése külön feladat, changelog- és migration guide-ellenőrzéssel.

### 13.6. Lockfile-szabályok

KÖTELEZŐ:

- `pnpm-lock.yaml` commitolása;
- dependency változás ugyanabban a commitban;
- CI-ben frozen install;
- merge conflict tudatos feloldása;
- lockfile kézi szerkesztésének kerülése;
- pnpm verzió pin.

TILOS:

```bash
rm pnpm-lock.yaml
pnpm install
```

csak azért, hogy egy ismeretlen telepítési hibát „megoldjunk”. Előbb a hiba okát kell feltárni.

### 13.7. Csomagfelvételi ellenőrzőlista

Új csomag előtt vizsgálandó:

- valóban szükséges-e;
- kiváltható-e platform API-val;
- aktívan karbantartott-e;
- licence kompatibilis-e;
- mekkora a dependency tree;
- van-e ismert sérülékenysége;
- futtat-e lifecycle scriptet;
- szerver- vagy kliensbundle-be kerül;
- támogatja-e az ESM-et;
- támogatja-e a Node 24-et;
- kompatibilis-e a Turbopackkal;
- hogyan tesztelhető és távolítható el;
- igényel-e Winzard recipe-t.

### 13.8. `latest` használata

`latest` használható egyszeri bootstrap parancsban:

```bash
pnpm create next-app@latest
```

A létrejött repositoryban azonban:

- a `package.json`;
- a `pnpm-lock.yaml`;
- a `packageManager`;
- a Node verziófájl

rögzíti a reprodukálható állapotot.

Production CI nem végezhet automatikus, felülvizsgálat nélküli `latest` frissítést.

---

## 14. Winzard recipe-k és presetek

Ez a Symfony Flex recipe és pack koncepció Winzard-specifikus megfelelője.

### 14.1. Miért szükséges recipe rendszer?

Egy JavaScript csomag telepítése gyakran nem elég. Szükség lehet:

- env változók dokumentálására;
- config fájl létrehozására;
- provider regisztrálására;
- composition root módosítására;
- route vagy instrumentation fájlra;
- teszt setupra;
- Docker szolgáltatásra;
- CI lépésre;
- architecture allowlist módosítására.

Ezek kézi, eltérő végrehajtása driftet okoz. A recipe célja a determinisztikus, ellenőrizhető integráció.

### 14.2. Tervezett parancsok

```bash
pnpm forge recipe:list
pnpm forge recipe:show observability
pnpm forge recipe:apply observability --dry-run
pnpm forge recipe:apply observability
pnpm forge recipe:remove observability --dry-run
pnpm forge recipe:remove observability
pnpm forge recipe:status
```

### 14.3. Recipe alkalmazás szabályai

A recipe KÖTELEZŐEN:

1. schema-validált manifestből dolgozik;
2. verziózott;
3. kompatibilitási tartományt ad meg;
4. futtatás előtt diffet készít;
5. `--dry-run` módot támogat;
6. nem ír felül kézzel módosított fájlt észrevétlenül;
7. hash alapján driftet érzékel;
8. minden módosítást visszakövethetően rögzít;
9. eltávolítási tervet tartalmaz;
10. nem futtat ellenőrizetlen távoli shell scriptet;
11. nem ír secretértéket repositoryba;
12. alkalmazás után futtatja a releváns checkeket.

### 14.4. `winzard.lock`

A recipe-k állapotát külön lockfile tartja nyilván:

```text
winzard.lock
```

Példa JSON-formátum:

```json
{
  "schemaVersion": 1,
  "platformVersion": "0.1.0",
  "recipes": {
    "observability": {
      "recipeVersion": 1,
      "package": "@example/observability",
      "packageVersion": "3.2.1",
      "appliedHash": "sha256:...",
      "managedFiles": [
        "src/platform/observability/index.server.ts",
        "instrumentation.ts"
      ]
    }
  }
}
```

A fájl:

- commitolandó;
- nem helyettesíti a `pnpm-lock.yaml` fájlt;
- nem tartalmaz secretet;
- a recipe által kezelt fájlokat és verziókat rögzíti.

### 14.5. Recipe források

Tervezett bizalmi szintek:

1. **Core recipe registry** — Winzard által karbantartott;
2. **Verified registry** — ellenőrzött külső recipe;
3. **Project-local recipe** — repositoryn belüli saját recipe;
4. **Untrusted remote recipe** — alapértelmezésben tiltott.

Külső recipe alkalmazása előtt:

- forrás;
- commit vagy verzió;
- checksum;
- engedélyek;
- módosítandó fájlok

megjelenítendők.

### 14.6. Presetek

A preset több recipe és dependency összefogása.

Tervezett példák:

| Preset          | Tartalom                                                         |
| --------------- | ---------------------------------------------------------------- |
| `webapp`        | UI, auth port, form/table alapok, Prisma, tesztelés.             |
| `testing`       | Vitest, integration setup, Playwright, fixture alapok.           |
| `observability` | strukturált log, tracing port, error reporting adapter.          |
| `worker`        | queue port, outbox, worker entrypoint, retry/idempotency alapok. |
| `debug`         | fejlesztői diagnosztika, query logging, bundle analysis.         |

Tervezett parancs:

```bash
pnpm forge preset:add testing
```

A preset telepítés után kibomolhat valós dependencykre és recipe-kre; a projektben a konkrét csomagok maradjanak láthatók.

### 14.7. Kézi és recipe-alapú telepítés határa

Kézi `pnpm add` elegendő, ha a csomag:

- nem igényel projektstruktúra-módosítást;
- nem igényel composition wiringot;
- nem igényel env vagy CI konfigurációt;
- nem hoz létre új cross-cutting capabilityt.

Recipe ajánlott, ha a csomag több réteget vagy több fájlt érint.

---

## 15. Biztonsági sérülékenységek ellenőrzése

### 15.1. Ismert csomagsérülékenységek

```bash
pnpm audit
```

CI minimum:

```bash
pnpm audit --audit-level high
```

A `pnpm audit` ismert registry-advisorykat vizsgál. Nem helyettesíti:

- a kódreview-t;
- a SAST/DAST eszközöket;
- a konténer image scant;
- a secret scant;
- a dependency eredetének ellenőrzését;
- a runtime monitorozást.

### 15.2. Csomagaláírások ellenőrzése

pnpm 11:

```bash
pnpm audit signatures
```

A parancs hibával áll le, ha:

- érvénytelen registry aláírást talál;
- a registry kulcsot hirdet, de az adott package aláírása hiányzik.

### 15.3. Javítás

Először:

```bash
pnpm update
pnpm audit
```

Automatikus javítás csak review-val:

```bash
pnpm audit --fix
```

Alternatív lockfile-frissítés:

```bash
pnpm audit --fix=update
```

KÖTELEZŐ utána:

```bash
git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml
pnpm verify
```

Automatikus `--fix` nem futhat review nélküli production deployment részeként.

### 15.4. Advisory figyelmen kívül hagyása

Csak akkor engedélyezhető, ha dokumentálva van:

- advisory azonosító;
- miért nem érinti a projektet;
- tulajdonos;
- lejárati vagy újraértékelési dátum;
- kompenzáló kontroll;
- kapcsolódó issue.

Példa `pnpm-workspace.yaml`:

```yaml
auditConfig:
  ignoreGhsas:
    - GHSA-xxxx-xxxx-xxxx
```

A puszta ignore lista indoklás nélkül nem elfogadható.

### 15.5. Supply-chain minimum

- pontos pnpm verzió;
- committed lockfile;
- frozen CI install;
- package signature audit;
- dependency review;
- ismeretlen lifecycle scriptek tiltása vagy engedélyezési listája;
- secret scan;
- branch protection;
- code review;
- reproducible build;
- SBOM előállítási lehetőség;
- konténer és base image rendszeres frissítése.

### 15.6. Winzard security célparancs

```bash
pnpm forge security:check
```

Tervezett összetett ellenőrzés:

1. `pnpm audit --audit-level high`;
2. `pnpm audit signatures`;
3. env/public secret névellenőrzés;
4. committed secret minták;
5. tiltott Client Component importok;
6. közvetlen Prisma-hozzáférés `app/**` alatt;
7. public Route Handler auth/policy metadata;
8. elavult generator output;
9. sebezhető vagy nem támogatott runtime verzió;
10. Docker base image pin és felhasználó ellenőrzése.

---

## 16. Verzió- és támogatási politika

### 16.1. Winzard verziózás

A Winzard szemantikus verziózást használ:

```text
MAJOR.MINOR.PATCH
```

- **MAJOR**: breaking architekturális, CLI-, config- vagy generatorváltozás;
- **MINOR**: visszafelé kompatibilis képesség;
- **PATCH**: hibajavítás és biztonsági javítás.

A generator output formátumának változása akkor is migrációt igényelhet, ha az alkalmazás runtime API-ja nem változik.

### 16.2. Csatornák

| Csatorna       | Cél                                               |
| -------------- | ------------------------------------------------- |
| `stable`       | Aktuális productionre ajánlott kiadás.            |
| `lts`          | Hosszabb támogatási idejű, később bevezetendő ág. |
| `next`         | Következő kiadás előzetes tesztelése.             |
| konkrét verzió | Reprodukálható projektlétrehozás vagy migráció.   |

### 16.3. Kezdeti projektállapot

Amíg a Winzard nem érte el az 1.0 stabil verziót:

- nincs implicit LTS ígéret;
- a `0.x` minor kiadás breaking változást tartalmazhat;
- minden frissítéshez changelog és migration note kell;
- a generator és recipe schema külön verziót kap;
- production használat kockázatát a projektnek explicit vállalnia kell.

### 16.4. Támogatott upstream verziók

A Winzard release manifest rögzíti:

- Node.js támogatott főverziók;
- pnpm támogatott főverzió;
- Next.js támogatott főverzió;
- React támogatott főverzió;
- TypeScript minimum és tesztelt verzió;
- Prisma támogatott főverzió;
- PostgreSQL támogatott főverziók.

A kompatibilitási mátrix a `forge doctor` által géppel ellenőrizhető legyen.

### 16.5. Upstream LTS elv

Productionben:

- csak támogatott Node.js LTS;
- csak támogatott PostgreSQL főverzió;
- stable Prisma ORM;
- stable Next.js;
- preview vagy Early Access adatkezelési komponens csak ADR-rel.

A dokumentáció ellenőrzési időpontjában a Prisma Next Early Access; ezért nem a Winzard stabil persistence alapja.

### 16.6. Frissítési folyamat

1. külön branch;
2. release note és migration guide;
3. package verziók módosítása;
4. lockfile frissítése;
5. `prisma generate`;
6. `forge sync --dry-run`;
7. codemod vagy generator migration;
8. teljes verify;
9. integration és E2E;
10. staging;
11. rollback terv;
12. merge.

Tervezett parancs:

```bash
pnpm forge upgrade --to=<VERSION> --dry-run
pnpm forge upgrade --to=<VERSION>
```

---

## 17. Referenciaalkalmazás

### 17.1. Cél

A Symfony Demo alkalmazás Winzard megfelelője egy teljes, működő referenciaalkalmazás.

Tervezett hely:

```text
examples/reference-app/
```

Tervezett létrehozás:

```bash
pnpm dlx create-winzard@latest my-demo \
  --profile=webapp \
  --with-example=product
```

### 17.2. A referenciamodul követelményei

A `Product` referenciamodul legalább tartalmazzon:

- enumot;
- relációt;
- money mezőt;
- tenant scope-ot;
- role-limited mezőt;
- list filtert;
- create és update műveletet;
- soft delete-et;
- cache-t;
- domain eventet;
- egyedi validációt;
- repository portot;
- Prisma write adaptert;
- külön read repositoryt;
- policyt;
- explicit DTO-kat;
- Server Action adaptert;
- admin list/detail/create/edit oldalakat;
- repository contract tesztet;
- E2E CRUD smoke tesztet;
- tenant isolation tesztet.

### 17.3. Golden reference szerep

A referenciaalkalmazás egyszerre:

- tanulási példa;
- architekturális minta;
- generator golden fixture;
- recipe integrációs teszt;
- upgrade smoke test;
- dokumentációs példaforrás.

A `forge make:resource` generált kimenetét ehhez kell hasonlítani.

### 17.4. Demo és production elválasztása

A demo:

- nem tartalmazhat valódi secretet;
- nem használhat valós személyes adatot;
- nem állíthat be gyenge production jelszót;
- nem kerülhet véletlenül production adatbázisra;
- jól látható demo bannerrel vagy environment jelöléssel futhat.

---

## 18. Az első modul létrehozása

A setup után a következő lépés egy modul létrehozása.

### 18.1. Célparancsok

```bash
pnpm forge make:module catalog
```

Prisma modellből resource:

```bash
pnpm forge make:resource catalog/Product \
  --from=prisma \
  --profile=crud \
  --ui=admin
```

Tervezett változások előnézete:

```bash
pnpm forge make:resource catalog/Product \
  --from=prisma \
  --profile=crud \
  --ui=admin \
  --dry-run
```

Drift ellenőrzése:

```bash
pnpm forge sync catalog/Product --dry-run
```

Teljes ellenőrzés:

```bash
pnpm forge check
```

### 18.2. A generálás előfeltétele

A Prisma modell önmagában nem elegendő az egész alkalmazási szemantika meghatározásához.

A generátornak szüksége lehet:

- resource manifestre;
- title fieldre;
- list/detail/create/update mezőválasztásra;
- relation UI-ra;
- money pénznemre;
- kereshető és rendezhető mezőkre;
- delete policyra;
- tenant és ownership szabályra;
- ability nevekre;
- cache tagekre;
- audit eseményekre.

Schema-first, de nem schema-only megközelítés szükséges.

### 18.3. Generált és kézi kód

Újragenerálható:

- scalar metadata;
- explicit projectionök;
- registryk;
- route wrapper;
- form/table alapkonfiguráció;
- cache tag helper;
- resource index;
- generált fixture-alap.

Egyszer létrehozott, utána fejlesztői tulajdon:

- domainmodell;
- use case;
- policy;
- repository adapter;
- custom query;
- egyedi UI;
- kézzel bővített teszt.

A `forge` nem írhatja felül a kézzel kezelt üzleti kódot.

---

## 19. Projektellenőrzések és CI

### 19.1. Helyi gyors ellenőrzés

```bash
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
```

### 19.2. Teljes ellenőrzés

```bash
pnpm forge check
pnpm forge sync --check

pnpm db:validate
pnpm db:migrate:status
pnpm db:generate

pnpm typegen
pnpm typecheck
pnpm lint

pnpm test
pnpm test:e2e

pnpm audit --audit-level high
pnpm audit signatures

pnpm build
```

### 19.3. `forge check` elvárt ellenőrzései

- minden porthoz tartozik adapter a composition rootban;
- nincs körkörös modulfüggőség;
- domain nem importál frameworkkódot;
- Client Component nem importál szervermodult;
- `app/**` nem hív közvetlen ORM-et;
- minden write use case rendelkezik policy ellenőrzéssel;
- publikus output explicit DTO;
- resource/Prisma drift nincs;
- tenant-erőforrás repository metódusa explicit scope-olt;
- generált fájl hash helyes;
- nincs ismeretlen enum vagy relation mapping;
- composition root szerveroldali;
- nincs ORM-típus klienspropban;
- minden Route Handlernek van input/output contractja;
- minden Server Action inputot validál.

### 19.4. CI telepítés

```bash
corepack enable pnpm
corepack install

pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:generate
pnpm db:migrate:deploy
pnpm typegen
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm forge check
pnpm build
```

A `pnpm verify` a helyi, aggregált ellenőrzési parancs. A GitHub Actions ugyanezeket az ellenőrzéseket külön, elnevezett lépésekben futtatja, hogy a hibás alrendszer közvetlenül azonosítható legyen.

Adatbázisos integration tesztnél:

```bash
docker compose up --detach postgres
pnpm db:migrate:deploy
pnpm db:seed
pnpm test
```

CI teardown:

```bash
docker compose down --volumes
```

### 19.5. Production deployment minimum

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level high
```

Deployment oldali adatbázis-lépés:

```bash
pnpm db:migrate:deploy
```

### 19.6. Build és lint

Next.js 16-tól a `next build` nem helyettesíti a linter futtatását. Ezért a CI-ben külön `pnpm lint` kötelező.

### 19.7. Route typegen

A `next typegen` fusson a TypeScript ellenőrzés előtt:

```bash
pnpm typegen
pnpm exec tsc --noEmit
```

Így a route-, page-, layout- és Route Handler típusok build nélkül is rendelkezésre állnak.

---

## 20. Hibaelhárítás

### 20.1. Hibás Node.js verzió

Tünet:

```text
Unsupported engine
```

vagy Prisma/pnpm indulási hiba.

Ellenőrzés:

```bash
node --version
cat .node-version
cat package.json
```

Megoldás:

- válts Node 24-re;
- nyiss új shellt;
- futtasd újra a `corepack install` parancsot;
- csak ezután telepítsd újra a dependencyket.

### 20.2. Hibás pnpm verzió

Ellenőrzés:

```bash
pnpm --version
node -p "require('./package.json').packageManager"
```

Megoldás:

```bash
npm install --global corepack@latest
corepack enable pnpm
corepack install
```

Ne írd át a `packageManager` mezőt pusztán azért, hogy a lokális verziód megfeleljen.

### 20.3. Lockfile mismatch

Tünet:

```text
Cannot install with frozen-lockfile
```

Ellenőrizd:

```bash
git status
git diff -- package.json pnpm-lock.yaml
pnpm --version
```

Lehetséges ok:

- `package.json` változott lockfile-frissítés nélkül;
- rossz pnpm verzió;
- hibás merge;
- félbehagyott dependency update.

A megoldás nem a lockfile törlése, hanem a változás szándékának tisztázása.

### 20.4. A 3000-es port foglalt

Linux/macOS:

```bash
lsof -i :3000
```

Alternatív port:

```bash
pnpm exec next dev --port 3001
```

### 20.5. Az 5432-es port foglalt

```bash
docker compose ps
lsof -i :5432
```

Alternatív host port:

```dotenv
POSTGRES_PORT=5433
DATABASE_URL=postgresql://winzard:winzard_dev_only@localhost:5433/winzard?schema=public
```

Ezután:

```bash
docker compose up --detach postgres
```

### 20.6. PostgreSQL nem healthy

```bash
docker compose ps
docker compose logs postgres
```

Ellenőrizd:

- volume jogosultság;
- portütközés;
- jelszó és user;
- lemezterület;
- régi, inkompatibilis volume;
- image frissítés utáni major version eltérés.

Major PostgreSQL image váltásnál a régi volume nem feltétlenül használható közvetlenül. Szükség lehet dump/restore vagy `pg_upgrade` folyamatra.

### 20.7. Prisma nem találja a `DATABASE_URL` változót

Ellenőrzés:

```bash
test -f .env && echo ".env exists"
grep '^DATABASE_URL=' .env
```

A `prisma.config.ts` tartalmazza:

```ts
import "dotenv/config";
```

Ne csak `.env.local` fájlban add meg a Prisma CLI számára szükséges értéket.

### 20.8. Prisma Client nincs generálva

Tünet:

```text
Cannot find module '@/generated/prisma/client'
```

Megoldás:

```bash
pnpm db:generate
```

Ellenőrizd a generator outputot:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

### 20.9. Prisma Client adapter hiba

Tünet:

```text
PrismaClient requires an adapter
```

Prisma 7 esetén példányosítás:

```ts
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
```

Ellenőrizd:

```bash
pnpm why @prisma/adapter-pg
pnpm why pg
```

### 20.10. Migrációs drift

Ellenőrzés:

```bash
pnpm db:migrate:status
pnpm db:migrate:dev
```

A `migrate dev` csak fejlesztői DB-n fusson. Ha fontos helyi adat van:

1. készíts mentést;
2. vizsgáld meg a drift okát;
3. ne fogadd el automatikusan a resetet;
4. ellenőrizd a migrációs fájlok Git-történetét.

### 20.11. `server-only` import hiba Client Componentben

Tünet: build hiba arról, hogy szerveroldali modul kliensoldali fájlba került.

Megoldás:

- ne távolítsd el a `server-only` importot;
- válassz le biztonságos DTO-t;
- a lekérdezést Server Componentben vagy Server Actionben végezd;
- Client Component csak serializálható, minimális adatot kapjon.

### 20.12. Közvetlen Prisma-hívás az `app` könyvtárban

Tünet: `forge check` vagy architecture lint hiba.

Helytelen:

```ts
// src/app/products/page.tsx
const products = await db.product.findMany();
```

Helyes:

```text
page.tsx
  -> query use case
    -> read repository port
      -> Prisma read adapter
```

### 20.13. Turbopack inkompatibilitás

Próba:

```bash
pnpm exec next dev --webpack
```

Ha Webpackkal működik:

- ellenőrizd a csomag dokumentációját;
- keress Turbopack-kompatibilis megoldást;
- dokumentáld az ideiglenes fallbacket;
- ne adj hozzá Webpack plugint Turbopack konfigurációhoz.

### 20.14. Windows fájlfigyelési probléma

Ajánlott:

- WSL2;
- repository a WSL Linux fájlrendszerében;
- Node/pnpm WSL-en belül;
- Docker WSL integráció;
- editor Remote WSL módban.

### 20.15. Docker volume teljes törlése szükséges

Csak helyi adatvesztés elfogadásával:

```bash
docker compose down --volumes
docker compose up --detach postgres
pnpm db:migrate:deploy
pnpm db:seed
```

### 20.16. Build alatt hiányzó public env

A `NEXT_PUBLIC_` változók buildidőben kerülhetnek a bundle-be.

Biztosítsd őket a `pnpm build` folyamat környezetében, ne csak a runtime konténerindításnál.

### 20.17. Diagnosztikai csomag

Issue nyitása előtt:

```bash
pnpm forge about --json > winzard-about.json
pnpm forge doctor --json > winzard-doctor.json
pnpm exec next info --verbose > next-info.txt
pnpm exec prisma debug > prisma-debug.txt
```

A fájlok megosztása előtt secret- és személyesadat-ellenőrzés kötelező.

---

## 21. Symfony–Winzard parancsmegfeleltetés

| Symfony                       | Winzard                                                           | Megjegyzés                                              |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `symfony check:requirements`  | `pnpm forge doctor`                                               | Runtime, toolchain, env, DB, generált állapot.          |
| `symfony new app --webapp`    | `pnpm dlx create-winzard app --profile=webapp`                    | Tervezett bootstrap CLI.                                |
| `symfony new app`             | `pnpm dlx create-winzard app --profile=minimal`                   | Minimális profil.                                       |
| `composer create-project ...` | `pnpm create next-app ...` + manuális Winzard bootstrap           | CLI nélküli út.                                         |
| `composer install`            | `pnpm install --frozen-lockfile`                                  | Reprodukálható dependency install.                      |
| `php bin/console about`       | `pnpm forge about`                                                | Projekt- és környezetinformáció.                        |
| `symfony server:start`        | `pnpm dev`                                                        | Next.js dev server.                                     |
| `symfony server:start --open` | `pnpm dev`, majd böngésző                                         | Nincs szükség saját daemon wrapperre az első verzióban. |
| `composer require logger`     | `pnpm add <package>` vagy `pnpm forge recipe:apply observability` | Egyszerű dependency vagy összetett integráció.          |
| Symfony Flex recipe           | Winzard recipe                                                    | Determinisztikus konfigurációs integráció.              |
| Symfony pack                  | Winzard preset                                                    | Több dependency/recipe együtt.                          |
| `symfony.lock`                | `winzard.lock`                                                    | Recipe/generator integrációs állapot.                   |
| `composer audit`              | `pnpm audit --audit-level high`                                   | Ismert dependency advisoryk.                            |
| `symfony check:security`      | `pnpm forge security:check`                                       | Összetett, tervezett security check.                    |
| `--version=lts`               | `--version=lts`                                                   | Csak létező Winzard LTS esetén.                         |
| Symfony Demo                  | `examples/reference-app`                                          | Golden reference Product modul.                         |
| `debug:container`             | `pnpm forge graph`                                                | Composition graph.                                      |
| `lint:container`              | `pnpm forge check`                                                | Dependency és architecture check.                       |

### 21.1. Fejezetmegfeleltetés

| Symfony setup fejezet             | Winzard fejezet                                                    |
| --------------------------------- | ------------------------------------------------------------------ |
| Technical Requirements            | Technikai követelmények, toolchain, `forge doctor`.                |
| Creating Symfony Applications     | `create-winzard`, profilok, manuális bootstrap.                    |
| Setting up an Existing Project    | Klónozás, frozen install, env, DB, migráció, seed.                 |
| Running Symfony Applications      | `next dev`, production build/start, health.                        |
| Docker Integration                | Compose-alapú helyi infrastruktúra és standalone production image. |
| Installing Packages               | pnpm dependency policy.                                            |
| Symfony Flex                      | Winzard recipe rendszer.                                           |
| Symfony Packs                     | Winzard presetek.                                                  |
| Checking Security Vulnerabilities | pnpm audit, signatures, `forge security:check`.                    |
| Symfony LTS Versions              | Winzard release channel és upstream támogatási mátrix.             |
| Symfony Demo                      | Product reference app.                                             |
| Start Coding                      | `forge make:module` és `forge make:resource`.                      |

---

## 22. Függelékek

### 22.1. Első napi fejlesztői checklist

```text
[ ] Repository klónozva
[ ] Node verzió egyezik
[ ] pnpm verzió egyezik
[ ] pnpm install --frozen-lockfile sikeres
[ ] .env létrehozva
[ ] Docker Compose PostgreSQL healthy
[ ] Prisma Client generálva
[ ] Migrációk alkalmazva
[ ] Seed lefutott
[ ] forge doctor sikeres
[ ] forge check sikeres
[ ] typecheck sikeres
[ ] lint sikeres
[ ] unit/integration teszt sikeres
[ ] Next.js dev server elindult
[ ] /api/health/live működik
[ ] /api/health/ready működik
```

### 22.2. Napi fejlesztői indítás

```bash
docker compose up --detach postgres
pnpm db:migrate:deploy
pnpm db:generate
pnpm dev
```

Ha sem schema, sem dependency nem változott, a `db:generate` és migrációs lépés project-specific wrapperrel optimalizálható.

### 22.3. Branchváltás utáni checklist

```bash
git status
git switch <BRANCH>

corepack install
pnpm install --frozen-lockfile

pnpm db:generate
pnpm db:migrate:deploy

pnpm forge sync --check
pnpm typecheck
```

### 22.4. Schema változtatási workflow

```bash
## 1. schema módosítása
$EDITOR prisma/schema.prisma

## 2. formázás és validáció
pnpm db:format
pnpm db:validate

## 3. migráció létrehozása
pnpm db:migrate:dev --name add_product_status

## 4. kliens generálása
pnpm db:generate

## 5. resource drift megtekintése
pnpm forge sync catalog/Product --dry-run

## 6. ellenőrzések
pnpm forge check
pnpm typecheck
pnpm test
pnpm build
```

### 22.5. Dependency változtatási workflow

```bash
pnpm add <PACKAGE>
pnpm audit --audit-level high
pnpm audit signatures
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff -- package.json pnpm-lock.yaml
```

### 22.6. Release előtti checklist

```text
[ ] Changelog frissítve
[ ] Migration note elkészült
[ ] Node/pnpm/Next/Prisma támogatási mátrix ellenőrizve
[ ] Lockfile frozen installból reprodukálható
[ ] Prisma schema valid
[ ] Migrációs SQL review megtörtént
[ ] forge sync --check sikeres
[ ] forge check sikeres
[ ] typecheck és lint sikeres
[ ] unit/integration/E2E sikeres
[ ] dependency audit sikeres
[ ] package signature audit sikeres
[ ] production build sikeres
[ ] container scan sikeres
[ ] staging migráció és rollout sikeres
[ ] rollback terv dokumentált
```

### 22.7. Minimális project metadata

Tervezett `winzard.config.ts`:

```ts
import { defineWinzardConfig } from "./src/platform/config/define-winzard-config";

export default defineWinzardConfig({
  name: "my-project",
  profile: "webapp",

  runtime: {
    node: "24",
  },

  database: {
    provider: "postgresql",
  },

  paths: {
    app: "src/app",
    modules: "src/modules",
    platform: "src/platform",
    composition: "src/composition",
    generated: "src/generated",
  },

  architecture: {
    forbidOrmInApp: true,
    forbidFrameworkInDomain: true,
    requireWritePolicies: true,
    requireExplicitDtos: true,
  },
});
```

Ez célkonfiguráció; végleges schema külön ADR és implementation task tárgya.

### 22.8. Példa `forge about` kimenet

```text
Winzard application
-------------------
Name:                 my-project
Environment:          development
Application profile:  webapp
Winzard:              0.1.0
Forge:                 0.1.0
Node.js:               24.x
pnpm:                  11.x
Next.js:               repository pinned
React:                 repository pinned
Prisma:                repository pinned
Database:              PostgreSQL
Database status:       reachable
Migrations:            up to date
Modules:               3
Resources:             7
Generated drift:       none
Architecture check:    passed
```

### 22.9. Példa `forge doctor` emberi kimenet

```text
[PASS] Operating system supported
[PASS] Node.js version matches project
[PASS] pnpm version matches packageManager
[PASS] Environment schema valid
[PASS] PostgreSQL reachable
[PASS] Prisma schema valid
[PASS] Prisma Client generated
[PASS] Migrations up to date
[PASS] Generated files in sync
[PASS] Architecture rules satisfied

All required checks passed.
```

### 22.10. Nem támogatott shortcutok

A következő minták nem Winzard-kompatibilisek:

```ts
// Közvetlen ORM a Server Actionben
export async function updateProduct(data: unknown) {
  return db.product.update({
    where: { id: (data as any).id },
    data: data as any,
  });
}
```

```ts
// Prisma modell klienspropban
"use client";

import type { Product } from "@/generated/prisma/client";

export function ProductEditor(props: { product: Product }) {
  // ...
}
```

```ts
// Belső Server Component saját HTTP API-n keresztül
const response = await fetch("http://localhost:3000/api/products");
```

Helyette:

- operation schema;
- Actor;
- policy;
- use case;
- repository port;
- explicit DTO;
- közvetlen szerveroldali query use case hívás.

---

## 23. Források és attribúció

### 23.1. Szerkezeti kiindulópont

- [Symfony Docs — Installing & Setting up the Symfony Framework](https://symfony.com/doc/current/setup.html)

A Symfony dokumentációs oldal 2026. július 16-i ellenőrzéskor az alábbi fő témákat tartalmazta: technikai követelmények, új és meglévő projekt setupja, helyi futtatás, Docker, csomagtelepítés, Flex recipe-k, packek, security audit, LTS és demo alkalmazás. A Winzard dokumentum ugyanezeket a funkcionális kérdéseket kezeli saját technológiai és architekturális környezetében.

A Symfony oldal Creative Commons BY-SA 3.0 licencjelölést tartalmaz. A dokumentum terjesztésekor az attribúciót és a projekt dokumentációs licencének kompatibilitását fenn kell tartani vagy jogilag ellenőrizni kell.

### 23.2. Upstream technikai források

#### Next.js

- [Installation](https://nextjs.org/docs/app/getting-started/installation)
- [create-next-app CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [next CLI](https://nextjs.org/docs/app/api-reference/cli/next)
- [Turbopack](https://nextjs.org/docs/app/api-reference/turbopack)
- [Deploying](https://nextjs.org/docs/app/getting-started/deploying)
- [Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Authentication and Authorization](https://nextjs.org/docs/app/guides/authentication)

#### Node.js

- [Node.js Releases](https://nodejs.org/en/about/previous-releases)

#### pnpm

- [Installation](https://pnpm.io/installation)
- [pnpm install](https://pnpm.io/cli/install)
- [pnpm audit](https://pnpm.io/cli/audit)

#### Prisma

- [System requirements](https://www.prisma.io/docs/orm/reference/system-requirements)
- [Prisma CLI](https://www.prisma.io/docs/cli)
- [prisma init](https://www.prisma.io/docs/cli/init)
- [Prisma Config reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)
- [prisma migrate dev](https://www.prisma.io/docs/cli/migrate/dev)
- [prisma migrate deploy](https://www.prisma.io/docs/cli/migrate/deploy)
- [Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)
- [Supported databases](https://www.prisma.io/docs/orm/reference/supported-databases)

#### PostgreSQL

- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/)

#### Docker

- [Install Docker Compose](https://docs.docker.com/compose/install/)
- [Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Docker Desktop WSL 2 backend](https://docs.docker.com/desktop/features/wsl/)
- [Official PostgreSQL image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md)

### 23.3. Ellenőrzési dátum

A külső verzió- és követelményadatok utolsó ellenőrzése:

```text
2026-07-16
```

Az upstream követelmények változhatnak. A Winzard repositoryban rögzített verziók és kompatibilitási mátrix elsőbbséget élveznek az általános példákkal szemben.
