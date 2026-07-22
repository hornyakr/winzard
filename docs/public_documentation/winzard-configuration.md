---
title: "Konfiguráció Winzard alkalmazásokban"
description: "A kitelepített Winzard projektek teljes konfigurációs szerződése: manifestek, next.config, capability-specifikus sémák, környezeti változók, build- és runtime-határok, secretek, validáció, diagnosztika és deployment."
status: "implemented"
document_version: "1.1.0"
last_verified: "2026-07-22"
source_basis: "Symfony Docs — Configuring Symfony"
nextjs_baseline: "16.2.10"
nodejs_baseline: "24.x LTS"
applies_to: "kitelepített vagy generált Winzard projektek, template-ek és publikus recipe-contractok"
related_documents:
  - "winzard-kernel-configuration.md"
  - "winzard-setup-capabilities.md"
  - "winzard-application-platform.md"
  - "winzard-controller.md"
  - "winzard-routing.md"
  - "winzard-project-documentation-cli.md"
  - "../development/configuration-platform-implementation.md"
---

# Konfiguráció Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Configuring Symfony”** fejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony konfigurációs dokumentációjának teljes funkcionális témakészletét követi — konfigurációs fájlok, formátumok, importok, paraméterek, környezetek, `.env` fájlok, secretek, környezeti változók feloldása, diagnosztika és konfiguráció elérése —, de minden fogalmat a Winzard **Next.js App Router + TypeScript + capability-aware Forge + ports and adapters** architektúrájához igazít.

A dokumentum kizárólag a **kitelepített vagy generált Winzard alkalmazás publikus konfigurációs szerződését** írja le. Nem publikálja a Winzard alaprendszer belső roadmapjét, maintainer-taskjait vagy belső Core Vaultját.

A központi döntés:

> **A Winzardban nincs egyetlen globális konfigurációs zsák. A konfiguráció tulajdonosa az a capability vagy adapter, amely az értéket használja; a nyers forrást a határon validált, immutable és típusos szerződéssé kell alakítani.**

A konfiguráció öt külön életciklusba tartozhat:

```text
verziózott forráskonfiguráció
build-time konfiguráció
process-start konfiguráció
request-time szerverkonfiguráció
publikus klienskonfiguráció
```

Ezeket nem szabad összemosni. Ugyanaz a kulcs más biztonsági, cache-, deployment- és frissítési tulajdonságokkal rendelkezik attól függően, hogy melyik életciklusban kerül feloldásra.

A dokumentum végére egy fejlesztő:

1. el tudja különíteni a manifestet, a framework-konfigurációt, az alkalmazáskonfigurációt és a secreteket;
2. tudja, mikor build-time és mikor runtime egy környezeti változó;
3. capability-nként tud Zod-sémát és típusos config objektumot létrehozni;
4. nem tesz secretet kliensbundle-be vagy generált dokumentációba;
5. determinisztikus `.env` és tesztkörnyezetet tud kialakítani;
6. helyesen kezeli a `NEXT_PUBLIC_` változók buildidőben rögzülő természetét;
7. külön tudja választani a `NODE_ENV` értéket a staging/preview/QA deployment stage-től;
8. explicit injectionnel tud konfigurációt adni az adaptereknek és application műveleteknek;
9. diagnosztizálni tudja a hiányzó, hibás, elavult vagy rossz lifecycle-ban feloldott konfigurációt;
10. CI-ben és deployment előtt ellenőrizhető konfigurációs contractot tud fenntartani.

> [!IMPORTANT]
> A dokumentumban szereplő `env:check`, `config:list`, `config:inspect`, `config:reference`, `config:diff`, `config:drift`, `config:unused`, `config:doctor`, `secrets:check`, `check`, `security:check` és `doctor` Forge-parancsok implementált, tesztelt felületek. A parancsok minden értéket redaktáltan kezelnek; secretet nem írnak ki.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Hatókör és kizárások](#2-hatókör-és-kizárások)
3. [Symfony és Winzard konfigurációs megfeleltetése](#3-symfony-és-winzard-konfigurációs-megfeleltetése)
4. [A Winzard konfigurációs alaptételei](#4-a-winzard-konfigurációs-alaptételei)
5. [Konfigurációs források és autoritási sorrend](#5-konfigurációs-források-és-autoritási-sorrend)
6. [Ajánlott projektstruktúra](#6-ajánlott-projektstruktúra)
7. [A Winzard manifest mint capability-konfiguráció](#7-a-winzard-manifest-mint-capability-konfiguráció)
8. [`next.config.ts`: framework- és build-konfiguráció](#8-nextconfigts-framework-és-build-konfiguráció)
9. [Konfigurációs formátumok](#9-konfigurációs-formátumok)
10. [Konfiguráció importálása és kompozíciója](#10-konfiguráció-importálása-és-kompozíciója)
11. [Statikus paraméterek és invariánsok](#11-statikus-paraméterek-és-invariánsok)
12. [Capability-specifikus konfigurációs ownership](#12-capability-specifikus-konfigurációs-ownership)
13. [Általános alkalmazáskonfiguráció](#13-általános-alkalmazáskonfiguráció)
14. [Adatbázis-konfiguráció](#14-adatbázis-konfiguráció)
15. [Authentikációs konfiguráció](#15-authentikációs-konfiguráció)
16. [Publikus klienskonfiguráció](#16-publikus-klienskonfiguráció)
17. [Build-time konfiguráció](#17-build-time-konfiguráció)
18. [Process-start konfiguráció](#18-process-start-konfiguráció)
19. [Request-time szerverkonfiguráció](#19-request-time-szerverkonfiguráció)
20. [Konfiguráció lifecycle és frissítési mátrix](#20-konfiguráció-lifecycle-és-frissítési-mátrix)
21. [`NODE_ENV` és deployment stage](#21-node_env-és-deployment-stage)
22. [Fejlesztési, production és test környezet](#22-fejlesztési-production-és-test-környezet)
23. [Staging, preview, QA és review deploymentek](#23-staging-preview-qa-és-review-deploymentek)
24. [Capability és feature flag különbsége](#24-capability-és-feature-flag-különbsége)
25. [`.env` fájlok alapjai](#25-env-fájlok-alapjai)
26. [`.env` szintaxis és változóexpanzió](#26-env-szintaxis-és-változóexpanzió)
27. [Next.js env betöltési sorrend](#27-nextjs-env-betöltési-sorrend)
28. [`.env.example`, lokális override és production értékek](#28-envexample-lokális-override-és-production-értékek)
29. [Production konfiguráció injektálása](#29-production-konfiguráció-injektálása)
30. [Runtime konfiguráció és promotálható artifact](#30-runtime-konfiguráció-és-promotálható-artifact)
31. [`NEXT_PUBLIC_` változók és buildidőben rögzülő értékek](#31-next_public_-változók-és-buildidőben-rögzülő-értékek)
32. [Runtime publikus konfiguráció biztonságosan](#32-runtime-publikus-konfiguráció-biztonságosan)
33. [Next.js-en kívüli toolok env-betöltése](#33-nextjs-en-kívüli-toolok-env-betöltése)
34. [Prisma konfiguráció](#34-prisma-konfiguráció)
35. [Egyedi konfigurációforrások és custom loader](#35-egyedi-konfigurációforrások-és-custom-loader)
36. [Secretkezelés](#36-secretkezelés)
37. [Környezeti változók típusos validációja](#37-környezeti-változók-típusos-validációja)
38. [Stringek, számok, booleanok és enumok](#38-stringek-számok-booleanok-és-enumok)
39. [URL-ek, DSN-ek, listák és JSON értékek](#39-url-ek-dsn-ek-listák-és-json-értékek)
40. [Hiányzó, üres, null és default értékek](#40-hiányzó-üres-null-és-default-értékek)
41. [Fail-fast és lazy validáció](#41-fail-fast-és-lazy-validáció)
42. [Konfiguráció elérése explicit injektálással](#42-konfiguráció-elérése-explicit-injektálással)
43. [Miért tilos a globális configuration bag?](#43-miért-tilos-a-globális-configuration-bag)
44. [Domain- és application-réteg konfigurációs határa](#44-domain-és-application-réteg-konfigurációs-határa)
45. [Composition root és konfiguráció](#45-composition-root-és-konfiguráció)
46. [Request-derived context nem konfiguráció](#46-request-derived-context-nem-konfiguráció)
47. [Node.js és Edge/Proxy runtime konfiguráció](#47-nodejs-és-edgeproxy-runtime-konfiguráció)
48. [Startup konfigurációvalidáció `instrumentation.ts` segítségével](#48-startup-konfigurációvalidáció-instrumentationts-segítségével)
49. [Konfigurációs diagnosztika](#49-konfigurációs-diagnosztika)
50. [Redakció, logging és observability](#50-redakció-logging-és-observability)
51. [Konfigurációs tesztelés](#51-konfigurációs-tesztelés)
52. [CI konfigurációs contract](#52-ci-konfigurációs-contract)
53. [Deployment és container konfiguráció](#53-deployment-és-container-konfiguráció)
54. [Orchestrator és secret mount minták](#54-orchestrator-és-secret-mount-minták)
55. [Konfigurációfrissítés, restart és hot reload](#55-konfigurációfrissítés-restart-és-hot-reload)
56. [Security fenyegetési modell](#56-security-fenyegetési-modell)
57. [Retry, timeout és circuit-breaker konfiguráció](#57-retry-timeout-és-circuit-breaker-konfiguráció)
58. [CORS, trusted origin és proxy konfiguráció](#58-cors-trusted-origin-és-proxy-konfiguráció)
59. [Cache- és namespace-konfiguráció](#59-cache-és-namespace-konfiguráció)
60. [Multi-instance és rolling deployment konfiguráció](#60-multi-instance-és-rolling-deployment-konfiguráció)
61. [Template- és recipe-konfigurációs contract](#61-template-és-recipe-konfigurációs-contract)
62. [Teljes alkalmazásconfig példa](#62-teljes-alkalmazásconfig-példa)
63. [Conditional és discriminated configuration](#63-conditional-és-discriminated-configuration)
64. [Konfigurációs reference és dokumentáció](#64-konfigurációs-reference-és-dokumentáció)
65. [Konfigurációs hibakódok](#65-konfigurációs-hibakódok)
66. [Forge konfigurációs parancsok](#66-forge-konfigurációs-parancsok)
67. [Hibaelhárítás: hiányzó változó](#67-hibaelhárítás-hiányzó-változó)
68. [Hibaelhárítás: működik devben, elbukik buildben](#68-hibaelhárítás-működik-devben-elbukik-buildben)
69. [Hibaelhárítás: működik buildben, rossz productionben](#69-hibaelhárítás-működik-buildben-rossz-productionben)
70. [Hibaelhárítás: secret megjelent kliensben vagy logban](#70-hibaelhárítás-secret-megjelent-kliensben-vagy-logban)
71. [Migráció globális env singletonból](#71-migráció-globális-env-singletonból)
72. [Konfigurációs change management](#72-konfigurációs-change-management)
73. [Implementációs elfogadási kritériumok](#73-implementációs-elfogadási-kritériumok)
74. [Symfony–Winzard részletes megfeleltetés](#74-symfonywinzard-részletes-megfeleltetés)
75. [Források és attribúció](#75-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott konfigurációt, security hibát, környezetfüggő driftet vagy nem reprodukálható buildet eredményezhet;
- **TILOS / MUST NOT**: a megoldás Winzard-kompatibilis projektben nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt eltérés lehetséges, de az eltérést ADR-ben, specificationben vagy deployment runbookban dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak kifejezett technikai indokkal alkalmazható;
- **OPCIONÁLIS / MAY**: a projekt és az aktív capability-k igénye szerint használható.

### 1.2. Fő fogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Konfiguráció** | Olyan, üzleti adattól elkülönülő érték vagy policy, amely egy alkalmazás, capability, adapter, build vagy deployment működését szabályozza. |
| **Forráskonfiguráció** | Gitben verziózott TypeScript-, JSON- vagy más statikus konfiguráció. |
| **Környezeti változó** | A folyamat környezetéből vagy `.env*` fájlból származó string bemenet. |
| **Secret** | Olyan érzékeny konfiguráció, amelynek nyilvánosságra kerülése jogosulatlan hozzáférést vagy visszaélést tesz lehetővé. |
| **Capability manifest** | A `winzard.json` vagy `package.json#winzard` szerződése, amely deklarálja a projekt profilját és képességeit. |
| **Build-time konfiguráció** | A build során kiértékelt és az artifactba, bundle-be vagy build-outputba beépülő érték. |
| **Process-start konfiguráció** | Az alkalmazáspéldány indulásakor feloldott és a process élettartamára rögzített érték. |
| **Request-time konfiguráció** | A beérkező kéréshez kötött szerveroldali kiértékeléskor feloldott érték. |
| **Publikus klienskonfiguráció** | Olyan explicit, secretmentes érték, amely böngészőbe kerülhet. |
| **Config schema** | A nyers értékek formai és szemantikai validációja. |
| **Config object** | A validáció után létrejövő, típusos, immutable értékobjektum. |
| **Feature flag** | Runtime viselkedést kapcsoló, tulajdonossal és lifecycle-lal rendelkező vezérlő; nem azonos a Winzard capability-vel. |
| **Deployment stage** | `local`, `preview`, `staging`, `production` vagy más operációs célkörnyezet; nem azonos a `NODE_ENV` értékkel. |

### 1.3. A „paraméter” szó használata

A Symfony service container paraméterei helyett a Winzard pontosabb neveket használ:

```text
app config
database config
auth config
mail config
storage config
feature-flag config
public client config
```

A „paraméter” önmagában nem jelöl tulajdonost, lifecycle-t vagy biztonsági osztályt, ezért normatív Winzard-dokumentumban kerülendő általános gyűjtőfogalomként.

---

## 2. Hatókör és kizárások

### 2.1. Mire vonatkozik?

A fejezet lefedi:

- `winzard.json` és `package.json#winzard`;
- `next.config.ts`;
- TypeScript-alapú capability-konfigurációt;
- `.env*` fájlokat és a Next.js betöltési sorrendjét;
- build-time és runtime környezeti változókat;
- `NEXT_PUBLIC_` klienskonfigurációt;
- Zod-alapú validációt;
- secretkezelési határokat;
- test-, CI- és deployment-konfigurációt;
- Prisma és más Next.js-en kívüli toolok env-betöltését;
- konfiguráció explicit injektálását;
- diagnosztikát, redakciót és driftellenőrzést;
- template- és recipe-tulajdonlást.

### 2.2. Mire nem vonatkozik?

Nem része ennek a fejezetnek:

- üzleti entitások vagy felhasználói beállítások adatmodellje;
- adminfelületen szerkeszthető tenant- vagy user-preferencia;
- feature-management provider teljes implementációja;
- központi secret manager konkrét vendorának kiválasztása;
- Winzard Core Vault belső konfigurációja;
- a Forge saját belső release- és publishing credentialjei;
- teljes GitOps-, Terraform- vagy Kubernetes-kézikönyv;
- alkalmazás-runtime AI provider konfigurációja, hacsak az külön capability-ként nincs telepítve.

### 2.3. Mi nem konfiguráció?

A következők request inputok vagy üzleti adatok, nem alkalmazáskonfigurációk:

```text
route paraméter
query string
request header
cookie
session actor
tenant ID
felhasználói preferencia
adatbázisrekord
admin által módosított üzleti szabály
```

Ezeket nem szabad `process.env`-ből, globális config objektumból vagy build-konfigurációból modellezni.

### 2.4. Határ a Winzard Core és a kitelepített projekt között

A kitelepített projekt csak:

1. a saját template-jében és recipe-jeiben lévő konfigurációs fájlokat;
2. az aktív capability-k publikus sémáit;
3. a `docs/80-winzard` consumer contract vonatkozó konfigurációs szabályait

kapja meg.

Belső Winzard-maintainer secret, belső registry token, platformfejlesztési stage vagy nem publikus konfiguráció nem kerülhet a generált alkalmazásba.

---

## 3. Symfony és Winzard konfigurációs megfeleltetése

A Symfony konfigurációja központi `config/` könyvtárra, service containerre, bundle-konfigurációra, paraméterekre és környezetfüggő felülírásokra épül.

A Winzard funkcionális megfeleltetése:

| Symfony | Winzard |
| --- | --- |
| `config/packages/` | capability- vagy adaptertulajdonú TypeScript config és recipe-fájl |
| `services.yaml` | explicit composition root és konstruktoros injektálás |
| `routes.yaml` | Next.js App Router route-fa és `next.config.ts` redirect/rewrite |
| `bundles.php` | `winzard.json`/`package.json#winzard` capabilities |
| container parameter | típusos config objektum vagy value object |
| `%env(NAME)%` | capability-specifikus parser által olvasott `process.env.NAME` |
| env var processor | Zod transform/preprocess vagy explicit parser |
| `config/packages/test/` | `.env.test`, test fixture és tesztkonfiguráció |
| `APP_ENV` | `NODE_ENV` + külön `APP_STAGE`/deployment metadata |
| Symfony secrets | deployment secret manager és runtime injection |
| `debug:dotenv` | Next load-order ismerete + `forge env:check` + redaktált diagnosztika |
| `debug:container --parameters` | célzott config reference, nem globális parameter bag |
| bundle config tree | capability manifest + schema + recipe contract |
| compiler-time parameter | build-time TypeScript/Next config |
| runtime env placeholder | adapterhatáron feloldott és validált runtime env |

A cél nem a Symfony fájlszerkezetének másolása. A cél a következő tulajdonságok megőrzése:

- egyértelmű tulajdonlás;
- validálhatóság;
- környezetek közötti kontrollált eltérés;
- secretbiztonság;
- statikus és runtime konfiguráció különválasztása;
- diagnosztizálhatóság;
- ismétlés nélküli, explicit injektálás.

---

## 4. A Winzard konfigurációs alaptételei

### 4.1. Egy értéknek egy tulajdonosa van

Minden konfigurációs kulcshoz KÖTELEZŐ kijelölni:

```text
owning capability
schema
security classification
resolution phase
default policy
restart/rebuild requirement
consumer
```

Példa:

| Kulcs | Tulajdonos | Lifecycle | Besorolás |
| --- | --- | --- | --- |
| `APP_NAME` | application shell | process-start vagy build | internal |
| `NEXT_PUBLIC_APP_NAME` | public UI | build-time | public |
| `DATABASE_URL` | `prisma-postgresql` | process-start | secret |
| `AUTH_SECRET` | `authentication` | process-start/buildfüggő adapter | secret |
| `LOG_LEVEL` | observability | process-start | internal |
| `FEATURE_CHECKOUT_V2` | checkout feature flag | request/process | internal vagy public, használattól függően |

### 4.2. Nyers env nem alkalmazási API

A `process.env`:

- string- vagy `undefined`-szerű nyers bemenet;
- operációsrendszer- és processfüggő;
- kliensbundle szempontjából veszélyes;
- közvetlenül nehezen tesztelhető;
- nem fejezi ki a domain jelentést.

Ezért:

```text
process.env
  → capability schema
  → normalizált config object
  → explicit injection
```

### 4.3. Nincs globális, mindent validáló singleton

Tilos olyan modul, amely importkor az összes lehetséges capability konfigurációját kötelezővé teszi:

```ts
// TILOS
export const environment = globalSchema.parse(process.env);
```

Ez a minimal profilt adatbázis-, auth-, mail- vagy storage-követelményhez kötné akkor is, ha az adott capability nincs telepítve.

### 4.4. Capability-aware validáció

A `prisma-postgresql` csak adatbázisváltozókat, az `authentication` csak authváltozókat követelhet.

```text
minimal
  → nincs DATABASE_URL
  → nincs AUTH_SECRET

webapp + prisma-postgresql
  → DATABASE_URL kötelező

webapp + authentication
  → AUTH_SECRET kötelező
```

### 4.5. Immutable konfiguráció

A validált config objektumot readonlyként kell kezelni. A runtime kód nem írhatja vissza a `process.env` objektumba, és nem módosíthatja globálisan a konfigurációt.

A konfiguráció változtatása:

```text
deployment config változás
→ új process vagy új request-time feloldás
→ kontrollált rollout
```

nem pedig:

```text
alkalmazáskód
→ process.env módosítás
```

---

## 5. Konfigurációs források és autoritási sorrend

### 5.1. Forrástípusok

A Winzard-projekt konfigurációs forrásai:

1. **Kódba írt invariánsok**
   Olyan értékek, amelyek nem deploymentfüggők és csak kódverzióval változhatnak.

2. **Winzard manifest**
   Profil, capability-k és azok publikus contractja.

3. **Framework- és toolkonfiguráció**
   `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `prisma.config.ts`, tesztkonfiguráció.

4. **Környezeti változók**
   Deployment- vagy gépfüggő stringértékek és secretek.

5. **Secret manager által injektált értékek**
   Runtime environment, mountolt fájl vagy támogatott provider adapter.

6. **Feature flag provider**
   Runtime rollout- és kill-switch állapot.

7. **Request context**
   Actor, tenant, locale és request-derived adatok; ezek nem írhatják felül az alkalmazásconfigot.

### 5.2. Precedencia

Ugyanazon env kulcs Next.js alatt az alábbi sorrendben kerül feloldásra; az első találat nyer:

```text
process.env
.env.$NODE_ENV.local
.env.local               # test környezetben kimarad
.env.$NODE_ENV
.env
```

A Winzard erre nem épít további, rejtett `.env` precedenciaréteget.

### 5.3. Manifest és env kapcsolata

A manifest azt mondja meg, **melyik capability aktív**. Az env azt mondja meg, **milyen deploymentértékkel működik az aktív capability**.

Tilos:

```text
DATABASE_URL létezik
→ automatikusan bekapcsoljuk a database capability-t
```

Használandó:

```text
manifestben prisma-postgresql aktív
→ database env schema kötelező
```

### 5.4. Request input nem override

Tilos konfigurációt query stringből, headerből vagy cookie-ból felülírni:

```text
?LOG_LEVEL=debug
X-App-Stage: production
cookie: FEATURE_ADMIN=true
```

Ha requestfüggő policy szükséges, azt authorizált feature flag vagy tenant-konfiguráció kezeli, nem nyers env override.

### 5.5. Parancssori override

Egy CLI-parancs saját, dokumentált flagje felülírhatja a CLI-művelet viselkedését, de nem módosíthatja csendben az alkalmazás runtime konfigurációját.

Példa:

```bash
pnpm forge docs:init --prefix=ATLAS
```

A `--prefix` a konkrét generálási művelet inputja. Nem globális `APP_PREFIX` környezeti override.

---

## 6. Ajánlott projektstruktúra

Egy teljes webapp profil konfigurációs felülete például:

```text
project/
├─ winzard.json
├─ package.json
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ vitest.config.ts
├─ prisma.config.ts
├─ .env.example
├─ .env.test
├─ .gitignore
│
├─ src/
│  ├─ app/
│  ├─ composition/
│  │  ├─ app.ts
│  │  ├─ catalog.ts
│  │  └─ auth.ts
│  │
│  ├─ platform/
│  │  ├─ config/
│  │  │  ├─ app-env.ts
│  │  │  ├─ public-config.ts
│  │  │  └─ deployment-stage.ts
│  │  ├─ database/
│  │  │  └─ database-env.server.ts
│  │  ├─ auth/
│  │  │  └─ auth-env.server.ts
│  │  ├─ mail/
│  │  │  └─ mail-env.server.ts
│  │  └─ storage/
│  │     └─ storage-env.server.ts
│  │
│  └─ modules/
│
├─ tests/
│  ├─ config/
│  └─ setup/
│
└─ docs/
   ├─ 30-architecture/specifications/
   ├─ 60-operations/environments/
   └─ 80-winzard/platform-contracts/
```

### 6.1. Nem kötelező központi `config/` könyvtár

A Winzard nem követeli, hogy minden beállítás egyetlen root `config/` mappában legyen. A capability-ownership fontosabb a fizikai központosításnál.

### 6.2. Config és adapter együtt

Az adapterhez szorosan tartozó schema az adapter közelében maradhat:

```text
src/platform/database/database-env.server.ts
src/platform/mail/mail-env.server.ts
```

Ez csökkenti annak esélyét, hogy a konfigurációs contract eltávolodjon a tényleges felhasználójától.

### 6.3. Publikus és szerveroldali fájlok

Szerveroldali konfigurációs modul:

```text
*.server.ts
+ import 'server-only'
```

Publikus kliensconfig:

```text
public-config.ts
→ kizárólag allowlistelt, secretmentes mezők
```

---

## 7. A Winzard manifest mint capability-konfiguráció

A projekt manifestje:

```text
winzard.json
```

vagy:

```text
package.json#winzard
```

A két forrás közül pontosan egy támogatott, egyértelmű manifestet kell használni.

### 7.1. Minimális példa

```json
{
  "schemaVersion": 1,
  "profile": "minimal",
  "capabilities": [
    "next-app",
    "forge",
    "project-documentation"
  ],
  "documentation": {
    "contractVersion": 1,
    "projectPrefix": "ATLAS",
    "consumerContractVersion": "0.1.0",
    "contextBudgetBytes": 262144
  }
}
```

### 7.2. Webapp példa

```json
{
  "schemaVersion": 1,
  "profile": "webapp",
  "capabilities": [
    "next-app",
    "forge",
    "modular-application",
    "liveness",
    "prisma-postgresql",
    "database-readiness",
    "project-documentation"
  ]
}
```

### 7.3. A manifest nem secret store

Tilos a manifestben:

```json
{
  "databasePassword": "secret",
  "authSecret": "secret",
  "apiToken": "secret"
}
```

A manifest Gitben verziózott, ember és automatizmus által olvasható projektcontract.

### 7.4. Capability és configuration block

Egy capability opcionálisan saját strukturált, secretmentes manifestblokkot kaphat, ha:

- a schema verziózott;
- a mezők build- vagy source-konfigurációk;
- secret nem kerül bele;
- a recipe tulajdonolja;
- a Forge validálja;
- kompatibilitási szabály tartozik hozzá.

Példa célcontract:

```json
{
  "capabilityConfig": {
    "localization": {
      "defaultLocale": "hu",
      "supportedLocales": ["hu", "en"]
    }
  }
}
```

Ez még nem jelenti azt, hogy minden runtime értéket a manifestbe kell tenni.

### 7.5. Ismeretlen mezők

A manifest parsernek fail-closed vagy legalább warning-alapú policyt kell használnia schema verzió szerint. A csendben figyelmen kívül hagyott elgépelés konfigurációs driftet okoz.

```text
capabilites
```

nem lehet a `capabilities` mező hallgatólagos hiánya.

---

## 8. `next.config.ts`: framework- és build-konfiguráció

A Next.js frameworkkonfigurációja a projekt gyökerében lévő `next.config.ts`.

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
};

export default nextConfig;
```

### 8.1. Mire való?

A `next.config.ts` tulajdonolhat:

- build outputot;
- framework feature-kapcsolókat;
- redirects/rewrites/headereket;
- image allowlistet;
- route typingot;
- package bundlingot;
- cache handler wiringot;
- deployment ID-t;
- framework-szintű body limiteket;
- build ID-t.

### 8.2. Mire nem való?

Nem lehet:

- runtime secret bag;
- domainkonfiguráció;
- user- vagy tenantbeállítás;
- requestfüggő policy;
- általános application service factory;
- kliensre biztonságosan kiadható config automatikus forrása.

### 8.3. Betöltési fázis

A `next.config.ts` a Next.js build- és szerverfázisaiban futó Node.js modul. Nem kerül automatikusan a browser bundle-be, de az innen származó frameworkbeállítások és az `env` opció értékei beépülhetnek a buildbe.

### 8.4. Az `env` next.config opció

A Next.js `env` konfiguráció legacy API, és az ott megadott értékek mindig a JavaScript bundle-be kerülnek.

Tilos secrethez:

```ts
const nextConfig: NextConfig = {
  env: {
    AUTH_SECRET: process.env.AUTH_SECRET,
  },
};
```

Még akkor is veszélyes, ha a kulcs neve nem `NEXT_PUBLIC_`.

### 8.5. Phase-alapú konfiguráció

A Next.js támogat phase-függő config functiont, de Winzardban csak framework-indokkal használható.

Nem ajánlott több, jelentősen eltérő alkalmazást generálni ugyanabból a source-ból pusztán phase-branchinggel.

### 8.6. Async config

Async `next.config` használatakor:

- hálózati fetch NEM AJÁNLOTT;
- a build reprodukálhatóságát meg kell őrizni;
- secret vagy remote config provider elérhetetlensége fail-closed legyen;
- a build inputot provenance-szel kell rögzíteni;
- ugyanazon commitnak azonos deklarált buildinput mellett azonos artifactot kell adnia.

---

## 9. Konfigurációs formátumok

A Symfony YAML és PHP konfigurációt támogat. A Winzard a következő formátumokat használja, eltérő szereppel.

### 9.1. TypeScript

Elsődleges választás:

- típusos config factory;
- schema;
- immutable object;
- explicit composition;
- IDE támogatás;
- unit tesztelhetőség.

```ts
export const catalogConfig = Object.freeze({
  defaultPageSize: 25,
  maximumPageSize: 100,
});
```

### 9.2. JSON

Alkalmas:

- manifesthez;
- gépi contracthoz;
- generated metadatahoz;
- vendorsemleges konfigurációhoz.

Hátránya:

- nincs komment;
- nincs függvény;
- nincs natív enum/type;
- az unknown mezők külön validációt igényelnek.

### 9.3. YAML

YAML használható dokumentációs frontmatterhez és bizonyos külső toolinghoz, de a Winzard alkalmazásconfig alapértelmezett runtime formátuma nem YAML.

YAML-kockázatok:

- implicit típusok;
- anchor/alias komplexitás;
- parserkülönbségek;
- kevésbé erős TypeScript integráció;
- túl dinamikus összevonás.

### 9.4. `.env`

A `.env` stringalapú deployment input. Nem strukturált alkalmazáskonfigurációs nyelv.

### 9.5. Formátumválasztási szabály

| Igény | Formátum |
| --- | --- |
| capability deklaráció | JSON manifest |
| framework build config | TypeScript |
| runtime env input | environment / `.env*` |
| validáció | TypeScript + Zod |
| secret | deployment secret store |
| dokumentációs metadata | YAML frontmatter |
| generated provenance | JSON |
| üzleti/admin config | adatmodell + application contract |

### 9.6. Egy érték ne legyen több helyen autoritatív

Tilos ugyanazt az értéket párhuzamosan karbantartani:

```text
manifest
+ TypeScript constant
+ .env
+ README
```

Egy hely a source of truth; a többi projekció vagy hivatkozás.

---

## 10. Konfiguráció importálása és kompozíciója

### 10.1. Statikus import

A Winzard alapértelmezett konfigurációs kompozíciója explicit TypeScript import:

```ts
import { parseAppEnvironment } from '@/platform/config/app-env';
import { getDatabaseEnvironment } from '@/platform/database/database-env.server';

export function createPlatformConfig(input: NodeJS.ProcessEnv) {
  return Object.freeze({
    app: parseAppEnvironment(input),
    database: getDatabaseEnvironment(input),
  });
}
```

### 10.2. Nincs implicit glob import

Nem ajánlott:

```ts
glob('src/**/config.*')
```

és minden fájl automatikus, sorrendfüggő összeolvasztása.

Kockázatok:

- rejtett precedencia;
- véletlen duplikáció;
- nehéz tree-shaking;
- bundler- és runtime-különbség;
- nem determinisztikus ownership;
- secret kliensoldali importja.

### 10.3. Optional import

Egy konfigurációs fájl hiányát csak akkor szabad figyelmen kívül hagyni, ha:

1. a manifest szerint a capability nincs telepítve; vagy
2. a schema explicit opcionális fájlként definiálja; és
3. a hiány determinisztikus, dokumentált defaultot jelent.

Tilos általános:

```ts
try {
  await import('./config');
} catch {
  // ignore every error
}
```

Ez a syntax-, permission- és runtimehibát is elrejti.

### 10.4. Merge-stratégia

Config objektumok merge-elésekor explicit szabály kell:

```text
replace
deep merge
append
set union
deny duplicate
```

A legtöbb security- és capability-config esetén az **ismeretlen vagy duplikált kulcs hiba** jobb, mint a csendes deep merge.

### 10.5. Import path és biztonság

User input, env vagy tenantadat nem képezhet közvetlen filesystem import pathot:

```ts
// TILOS
await import(`./config/${process.env.APP_STAGE}.ts`);
```

Használj allowlist registryt:

```ts
const stagePolicies = {
  local: localPolicy,
  preview: previewPolicy,
  production: productionPolicy,
} as const;
```

---

## 11. Statikus paraméterek és invariánsok

Nem minden változó env.

### 11.1. Kódba való érték

Kódba való, ha:

- minden deploymentben azonos;
- a contract része;
- változtatása code review-t és release-t igényel;
- nem secret;
- nem operációs tuning;
- nem ügyfél- vagy tenantfüggő.

```ts
export const productListPolicy = Object.freeze({
  absoluteMaximumPageSize: 100,
  defaultSort: 'createdAt.desc',
});
```

### 11.2. Envbe való érték

Envbe való, ha:

- deploymentfüggő endpoint vagy credential;
- infrastruktúra cím;
- region;
- process tuning;
- secret;
- rollout során redeploy nélkül vagy újraindítással változtatható operációs érték.

### 11.3. Adatbázisba való érték

Adatbázisba vagy feature-management rendszerbe való, ha:

- admin vagy üzleti szereplő módosítja;
- auditálni kell;
- tenant- vagy userfüggő;
- időzített;
- összetett jogosultsággal rendelkezik;
- üzleti workflow része.

### 11.4. Az env nem adminfelület

Tilos envvel modellezni például:

```text
aktuális ÁFA-kulcs
termékár
felhasználói limit
tenant subscription plan
tartalommoderációs döntés
```

Ezek üzleti adatok vagy policyk.

---

## 12. Capability-specifikus konfigurációs ownership

Minden recipe és capability dokumentálja:

```text
provides
requires
configuration keys
environment keys
secret keys
defaults
validation
resolution phase
restart/rebuild behavior
diagnostic command
removal behavior
```

### 12.1. Database capability

```text
owner: prisma-postgresql
keys:
  DATABASE_URL
  DATABASE_POOL_MAX
  DATABASE_CONNECTION_TIMEOUT_MS
phase:
  process-start
classification:
  DATABASE_URL: secret
  tuning values: internal
```

### 12.2. Authentication capability

```text
owner: authentication
keys:
  AUTH_SECRET
phase:
  process-start vagy adapterfüggő build/runtime
classification:
  secret
```

### 12.3. Recipe telepítés

A recipe:

- hozzáadja a schema fájlt;
- frissíti az `.env.example` dokumentált kulcsait;
- frissíti a manifest capability-listáját;
- hozzáadja a Forge env checket;
- dokumentálja a secret ownershipot;
- eltávolításkor nem töröl ismeretlen user-owned értéket csendben.

### 12.4. Nincs platform-wide kulcsnévütközés

A capability-k KÖTELEZŐEN kerülik a generikus kulcsokat:

```text
URL
SECRET
TIMEOUT
TOKEN
ENABLED
```

Használható:

```text
DATABASE_URL
AUTH_SECRET
MAIL_PROVIDER_TOKEN
STORAGE_ENDPOINT
CATALOG_SEARCH_TIMEOUT_MS
```

---

## 13. Általános alkalmazáskonfiguráció

Az alkalmazás általános, nem capability-specifikus környezeti szerződése lehet:

```ts
import { z } from 'zod';

export const appEnvironmentSchema = z.object({
  APP_URL: z.url(),
  APP_NAME: z.string().trim().min(1).max(128),
  APP_STAGE: z.enum([
    'local',
    'preview',
    'staging',
    'production',
  ]),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
});

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).max(128),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export function parseAppEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AppEnvironment {
  return appEnvironmentSchema.parse({
    APP_URL: input.APP_URL,
    APP_NAME: input.APP_NAME,
    APP_STAGE: input.APP_STAGE,
    LOG_LEVEL: input.LOG_LEVEL,
  });
}
```

### 13.1. Tiszta parser

A parser:

- nem olvassa automatikusan a `process.env` objektumot importkor;
- explicit inputot kap;
- tesztelhető;
- nem mutál;
- nem logol nyers értékeket;
- nem hoz létre infrastruktúra-kapcsolatot.

### 13.2. APP_URL

Az `APP_URL`:

- canonical origin;
- URL-generálás inputja;
- nem request Host headerből következtetett megbízható érték;
- HTTPS productionben;
- path nélküli vagy dokumentált base pathos URL;
- nem tartalmaz credentialt.

### 13.3. APP_NAME és public megfelelője

Az `APP_NAME` szerveroldali használatra való. A `NEXT_PUBLIC_APP_NAME` explicit kliensoldali buildinput.

A két érték lehet azonos, de lifecycle-juk eltér. A public változó buildidőben rögzülhet.

### 13.4. LOG_LEVEL

A log level:

- enum;
- productionben safe defaulttal rendelkezhet;
- secretértéket nem kapcsolhat ki/be;
- debug log productionben sem írhat credentialt;
- process-startkor rögzíthető.

---

## 14. Adatbázis-konfiguráció

A database schema kizárólag a database adapter tulajdona:

```ts
import 'server-only';

import { z } from 'zod';

function boundedIntegerEnvironmentValue(
  minimum: number,
  maximum: number,
) {
  return z.string()
    .trim()
    .regex(/^\d+$/u, 'The value must be an integer.')
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));
}

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  }),
  DATABASE_POOL_MAX: boundedIntegerEnvironmentValue(1, 100),
  DATABASE_CONNECTION_TIMEOUT_MS:
    boundedIntegerEnvironmentValue(100, 60_000),
});

export type DatabaseEnvironment =
  z.infer<typeof databaseEnvironmentSchema>;

export function getDatabaseEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined> =
    process.env,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(input);
}
```

### 14.1. Server-only

A fájl `server-only` határt deklarál. Nem importálható Client Componentbe.

### 14.2. DSN parsing

A `DATABASE_URL` teljes formai és szemantikai ellenőrzése adapterben történik.

Legalább ellenőrizendő:

- scheme;
- host;
- port;
- database name;
- credential jelenléte, ha szükséges;
- SSL policy;
- tiltott query opciók;
- connection limit;
- logolási redakció.

### 14.3. URL redakció

Tilos teljes DSN-t logolni.

Használható redaktált diagnosztika:

```text
postgresql://***:***@db.internal:5432/app
```

### 14.4. Poolméret

A poolméret:

- pozitív egész;
- deployment concurrencyhez igazodik;
- több process/pod esetén összesített connection budgettel számolandó;
- nem lehet korlátlan;
- serverless és long-running runtime esetén eltérő policyt igényelhet.

### 14.5. Readiness

A database readiness csak a `database-readiness` capability mellett létezik. A minimal projekt nem követel adatbázis-konfigurációt.

---

## 15. Authentikációs konfiguráció

Az auth konfiguráció saját capability-határban marad:

```ts
import 'server-only';

import { z } from 'zod';

export const authEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32),
});

export type AuthEnvironment =
  z.infer<typeof authEnvironmentSchema>;

export function getAuthEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined> =
    process.env,
): AuthEnvironment {
  return authEnvironmentSchema.parse(input);
}
```

### 15.1. Secret minimum nem teljes security policy

A minimális hossz csak alapellenőrzés. A teljes policy meghatározhat:

- generálási módot;
- entrópiát;
- encodingot;
- aktív és előző kulcsot;
- rotation windowt;
- purpose separationt;
- environment isolationt;
- revocationt.

### 15.2. Nincs development fallback productionben

Tilos:

```ts
const secret = process.env.AUTH_SECRET ?? 'development-secret';
```

Ha productionben az auth capability aktív, hiányzó secret esetén fail-closed indulási hiba szükséges.

### 15.3. Kulcspurpose

Külön célhoz külön kulcs ajánlott:

```text
session signing
email token signing
webhook verification
field encryption
Server Action encryption
```

Egyetlen `AUTH_SECRET` nem lehet korlátlan általános master key.

### 15.4. Klienshatár

Auth secret és teljes auth config soha nem kerül:

- Client Component propba;
- `NEXT_PUBLIC_` kulcsba;
- `next.config.env` értékbe;
- browser source mapbe;
- publikus runtime config endpointba;
- dokumentációs evidence-be.

---

## 16. Publikus klienskonfiguráció

A kliensbe kerülő konfiguráció külön szerződés.

### 16.1. Alapelv

> Ami a browser bundle-be kerül, az nyilvánosnak tekintendő.

A `NEXT_PUBLIC_` prefix nem titkosít és nem authorizál. A prefix azt jelzi a Next.js számára, hogy az érték kliensoldali felhasználásra szánt és buildidőben beágyazható.

### 16.2. Allowlist

A kliens ne kapja meg a teljes env objektumot:

```ts
// TILOS
const publicConfig = process.env;
```

Használj explicit sémát:

```ts
import { z } from 'zod';

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1),
  NEXT_PUBLIC_SUPPORT_URL: z.url(),
  NEXT_PUBLIC_ANALYTICS_ID: z.string().trim().min(1).optional(),
});

export type PublicEnvironment =
  z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse(input);
}
```

### 16.3. Public nem feltétlenül browser-owned

Egy public config értéket lehet szerveren view modelbe rendezni:

```ts
export function toPublicAppConfig(
  environment: PublicEnvironment,
) {
  return Object.freeze({
    appName: environment.NEXT_PUBLIC_APP_NAME,
    supportUrl: environment.NEXT_PUBLIC_SUPPORT_URL,
  });
}
```

### 16.4. Tiltott publikus értékek

Tilos:

```text
database URL
service credential
private API token
session signing secret
internal hostnév, ha érzékeny
tenantlista
feature rollout célcsoportja
security bypass flag
private observability ingest secret
```

### 16.5. Analytics azonosító

Egy analytics project ID lehet public, de:

- vendor és adatkezelési policy dokumentált;
- consent kezelés külön történik;
- azonosító buildidőben fagyhat;
- staging és production elkülönül;
- a kliensbe kerülő azonosító nem ad adminjogot.

---

## 17. Build-time konfiguráció

Build-time az az érték, amelyet a buildfolyamat olvas, és amely hatással lehet:

- a kliensbundle-re;
- statikusan generált HTML-re;
- route metadata outputra;
- redirect/rewrite táblára;
- image allowlistre;
- build ID-re;
- output tracingre;
- generált kliensre;
- compiled schema/artifact tartalmára.

### 17.1. Tipikus build-time források

```text
next.config.ts
NEXT_PUBLIC_*
generateStaticParams()
statikusan prerenderelt route által olvasott env
Prisma Client generator input
feature-gated build output
```

### 17.2. Artifact promotion

Ha ugyanazt a Docker image-et több stage-en keresztül promotálod:

```text
build once
→ preview
→ staging
→ production
```

akkor minden build-time érték azonos marad.

Ez különösen igaz a `NEXT_PUBLIC_` változókra. Productionbe promótált artifact nem veszi fel automatikusan a production környezetben később beállított új public értéket.

### 17.3. Build input provenance

Ajánlott rögzíteni:

```text
git commit
Node/pnpm/Next version
manifest hash
next.config hash
public env key names
public env value hash vagy redaktált fingerprint
generated client/schema hash
build ID
```

Secret értéket nem szabad provenance logba írni.

### 17.4. Statikus render veszélye

Egy szerveroldali, nem `NEXT_PUBLIC_` env is build-time hatásúvá válhat, ha statikus prerenderelés közben olvassák.

Példa:

```tsx
export default function Page() {
  return <p>{process.env.DEPLOYMENT_LABEL}</p>;
}
```

Ha a route statikusan renderelődik, az érték az artifactba kerülhet.

### 17.5. Buildidőben hiányzó runtime secret

Runtime-only secretet nem szabad olyan modulban feloldani, amelyet a build importál és azonnal végrehajt.

A buildnek képesnek kell lennie arra, hogy runtime-infrastruktúra nélkül:

- typecheckeljen;
- route type-ot generáljon;
- statikus assetet építsen;

ha az adott route vagy capability ezt nem igényli buildidőben.

---

## 18. Process-start konfiguráció

Process-start konfiguráció az alkalmazáspéldány indulásakor feloldott érték.

### 18.1. Tipikus használat

```text
database pool
logger
auth adapter
mail client
object storage client
telemetry exporter
queue connection
```

### 18.2. Modul singleton

Egy szerveroldali adapter létrehozhat process-szintű singleton objektumot:

```ts
import 'server-only';

const databaseEnvironment = getDatabaseEnvironment();

export const databaseClient =
  createDatabaseClient(databaseEnvironment);
```

Ez akkor megfelelő, ha:

- a config a process élettartamára immutable;
- secretrotationkor process restart történik;
- a modul nem fut buildidőben olyan helyen, ahol a secret hiányzik;
- hot reload fejlesztésben kezelve van;
- a klienskapcsolat lifecycle-ja dokumentált.

### 18.3. Startup validation

A process indulásakor végzett validáció előnye:

- hibás deployment nem fogad forgalmat;
- readiness csak valid config után lesz sikeres;
- a hiba közel van az okhoz;
- a monitoring egyértelmű.

Hátránya:

- opcionális capability-ket nem szabad globálisan validálni;
- build és migration parancsok más configot igényelhetnek;
- egy processben nem használt adapter ne blokkolja az indulást.

### 18.4. Secretrotation

Process-startkor feloldott secret:

```text
secret manager update
→ nem feltétlenül frissül a futó processben
→ rolling restart vagy explicit reload szükséges
```

A rotation runbooknak meg kell adnia:

- dupla kulcsablakot;
- restart sorrendet;
- rollbacket;
- readiness ellenőrzést;
- régi kulcs eltávolítását.

---

## 19. Request-time szerverkonfiguráció

Request-time config csak szerveren, a bejövő kéréshez kötött végrehajtás során kerül feloldásra.

### 19.1. Használati esetek

- runtime deployment label;
- requestenként változó remote feature flag;
- gyorsan rotálható, providerből olvasott configuration snapshot;
- region- vagy tenantfüggetlen, de requestkor feloldott origin;
- dinamikus maintenance policy.

### 19.2. Dinamikus renderelés

Ha Server Componentben runtime env szükséges, biztosítani kell, hogy a kiértékelés ne prerendereléskor történjen.

```tsx
import { connection } from 'next/server';

export default async function RuntimeConfigPage() {
  await connection();

  const label = process.env.RUNTIME_DEPLOYMENT_LABEL ?? 'unknown';

  return <p>{label}</p>;
}
```

A `connection()` után következő kód bejövő requesthez kötődik.

### 19.3. Nem minden request-time érték env

A remote config provider értéke nem feltétlenül `process.env`. Lehet:

```text
feature flag SDK
config service
tenant config repository
edge config
signed deployment manifest
```

Ehhez port szükséges:

```ts
export interface RuntimeConfigurationProvider {
  getSnapshot(): Promise<RuntimeConfigurationSnapshot>;
}
```

### 19.4. Cache policy

Request-time config használatakor explicit döntés kell:

- request-local memoization;
- process cache TTL;
- shared cache;
- stale-while-revalidate;
- fail-open vagy fail-closed;
- fallback snapshot;
- audit.

Security flag, authorization policy vagy kill switch esetén fail-open általában nem megengedett.

### 19.5. Request config nem domain input helyett

A requestből származó tenant, actor vagy locale továbbra is explicit request context, nem globális config.

---

## 20. Konfiguráció lifecycle és frissítési mátrix

| Lifecycle | Feloldás | Változáshoz szükséges | Kliensbe kerülhet? | Példa |
| --- | --- | --- | --- | --- |
| source | import/compile | commit + release | csak explicit | max page size |
| build-time | `next build` | rebuild | igen, ha public | `NEXT_PUBLIC_APP_NAME` |
| process-start | server boot | restart/rollout | nem automatikusan | `DATABASE_URL` |
| request-time | request | provider/env változás + cache policy | csak allowlisten | remote flag |
| user/tenant data | application query | üzleti művelet | DTO szerint | locale preference |

### 20.1. Minden kulcs lifecycle-t kap

Példa documentation table:

| Key | Phase | Rebuild | Restart | Public | Secret |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | build | igen | nem elég | igen | nem |
| `DATABASE_URL` | process | nem | igen | nem | igen |
| `APP_STAGE` | process | nem | igen | nem | nem |
| `RUNTIME_BANNER_ENABLED` | request/provider | nem | nem feltétlenül | explicit | nem |

### 20.2. Drift

Config drift, ha:

- dokumentáció szerint runtime, de buildbe inlinelődik;
- secret új értéke nem jut el minden podhoz;
- ugyanaz a key más stage-en eltérő lifecycle-t használ;
- local `.env` elfedi a CI hibát;
- public és server változó eltérő, de az alkalmazás ugyanannak tekinti;
- a template `.env.example` nem egyezik a capability schema kulcsaival.

### 20.3. Változási hatás

Konfigurációs PR vagy deployment change tartalmazza:

```text
affected key
owner
old/new semantics
security classification
rebuild?
restart?
migration?
rollback?
observability?
docs?
```

---

## 21. `NODE_ENV` és deployment stage

### 21.1. `NODE_ENV`

A Next.js által támogatott `NODE_ENV` értékek:

```text
development
production
test
```

Nem ajánlott:

```text
NODE_ENV=staging
NODE_ENV=preview
NODE_ENV=qa
```

A framework és dependency-k sokszor pontosan a három standard értékre építenek.

### 21.2. Külön stage változó

Operációs stage-hez használj külön kulcsot:

```text
APP_STAGE=local
APP_STAGE=preview
APP_STAGE=staging
APP_STAGE=production
```

Schema:

```ts
import { z } from 'zod';

export const deploymentStageSchema = z.enum([
  'local',
  'preview',
  'staging',
  'production',
]);

export type DeploymentStage =
  z.infer<typeof deploymentStageSchema>;
```

### 21.3. Stage nem security boundary

Tilos kizárólag stage névre építeni authorizációt:

```ts
if (stage !== 'production') {
  return adminAccess;
}
```

Preview és staging is lehet internet felől elérhető, valódi adattal vagy credentiallel.

### 21.4. Stage és build

Ajánlott modell:

```text
NODE_ENV=production
APP_STAGE=preview | staging | production
```

mindhárom deployolt stage-en.

Így a production-optimalizált build használható több operációs környezetben.

### 21.5. Stage-specific behavior

Stage alapján eltérhet:

- log destination;
- telemetry sample rate;
- external sandbox endpoint;
- email sink;
- banner;
- destructive job engedélye.

A stage alapján nem térhet el észrevétlenül:

- domain invariant;
- authorization alapelv;
- adatvédelmi policy;
- migrációs schema jelentése.

---

## 22. Fejlesztési, production és test környezet

### 22.1. Development

Cél:

- gyors feedback;
- részletes, de redaktált log;
- lokális infrastruktúra;
- hot reload;
- safe development credential;
- productionnel kompatibilis schema.

Development nem indok a security contract kikapcsolására.

### 22.2. Production

Cél:

- minimális jogosultság;
- secret manager;
- HTTPS endpoint;
- kontrollált log;
- stabil runtime config;
- readiness;
- reprodukálható artifact;
- rolling rotation;
- auditált feature flag.

### 22.3. Test

A test konfiguráció:

- determinisztikus;
- developer machine-től független;
- nem használ production secretet;
- `.env.local` hatásától mentes;
- fixture-ből vagy explicit inputból épül;
- external service helyett fake/test adaptert használhat.

### 22.4. `.env.test`

Biztonságos, nem secret tesztdefault commitolható:

```dotenv
APP_URL=http://localhost:3000
APP_NAME=Winzard Test
LOG_LEVEL=error
NEXT_PUBLIC_APP_NAME=Winzard Test
```

Valós credential nem kerülhet bele.

### 22.5. Unit teszt

A pure schema teszt nem igényel `.env` fájlt:

```ts
import { describe, expect, it } from 'vitest';

describe('app environment', () => {
  it('parses valid values', () => {
    expect(parseAppEnvironment({
      APP_URL: 'http://localhost:3000',
      APP_NAME: 'Atlas',
      LOG_LEVEL: 'info',
      NEXT_PUBLIC_APP_NAME: 'Atlas',
    })).toMatchObject({
      APP_NAME: 'Atlas',
    });
  });
});
```

---

## 23. Staging, preview, QA és review deploymentek

A Symfony új environmentet enged külön config directoryval. Winzardban a legtöbb staging/preview különbséget nem új `NODE_ENV`, hanem deployment stage és runtime config kezeli.

### 23.1. Ajánlott stratégia

```text
azonos source
azonos production build mód
azonos schema
eltérő runtime env
eltérő secret namespace
eltérő külső endpoint
eltérő adatbázis
```

### 23.2. Preview deployment

Preview esetén:

- izolált database vagy read-only fake;
- rövid életű secret;
- production customer data tiltott vagy maszkolt;
- callback URL dinamikus origin resolverből;
- public env buildkor a preview URL-hez igazodhat;
- cleanup policy szükséges.

### 23.3. Staging parity

A staging legyen productionhöz hasonló:

- Node runtime;
- proxy/CDN;
- cache handler;
- secret injection;
- database SSL;
- multi-instance viselkedés;
- readiness és observability.

### 23.4. QA flag

QA funkció ne legyen rejtett, auth nélküli URL vagy kliensflag.

Használj:

- explicit QA actor/role;
- szerveroldali feature flag;
- audit;
- environment-isolated data.

### 23.5. Symlinkes config könyvtárak

Environment-specifikus config symlinkek NEM AJÁNLOTTAK:

- platformfüggők;
- container buildben meglepetést okozhatnak;
- ownershipot elrejtik;
- Windows checkout eltérhet;
- diff és audit nehezebb.

Használj explicit közös factoryt és kis stage-specifikus értékobjektumot.

---

## 24. Capability és feature flag különbsége

### 24.1. Capability

A Winzard capability:

- telepített struktúrát jelent;
- dependency-ket adhat;
- fájlokat és parancsokat adhat;
- schema és env követelményt aktivál;
- build/deployment alakját módosíthatja.

Példa:

```text
prisma-postgresql
authentication
project-documentation
ai-delivery
```

### 24.2. Feature flag

A feature flag:

- egy már telepített kódútvonal runtime engedélyezése;
- rollout;
- experiment;
- kill switch;
- tenant/user célzás;
- időzített bekapcsolás.

### 24.3. Tilos env-létezésből capabilityt következtetni

```text
AUTH_SECRET jelen van
≠ authentication capability telepítve
```

### 24.4. Flag metadata

Minden flaghez ajánlott:

```yaml
key: checkout-v2
owner: role:checkout-maintainer
type: release
default: false
created: 2026-07-18
expires: 2026-09-01
fallback: false
failure_mode: closed
```

### 24.5. Flag lifecycle

```text
create
→ dark deploy
→ internal rollout
→ partial rollout
→ full rollout
→ code cleanup
→ flag removal
```

A permanent, owner nélküli flag konfigurációs adósság.

### 24.6. Public flag

Kliensoldali flag csak UI-optimalizáció. A szerveroldali authorization és business enforcement nem támaszkodhat kizárólag browser flagre.

---

## 25. `.env` fájlok alapjai

A Next.js a projekt gyökerében lévő `.env*` fájlokat tölti be `process.env` alá.

`src/` használatakor is a projekt gyökerében maradnak:

```text
project/.env
project/.env.local
project/src/
```

Nem:

```text
project/src/.env
```

### 25.1. Git policy

A Winzard alapértelmezése:

| Fájl | Commit? | Tartalom |
| --- | --- | --- |
| `.env.example` | igen | kulcsok, safe példa, placeholder |
| `.env` | általában nem | lokális vagy project default; repo policy dönti el |
| `.env.local` | nem | gépspecifikus érték |
| `.env.development.local` | nem | gépspecifikus dev |
| `.env.test` | igen, ha secretmentes | determinisztikus test default |
| `.env.test.local` | nem | lokális test override |
| `.env.production` | általában nem | production secretet nem tárolunk Gitben |
| `.env.production.local` | nem | lokális/deployment override, de productionben secret manager ajánlott |

A Next.js default template minden `.env` fájlt ignore-ol. A Winzard `.env.example` fájlt explicit kivételként verziózhatja.

### 25.2. `.env.example`

Példa:

```dotenv
APP_URL=http://localhost:3000
APP_NAME=Atlas
LOG_LEVEL=debug
NEXT_PUBLIC_APP_NAME=Atlas

# Added by prisma-postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/atlas
DATABASE_POOL_MAX=10
DATABASE_CONNECTION_TIMEOUT_MS=5000

# Added by authentication
AUTH_SECRET=<generate-at-least-32-random-characters>
```

A placeholder nem lehet működő production secret.

### 25.3. Kommentek

A `.env.example` dokumentálhatja:

- owner capability;
- required/optional;
- format;
- default;
- secret;
- lifecycle;
- rebuild/restart hatás.

### 25.4. `.env` nem schema

A komment nem helyettesíti a runtime validációt.

---

## 26. `.env` szintaxis és változóexpanzió

### 26.1. Alapérték

```dotenv
APP_NAME=Atlas
```

### 26.2. Idézőjelek

```dotenv
APP_NAME="Atlas Commerce"
```

Az idézés és escape viselkedését a használt dotenv loader szerint kell tesztelni.

### 26.3. Multiline

A Next.js támogat idézőjelezett multiline értéket és `\n` escape-et. Privát kulcsot azonban általában jobb secret managerből mountolni vagy base64/PEM fájlként kezelni, mint hosszú `.env` értékként.

### 26.4. Változóreferencia

```dotenv
TWITTER_USER=atlas
TWITTER_URL=https://example.com/$TWITTER_USER
```

A `$` literal escape-elendő:

```dotenv
PRICE_TEMPLATE=\$VALUE
```

### 26.5. Sorrend

Ha egyik változó a másikra hivatkozik, a loader és a fájlok precedenciája befolyásolja az eredményt. A Winzard AJÁNLOTTAN kerüli az összetett, több fájlon átívelő env-expanziót.

### 26.6. Üres string

```dotenv
OPTIONAL_VALUE=
```

Ez nem azonos a hiányzó kulccsal. A schema külön döntse el, hogy:

```text
undefined
empty string
whitespace
null text
```

mit jelent.

### 26.7. Komment a sor végén

Az értékben szereplő `#`, whitespace és idézőjel loaderfüggő meglepetést okozhat. Secret vagy DSN esetén explicit idézés és teszt ajánlott.

### 26.8. Case

A Winzard env kulcsai nagybetűs `UPPER_SNAKE_CASE` formátumúak. Windows alatt az operációs környezet case-insensitive lehet, ezért két, csak kis-/nagybetűben eltérő kulcs használata TILOS.

---

## 27. Next.js env betöltési sorrend

A Next.js a következő sorrendben keres egy kulcsot, és az első találatnál megáll:

```text
1. process.env
2. .env.$NODE_ENV.local
3. .env.local              # NODE_ENV=test esetén kimarad
4. .env.$NODE_ENV
5. .env
```

### 27.1. Példa

Ha:

```text
NODE_ENV=development
process.env.APP_NAME nincs
.env.development.local: APP_NAME=Local
.env: APP_NAME=Default
```

akkor:

```text
APP_NAME=Local
```

### 27.2. System env nyer

A deployment platform által beállított `process.env` megelőzi a `.env*` fájlokat.

A Winzard nem támogat olyan általános módot, amely productionben csendben felülírja a platform által injektált értéket lokális fájlból.

### 27.3. Test specialitás

`NODE_ENV=test` alatt `.env.local` nem töltődik be. Ez segíti a reprodukálhatóságot.

### 27.4. Diagnosztikai következmény

Hibaelhárításkor rögzíteni kell:

```text
NODE_ENV
project root
vizsgált fájlok létezése
kulcs forrása
kulcs jelen van-e
érték redaktált fingerprintje
```

A teljes secretértéket nem szabad kiírni.

### 27.5. Monorepo

Minden Next.js alkalmazás saját project rootja alapján tölti az envet. A workspace gyökér és az app gyökér összekeverése gyakori hiba.

Explicit:

```bash
next dev apps/web
```

esetén ellenőrizd, hogy az env fájl a tényleges Next project rootban van-e.

---

## 28. `.env.example`, lokális override és production értékek

### 28.1. `.env.example` mint contract

A fájl:

- nem runtime source of truth;
- kulcsinventár;
- onboarding segédlet;
- safe placeholder;
- capability ownership projekció.

A schema az autoritatív formai contract.

### 28.2. Lokális override

A developer:

```bash
cp .env.example .env.local
```

majd gépspecifikus értékeket ad meg.

A `.env.local`:

- gitignored;
- nem review-zott;
- nem CI source;
- nem evidence;
- nem használható production runbook helyett.

### 28.3. Production

Productionben ajánlott:

```text
deployment platform environment
secret manager injection
container orchestrator secret
mounted secret file adapter
```

A production `.env.local` fájl csak kontrollált, megfelelő permissionnel és lifecycle-lal rendelkező deployment artifactként elfogadható; Gitből nem származhat.

### 28.4. Template frissítés

Recipe telepítéskor vagy eltávolításkor az `.env.example` változását merge-aware módon kell kezelni:

- user commentet ne töröljön;
- ismeretlen kulcsot ne távolítson el;
- duplikált kulcsot jelezzen;
- ownership megjegyzést tartsa;
- eltávolításkor orphan warningot adjon.

### 28.5. Secret scanner

CI-ben ajánlott ellenőrizni:

- véletlen `.env.local` commit;
- high-entropy token;
- private key;
- cloud credential;
- connection string credentialdel;
- dokumentációs kódblokkban lévő valósnak tűnő secret.

---

## 29. Production konfiguráció injektálása

### 29.1. Környezeti változó

A leggyakoribb forma:

```text
orchestrator/platform
→ process environment
→ capability schema
→ adapter
```

### 29.2. Mountolt fájl

Nagy, multiline vagy rotálható secrethez:

```text
/run/secrets/auth_private_key
```

Külön file loader adapter:

```ts
import 'server-only';

import { readFile } from 'node:fs/promises';

export async function loadSecretFile(path: string): Promise<string> {
  const value = await readFile(path, 'utf8');
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error('Secret file is empty.');
  }

  return trimmed;
}
```

A path maga lehet envből validált allowlistelt filesystem path.

### 29.3. Secret manager API

Provider adapter:

```ts
export interface SecretProvider {
  read(name: SecretName): Promise<SecretValue>;
}
```

Követelmények:

- TLS;
- workload identity;
- timeout;
- retry budget;
- cache policy;
- rotation;
- audit;
- redakció;
- fail-closed security secretnél.

### 29.4. Bootstrap chicken-and-egg

A secret manager eléréséhez szükséges credentialt lehetőleg workload identity, instance role vagy platform identity adja, ne újabb hosszú életű env token.

### 29.5. Production diagnosztika

Csak ezt jelezd:

```text
AUTH_SECRET: present [redacted]
DATABASE_URL: present [redacted]
```

Ne ezt:

```text
AUTH_SECRET=actual-secret
DATABASE_URL=postgresql://user:password@...
```

---

## 30. Runtime konfiguráció és promotálható artifact

### 30.1. Build once, deploy many

A Winzard AJÁNLOTT deployment modellje:

```text
egy commit
→ egy build artifact
→ több deployment stage
→ runtime server config stage-enként
```

Ehhez a stage-enként változó értékek nem kerülhetnek build-time kliensbundle-be.

### 30.2. Runtime server env App Routerben

Dinamikus szerverrenderelés során a server-only env runtime értéke olvasható.

Azonban figyelni kell:

- statikus prerender;
- module evaluation;
- process singleton;
- cache;
- Server Component output;
- edge/runtime limit;
- buildtime import.

### 30.3. Public runtime config

Ha browsernek stage-enként runtime public config kell, a `NEXT_PUBLIC_` nem elég promotálható artifacthoz.

Lehetséges megoldások:

1. szerverrenderelt, allowlistelt props;
2. `/api/public-config` Route Handler;
3. HTML-be ágyazott, escaped JSON bootstrap;
4. deployment által generált statikus public config fájl.

### 30.4. Public config endpoint

```ts
import { publicRuntimeConfig } from '@/composition/public-runtime-config';

export function GET(): Response {
  return Response.json(publicRuntimeConfig(), {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
```

Követelmények:

- explicit DTO;
- secretmentes;
- schema;
- cache policy;
- version;
- CSP/escaping, ha HTML-be ágyazott;
- tenant/user adat nélkül vagy megfelelő private cache-sel.

### 30.5. Hydration consistency

Ha server és client ugyanazt a public runtime configot használja, ugyanazt a snapshotot kell átadni a kezdeti renderhez. Külön fetchből származó eltérés hydration vagy UI flicker problémát okozhat.

---

## 31. `NEXT_PUBLIC_` változók és buildidőben rögzülő értékek

### 31.1. Inlining

A Next.js a közvetlen hivatkozásokat buildidőben behelyettesítheti:

```ts
setupAnalytics(process.env.NEXT_PUBLIC_ANALYTICS_ID);
```

A production bundle lényegében a buildkor látott literal értéket tartalmazza.

### 31.2. Dinamikus lookup

A dinamikus hozzáférés nem feltétlenül inlinelődik:

```ts
const key = 'NEXT_PUBLIC_ANALYTICS_ID';
process.env[key];
```

és:

```ts
const environment = process.env;
environment.NEXT_PUBLIC_ANALYTICS_ID;
```

Erre nem szabad konfigurációs stratégiát építeni. A bundler viselkedésének megkerülése nem runtime public config megoldás.

### 31.3. Rebuild szükséges

Változás után:

```text
NEXT_PUBLIC_* módosítás
→ új next build
→ új artifact
```

A process restart önmagában nem garantál friss browser értéket.

### 31.4. Secret exposure

Tilos secretet `NEXT_PUBLIC_` prefixszel átnevezni azért, hogy Client Component hozzáférjen.

```text
NEXT_PUBLIC_DATABASE_URL
NEXT_PUBLIC_AUTH_SECRET
NEXT_PUBLIC_ADMIN_TOKEN
```

mind security hiba.

### 31.5. Public config review

Minden új `NEXT_PUBLIC_` kulcs PR-ja válaszolja meg:

```text
Miért szükséges a browsernek?
Milyen user láthatja?
Van-e érzékeny metadata?
Build-time fagyás elfogadható?
Mi a default?
Mikor távolítjuk el?
Milyen CSP/privacy hatása van?
```

### 31.6. `next.config.env`

A `next.config` `env` opciója legacy és minden ott megadott értéket bundle-be helyezhet. Winzardban kerülendő; a szabványos `.env*` + `NEXT_PUBLIC_` vagy explicit public runtime DTO használatos.

---

## 32. Runtime publikus konfiguráció biztonságosan

### 32.1. Külön schema

```ts
import { z } from 'zod';

const runtimePublicConfigSchema = z.object({
  appName: z.string().min(1),
  supportUrl: z.url(),
  deploymentLabel: z.string().max(64),
  statusPageUrl: z.url().optional(),
});

export type RuntimePublicConfig =
  z.infer<typeof runtimePublicConfigSchema>;
```

### 32.2. Szerveroldali factory

```ts
import 'server-only';

export function createRuntimePublicConfig(
  input: NodeJS.ProcessEnv,
): RuntimePublicConfig {
  return runtimePublicConfigSchema.parse({
    appName: input.APP_NAME,
    supportUrl: input.SUPPORT_URL,
    deploymentLabel: input.DEPLOYMENT_LABEL ?? 'unknown',
    statusPageUrl: input.STATUS_PAGE_URL,
  });
}
```

Az input server-only, az output public allowlist.

### 32.3. Version és cache

Ajánlott DTO:

```ts
type PublicConfigEnvelope = Readonly<{
  version: 1;
  generatedAt: string;
  config: RuntimePublicConfig;
}>;
```

Cache:

- globális, minden usernek azonos config: public cache engedhető;
- tenantfüggő config: `private` vagy tenant-safe cache key;
- userfüggő config: private/no-store;
- emergency flag: rövid TTL.

### 32.4. JSON beágyazása HTML-be

Tilos nyers stringkonkatenáció:

```tsx
<script>{`window.CONFIG=${JSON.stringify(config)}`}</script>
```

ha nincs megfelelő escaping és CSP policy.

Biztonságosabb:

- React propként átadni;
- JSON Route Handlerből kérni;
- auditált serialization helper;
- `</script>` escape;
- nonce/hash CSP.

### 32.5. Browser trust

A browser config manipulálható. Szerveroldali security döntés nem bízhat benne.

---

## 33. Next.js-en kívüli toolok env-betöltése

A Next.js automatikus `.env*` betöltése csak a Next runtime és parancsok kontextusában garantált.

Külső tool példák:

```text
Prisma CLI
Vitest setup
Playwright config
standalone migration script
seed script
code generator
custom Forge command
```

### 33.1. `@next/env`

Ha ugyanazt a load ordert akarod használni:

```ts
// env-config.ts
import { loadEnvConfig } from '@next/env';

const projectDirectory = process.cwd();

loadEnvConfig(projectDirectory);
```

Majd:

```ts
import './env-config';

export default defineToolConfig({
  endpoint: process.env.SERVICE_URL,
});
```

### 33.2. `dotenv/config`

Egyszerű eszköznél használható:

```ts
import 'dotenv/config';
```

De a betöltési sorrend és a több `.env.*` fájl kezelése eltérhet a Next.js teljes logikájától. Ha egyezés szükséges, `@next/env` ajánlott.

### 33.3. Kettős betöltés

Kerülendő:

```text
Next.js automatikusan tölt
+ saját dotenv loader újra tölt
+ overrideExisting=true
```

Ez felülírási meglepetést okozhat.

### 33.4. Tool project root

Monorepóban explicit root:

```ts
loadEnvConfig(path.resolve(import.meta.dirname, '../..'));
```

A `process.cwd()` a hívási helytől függhet CI-ben vagy workspace scriptben.

### 33.5. Tool-specifikus schema

A tool ne követelje az egész webapp envet. Migration CLI csak a migrationhöz szükséges kulcsokat validálja.

---

## 34. Prisma konfiguráció

A Prisma config minden Prisma CLI-parancsnál betöltődhet. Ezért nem tehet olyan kulcsot eager módon kötelezővé, amelyet az adott parancs nem használ.

Kanonikus baseline:

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

### 34.1. Miért fallback?

```text
prisma generate
```

nem feltétlenül igényel élő adatbázis-URL-t, mégis betölti a configot.

A ténylegesen adatbázist igénylő művelet:

```text
migrate deploy
migrate dev
db seed
runtime client
readiness
```

külön fail-fast ellenőrzi a `DATABASE_URL` értéket.

### 34.2. Nem jelent optional database-t

Az üres fallback nem azt jelenti, hogy runtime database URL nélkül működhet. Csak a config betöltését választja el a konkrét művelet követelményeitől.

### 34.3. Prisma Client build

Ha a webapp valóban importálja a generált klienst:

```bash
pnpm db:generate
pnpm build
```

explicit lépések.

A core/minimal build nem futtat implicit Prisma-generálást.

### 34.4. Migration credential

Migration user és runtime user elkülöníthető:

```text
MIGRATION_DATABASE_URL
DATABASE_URL
```

A migration credential nagyobb jogosultságú lehet, ezért csak CI/deploy job kapja meg.

### 34.5. Shadow database és development

`migrate dev` specifikus változókat külön development schema és runbook kezelje. Production process ne kapjon felesleges DDL jogosultságot.

---

## 35. Egyedi konfigurációforrások és custom loader

A Symfony custom env loaderének megfelelője Winzardban egy explicit adapter.

### 35.1. Port

```ts
export interface ConfigurationSource {
  load(): Promise<Record<string, unknown>>;
}
```

### 35.2. JSON file source

```ts
import 'server-only';

import { readFile } from 'node:fs/promises';

export class JsonConfigurationSource
  implements ConfigurationSource {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Record<string, unknown>> {
    const content = await readFile(this.filePath, 'utf8');
    const parsed: unknown = JSON.parse(content);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new TypeError('Configuration root must be an object.');
    }

    return parsed as Record<string, unknown>;
  }
}
```

### 35.3. Provider source

```ts
export class RemoteConfigurationSource
  implements ConfigurationSource {
  constructor(
    private readonly client: ConfigurationServiceClient,
  ) {}

  async load(): Promise<Record<string, unknown>> {
    return this.client.getSnapshot();
  }
}
```

### 35.4. Kötelező policy

Custom source dokumentálja:

- auth;
- timeout;
- retry;
- cache;
- schema;
- signature;
- version;
- rollback;
- offline behavior;
- secretredakció;
- startup vagy request lifecycle.

### 35.5. Fail-closed vs fallback

Security és authorization config:

```text
provider unavailable
→ deny / startup failure
```

Nem kritikus banner config:

```text
provider unavailable
→ last known safe snapshot
```

A döntés explicit.

### 35.6. Nincs automatikus env-pollution

A custom loader ne írja tele globálisan a `process.env` objektumot. Adjon vissza típusos config snapshotot.

---

## 36. Secretkezelés

### 36.1. Secret meghatározás

Secret például:

- password;
- API token;
- private key;
- signing key;
- database credential;
- webhook secret;
- OAuth client secret;
- encryption key;
- session secret;
- privileged DSN.

### 36.2. Tárolási sorrend

Ajánlott:

1. workload identity vagy managed identity;
2. deployment secret manager;
3. orchestrator secret;
4. kontrollált, permissionnel védett mountolt fájl;
5. lokális `.env.local` developmenthez.

Nem ajánlott:

- Git;
- README;
- issue;
- handoff;
- AI context;
- container image layer;
- build log;
- browser bundle;
- shared chat.

### 36.3. Encryption at rest nem elég

Repo-ban tárolt encrypted secret esetén is kezelni kell:

- decrypt key;
- access audit;
- rotation;
- plaintext exposure CI-ben;
- fork PR;
- secret scanner;
- backup;
- history removal.

A Winzard jelenlegi baseline nem ír elő saját encrypted secret vaultot.

### 36.4. Secret metadata

Dokumentálható secretérték nélkül:

```yaml
key: AUTH_SECRET
owner: authentication
classification: restricted
minimum_length: 32
rotation: 90d
restart_required: true
source: deployment-secret-manager
```

### 36.5. Rotation

Kétkulcsos verification:

```text
sign with current
verify with current or previous
roll all instances
wait max token/session lifetime
remove previous
```

### 36.6. Revocation

Ha secret kiszivárog:

1. incident;
2. új kulcs;
3. credential visszavonás;
4. deploy/restart;
5. token/session invalidálás;
6. log és artifact audit;
7. Git history és cache vizsgálat;
8. postmortem.

### 36.7. Secret és build

Buildhez adott secret bekerülhet:

- build logba;
- image layerbe;
- source mapbe;
- generated artifactba;
- remote cache-be.

Csak akkor adj buildsecretet, ha valóban szükséges, és ephemeral secret mountot használj.

---

## 37. Környezeti változók típusos validációja

Minden env stringként vagy `undefined` értékként érkezik. A TypeScript típusannotáció nem runtime validáció.

### 37.1. Schema alap

```ts
import { z } from 'zod';

const schema = z.object({
  SERVICE_URL: z.url(),
  TIMEOUT_MS: z.coerce.number().int().positive(),
  MODE: z.enum(['disabled', 'shadow', 'enabled']),
});
```

### 37.2. Parse vs safeParse

Startup/CLI fail-fast:

```ts
const config = schema.parse(input);
```

Diagnosztikai lista:

```ts
const result = schema.safeParse(input);

if (!result.success) {
  return mapConfigurationIssues(result.error);
}
```

### 37.3. Unknown kulcsok

A teljes `process.env` sok rendszerkulcsot tartalmaz, ezért a globális env schema nem lehet egyszerűen strict minden OS változóra.

Két megoldás:

1. pickeld ki az owned kulcsokat, majd strict schema;
2. parse-old a teljes inputot passthrough/strip módban, de csak owned outputot adj vissza.

Példa:

```ts
function pickDatabaseEnvironment(
  input: NodeJS.ProcessEnv,
) {
  return {
    DATABASE_URL: input.DATABASE_URL,
    DATABASE_POOL_MAX: input.DATABASE_POOL_MAX,
    DATABASE_CONNECTION_TIMEOUT_MS:
      input.DATABASE_CONNECTION_TIMEOUT_MS,
  };
}
```

### 37.4. Error model

Publikus config hiba:

```ts
type ConfigurationIssue = Readonly<{
  code: string;
  key: string;
  message: string;
  source?: string;
}>;
```

A message nem tartalmazza a secret értékét.

### 37.5. Schema export

A schema exportálható teszthez és reference generáláshoz, de a secret metadata és public documentation külön redakciós projekciót igényel.

---

## 38. Stringek, számok, booleanok és enumok

### 38.1. String

```ts
z.string().trim().min(1)
```

Döntsd el, hogy trim megengedett-e. Token vagy signature esetén az automatikus trim káros lehet; fájlalapú secret esetén gyakran szükséges a lezáró newline eltávolítása.

### 38.2. Szám

```ts
z.coerce.number().int().min(1).max(60_000)
```

Veszélyek:

- `Number('') === 0`;
- floating point;
- `NaN`;
- `Infinity`;
- safe integer limit;
- unit félreértés.

Ajánlott a kulcsnévben unit:

```text
TIMEOUT_MS
CACHE_TTL_SECONDS
MAX_BODY_BYTES
```

### 38.3. Boolean

Tilos:

```ts
z.coerce.boolean()
```

env booleanhoz, ha `"false"` értéket false-nak vársz, mert JavaScriptben a nem üres string truthy.

Használj explicit parsert:

```ts
const booleanEnvironmentValue = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');
```

Ha `1/0`, `yes/no` is támogatott, azt explicit enum és dokumentáció írja le.

### 38.4. Enum

```ts
z.enum(['debug', 'info', 'warn', 'error'])
```

Előny:

- typo fail-fast;
- dokumentálható;
- exhaustive switch;
- nincs magic string.

### 38.5. Optional enum defaulttal

```ts
const modeSchema = z
  .enum(['off', 'shadow', 'on'])
  .default('off');
```

Default csak safe érték lehet.

### 38.6. Case normalizálás

Ha case-insensitive input támogatott:

```ts
z.string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(['debug', 'info', 'warn', 'error']));
```

A normalizálás legyen explicit.

---

## 39. URL-ek, DSN-ek, listák és JSON értékek

### 39.1. URL

```ts
const urlSchema = z.url();
```

További szemantikai ellenőrzés:

```ts
const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:');
```

Production külső endpointnál HTTPS általában kötelező.

### 39.2. Origin

Canonical origin schema:

```ts
const originSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine((url) => url.pathname === '/' && url.search === '' && url.hash === '')
  .transform((url) => url.origin);
```

### 39.3. DSN

A DSN lehet credentialt tartalmazó secret. Parse után ne add tovább teljes stringként szükségtelenül.

### 39.4. Vesszővel elválasztott lista

Egyszerű lista:

```ts
const csvListSchema = z
  .string()
  .transform((value) =>
    value.split(',').map((item) => item.trim()).filter(Boolean),
  );
```

Korlátok:

- vessző az értékben;
- escaping hiánya;
- üres elem;
- duplikáció;
- sorrend.

Komplex listához JSON vagy statikus config jobb.

### 39.5. JSON env

```ts
const jsonEnvironmentSchema = z
  .string()
  .max(16_384)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Invalid JSON.',
      });
      return z.NEVER;
    }
  });
```

Követelmények:

- méretlimit;
- nested schema;
- depth/complexity limit;
- secretredakció;
- ne legyen user-controlled code;
- dokumentált version.

### 39.6. Base64

Base64 nem encryption. Használható bináris transporthoz, de secret marad.

### 39.7. Regex

Envből kapott regex NEM AJÁNLOTT. ReDoS, escaping és platformeltérés kockázat. Inkább előre definiált pattern ID.

---

## 40. Hiányzó, üres, null és default értékek

### 40.1. Négy külön állapot

```text
kulcs nincs
kulcs = ""
kulcs = "null"
kulcs = whitespace
```

Nem azonosak.

### 40.2. Required

```ts
z.string().trim().min(1)
```

### 40.3. Optional

```ts
z.string().trim().min(1).optional()
```

### 40.4. Üres stringet undefineddé alakító helper

```ts
const emptyStringToUndefined = z
  .string()
  .transform((value) => {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  .optional();
```

Vagy preprocess:

```ts
const optionalUrl = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.url().optional(),
);
```

### 40.5. Default

Default használható, ha:

- biztonságos;
- stagefüggetlen vagy dokumentált;
- nem secret;
- nem rejt el hibás deploymentet;
- a default operational impactja ismert.

Jó:

```text
LOG_LEVEL=info
DATABASE_POOL_MAX=10
```

kontextustól függően.

Rossz:

```text
AUTH_SECRET=development-secret
PAYMENT_PROVIDER=live
DATABASE_URL=production
```

### 40.6. Null sentinel

A `"null"`, `"none"` vagy `"disabled"` csak explicit enumként használható. Ne legyen implicit magic value.

### 40.7. Conditional required

Példa:

```text
MAIL_PROVIDER=smtp
→ SMTP_URL kötelező

MAIL_PROVIDER=disabled
→ SMTP_URL tiltott vagy figyelmen kívül hagyott warninggal
```

Zod `superRefine()` vagy discriminated union használható.

---

## 41. Fail-fast és lazy validáció

### 41.1. Fail-fast

Induláskor kötelezően validálandó, ha:

- a process minden requesthez használja;
- hibás értékkel nem tud biztonságosan működni;
- readiness csak érvényes configgal lehet zöld;
- a dependency process-szintű singleton.

Példa:

```text
logger baseline
session signing
database, ha minden route használja
telemetry exporter, ha compliance követelmény
```

### 41.2. Lazy capability validáció

Csak adapteraktiváláskor validálandó, ha:

- opcionális capability;
- csak bizonyos worker használja;
- build vagy unrelated CLI nem igényli;
- minimal profile-nak nem része.

### 41.3. Hibrid

Process startup:

```text
manifest
+ core app config
+ aktív critical capabilities
```

Adapter creation:

```text
ritkán használt optional integration config
```

Request:

```text
remote feature flag snapshot
```

### 41.4. Instrumentation register

A Next.js `instrumentation.ts` `register()` függvénye egyszer fut új server instance indulásakor, és a server readiness előtt be kell fejeződnie.

Használható:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerConfiguration } =
      await import('./src/platform/config/validate-server-config');

    validateServerConfiguration();
  }
}
```

Korlátok:

- Edge/Node runtime különbség;
- ne importáljon klienskódot;
- ne nyisson felesleges kapcsolatot;
- ne validáljon nem aktív capability-t;
- a hiba redaktált legyen.

### 41.5. Readiness

Readiness a configvalidáció eredményét figyelembe veheti, de secretet vagy schema detailt nem ad vissza.

---

## 42. Konfiguráció elérése explicit injektálással

A Symfony parameter bag helyett Winzardban explicit, szűk interface vagy value object kerül injektálásra.

### 42.1. Adapter constructor

```ts
type MailConfiguration = Readonly<{
  fromAddress: string;
  providerEndpoint: URL;
  timeoutMs: number;
}>;

export class HttpMailSender {
  constructor(
    private readonly config: MailConfiguration,
    private readonly httpClient: HttpClient,
  ) {}
}
```

### 42.2. Composition root

```ts
import 'server-only';

export function createMailModule() {
  const environment = getMailEnvironment();

  const sender = new HttpMailSender(
    Object.freeze({
      fromAddress: environment.MAIL_FROM_ADDRESS,
      providerEndpoint: new URL(environment.MAIL_PROVIDER_URL),
      timeoutMs: environment.MAIL_TIMEOUT_MS,
    }),
    createHttpClient(),
  );

  return Object.freeze({ sender });
}
```

### 42.3. Application service

Az application service lehetőleg policy/value objectet kap, nem deployment configot:

```ts
export class RegisterCustomer {
  constructor(
    private readonly repository: CustomerRepository,
    private readonly registrationPolicy: RegistrationPolicy,
  ) {}
}
```

A composition root készíti el a policyt a konfigurációból, ha valóban configfüggő.

### 42.4. Függvényargumentum

Kis pure helper:

```ts
export function buildPublicUrl(
  origin: URL,
  path: string,
): URL {
  return new URL(path, origin);
}
```

### 42.5. Client Component

Client Component csak explicit public propsot kap:

```tsx
<SupportLink href={publicConfig.supportUrl} />
```

Nem importálhat server env modult.

---

## 43. Miért tilos a globális configuration bag?

Tilos minta:

```ts
export const config = {
  get(name: string): unknown {
    return process.env[name];
  },
};
```

### 43.1. Problémák

- nincs típus;
- nincs ownership;
- nincs lifecycle;
- secret és public összemosódik;
- runtime hiba későn jelentkezik;
- teszt globális állapottól függ;
- dependency rejtett;
- domain bármit elér;
- refaktor és dead config detection nehéz;
- kliensimport veszélyes.

### 43.2. „Minden config” objektum

Szintén kerülendő:

```ts
type GlobalConfig = {
  app: AppConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  mail: MailConfig;
  storage: StorageConfig;
  // ...
};
```

ha minden service megkapja.

### 43.3. Szűk interface

```ts
type PasswordResetTokenPolicy = Readonly<{
  ttlSeconds: number;
  issuer: string;
}>;
```

Az adott use case csak ezt kapja.

### 43.4. Típus alapján sem automatikus globális injection

A Winzard explicit composition rootot használ. Nincs automatikus parameter-name binding, amely `$projectDir` vagy hasonló név alapján bárhová értéket injektál.

### 43.5. Config discovery

A dependency graphnak kódból és composition rootból követhetőnek kell lennie.

---

## 44. Domain- és application-réteg konfigurációs határa

### 44.1. Domain

A domain nem importál:

```text
process.env
next/config
next/*
server-only
Node filesystem
secret provider
deployment stage
```

### 44.2. Domain value object

A domain kaphat:

```ts
type MaximumOpenOrders = number & {
  readonly __brand: 'MaximumOpenOrders';
};
```

ha ez valóban domain policy része.

### 44.3. Application

Az application layer:

- frameworkfüggetlen;
- config bag nélküli;
- explicit policy/port függőséggel rendelkezik;
- nem olvas envet;
- nem dönti el a deployment stage-et.

### 44.4. Configuration-derived policy

```ts
export interface CheckoutAvailabilityPolicy {
  isCheckoutEnabledFor(
    actor: Actor,
    tenantId: TenantId,
  ): Promise<boolean>;
}
```

Az implementáció lehet feature flag adapter. Az application a portot látja, nem az env kulcsot.

### 44.5. Invariáns vs rollout

Tilos domain invariantot feature flaggel teljesen megkerülni audit nélkül.

Példa:

```text
„negatív készlet nem lehet”
```

nem kapcsolható ki egyszerű `ALLOW_NEGATIVE_STOCK=true` envvel, ha ez a domain integritását sérti.

---

## 45. Composition root és konfiguráció

A composition root a nyers konfiguráció és az alkalmazási objektumgráf közötti fő határ.

### 45.1. Feladata

- aktív capability ellenőrzése;
- megfelelő schema meghívása;
- config normalizálása;
- adapter létrehozása;
- policy létrehozása;
- portok bekötése;
- singleton lifecycle kezelése;
- redaktált startup log.

### 45.2. Nem feladata

- request body validálása;
- domain döntést hozni;
- admin configot tárolni;
- secrettel UI-t renderelni;
- `process.env` objektumot továbbadni;
- implicit service locatort biztosítani.

### 45.3. Példa

```ts
import 'server-only';

import { GetProduct } from '@/modules/catalog/application/get-product';
import { PrismaProductRepository } from '@/modules/catalog/infrastructure/prisma-product-repository';
import { databaseClient } from '@/platform/database/client';

const productRepository =
  new PrismaProductRepository(databaseClient);

export const catalogModule = Object.freeze({
  queries: Object.freeze({
    getProduct: new GetProduct(productRepository),
  }),
});
```

A database client saját server-only config adapteréből kapja a validált konfigurációt.

### 45.4. Factory és memoization

A factory lehet:

- process singleton;
- request-scoped;
- testenként új;
- worker-specifikus.

A scope dokumentált.

### 45.5. Circular config

Config factoryk nem függhetnek kölcsönösen egymástól. Alacsonyabb szintű primitivekből épülnek felfelé.

---

## 46. Request-derived context nem konfiguráció

A requestből származó értékek lifecycle-ja eltér a deployment konfigurációtól.

### 46.1. Request context

```ts
type RequestContext = Readonly<{
  requestId: string;
  actor: Actor;
  tenantId: TenantId | null;
  locale: Locale;
  origin: TrustedOrigin;
}>;
```

### 46.2. Források

- auth/session adapter;
- validált host/tenant resolver;
- locale resolver;
- trusted proxy config;
- request ID generator.

### 46.3. Config és request context együtt

A tenant resolver kaphat konfigurációt:

```text
trusted root domains
custom domain policy
default locale
```

de az aktuális host és tenant a requestből származik.

### 46.4. Tilos globális current tenant

```ts
// TILOS
globalConfig.currentTenant = requestTenant;
```

Concurrent request leaket okozhat.

### 46.5. Async context

Ha AsyncLocalStorage vagy request context carrier használatos, az infrastruktúra-részlet. Az application továbbra is explicit inputot vagy portot kapjon a kritikus adatokhoz.

### 46.6. Header mint config override

A `X-Environment`, `X-Debug`, `X-Feature` header csak megbízható belső gateway és explicit signature/allowlist mellett használható; publikus requestből config override TILOS.

---

## 47. Node.js és Edge/Proxy runtime konfiguráció

### 47.1. Node.js runtime

A Node.js runtime hozzáfér:

- `process.env`;
- Node API-khoz;
- filesystemhez;
- natív package-ekhez;
- hosszabb életű process-szintű singletonokhoz, deploymentfüggően.

### 47.2. Edge/Proxy runtime

A Proxy korlátozott runtime-környezetben futhat. Nem minden Node API és dependency érhető el.

Konfigurációs modul Edge-kompatibilitása:

- nem használ `node:fs`;
- nem használ natív addont;
- nem importál Node-only database clientet;
- kis bundle;
- csak szükséges public/internal env;
- secretkezelés platformtól függ.

### 47.3. Külön schema

```text
proxy-env.ts
server-env.ts
worker-env.ts
```

Lehet külön, ha runtime képességei eltérnek.

### 47.4. Import graph

Tilos, hogy Proxy importáljon:

```text
src/platform/database/**
src/composition/full-app.ts
mail SDK
large secret manager client
```

### 47.5. Environment availability

A deployment adapter vagy platform határozza meg, mely env változók érhetők el az Edge/Proxy runtime-ban. Ezt production deploymenten tesztelni kell; local `next dev` sikere nem elegendő.

### 47.6. Secret minimalizálás

Proxy csak a saját feladatához szükséges secretet kapja. Ne kapjon teljes application environmentet.

---

## 48. Startup konfigurációvalidáció `instrumentation.ts` segítségével

A Next.js `instrumentation.ts` `register()` exportja új server instance indulásakor egyszer fut, és a server forgalomfogadása előtt befejeződik.

### 48.1. Példa

```ts
// instrumentation.ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { validateInstalledCapabilities } =
    await import('./src/platform/config/validate-installed-capabilities');

  await validateInstalledCapabilities();
}
```

### 48.2. Validációs lista

A startup validator:

1. beolvassa a manifestet;
2. azonosítja az aktív critical capability-ket;
3. meghívja a hozzájuk tartozó schema/factory ellenőrzést;
4. nem hoz létre szükségtelen side effectet;
5. redaktált hibát ad;
6. readiness state-et állíthat.

### 48.3. Ne legyen túlterhelt

Nem ajánlott startupban:

- teljes database migration;
- hosszú remote health sweep;
- email küldés;
- queue drain;
- nagy config dump;
- user/tenant config előtöltés;
- nem kritikus provider miatt teljes leállás.

### 48.4. Runtime-specific import

Dinamikus import segít elkerülni, hogy Node-only validator Edge bundle-be kerüljön.

### 48.5. Development hot reload

Fejlesztésben a register többször vagy eltérő process lifecycle-ban futhat. A validátor idempotens legyen.

### 48.6. Build különbség

Az instrumentation startup validáció nem helyettesíti a CI `forge env:check` és schema unit tesztet.

---

## 49. Konfigurációs diagnosztika

### 49.1. Jelenleg használható Winzard parancsok

```bash
pnpm forge env:check --project <PROJECT>
pnpm forge check --project <PROJECT>
pnpm forge doctor --project <PROJECT>
```

Az `env:check` capability-aware módon ellenőrzi az alkalmazás-shell, a publikus kliensconfig és az aktív infrastruktúra-capability-k környezeti szerződéseit.

### 49.2. Upstream diagnosztika

```bash
pnpm next info
pnpm next typegen
pnpm exec tsc --noEmit
pnpm next build
```

### 49.3. Manuális env source diagnosztika

Biztonságos script:

```ts
const keys = [
  { key: 'APP_URL', classification: 'internal' },
  { key: 'APP_NAME', classification: 'internal' },
  { key: 'LOG_LEVEL', classification: 'internal' },
  { key: 'DATABASE_URL', classification: 'secret' },
] as const;

for (const definition of keys) {
  const key = definition.key;
  const value = process.env[key];

  console.log({
    key,
    present: value !== undefined,
    empty: value === '',
    ...(definition.classification === 'secret'
      ? { value: '[redacted]' }
      : { length: value?.length }),
  });
}
```

Secret értéket nem ír ki.

### 49.4. Implementált konfigurációs parancsok

A Forge felülete:

```bash
pnpm forge config:list
pnpm forge config:inspect DATABASE_URL
pnpm forge config:reference
pnpm forge config:diff --from=staging --to=production
pnpm forge config:unused
pnpm forge config:drift
pnpm forge config:doctor
pnpm forge secrets:check
```

### 49.5. `config:list`

A redaktált output fő mezői:

```text
KEY
OWNER
REQUIRED
PHASE
CLASS
SOURCE
STATUS
REBUILD
RESTART
```

Érték helyett redaktált státusz.

### 49.6. `config:inspect`

Mutathatja:

```text
schema
owner
documentation
source precedence
present?
valid?
fingerprint, kizárólag public/internal értéknél
consumers
```

Secretnél csak a státusz és a `[redacted]` jelölés jelenhet meg; hossz és fingerprint sem.

### 49.7. Exit code

Config error CI-ben non-zero exit code. Warning és error külön kategória.


> [!NOTE]
> A Forge `env:check`, `config:list`, `config:inspect` és `config:doctor` ugyanazt a dokumentált precedenciát alkalmazza: `process.env` → `.env.$NODE_ENV.local` → `.env.local` (testben kihagyva) → `.env.$NODE_ENV` → `.env`. Public/internal konfigurációnál a diagnosztika rögzíthet hosszt és rövid SHA-256 fingerprintet. Secretnél kizárólag a forrás, státusz és `[redacted]` jelölés jelenhet meg; hossz és fingerprint sem.

---

## 50. Redakció, logging és observability

### 50.1. Soha ne dumpold a teljes envet

Tilos:

```ts
console.log(process.env);
```

és:

```ts
logger.debug({ config });
```

ha a config secretet tartalmazhat.

### 50.2. Redakciós kulcsminta

Alapértelmezett sensitive névminta:

```text
SECRET
TOKEN
PASSWORD
PASS
KEY
CREDENTIAL
DATABASE_URL
DSN
AUTHORIZATION
COOKIE
```

A névminta önmagában nem teljes. Schema metadata alapján is redaktálni kell.

### 50.3. Nem secret konfiguráció fingerprintje

Diagnosztikai fingerprint:

```ts
import { createHash } from 'node:crypto';

export function configurationFingerprint(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 12);
}
```

A fingerprint public vagy internal konfigurációnál segíthet megállapítani, hogy instance-ok azonos verziót kaptak-e, értékfeltárás nélkül. **Secrethez fingerprintet készíteni vagy diagnosztikában közölni TILOS**, mert offline találgatást és korrelációt segíthet. Nem secret fingerprintet is csak kontrollált logban használj.

### 50.4. Startup log

Jó:

```text
configuration validated
profile=webapp
capabilities=prisma-postgresql,database-readiness
databaseUrl=present
databaseHost=db.internal
authSecret=not-applicable
```

Rossz:

```text
DATABASE_URL=postgresql://user:password@...
```

### 50.5. Metrics

Hasznos:

```text
config_validation_failure_total{capability,key}
config_snapshot_age_seconds
config_provider_error_total
secret_rotation_version
feature_flag_provider_latency
```

Labelben ne legyen secret vagy tenant PII.

### 50.6. Error response

Felhasználói HTTP response:

```text
503 Service Unavailable
```

ne tartalmazza a hiányzó env kulcs és internal host teljes részletét. Részletes hiba belső logba kerül, redaktálva.

---

## 51. Konfigurációs tesztelés

### 51.1. Schema unit teszt

Minden schema teszteli:

- valid minimum;
- hiányzó required;
- üres;
- invalid enum;
- határérték;
- túl nagy;
- malformed URL;
- secret minimum;
- boolean `"false"`;
- unknown/owned key viselkedés.

### 51.2. Factory teszt

A config factory:

- immutable output;
- normalizált URL;
- correct units;
- default;
- redakció;
- dependency nélküli pure működés.

### 51.3. Composition teszt

A composition root fake configgal létrehozható, és a megfelelő adaptert köti be.

### 51.4. Test env betöltés

Ha integration testnek Next load order kell:

```ts
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());
```

### 51.5. Process env izoláció

Tesztben:

```ts
const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});
```

Node/TypeScript környezetben inkább helperrel állíts és törölj kulcsokat. Párhuzamos teszteknél a globális `process.env` módosítás race-et okozhat.

### 51.6. Explicit input előnye

A pure parser explicit recorddal tesztelhető, nincs globális race:

```ts
parseAppEnvironment(testEnvironment);
```

### 51.7. Build test

Külön teszt:

```text
runtime secret nélkül buildelhető-e, ha nem kell buildkor?
NEXT_PUBLIC érték megfelelő artifactba került-e?
statikus route nem fagyasztott-e runtime értéket?
```

### 51.8. Deployment smoke

Productiontopológiában ellenőrizd:

- config jelen;
- secret valid;
- readiness;
- external endpoint;
- multi-instance key consistency;
- public config;
- rotation.

---

## 52. CI konfigurációs contract

### 52.1. Core CI

Adatbázis és auth nélkül:

```text
install
manifest check
typegen
typecheck
lint
unit tests
Forge checks
build
reference E2E
```

Bizonyítja, hogy a core nem igényel opcionális capability envet.

### 52.2. Database CI

```text
PostgreSQL service
webapp capability check
database env check
Prisma validate
Prisma generate
migrate deploy
integration test
```

### 52.3. Auth CI

Későbbi külön fixture:

```text
authentication capability check
secret shape check
auth adapter integration
rotation compatibility
cookie/session security test
```

### 52.4. Environment matrix

CI matrix:

```yaml
strategy:
  matrix:
    profile:
      - minimal
      - webapp
```

A profile csak saját required configot kap.

### 52.5. Secret a fork PR-ben

Untrusted fork PR nem kap production secretet. A tesztek fake adapterrel vagy ephemeral service-szel futnak.

### 52.6. Config reference drift

CI ellenőrizheti:

```text
schema keys
.env.example keys
recipe environment list
documentation reference
Forge env checker
```

közötti eltérést.

### 52.7. Build-time public config

CI artifact metadata rögzítheti a public config fingerprintet. Production promotion előtt ellenőrizhető, hogy a megfelelő stage-re készült-e.

### 52.8. Tiltott minták

Architecture/static check céljai:

```text
process.env az application/domain alatt
NEXT_PUBLIC_ secretnév
next.config.env használata
globális environment singleton
secret logolás
fallback development secret
public configban credential
```

---

## 53. Deployment és container konfiguráció

### 53.1. Image és config szétválasztása

Ajánlott:

```text
image = kód + build artifact
deployment = env + secret + identity + resource limit
```

### 53.2. Docker Compose development

Safe local példa:

```yaml
services:
  app:
    build: .
    environment:
      APP_URL: http://localhost:3000
      APP_NAME: Atlas
      LOG_LEVEL: debug
    env_file:
      - .env.local
```

Az `env_file` nincs Gitben, vagy csak secretmentes fixture.

### 53.3. Docker image layer

Tilos:

```dockerfile
COPY .env.production .env.production
```

és:

```dockerfile
ARG AUTH_SECRET
ENV AUTH_SECRET=$AUTH_SECRET
```

ha a secret layer metadata/history részévé válhat.

### 53.4. Multi-stage build

Build secret csak BuildKit secret mounttal vagy platform megfelelőjével, és ne kerüljön outputba.

### 53.5. Container runtime

Runtime env a container indításakor:

```bash
docker run \
  --env-file /secure/runtime.env \
  winzard-app:commit
```

A file permission és host lifecycle dokumentált.

### 53.6. Multiple replicas

Minden replica azonos critical config versiont kap:

- session key;
- Server Action encryption key;
- feature flag baseline;
- cache namespace;
- deployment ID.

### 53.7. Rolling deploy

Régi és új verzió együtt futhat. Config kompatibilitás:

```text
old code + new config
new code + old config
```

átmeneti ablakban szükséges lehet.

### 53.8. Readiness vs liveness

- liveness: process működik;
- readiness: szükséges config és dependency elérhető.

Hiányzó runtime critical config readiness failure, nem végtelen crash loop diagnosztika nélkül.

---

## 54. Orchestrator és secret mount minták

Ez a fejezet vendorsemleges.

### 54.1. Environment injection

```text
Secret/Config object
→ pod/container env
→ process.env
```

Egyszerű, de:

- secret process environmentben látható lehet jogosult diagnosztikában;
- frissítés általában restartot igényel;
- méretlimit;
- multiline kényelmetlen.

### 54.2. Volume mount

```text
secret object
→ read-only file
→ adapter
```

Előny:

- multiline;
- permission;
- egyes platformokon frissülhet.

Kockázat:

- alkalmazás reload policy;
- atomic update;
- stale file descriptor;
- path permission;
- backup/log.

### 54.3. Sidecar/agent

Secret agent fájlba vagy lokális API-n ad snapshotot.

Dokumentálandó:

- trust boundary;
- TLS/socket permission;
- refresh;
- startup ordering;
- failure mode;
- cleanup.

### 54.4. Config map nem secret

Public/internal config és secret külön erőforrásban legyen.

### 54.5. Immutability

Ha orchestrator config mutable, a process config ettől még lehet immutable. A restart vagy reload contract explicit.

### 54.6. Namespace isolation

Development, staging és production secret namespace külön. Ugyanaz a kulcsnév használható, de credential és hozzáférés izolált.

---

## 55. Konfigurációfrissítés, restart és hot reload

### 55.1. Development

`.env*` változás után a Next dev server viselkedése és HMR nem minden esetben garantálja a modul singleton újraértékelését. Biztonságos eljárás:

```text
env változás
→ dev server restart
```

### 55.2. Production

Process env változás:

```text
running process
→ nem frissül automatikusan
→ rolling restart
```

### 55.3. Request-time provider

Remote provider frissülhet restart nélkül, de cache TTL és consistency policy szerint.

### 55.4. Public build config

`NEXT_PUBLIC_`:

```text
változás
→ rebuild
```

### 55.5. Mountolt file

Ha file frissül:

- figyelő vagy per-request olvasás;
- cache invalidáció;
- parse/validation;
- atomic snapshot;
- rollback.

Ne olvass kritikus secretfile-t minden requestben korlátlanul, ha provider/FS latency és partial write kockázat van.

### 55.6. Hot reload és connection pool

Developmentben globális cache minta használható a többszörös database client elkerülésére, de production lifecycle-t ne a HMR hack határozza meg.

### 55.7. Config version

Runtime snapshot tartalmazhat versiont:

```ts
type ConfigurationSnapshot<T> = Readonly<{
  version: string;
  loadedAt: Date;
  value: T;
}>;
```

Logban a version, nem a secret.

---

## 56. Security fenyegetési modell

### 56.1. Secret exfiltration

Vektorok:

- browser bundle;
- source map;
- log;
- error page;
- profiler;
- metrics label;
- docs;
- CI artifact;
- container layer;
- public config endpoint;
- AI context.

### 56.2. Config injection

Támadó inputja configként értelmeződik:

```text
header
query
cookie
uploaded JSON
tenant setting
```

Védelem:

- külön request schema;
- allowlist;
- signature;
- authorization;
- config source trust boundary.

### 56.3. Unsafe URL config

Kockázat:

- SSRF;
- credential forwarding;
- open redirect;
- webhook exfiltration.

Védelem:

- protocol allowlist;
- host/domain allowlist;
- private IP policy;
- DNS rebinding consideration;
- no userinfo;
- timeout;
- redirect limit.

### 56.4. Debug flag productionben

```text
DEBUG=true
BYPASS_AUTH=true
DISABLE_TLS=true
ALLOW_ALL_ORIGINS=true
```

magas kockázatú. Production schema explicit tiltja vagy approvalt igényel.

### 56.5. Config tampering

Static manifest és runtime config integritása:

- Git review;
- signed artifact;
- RBAC;
- secret manager audit;
- hash/version;
- immutable deployment;
- least privilege.

### 56.6. Default credential

Sample credential csak developmentben, izolált service-hez. Productionben fail-fast.

### 56.7. Cross-tenant leak

Tenant-specifikus config cache key tartalmazza tenant ID-t; public shared cache nem keverhet tenantokat.

### 56.8. Configuration DoS

Túl nagy JSON/lista, extrém timeout, poolméret vagy retry count erőforrás-kimerítést okozhat. Minden numerikus és strukturált config kap upper boundot.

---

## 57. Retry, timeout és circuit-breaker konfiguráció

### 57.1. Unit a névben

```text
HTTP_TIMEOUT_MS
QUEUE_VISIBILITY_TIMEOUT_SECONDS
RETRY_BASE_DELAY_MS
```

### 57.2. Timeout rétegek

- connection timeout;
- request timeout;
- total operation deadline;
- idle timeout;
- server function max duration.

A kisebb belső timeout férjen bele a külső deadline-ba.

### 57.3. Retry

Config:

```ts
type RetryPolicyConfig = Readonly<{
  maximumAttempts: number;
  baseDelayMs: number;
  maximumDelayMs: number;
  jitter: 'full' | 'equal' | 'none';
}>;
```

Korlát:

- idempotens művelet;
- retryable error allowlist;
- total budget;
- no unbounded retry;
- no retry storm.

### 57.4. Env schema

```ts
const retryEnvironmentSchema = z.object({
  PROVIDER_MAX_ATTEMPTS:
    z.coerce.number().int().min(1).max(5),
  PROVIDER_BASE_DELAY_MS:
    z.coerce.number().int().min(10).max(10_000),
});
```

### 57.5. Circuit breaker

Threshold, window és cooldown konfigurálható, de safe bounds és ownership kell.

### 57.6. Business retry

Payment vagy command retry nem pusztán HTTP client config; idempotency és application contract szükséges.

---

## 58. CORS, trusted origin és proxy konfiguráció

### 58.1. Origin allowlist

```ts
const allowedOriginsSchema = z
  .string()
  .transform((value) =>
    value.split(',').map((item) => new URL(item.trim()).origin),
  );
```

Upper bound és duplicate removal szükséges.

### 58.2. Wildcard

Credentiales CORS mellett `*` origin TILOS.

### 58.3. Trusted proxy

Konfiguráció:

```text
TRUSTED_PROXY_HOPS
TRUSTED_PROXY_CIDRS
TRUST_FORWARDED_HOST
TRUST_FORWARDED_PROTO
```

Csak akkor használd a forwarded headert, ha a közvetlen upstream megbízható és felülírja/tisztítja a kliens által küldött értéket.

### 58.4. Canonical origin

Email és redirect URL generálás elsődlegesen explicit `APP_URL`/origin registryből, nem nyers Host headerből.

### 58.5. Server Actions allowed origins

Ha additional origin szükséges, explicit allowlist, stage-specific validation és security review kell.

### 58.6. Dev origins

Development origin relaxáció nem kerülhet production configba ugyanazzal a permissive defaulttal.

---

## 59. Cache- és namespace-konfiguráció

### 59.1. Cache backend

Config:

```text
CACHE_BACKEND
CACHE_NAMESPACE
CACHE_DEFAULT_TTL_SECONDS
CACHE_MAX_ENTRY_BYTES
```

### 59.2. Namespace

Tartalmazhat:

```text
application
stage
deployment compatibility version
tenant scope, ha szükséges
```

Nem tartalmaz secretet.

### 59.3. Multi-instance

In-memory cache nem megosztott. Ha correctness megosztott invalidációt igényel, külső cache handler szükséges.

### 59.4. Config és cached output

A cache key tartalmazza a viselkedést befolyásoló config versiont vagy invalidáció történik config változásakor.

### 59.5. Public config cache

Runtime public config endpoint cache policyja külön contract.

### 59.6. Failover

Cache failure:

- cache missként kezelhető, ha csak performance;
- fail-closed lehet rate limit/security token esetén;
- stampede protection;
- timeout;
- circuit breaker.

---

## 60. Multi-instance és rolling deployment konfiguráció

### 60.1. Azonos build

Egy rolling deployment minden instance-a azonos build artifactot használjon az adott revisionön belül.

### 60.2. Server Function encryption key

Több instance esetén a Server Function closure encryption keynek konzisztensnek kell lennie. A Next.js erre külön environment változót támogat. A kulcs lifecycle-ja buildhez és runtimehoz is kötődhet, ezért a deployment runbooknak explicit kezelnie kell.

### 60.3. Deployment ID

Version skew védelemhez deployment ID konfigurálható. A value:

- buildhez kötött;
- nem secret;
- stabil azonos artifacton;
- eltér új revisionnél.

### 60.4. Config compatibility window

Rolling deploy alatt:

```text
revision N + config version A
revision N+1 + config version A/B
```

együtt futhat.

Breaking config change lépése:

1. code mindkét formát támogatja;
2. config rollout;
3. új code rollout;
4. régi forma eltávolítása később.

### 60.5. Session/signing key rotation

Régi és új instance ugyanazokat a tokeneket ellenőrizze transition alatt.

### 60.6. Observability

Log és metric tartalmazza:

```text
deployment_id
config_version
manifest_version
capability set hash
```

secret nélkül.

---

## 61. Template- és recipe-konfigurációs contract

### 61.1. Template

A template deklarálja:

- kezdeti capability-ket;
- statikus config fájlokat;
- `.env.example` kulcsokat;
- build és verify scripteket;
- defaultokat;
- publikus dokumentációt.

### 61.2. Minimal template

A minimal profil nem követel:

```text
DATABASE_URL
AUTH_SECRET
mail credential
storage credential
readiness endpoint
```

### 61.3. Webapp template

A webapp a manifestben deklarált capability-k alapján követelhet database configot. Auth továbbra is külön recipe.

### 61.4. Recipe environment lista

Példa:

```json
{
  "name": "prisma-postgresql",
  "provides": ["prisma-postgresql"],
  "environment": [
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "DATABASE_CONNECTION_TIMEOUT_MS"
  ]
}
```

Ez gépi inventory, de a schema a formai és szemantikai source of truth.

### 61.5. Recipe config ownership

A recipe tartalmazza:

```text
schema file
config factory
.env.example fragment
documentation
Forge validation
tests
removal metadata
```

### 61.6. Conflict

Két recipe nem tulajdonolhatja ugyanazt a kulcsot eltérő jelentéssel.

### 61.7. Upgrade

Recipe upgrade:

- új optional key: minor/patch contract szerint;
- új required key: migration és upgrade guide;
- átnevezés: compatibility window;
- secret format változás: rotation plan;
- lifecycle build↔runtime változás: breaking change.

### 61.8. Uninstall

Eltávolításkor:

- capability kikerül;
- schema és adapter kikerülhet;
- `.env.example` owned blokk frissül;
- valós secretet a Forge nem töröl deployment platformról;
- orphan env warning;
- data/migration hatás külön.

---

## 62. Teljes alkalmazásconfig példa

Az alábbi példa bemutatja az explicit rétegeket.

### 62.1. Schemas

```ts
// src/platform/config/app-env.ts
import { z } from 'zod';

export const appEnvironmentSchema = z.object({
  APP_URL: z.url(),
  APP_NAME: z.string().trim().min(1).max(128),
  APP_STAGE: z.enum([
    'local',
    'preview',
    'staging',
    'production',
  ]),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
});

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).max(128),
});

export type AppEnvironment =
  z.infer<typeof appEnvironmentSchema>;
```

```ts
// src/platform/database/database-env.server.ts
import 'server-only';

import { z } from 'zod';

function boundedIntegerEnvironmentValue(
  minimum: number,
  maximum: number,
) {
  return z.string()
    .trim()
    .regex(/^\d+$/u)
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));
}

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  }),
  DATABASE_POOL_MAX:
    boundedIntegerEnvironmentValue(1, 100),
  DATABASE_CONNECTION_TIMEOUT_MS:
    boundedIntegerEnvironmentValue(100, 60_000),
});
```

### 62.2. Pickelt input

```ts
export function readAppEnvironmentInput(
  input: NodeJS.ProcessEnv,
) {
  return {
    APP_URL: input.APP_URL,
    APP_NAME: input.APP_NAME,
    APP_STAGE: input.APP_STAGE,
    LOG_LEVEL: input.LOG_LEVEL,
  };
}
```

### 62.3. Config value object

```ts
export type AppConfig = Readonly<{
  origin: URL;
  name: string;
  stage: 'local' | 'preview' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}>;

export function createAppConfig(
  input: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const environment = appEnvironmentSchema.parse(
    readAppEnvironmentInput(input),
  );

  return Object.freeze({
    origin: new URL(environment.APP_URL),
    name: environment.APP_NAME,
    stage: environment.APP_STAGE,
    logLevel: environment.LOG_LEVEL,
  });
}
```

### 62.4. Database config

```ts
export type DatabaseConfig = Readonly<{
  connectionString: string;
  poolMaximum: number;
  connectionTimeoutMs: number;
}>;

export function createDatabaseConfig(
  input: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const environment = databaseEnvironmentSchema.parse({
    DATABASE_URL: input.DATABASE_URL,
    DATABASE_POOL_MAX: input.DATABASE_POOL_MAX,
    DATABASE_CONNECTION_TIMEOUT_MS:
      input.DATABASE_CONNECTION_TIMEOUT_MS,
  });

  return Object.freeze({
    connectionString: environment.DATABASE_URL,
    poolMaximum: environment.DATABASE_POOL_MAX,
    connectionTimeoutMs:
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
  });
}
```

### 62.5. Composition

```ts
import 'server-only';

const appConfig = createAppConfig();
const databaseConfig = createDatabaseConfig();

export const platform = Object.freeze({
  appConfig,
  database: createDatabaseClient(databaseConfig),
});
```

### 62.6. Public projection

```ts
export type PublicAppConfig = Readonly<{
  appName: string;
}>;

export function readBuildPublicEnvironmentInput() {
  return {
    NEXT_PUBLIC_APP_NAME:
      process.env.NEXT_PUBLIC_APP_NAME,
  };
}

export function createPublicAppConfig(
  input: Readonly<Record<string, string | undefined>> =
    readBuildPublicEnvironmentInput(),
): PublicAppConfig {
  const environment = publicEnvironmentSchema.parse({
    NEXT_PUBLIC_APP_NAME: input.NEXT_PUBLIC_APP_NAME,
  });

  return Object.freeze({
    appName: environment.NEXT_PUBLIC_APP_NAME,
  });
}
```

---

## 63. Conditional és discriminated configuration

Összetett provider választásnál discriminated union használható.

### 63.1. Mail provider

```ts
import { z } from 'zod';

const disabledMailSchema = z.object({
  MAIL_PROVIDER: z.literal('disabled'),
});

const smtpMailSchema = z.object({
  MAIL_PROVIDER: z.literal('smtp'),
  SMTP_URL: z.url(),
  MAIL_FROM_ADDRESS: z.email(),
});

const apiMailSchema = z.object({
  MAIL_PROVIDER: z.literal('api'),
  MAIL_API_URL: z.url(),
  MAIL_API_TOKEN: z.string().min(20),
  MAIL_FROM_ADDRESS: z.email(),
});

export const mailEnvironmentSchema =
  z.discriminatedUnion('MAIL_PROVIDER', [
    disabledMailSchema,
    smtpMailSchema,
    apiMailSchema,
  ]);
```

### 63.2. Előny

- csak releváns kulcs required;
- invalid kombináció fail-fast;
- exhaustive switch;
- provider-specific secret;
- disabled mód explicit.

### 63.3. Factory

```ts
export function createMailSender(
  environment: MailEnvironment,
): MailSender {
  switch (environment.MAIL_PROVIDER) {
    case 'disabled':
      return new DisabledMailSender();

    case 'smtp':
      return new SmtpMailSender({
        url: environment.SMTP_URL,
        from: environment.MAIL_FROM_ADDRESS,
      });

    case 'api':
      return new ApiMailSender({
        url: environment.MAIL_API_URL,
        token: environment.MAIL_API_TOKEN,
        from: environment.MAIL_FROM_ADDRESS,
      });
  }
}
```

### 63.4. Secret redakció

A union metadata jelölje a token mezőt secretként; az error mapping ne írja ki az inputot.

### 63.5. Provider switch

Provider váltás migration lehet:

- deliverability;
- webhook;
- idempotency;
- template;
- DNS;
- credential;
- rollback.

---

## 64. Konfigurációs reference és dokumentáció

Minden aktív capability konfigurációs reference-e tartalmazza:

```text
key
type
required
default
owner
phase
classification
public
rebuild
restart
example
validation
description
introduced
deprecated
removed
```

### 64.1. Példa reference

| Key | Type | Required | Phase | Secret | Default |
| --- | --- | --- | --- | --- | --- |
| `APP_URL` | URL | igen | process | nem | nincs |
| `APP_NAME` | non-empty string | igen | process | nem | nincs |
| `LOG_LEVEL` | enum | igen | process | nem | `info` célpolicy szerint |
| `NEXT_PUBLIC_APP_NAME` | string | igen | build | nem | nincs |
| `DATABASE_URL` | PostgreSQL DSN | database mellett | process | igen | nincs |

### 64.2. Generált reference

Az implementált generátor:

```bash
pnpm forge config:reference --project .
pnpm forge config:reference --check --project .
```

A generátor az aktív manifest és az autoritatív Forge konfigurációs catalog alapján készít reference-et; a recipe metadata egyezését a `config:drift` ellenőrzi. A generátor nem olvas vagy publikál secretértéket.

### 64.3. Human és machine source

A schema legyen machine-readable source. A leírás és biztonsági indoklás specificationben. A `.env.example` csak onboarding projekció.

### 64.4. Deprecation

Config key lifecycle:

```text
active
deprecated
compatibility alias
removed
```

Deprecation warning:

- régi és új kulcs egyszerre: hiba vagy egyértelmű precedence;
- régi kulcs használata: warning;
- removal version;
- migration guide.

### 64.5. Alias

Átmeneti helper:

```ts
const databaseUrl =
  input.DATABASE_URL ??
  input.LEGACY_POSTGRES_URL;
```

Ha mindkettő jelen van, fail-closed conflict ajánlott.

---

## 65. Konfigurációs hibakódok

A Forge stabil, géppel feldolgozható hibakódokat ad. Az implementált kódok fő csoportjai:

```text
# manifest és capability
MANIFEST_MISSING
MANIFEST_INVALID
MANIFEST_JSON_INVALID
MANIFEST_AMBIGUOUS
MANIFEST_UNKNOWN_FIELD
MANIFEST_SCHEMA_VERSION
MANIFEST_PROFILE
MANIFEST_CAPABILITIES
MANIFEST_CAPABILITY_CONFIG
MANIFEST_CAPABILITY_CONFIG_UNKNOWN
MANIFEST_CAPABILITY_CONFIG_INACTIVE
CAPABILITY_UNKNOWN
CAPABILITY_DUPLICATE
CAPABILITY_DEPENDENCY_MISSING
CAPABILITY_PATH_MISSING
DOCUMENTATION_MANIFEST_MISSING
DOCUMENTATION_MANIFEST_ORPHAN

# feloldás és validáció
CONFIG_NODE_ENV_INVALID
CONFIG_ENV_EXPANSION_CYCLE
CONFIG_SOURCE_FILE_MISSING
CONFIG_KEY_MISSING
CONFIG_KEY_EMPTY
CONFIG_KEY_INVALID
CONFIG_URL_PROTOCOL_FORBIDDEN
CONFIG_NUMBER_OUT_OF_RANGE
CONFIG_BOOLEAN_INVALID
CONFIG_JSON_TOO_LARGE
CONFIG_SECRET_TOO_SHORT
CONFIG_DEFAULT_UNSAFE

# drift és consumer inventory
CONFIG_ENV_EXAMPLE_MISSING
CONFIG_ENV_EXAMPLE_DRIFT
CONFIG_ENV_TEST_DRIFT
CONFIG_ENV_KEY_DUPLICATE
CONFIG_KEY_UNDECLARED
CONFIG_KEY_UNUSED
CONFIG_REFERENCE_DRIFT
CONFIG_RECIPE_INVALID

# architektúra és security
CONFIG_PROCESS_ENV_FORBIDDEN
CONFIG_GLOBAL_BAG_FORBIDDEN
CONFIG_CLIENT_SERVER_ENV
CONFIG_CLIENT_DYNAMIC_ENV
CONFIG_SERVER_BOUNDARY_MISSING
CONFIG_PUBLIC_SECRET
CONFIG_NEXT_ENV_FORBIDDEN
CONFIG_RAW_ENV_LOG
CONFIG_SECRET_EXPOSED
CONFIG_SECRET_FILE_COMMITTED
DOC_SECRET_EXPOSED
```

Az olyan provider- vagy rotation-specifikus kódok, mint a `CONFIG_PROVIDER_UNAVAILABLE`, `CONFIG_SNAPSHOT_STALE` vagy `CONFIG_SECRET_ROTATION_INCOMPATIBLE`, csak az ezeket bevezető későbbi capability-contracttal válnak emitált, stabil felületté; a jelenlegi Forge nem állítja elő őket.

### 65.1. Hibaformátum

```ts
type ConfigurationFailure = Readonly<{
  code: string;
  key?: string;
  owner?: string;
  file?: string;
  message: string;
  remediation?: string;
}>;
```

### 65.2. Secretbiztonság

A failure nem tartalmazza:

- nyers értéket;
- teljes DSN-t;
- token prefixet, ha az azonosítható;
- private key részletet;
- decrypted file pathot, ha érzékeny.

### 65.3. Exit code

- invalid config: `1`;
- unknown CLI command: `2`;
- warning-only: `0`, ha policy engedi;
- security leak: non-zero.

### 65.4. Aggregation

CLI lehetőleg minden független schema hibát összegyűjt, hogy a deploymentet ne kelljen egy kulcsonként javítani. Secretérték továbbra sem jelenik meg.

---

## 66. Forge konfigurációs parancsok

### 66.1. Alap- és biztonsági ellenőrzések

```bash
pnpm forge about --project .
pnpm forge check --project .
pnpm forge env:check --project .
pnpm forge security:check --project .
pnpm forge doctor --project .
```

A `pnpm forge ...` a kanonikus CLI-forma. Projektlokális rövid script csak explicit wrapper lehet körülötte.

### 66.2. `env:check`

Implementált scope:

- manifest betöltése;
- alkalmazás-shell, publikus kliensconfig és aktív capability-k validációja;
- Next.js precedencia és változóexpanzió;
- forrásproveniencia és redaktált hibák;
- non-zero exit invalid értéknél.

### 66.3. `config:list`

```bash
pnpm forge config:list --project .
```

### 66.4. `config:inspect`

```bash
pnpm forge config:inspect DATABASE_URL --project .
```

### 66.5. `config:reference`

```bash
pnpm forge config:reference --project .
pnpm forge config:reference --check --project .
```

### 66.6. `config:drift`

```bash
pnpm forge config:drift --project .
```

Ellenőrzi:

```text
aktív manifest + Forge catalog
recipe environment és részletes configuration metadata a monorepóban
.env.example kulcsinventár és secretmentes példák
.env.test determinisztikus kulcsinventár
közvetlen process.env consumerek és undeclared kulcsok
```

A generált Markdown-reference külön a `config:reference --check` feladata.

### 66.7. `config:diff`

```bash
pnpm forge config:diff --from=staging --to=production --project .
```

A parancs explicit `.env.<stage>` vagy megadott snapshotfájlokat hasonlít össze. Public/internal értéknél státuszt és fingerprint-változást jeleníthet meg. Secret esetén csak azt jelzi, hogy a redaktált érték változott-e; secret fingerprintet és nyers értéket nem közöl.

### 66.8. `config:unused`

```bash
pnpm forge config:unused --project .
```

Statikus elemzéssel és metadata alapján jelzi az orphan kulcsokat. Dinamikus lookup miatt teljes bizonyosság nem mindig lehetséges.

### 66.9. `secrets:check`

```bash
pnpm forge secrets:check --project .
```

Nem secret managert helyettesít; repo és generated artifact leaket keres.

### 66.10. `config:doctor`

A teljes inventoryt, env-validációt, driftet, unused kulcsokat, generated reference-et és secret hygiene eredményt egyetlen redaktált diagnosztikában összesíti.

---

## 67. Hibaelhárítás: hiányzó változó

### Tünet

```text
Required environment variable is missing
ZodError
CONFIG_KEY_MISSING
CONFIG_KEY_INVALID
CONFIG_SECRET_TOO_SHORT
```

### Ellenőrzés

1. aktív-e a capability;
2. helyes project rootból fut-e a parancs;
3. melyik `NODE_ENV`;
4. `process.env` tartalmazza-e;
5. megfelelő `.env*` fájlban van-e;
6. `.env.local` testben kimarad-e;
7. CI job megkapja-e;
8. build vagy runtime fázisban hiányzik-e;
9. schema kulcsneve egyezik-e;
10. üres string-e.

### Javítás

- `.env.example` alapján lokális `.env.local`;
- deployment secret/env;
- capability eltávolítása, ha nem szükséges;
- schema ownership javítása;
- build-time eager import megszüntetése;
- toolhoz `@next/env` vagy explicit loader.

### Ne tedd

Ne adj általános development fallback secretet production kompatibilitás kedvéért.

---

## 68. Hibaelhárítás: működik devben, elbukik buildben

### Lehetséges okok

- dev `.env.local`, CI-ben nincs;
- statikus prerender buildkor olvas runtime envet;
- config modul importkor parse-ol;
- Prisma generate implicit build step;
- `NEXT_PUBLIC_` nincs build environmentben;
- monorepo project root eltér;
- `next.config.ts` olvas hiányzó envet;
- build cache régi értéket tartalmaz.

### Diagnózis

```bash
pnpm next build --debug
pnpm forge env:check --project .
pnpm exec tsc --noEmit
```

Redaktált key presence script.

### Megoldás

- runtime secret feloldás adapter creationkor;
- static route dinamikussá tétele csak indokolt esetben;
- `connection()` request-time olvasáshoz;
- explicit build input;
- public config rebuild;
- build és db generate szétválasztása;
- CI job capability-specifikus envje.

---

## 69. Hibaelhárítás: működik buildben, rossz productionben

### Lehetséges okok

- `NEXT_PUBLIC_` staging buildértékkel fagyott;
- production process env nincs injektálva;
- process restart elmaradt;
- secret mount frissült, app cache nem;
- multi-instance kulcs eltér;
- reverse proxy forwarded config hibás;
- runtime route statikusan cache-elt;
- public config endpoint CDN cache-e régi;
- stage és `NODE_ENV` összekeveredett.

### Ellenőrzés

- build ID;
- deployment ID;
- config fingerprint instance-onként;
- public bundle érték;
- pod/container env presence;
- secret version;
- cache headers;
- route rendering mode;
- readiness log;
- stage.

### Javítás

- új build public confighoz;
- rolling restart process confighoz;
- shared encryption/signing key;
- cache purge/versioned key;
- explicit runtime public config;
- trusted proxy beállítás.

---

## 70. Hibaelhárítás: secret megjelent kliensben vagy logban

### Azonnali lépések

1. tekintsd kompromittáltnak;
2. vond vissza/rotáld;
3. állítsd le a további logolást;
4. építs új artifactot;
5. invalidáld session/tokeneket;
6. vizsgáld Git, CI artifact, source map és cache történetet;
7. incidentet nyiss;
8. add hozzá a negatív tesztet/static checket.

### Gyökérokok

- `NEXT_PUBLIC_`;
- `next.config.env`;
- Client Component import;
- props serialization;
- `console.log(process.env)`;
- error object;
- config endpoint;
- source map;
- documentation/AI context;
- container layer.

### Implementált architecture és documentation checkek

```text
CONFIG_PUBLIC_SECRET
CONFIG_CLIENT_SERVER_ENV
CONFIG_NEXT_ENV_FORBIDDEN
CONFIG_RAW_ENV_LOG
DOC_SECRET_EXPOSED
```

### Git history

Fájl törlése a legújabb commitból nem vonja vissza a secretet. Rotation kötelező; history rewrite önmagában nem elég.

---

## 71. Migráció globális env singletonból

Kiinduló anti-pattern:

```ts
export const environment =
  globalEnvironmentSchema.parse(process.env);
```

### 71.1. Inventory

Listázd:

- schema kulcsok;
- consumers;
- capability owner;
- public/secret;
- phase;
- test;
- default;
- restart/rebuild.

### 71.2. Bontás

```text
app-env.ts
database-env.server.ts
auth-env.server.ts
mail-env.server.ts
storage-env.server.ts
```

### 71.3. Explicit input

A parserek fogadjanak inputot:

```ts
parseAppEnvironment(input)
getDatabaseEnvironment(input)
```

### 71.4. Consumer refaktor

```text
service közvetlen process.env
→ composition root
→ config object
→ constructor
```

### 71.5. Client audit

Minden `NEXT_PUBLIC_` és Client Component import review.

### 71.6. Build audit

Megnézni:

- `next.config.ts`;
- static pages;
- generateStaticParams;
- build scripts;
- Prisma config;
- test setup.

### 71.7. Capability manifest

Optional config csak aktív capability mellett required.

### 71.8. CI bontás

Core és capability-specifikus job.

### 71.9. Deprecation

Régi global module ideiglenesen wrapper lehet warninggal, majd eltávolítandó.

### 71.10. Definition of Done

- nincs direct env domain/application alatt;
- nincs client secret;
- minimal build opcionális env nélkül;
- env example driftmentes;
- tests pass;
- deployment runbook friss.

---

## 72. Konfigurációs change management

Minden konfigurációváltozás dokumentációs hatást okozhat.

### 72.1. PR impact statement

```yaml
configuration_impact:
  keys_added:
    - MAIL_PROVIDER
  keys_changed: []
  keys_deprecated: []
  keys_removed: []
  secret_changes:
    - MAIL_API_TOKEN
  build_required: false
  restart_required: true
  migration_required: false
  rollback: "restore previous provider and token"
```

### 72.2. Reviewerek

Legalább:

- owning capability maintainer;
- security owner secretnél;
- operations owner deploymentnél;
- data owner database/migration esetén.

### 72.3. Breaking change

Breaking:

- required key hozzáadása migration nélkül;
- key jelentésének megváltoztatása;
- unit módosítása;
- build/runtime lifecycle váltás;
- default security módosítása;
- secret format;
- public exposure.

### 72.4. Rollback

Rollback megadja:

- previous key support;
- previous secret;
- config version;
- code compatibility;
- cache invalidáció;
- restart;
- data hatás.

### 72.5. Release notes

User-facing template/recipe config változás release note és upgrade guide része.

---

## 73. Implementációs elfogadási kritériumok

Egy Winzard projekt konfigurációs rendszere akkor tekinthető megfelelőnek, ha:

1. a manifest explicit capability-ket deklarál;
2. optional capability hiányában annak envje nem kötelező;
3. minden owned env kulcshoz schema tartozik;
4. a parser explicit inputtal unit tesztelhető;
5. domain és application nem olvas `process.env`-et;
6. Client Component nem importál server configot;
7. secret nem kerül `NEXT_PUBLIC_` vagy `next.config.env` alá;
8. public config explicit allowlist;
9. `.env.example` secretmentes és schema-kompatibilis;
10. `.env.local` gitignored;
11. `.env.test` determinisztikus és secretmentes;
12. production config deployment platformból vagy secret managerből származik;
13. lifecycle dokumentált: build/process/request/public;
14. rebuild/restart követelmény ismert;
15. hiányzó critical config fail-closed;
16. diagnosztika redaktált;
17. CI capability-specifikus;
18. minimal/core build database és auth nélkül sikeres;
19. config change rollbackkel rendelkezik;
20. secretrotation runbook elérhető;
21. multi-instance critical kulcsok konzisztensek;
22. test és production stage nem oszt credentialt;
23. request input nem írja felül a deployment configot;
24. feature flag nem helyettesít capabilityt vagy authorizációt;
25. generated config reference és docs nem driftel.

### 73.1. Negatív elfogadási tesztek

- hiányzó database URL;
- invalid URL scheme;
- `"false"` boolean;
- túl nagy pool;
- default secret;
- public secret;
- stale `NEXT_PUBLIC_`;
- statikus renderbe fagyott runtime env;
- más project root;
- `.env.local` testben elvárt, de hiányzó;
- multi-instance key mismatch;
- external provider unavailable;
- secret logolás.

---

## 74. Symfony–Winzard részletes megfeleltetés

| Symfony konfigurációs fogalom | Winzard megfelelő |
| --- | --- |
| `config/` | manifest + typed tool/framework config + capability-owned config |
| `config/packages/` | recipe/capability adapter konfiguráció |
| YAML/PHP config | TypeScript/JSON, env csak deployment input |
| config import | explicit static TS import/registry |
| bundle | capability/recipe |
| Flex recipe | Winzard recipe contract |
| service container parameter | szűk immutable config/value object |
| `%parameter%` | explicit import/injection |
| `%env(NAME)%` | schema által olvasott `process.env.NAME` |
| env processor `int`, `bool`, `json` | Zod/explicit parser |
| `APP_ENV` | `NODE_ENV` + `APP_STAGE` |
| `config/packages/test` | `.env.test` + fixture/test factory |
| `.env.local` | lokális, gitignored override |
| system env precedence | Next env load order első eleme `process.env` |
| `dump-env` | Next build/runtime természetes envkezelés; nincs azonos Winzard lépés |
| Symfony secrets vault | deployment secret manager; saját vault nem baseline |
| `debug:dotenv` | `forge env:check` + célzott redaktált diagnostics |
| `debug:container --env-vars` | `forge config:list` és `forge config:inspect` |
| custom EnvVarLoader | explicit ConfigurationSource/SecretProvider adapter |
| bundle config runtime placeholder | adapterhatáron runtime parse/factory |
| `getParameter()` | explicit config injection |
| `ContainerBagInterface` | tiltott global config bag; szűk interface |
| environment-specific file override | deployment stage + env/typed policy |
| parameter default | schema default, csak safe esetben |
| non-empty parameter check | schema `.min(1)`/refinement |
| compile-time private parameter | build-only typed constant |
| config reference dump | `forge config:reference` |

### 74.1. Lényegi különbség

A Symfony container a konfigurációt és service wiringot központilag fordítja össze. A Winzard explicit TypeScript composition rootokat használ, ezért a konfigurációs dependency-k közvetlenül láthatók a konstruktorokban és factorykban.

### 74.2. Megőrzött értékek

Megmarad:

- centralizált contract;
- environment differenciálás;
- diagnostics;
- reusable parameters helyett reusable typed objects;
- package/capability ownership;
- secret management;
- schema/reference;
- test overrides.

### 74.3. Tudatosan nem átvett elemek

Nem kerül át:

- globális parameter bag;
- implicit autowire név alapján;
- tetszőleges YAML merge;
- új `NODE_ENV` stage-enként;
- envből dinamikus import path;
- minden package config egyetlen központi directoryban;
- secret automatikus repo-vaultja.

---

## 75. Források és attribúció

A dokumentum a következő hivatalos forrásokra épül.

### 75.1. Symfony

- [Configuring Symfony](https://symfony.com/doc/current/configuration.html)
- [Symfony Configuration Reference](https://symfony.com/doc/current/reference/configuration/framework.html)
- [Environment Variables](https://symfony.com/doc/current/configuration/env_var_processors.html)
- [Secrets Management](https://symfony.com/doc/current/configuration/secrets.html)
- [Service Container](https://symfony.com/doc/current/service_container.html)

### 75.2. Next.js

- [Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)
- [next.config.js](https://nextjs.org/docs/app/api-reference/config/next-config-js)
- [next.config `env`](https://nextjs.org/docs/app/api-reference/config/next-config-js/env)
- [Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [`instrumentation.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [`connection()`](https://nextjs.org/docs/app/api-reference/functions/connection)
- [Edge Runtime](https://nextjs.org/docs/app/api-reference/edge)
- [Data Security](https://nextjs.org/docs/app/guides/data-security)

### 75.3. Node.js és schema

- [`process.env`](https://nodejs.org/docs/latest-v24.x/api/process.html#processenv)
- [Node.js Environment Variables](https://nodejs.org/docs/latest-v24.x/api/environment_variables.html)
- [Zod schemas](https://zod.dev/api)

### 75.4. Prisma

- [Prisma Config reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference)
- [Prisma environment variables](https://www.prisma.io/docs/orm/more/development-environment/environment-variables)

### 75.5. Winzard repository baseline

A dokumentum a következő publikus Winzard-szerződésekhez igazodik:

```text
packages/config/src/app-env.ts
templates/webapp/src/platform/config/app-env.ts
templates/webapp/src/platform/database/database-env.server.ts
recipes/authentication/files/src/platform/auth/auth-env.server.ts
templates/webapp/prisma.config.ts
packages/forge/src/environment.ts
packages/forge/src/manifest.ts
```

### 75.6. Ellenőrzési dátum

```text
2026-07-18
```

A frameworkek env-, build- és runtimeviselkedése változhat. Frissítéskor újra ellenőrizni kell legalább:

- Next.js `.env` load order;
- `NEXT_PUBLIC_` inlining;
- runtime config ajánlás;
- `next.config.env` státusz;
- `instrumentation.register`;
- Node.js `process.env` semantics;
- Edge/Proxy env elérhetőség;
- Prisma Config betöltése;
- Server Function encryption key deployment viselkedése.
