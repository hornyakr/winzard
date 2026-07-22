---
title: "Kernel-szintű konfiguráció Winzard alkalmazásokban"
description: "A Symfony kernel konfigurációs paramétereinek teljes Winzard-specifikus átültetése: projekt- és buildgyökér, cache, runtime módok, környezetek, locale-ok, hibakezelés, proxybizalom, secretek, reprodukálható build és deployment-identitás."
status: "implemented-unverified"
document_version: "1.0.0"
last_verified: "2026-07-22"
source_basis: "Symfony Docs — Configuring in the Kernel"
nextjs_baseline: "16.2.10"
nodejs_baseline: "24.x"
applies_to: "Winzard Reference App, Winzard template-ek és kitelepített Winzard projektek"
related_documents:
  - "winzard-configuration.md"
  - "winzard-http-kernel.md"
  - "winzard-application-platform.md"
  - "winzard-routing.md"
  - "winzard-controller.md"
---

# Kernel-szintű konfiguráció Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Configuring in the Kernel”** referenciafejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony által felsorolt kernelparamétereket és azok üzemeltetési jelentését követi, de minden fogalmat a Winzard **Next.js App Router + explicit composition root + capability manifest + típusos konfiguráció** architektúrájára képez le.

A Symfony kernel egyetlen, központi alkalmazásobjektumként többek között ismeri a projektkönyvtárat, a cache- és logkönyvtárat, a regisztrált bundle-öket, az environmentet, a runtime módot, a locale-okat, a secretet, valamint a trusted proxy/host/header beállításokat. A Winzard nem hoz létre ennek mintájára egy mindenből elérhető, mutable `Kernel` vagy `ParameterBag` objektumot.

A Winzard alapdöntése:

> **A kernel-szintű konfiguráció nem egy globális service locator. A build-, process-, request-, deployment- és capability-szintű értékeket külön szerződések kezelik, majd a composition root csak a szükséges, validált és immutable részhalmazokat injektálja.**

A dokumentum végére egy fejlesztő vagy üzemeltető:

1. megérti a Symfony összes jelenlegi `kernel.*` paraméterének Winzard-megfelelőjét;
2. szét tudja választani a projekt-, build-, runtime-, request- és deployment-identitást;
3. biztonságosan kezeli a build- és cache-könyvtárakat read-only vagy ephemeral környezetben;
4. reprodukálható és többpéldányos deploymentre alkalmas buildazonosítót tud kialakítani;
5. explicit módon kezeli a web, CLI és worker futási módokat;
6. helyesen kezeli a locale-, error-, method override-, secret- és proxybizalmi contractokat;
7. meg tudja akadályozni a Host-, `X-Forwarded-*`- és `X-Sendfile` alapú biztonsági hibákat;
8. diagnosztizálható, tesztelhető és CI-ben ellenőrizhető kernelkonfigurációt tud fenntartani.

> [!IMPORTANT]
> A dokumentumban szereplő `forge kernel-config:*`, `forge runtime:*`, `forge proxy:trust`, `forge locale:check` és `forge build:reproducibility` parancsok implementált, tesztelt Forge-felületek. A diagnostics minden secret- és sensitive-metadata értéket redaktál.

> [!NOTE]
> A „kernel” szó ebben a dokumentumban konfigurációs és üzemeltetési fogalom. A Winzard nem vezet be a Next.js mellé második HTTP-request dispatchert vagy saját framework kernelt. A request–response életciklust a `winzard-http-kernel.md` tárgyalja.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#fogalmak-es-normativ-nyelv)
2. [Hatókör és kizárások](#hatokor-es-kizarasok)
3. [A Symfony kernel konfigurációs modellje](#a-symfony-kernel-konfiguracios-modellje)
4. [A Winzard kernelkonfigurációs modellje](#a-winzard-kernel-konfiguracios-modellje)
5. [Gyors megfeleltetési tábla](#gyors-megfeleltetesi-tabla)
6. [Forrásigazság és prioritás](#forrasigazsag-es-prioritas)
7. [Ajánlott könyvtárstruktúra](#ajanlott-konyvtarszerkezet)
8. [`kernel.project_dir`: repository- és alkalmazásgyökér](#kernel-project-dir)
9. [Monorepo- és workspace-gyökerek](#monorepo-es-workspace-gyokerek)
10. [Pathbiztonság és hordozhatóság](#path-biztonsag-es-portabilitas)
11. [`kernel.build_dir`: build artifact gyökér](#kernel-build-dir)
12. [`distDir`, `output` és artifactstratégia](#distdir-es-output-strategia)
13. [`kernel.cache_dir`: futásidejű cache](#kernel-cache-dir)
14. [Build cache és runtime cache szétválasztása](#build-cache-es-runtime-cache)
15. [Next.js cache handlerek](#nextjs-cache-handlers)
16. [`kernel.share_dir`: megosztott cache és közös állapot](#kernel-share-dir)
17. [Cache namespace, tagek és invalidáció](#cache-namespace-es-invalidation)
18. [`kernel.logs_dir`: logcél és observability](#kernel-logs-dir)
19. [Logszintek, debug és production](#log-szintek-debug-es-production)
20. [`kernel.charset`: karakterkódolás](#kernel-charset)
21. [Encoding boundaryk és legacy input](#encoding-boundaryk)
22. [`kernel.bundles`: capability-k, recipe-k és package-ek](#kernel-bundles)
23. [`kernel.bundles_metadata`: capability- és package-metadata](#kernel-bundles-metadata)
24. [Capability graph és kompatibilitás](#capability-graph-es-kompatibilitas)
25. [`kernel.container_build_time`: reprodukálható build idő](#kernel-container-build-time)
26. [`SOURCE_DATE_EPOCH` contract](#source-date-epoch-contract)
27. [Next.js build ID](#build-id)
28. [Deployment ID és rolling deployment](#deployment-id)
29. [`kernel.container_class`: composition graph identitás](#kernel-container-class)
30. [Composition graph drift](#composition-graph-drift)
31. [`kernel.debug`: debug policy](#kernel-debug)
32. [Debug, source map és diagnosztikai adat](#debug-es-forrasterkep)
33. [`kernel.environment`: configuration environment](#kernel-environment)
34. [`kernel.runtime_environment`: deployment stage](#kernel-runtime-environment)
35. [Environment- és stage-mátrix](#environment-matrix)
36. [`kernel.runtime_mode`: process-szerep](#kernel-runtime-mode)
37. [`kernel.runtime_mode.web`: web mód](#runtime-mode-web)
38. [`kernel.runtime_mode.cli`: CLI mód](#runtime-mode-cli)
39. [`kernel.runtime_mode.worker`: worker mód](#runtime-mode-worker)
40. [Runtime mode feloldása és tiltott heurisztikák](#runtime-mode-feloldas)
41. [`kernel.default_locale`: alapértelmezett locale](#kernel-default-locale)
42. [`kernel.enabled_locales`: támogatott locale-ok](#kernel-enabled-locales)
43. [Locale-feloldási prioritás](#locale-feloldasi-prioritas)
44. [`kernel.error_controller`: error felületek](#kernel-error-controller)
45. [Error lifecycle és observability](#error-lifecycle-es-observability)
46. [`kernel.http_method_override`: HTTP method override](#kernel-http-method-override)
47. [`kernel.allowed_http_method_override`: engedélyezett override-ok](#allowed-http-method-override)
48. [Method override security és migráció](#method-override-security)
49. [`kernel.secret`: nincs globális alkalmazássecret](#kernel-secret)
50. [Secret rotation és többpéldányos működés](#secret-rotation)
51. [`kernel.trusted_headers`: megbízható forwardolt headerek](#kernel-trusted-headers)
52. [`kernel.trusted_proxies`: proxy trust boundary](#kernel-trusted-proxies)
53. [`kernel.trusted_hosts`: host allowlist](#kernel-trusted-hosts)
54. [Canonical origin és abszolút URL](#canonical-origin)
55. [Server Actions és engedélyezett originök](#server-actions-allowed-origins)
56. [`kernel.trust_x_sendfile_type_header`: fájlkiszolgálás offload](#kernel-trust-x-sendfile)
57. [Reverse proxy deployment baseline](#trusted-proxy-deployment)
58. [Komplett kernelkonfigurációs típus](#komplett-kernel-config-tipus)
59. [Típusos kernelkonfiguráció Zoddal](#zod-kernel-schema)
60. [Teljes `next.config.ts` példa](#next-config-pelda)
61. [Startup-validáció `instrumentation.ts` segítségével](#startup-validacio)
62. [Read-only és ephemeral filesystem](#read-only-es-ephemeral-filesystem)
63. [Node, Edge/Proxy és static runtime](#node-edge-es-static-runtime)
64. [Fejlesztési és tesztkörnyezet](#fejlesztesi-es-teszt-kornyezet)
65. [Production és rolling deployment](#production-es-rolling-deployment)
66. [Kernelkonfigurációs diagnosztika](#kernelkonfiguracios-diagnosztika)
67. [Kernelkonfigurációs tesztelés](#kernelkonfiguracios-teszteles)
68. [CI és reprodukálhatóság](#ci-es-reprodukalthatosag)
69. [Biztonsági fenyegetési modell](#biztonsagi-fenyegetesi-modell)
70. [Célzott hibakódok](#célzott-hibakodok)
71. [Migráció Symfony kernelkonfigurációból](#migracio-symfonybol)
72. [Hibaelhárítás: build- és pathproblémák](#hibaelharitas-build-es-path)
73. [Hibaelhárítás: environment és runtime](#hibaelharitas-environment-es-runtime)
74. [Hibaelhárítás: proxy, host és origin](#hibaelharitas-proxy-es-host)
75. [Implementációs elfogadási kritériumok](#implementacios-elfogadasi-kriteriumok)
76. [Részletes Symfony–Winzard megfeleltetés](#reszletes-symfony-winzard-megfeleltetes)
77. [Források és attribúció](#forrasok-es-attribucio)

---

<a id="fogalmak-es-normativ-nyelv"></a>

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy biztonsági, reprodukálhatósági, kompatibilitási, illetve üzemeltetési hibát okozhat;
- **TILOS / MUST NOT**: a megoldás nem használható Winzard-kompatibilis projektben;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni és tesztelni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak explicit, review-zott indoklással alkalmazható;
- **OPCIONÁLIS / MAY**: a projekt és a hosting platform igénye szerint használható.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Projektgyökér** | A kitelepített alkalmazás logikai gyökere, amelyből a manifestet, `package.json`-t és appkonfigurációt feloldjuk. |
| **Repository-gyökér** | A Git working tree gyökere. Monorepóban nem feltétlenül azonos az alkalmazásgyökérrel. |
| **Buildgyökér** | A Next.js build artifactjainak gyökere, alapértelmezetten `.next`. |
| **Runtime írható tér** | Olyan könyvtár vagy külső szolgáltatás, amelybe a futó process biztonságosan írhat. |
| **Deployment-identitás** | Egy konkrét kiadás vagy rollout stabil azonosítója. |
| **Build-identitás** | Az azonos forrásból és buildinputból létrehozott artifact azonosítója. |
| **Configuration environment** | A kód- és frameworkviselkedést meghatározó mód, például `development`, `production`, `test`. |
| **Deployment stage** | A telepítés üzleti/üzemeltetési helye, például `preview`, `staging`, `production`. |
| **Runtime mode** | A process szerepe: web, CLI, worker vagy más explicit entrypoint. |
| **Trusted proxy boundary** | Az a hálózati határ, amely után bizonyos forwardolt headerek megbízhatónak tekinthetők. |
| **Capability** | Telepített, manifestben deklarált platformképesség saját fájl-, dependency-, env- és Forge-contracttal. |
| **Kernelkonfiguráció** | A projekt-, build-, runtime-, deployment- és hálózati invariánsok összessége; nem globális service bag. |

### 1.3. Paraméter és contract különbsége

A Symfony kernelparaméter egy containerben elérhető név–érték pár lehet. A Winzardban ugyanaz a fogalom gyakran több külön szerződésre bomlik:

```text
kernel.project_dir
→ repositoryRoot
+ applicationRoot
+ packageRoot
+ runtimeWorkingDirectory

kernel.environment
→ NODE_ENV
+ build phase
+ test mode

kernel.runtime_environment
→ APP_STAGE
+ deployment region
+ deployment ID

kernel.runtime_mode
→ explicit web/cli/worker entrypoint
```

A cél nem a paraméternevek mechanikus másolása, hanem a viselkedési és üzemeltetési jelentés pontos megőrzése.

---

<a id="hatokor-es-kizarasok"></a>

## 2. Hatókör és kizárások

### 2.1. A dokumentum lefedi

- projekt- és alkalmazásgyökér feloldását;
- build-, cache-, megosztott cache- és logtér kezelését;
- capability- és package-metadata szerepét;
- reprodukálható buildet és build/deployment fingerprintet;
- debug-, environment-, stage- és runtime-mode contractot;
- locale-konfigurációt;
- error felületeket;
- HTTP method override szabályokat;
- capability-specifikus secretkezelést;
- trusted header, proxy és host biztonságot;
- X-Sendfile/X-Accel-Redirect integrációt;
- startup validációt, teszteket és CI-t.

### 2.2. Nem része ennek a dokumentumnak

Nem ez a fejezet definiálja teljes mélységben:

- az általános `.env` precedenciát és Zod-env mintákat — lásd `winzard-configuration.md`;
- a teljes request–response pipeline-t — lásd `winzard-http-kernel.md`;
- a composition graphot — lásd `winzard-service-container.md`;
- a routingot — lásd `winzard-routing.md`;
- a controller/delivery adaptereket — lásd `winzard-controller.md`;
- konkrét hosting provider minden egyedi beállítását;
- saját custom Next.js servert;
- új runtime kernel vagy EventDispatcher implementációját.

### 2.3. Támogatott baseline

```text
Node.js:      24.x
pnpm:         11.x
Next.js:      16.2.10
React:        19.2.x
TypeScript:   5.9.x
App Router:   igen
src/:         igen
```

A példák Node.js runtime-ot feltételeznek, hacsak egy szakasz kifejezetten nem tárgyalja az Edge/Proxy vagy statikus export korlátait.

---

<a id="a-symfony-kernel-konfiguracios-modellje"></a>

## 3. A Symfony kernel konfigurációs modellje

A Symfony alkalmazás központi kernelosztálya számos, containerparaméterként is elérhető értéket állít elő. A referencia jelenleg többek között a következőket sorolja fel:

```text
kernel.build_dir
kernel.bundles
kernel.bundles_metadata
kernel.cache_dir
kernel.charset
kernel.container_build_time
kernel.container_class
kernel.debug
kernel.default_locale
kernel.enabled_locales
kernel.environment
kernel.error_controller
kernel.http_method_override
kernel.allowed_http_method_override
kernel.logs_dir
kernel.project_dir
kernel.runtime_environment
kernel.runtime_mode
kernel.runtime_mode.web
kernel.runtime_mode.cli
kernel.runtime_mode.worker
kernel.secret
kernel.share_dir
kernel.trust_x_sendfile_type_header
kernel.trusted_headers
kernel.trusted_hosts
kernel.trusted_proxies
```

A Symfony modell előnye, hogy ezek az értékek:

- egy központi bootstrap során jönnek létre;
- a framework és a service container ugyanazt a forrást használja;
- environment és debug szerint változhatnak;
- diagnosztizálhatók;
- felülírható kernelmetódusokkal rendelkezhetnek;
- bundle- és frameworkkonfigurációval összhangban állnak.

A Winzardnak ugyanilyen egyértelmű contractot kell adnia, de a JavaScript/Node/Next.js futási modell miatt nem ugyanazzal a megvalósítással.

---

<a id="a-winzard-kernel-konfiguracios-modellje"></a>

## 4. A Winzard kernelkonfigurációs modellje

A Winzardban nincs egyetlen, process-wide `KernelParameters` objektum, amelyet bármely modul szabadon lekérdezhet.

A támogatott modell:

```text
Git/repository metadata
  → repository és app root

package.json / winzard.json
  → profile és capability-k

next.config.ts
  → Next.js build- és frameworkkonfiguráció

process environment / secret provider
  → process-start konfiguráció

explicit entrypoint
  → web, CLI vagy worker runtime mode

incoming Request
  → request-derived host, proxy, locale és actor context

composition root
  → validált, minimális configobjektumok injektálása
```

### 4.1. Fő szabályok

1. A buildidőben szükséges érték buildidőben validálandó.
2. A process-start érték a szerver indulásakor fail-fast módon validálandó.
3. A request-derived érték nem processsingleton.
4. Egy capability csak a saját értékeit követelheti.
5. Secret nem kerülhet általános diagnostics outputba.
6. Az alkalmazás- és domainréteg nem olvashat közvetlenül `process.env`-et.
7. A repository- és appgyökér explicit legyen monorepóban.
8. A build- és deployment-identitás ne keveredjen.
9. A proxy- és hostbizalom infrastruktúra-contract, nem stringfeldolgozási kényelmi beállítás.
10. A teljes konfiguráció tesztelhető legyen valós platform nélkül is.

---

<a id="gyors-megfeleltetesi-tabla"></a>

## 5. Gyors megfeleltetési tábla

| Symfony kernelparaméter | Winzard-megfelelő | Fő autoritás |
| --- | --- | --- |
| `kernel.project_dir` | repository/app root resolver | CLI argumentum, manifest, `package.json` |
| `kernel.build_dir` | `.next` vagy `distDir` | `next.config.ts` |
| `kernel.cache_dir` | Next.js cache handler + lokális cache policy | `next.config.ts`, cache capability |
| `kernel.share_dir` | külső megosztott cache/object storage | capability adapter |
| `kernel.logs_dir` | stdout/stderr + telemetry sink | observability capability |
| `kernel.charset` | UTF-8 invariant | HTTP/content contract |
| `kernel.bundles` | capability-k és recipe-k | Winzard manifest |
| `kernel.bundles_metadata` | package/recipe/capability metadata | manifest + package export |
| `kernel.container_build_time` | `SOURCE_DATE_EPOCH` és release metadata | CI/build pipeline |
| `kernel.container_class` | composition graph/build fingerprint | Forge/generator |
| `kernel.debug` | debug policy, dev diagnostics | `NODE_ENV` + explicit flags |
| `kernel.environment` | framework configuration mode | `NODE_ENV` |
| `kernel.runtime_environment` | deployment stage | `APP_STAGE` / deployment metadata |
| `kernel.runtime_mode.*` | explicit web/CLI/worker entrypoint | process command |
| `kernel.default_locale` | `DEFAULT_LOCALE` | i18n capability config |
| `kernel.enabled_locales` | validated locale allowlist | i18n capability config |
| `kernel.error_controller` | error boundary + problem mapper + instrumentation | App Router + delivery contract |
| `kernel.http_method_override` | alapértelmezetten tiltott | legacy adapter, ha szükséges |
| `kernel.allowed_http_method_override` | explicit method allowlist | legacy adapter config |
| `kernel.secret` | capability-specifikus signing/auth secret | secret provider |
| `kernel.trusted_headers` | trusted forwarded header allowlist | reverse proxy contract |
| `kernel.trusted_proxies` | proxy CIDR/hop trust | infrastructure config |
| `kernel.trusted_hosts` | canonical host allowlist | deployment/tenant config |
| `kernel.trust_x_sendfile_type_header` | explicit internal file-offload adapter | reverse proxy capability |

A táblázat navigációs összefoglaló. Az egyes sorok normatív részletei a későbbi fejezetekben találhatók.

---

<a id="forrasigazsag-es-prioritas"></a>

## 6. Forrásigazság és prioritás

Egy kernelértéknek pontosan egy kanonikus tulajdonosa legyen.

### 6.1. Ajánlott prioritási sorrend

```text
1. explicit CLI vagy deployment input
2. Winzard manifest / package metadata
3. next.config.ts
4. process environment / secret mount
5. validált default
6. request-derived context, csak request-szintű értékhez
```

Ez nem általános merge-algoritmus. Minden kulcs contractja külön mondja meg, mely források engedélyezettek.

### 6.2. Tiltott prioritás

Nem támogatott:

```text
request header
→ felülírja a buildgyökeret

query string
→ felülírja az APP_STAGE-et

tenant adatbázisrekord
→ felülírja a signing secretet

NEXT_PUBLIC_* érték
→ szerveroldali security policy forrása
```

### 6.3. Diagnostics

A diagnosztika minden értékhez lehetőség szerint rögzíti:

```text
kulcs
owner capability
lifecycle
source type
source file vagy provider
present / missing / redacted
build vagy runtime
restart szükséges-e
```

A secretérték maga soha nem jelenik meg.

---

<a id="ajanlott-konyvtarszerkezet"></a>

## 7. Ajánlott könyvtárstruktúra

```text
src/
  platform/
    kernel-config/
      project-paths.ts
      build-identity.ts
      runtime-environment.ts
      runtime-mode.ts
      locale-config.ts
      proxy-trust.server.ts
      kernel-config.errors.ts
      validate-kernel-config.server.ts

    observability/
      logger.server.ts
      instrumentation.ts

    cache/
      cache-policy.ts
      cache-handlers/

  composition/
    application.server.ts
    worker.server.ts
    cli.server.ts

instrumentation.ts
next.config.ts
winzard.json
package.json
```

### 7.1. Ownership

- `project-paths.ts` csak path-feloldást végez.
- `build-identity.ts` build- és deploymentazonosítókat validál.
- `runtime-environment.ts` az environment/stage contractot birtokolja.
- `runtime-mode.ts` explicit process-szerepet reprezentál.
- `proxy-trust.server.ts` csak szerveroldalon importálható.
- `validate-kernel-config.server.ts` startupkor összeállítja a kötelező invariánsokat.
- a composition root csak a szükséges részhalmazokat adja tovább.

### 7.2. Nem támogatott

```text
src/config.ts
  → minden env, secret, request header és provider beolvasása
  → globális mutable export
  → importálás domainből, UI-ból és toolból
```

Az ilyen modul elrejti az ownershipot és minden capability-t minden környezetben kötelezővé tesz.

---

<a id="kernel-project-dir"></a>

## 8. `kernel.project_dir`: repository- és alkalmazásgyökér

A Symfony `kernel.project_dir` a projekt abszolút gyökérútvonala. Winzardban legalább három külön fogalom szükséges:

```text
repositoryRoot
applicationRoot
packageRoot
```

Egy egyszerű, egypackage-es projektben ezek azonosak lehetnek. A Winzard repositoryhoz hasonló monorepóban viszont:

```text
repositoryRoot = /workspace/winzard
applicationRoot = /workspace/winzard/apps/reference
packageRoot = /workspace/winzard/packages/forge
```

### 8.1. Kanonikus resolver

```ts
import path from 'node:path';

export type ProjectPaths = Readonly<{
  repositoryRoot: string;
  applicationRoot: string;
}>;

export function resolveProjectPaths(input: {
  cwd: string;
  projectArgument?: string;
}): ProjectPaths {
  const repositoryRoot = path.resolve(input.cwd);
  const applicationRoot = path.resolve(
    repositoryRoot,
    input.projectArgument ?? '.',
  );

  const relative = path.relative(repositoryRoot, applicationRoot);

  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'A projektgyökér nem mutathat a repositoryn kívülre.',
    );
  }

  return Object.freeze({
    repositoryRoot,
    applicationRoot,
  });
}
```

### 8.2. Követelmények

- A path legyen abszolút és normalizált.
- A trailing slash ne legyen contractrésze.
- A CLI `--project` értéke ne léphessen ki a repositoryból engedély nélkül.
- Symlink esetén a valós pathot is ellenőrizni kell, ha security boundaryról van szó.
- User inputból soha ne épüljön tetszőleges filesystem path.
- A kód ne feltételezze, hogy `process.cwd()` mindig az alkalmazásgyökér.

### 8.3. `APP_PROJECT_DIR`

A Winzardban nem ajánlott egy általános `APP_PROJECT_DIR` envvel felülírni a repository és application rootot. CI-ben és CLI-ben az explicit `--project` vagy workspace metadata egyértelműbb és auditálhatóbb.

---

<a id="monorepo-es-workspace-gyokerek"></a>

## 9. Monorepo- és workspace-gyökerek

Monorepóban az alábbi műveletek eltérő gyökeret használhatnak:

| Művelet | Javasolt gyökér |
| --- | --- |
| Git diff és base commit | repository root |
| Next.js build | application root |
| Prisma config | capability/template root |
| Forge project check | explicit project root |
| Package export check | package root |
| Dokumentációs vault | fogyasztói project root |
| Cache key namespace | repository + app + deployment ID |

### 9.1. Stabil app-azonosító

A path önmagában nem stabil deploymentazonosító. A projekt adjon explicit appnevet:

```ts
export type ApplicationIdentity = Readonly<{
  name: string;
  packageName: string;
  profile: string;
}>;
```

Ezt a `package.json` és a Winzard manifest adja, nem a könyvtár utolsó szegmense.

### 9.2. Root drift

A következő hibákat CI-ben érdemes felismerni:

```text
KERNEL_PROJECT_ROOT_MISSING
KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY
KERNEL_APPLICATION_ROOT_AMBIGUOUS
KERNEL_PACKAGE_ROOT_MISMATCH
KERNEL_WORKSPACE_MANIFEST_MISSING
```

### 9.3. Container

Containerben az abszolút path deploymentenként eltérhet, ezért:

- ne kerüljön üzleti adatba;
- ne legyen publikus API-contract;
- ne kerüljön cache keybe teljes formában;
- logban csak szükség esetén jelenjen meg;
- generated dokumentumban relatív path legyen.

---

<a id="path-biztonsag-es-portabilitas"></a>

## 10. Pathbiztonság és hordozhatóság

A Node.js `path.resolve()` abszolút, normalizált pathot állít elő; a `path.relative()` segítségével ellenőrizhető, hogy egy cél a megengedett gyökér alatt marad-e.

### 10.1. Kötelező ellenőrzések

- POSIX és Windows szeparátor kezelése;
- UNC path és meghajtóbetű esete;
- `..` traversal;
- abszolút bemenet;
- symlink escape;
- null byte;
- túl hosszú path;
- case sensitivity eltérés;
- reserved device name, ha Windows támogatott.

### 10.2. Fájlhozzáférés

A path validálása és a fájl megnyitása között TOCTOU verseny lehetséges. Érzékeny write vagy delete művelethez:

- minimalizáld az időablakot;
- használj atomikus rename-et;
- ellenőrizd a parentet;
- ne kövesd automatikusan a symlinket;
- használj platform-specifikus biztonságos adaptert.

### 10.3. Publikus output

HTTP-válaszban ne jelenjen meg:

```text
/app/apps/reference/.next/server/chunks/...
/home/user/project/...
C:\build\agent\...
```

Production error mapper ezeket redaktálja.

---

<a id="kernel-build-dir"></a>

## 11. `kernel.build_dir`: build artifact gyökér

A Symfony `kernel.build_dir` a buildidőben előállított, tipikusan read-only artifactokat választja el a futásidőben írható cache-től.

Winzardban ennek elsődleges megfelelője a Next.js build könyvtára:

```text
.next/
```

vagy a `next.config.ts` `distDir` opciója.

### 11.1. Alapszabály

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: '.next',
};

export default nextConfig;
```

A default `.next` használata általában a legjobb. Egyedi `distDir` csak akkor indokolt, ha:

- build rendszer megköveteli;
- több app artifactját külön kell kezelni;
- platformadapter szerződése ezt írja elő;
- legacy layout migrációja szükséges.

### 11.2. Korlátok

- A `distDir` nem mutathat a projektgyökéren kívülre.
- A build output nem általános runtime-adattár.
- Business upload, session, log és mutable cache nem kerülhet ide.
- A build könyvtár törölhető és újragenerálható.
- Az artifactot a build után immutable-ként kell kezelni.
- A process nem módosíthatja önkényesen a generált server bundle-t.

### 11.3. Read-only container

A támogatott container minta:

```text
build stage
  → next build
  → standalone/static artifact

runtime stage
  → read-only application filesystem
  → külön /tmp vagy external cache, ha szükséges
  → stdout logging
  → external secret injection
```

A read-only root filesystem hibát korán, deployment smoke testben kell felismerni.

---

<a id="distdir-es-output-strategia"></a>

## 12. `distDir`, `output` és artifactstratégia

A build könyvtár neve nem azonos az output formátumával.

```ts
const nextConfig: NextConfig = {
  distDir: '.next',
  output: 'standalone',
};
```

### 12.1. `distDir`

Meghatározza a Next.js buildadatok könyvtárát.

### 12.2. `output: 'standalone'`

Olyan deployment artifactot készít, amely a szükséges szerverfájlok traced részhalmazát tartalmazhatja. Ez nem jelenti azt, hogy:

- minden external asset automatikusan bekerül;
- a runtime cache megosztott;
- a secret buildbe csomagolható;
- custom serverrel korlátlanul kombinálható;
- a working directory tetszőleges lehet.

### 12.3. Artifact manifest

AJÁNLOTT release metadata:

```json
{
  "application": "catalog-web",
  "gitCommit": "abc1234",
  "buildId": "abc1234",
  "deploymentId": "catalog-web-2026-07-19-1",
  "nodeVersion": "24.10.0",
  "nextVersion": "16.2.10",
  "sourceDateEpoch": 1784419200
}
```

A manifest nem tartalmaz secretet vagy teljes env dumpot.

---

<a id="kernel-cache-dir"></a>

## 13. `kernel.cache_dir`: futásidejű cache

A Symfony `kernel.cache_dir` írható runtime cachekönyvtár. Next.jsben több külön cache létezik:

```text
build cache
Turbopack/webpack cache
Full Route Cache
Data/Component Cache
image optimization cache
request memoization
client router cache
alkalmazási cache
```

Ezek nem kezelhetők egyetlen `CACHE_DIR` kulccsal.

### 13.1. Kötelező szétválasztás

| Cache | Élettartam | Megosztás |
| --- | --- | --- |
| Build cache | CI/build | build rendszer szerint |
| Request memoization | egy render/request | nem megosztott |
| Process in-memory cache | process | instance-local |
| Next.js runtime cache | deployment/platform | configfüggő |
| Alkalmazási cache | üzleti contract | explicit provider |
| CDN cache | edge | HTTP-policy |
| Browser cache | kliens | response headerek |

### 13.2. Lokális filesystem

Single-instance, persistent disk esetén a lokális cache működhet. Több instance, ephemeral compute vagy serverless esetén:

- a cache instance-onként eltérhet;
- restartkor elveszhet;
- revalidation nem feltétlenül koordinált;
- shared cache adapter szükséges lehet.

### 13.3. Nem cache-elhető

```text
actor object
tenant permission
raw secret
mutable database transaction
request-specific headers
unredacted error
```

Az ilyen érték process- vagy shared cache-be helyezése security leak.

---

<a id="build-cache-es-runtime-cache"></a>

## 14. Build cache és runtime cache szétválasztása

A build cache célja a fordítás gyorsítása. A runtime cache célja response- vagy adatújrahasznosítás. A kettőnek eltérő:

- invalidációja;
- retentionje;
- érzékenysége;
- kompatibilitási szabálya;
- namespace-e;
- megosztási szintje van.

### 14.1. Build cache key

Példa CI kulcs:

```text
os
+ architecture
+ Node major
+ pnpm lock hash
+ Next version
+ build config hash
```

Nem elég csak a branch neve.

### 14.2. Runtime namespace

Példa:

```ts
export type CacheNamespace = Readonly<{
  application: string;
  deploymentId: string;
  schemaVersion: number;
  tenantId?: string;
}>;
```

### 14.3. Törő változás

DTO-, serializer- vagy cache-entry schema változásakor:

- namespace verziót emelni kell; vagy
- backward-compatible readert kell adni; vagy
- teljes invalidáció szükséges.

A rolling deployment alatt a régi és új instance egyszerre futhat, ezért a cache-format kompatibilitás explicit contract.

---

<a id="nextjs-cache-handlers"></a>

## 15. Next.js cache handlerek

Next.js 16-ban a `cacheHandlers` konfiguráció lehetővé teszi saját tároló implementáció megadását a `'use cache'` és `'use cache: remote'` használatához.

### 15.1. Példa

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheHandlers: {
    remote: require.resolve(
      './src/platform/cache/next-remote-cache-handler.js',
    ),
  },
};

export default nextConfig;
```

### 15.2. Contract

A cache handler többek között:

- cache entryt olvas;
- pending entryt tárol;
- tagek lejáratát kezeli;
- tagfrissítést koordinálhat;
- streamelt értéket kezelhet.

### 15.3. Winzard-szabályok

- A handler infrastruktúra-adapter.
- Nem importálható application rétegből.
- A handler config capability-specifikus.
- Shared storage használatakor tenant- és deploymentnamespace kötelező.
- Partial stream hiba esetén az entry megőrzésének szabálya explicit.
- Taginvalidáció több instance között tesztelendő.
- Provider outage esetén fail-open/fail-closed viselkedés dokumentálandó.
- A cache nem authorizációs forrás.

### 15.4. Saját application cache

Ha az üzleti olvasási modellnek Next.js cache-től eltérő semanticsa van, külön application port használható:

```ts
export interface ProductProjectionCache {
  get(id: ProductId): Promise<ProductView | null>;
  set(value: ProductView): Promise<void>;
  invalidate(id: ProductId): Promise<void>;
}
```

Ezt nem kell a Next.js belső cache API-jára ráerőltetni.

---

<a id="kernel-share-dir"></a>

## 16. `kernel.share_dir`: megosztott cache és közös állapot

A Symfony `kernel.share_dir` megosztott cachekönyvtárként szolgálhat. Modern Winzard deploymentben a közös állapot jellemzően nem hálózati fájlrendszerként jelenik meg.

Lehetséges megfelelő:

```text
Redis vagy kompatibilis KV
distributed cache service
object storage
database table
provider-managed cache
shared persistent volume, indokolt esetben
```

### 16.1. Alapelv

A megosztott állapothoz a megfelelő protokollt kell használni:

- cache → cache/KV;
- blob → object storage;
- durable message → queue/broker;
- lock → lock service vagy adatbázis;
- session → session store;
- build artifact → artifact registry.

### 16.2. Shared filesystem kockázatok

- locking semantics;
- latency;
- inode és permission különbség;
- partial write;
- stale mount;
- regionközi használat;
- symlink és traversal;
- backup/restore;
- rolling deployment formatütközés.

### 16.3. Fájlnév

Ha mégis shared file adapter szükséges:

```text
<application>/<deployment-or-schema>/<tenant>/<hash>
```

User által adott fájlnév közvetlenül nem használható.

---

<a id="cache-namespace-es-invalidation"></a>

## 17. Cache namespace, tagek és invalidáció

A kernelkonfiguráció csak a cache infrastruktúra alapját adja. Az invalidáció üzleti szemantikáját a owning capability határozza meg.

### 17.1. Namespace komponensek

```text
application ID
environment/stage
deployment vagy schema version
tenant ID
locale, ha a payload lokalizált
authorization scope, ha releváns
```

### 17.2. Túl széles namespace

Nem támogatott:

```text
product:123
```

ha több tenant használhat azonos ID-t.

Használandó:

```text
catalog:v3:tenant:acme:product:123
```

### 17.3. Tag policy

A tagek:

- legyenek stabilak;
- ne tartalmazzanak secretet;
- ne növekedjenek korlátlanul;
- tenant scope-pal rendelkezzenek;
- kompatibilisek legyenek rolling deployment alatt.

### 17.4. Invalidation evidence

Kritikus cache-változáshoz tesztelendő:

```text
write
→ invalidate
→ másik instance read
→ régi érték nem tér vissza
```

Ez különösen fontos external cache handlernél.

---

<a id="kernel-logs-dir"></a>

## 18. `kernel.logs_dir`: logcél és observability

A Symfony tipikusan fájlrendszerbeli logkönyvtárat ad. Containeres és serverless Winzard környezetben az alapértelmezett contract:

```text
alkalmazás
→ stdout / stderr
→ platform log collector
→ központi log backend
```

### 18.1. Miért ne legyen általános `LOG_DIR`?

- a lokális disk ephemeral lehet;
- több instance logjai szétszóródnak;
- rotáció és retention platformfeladat;
- read-only filesystem blokkolhatja;
- serverless környezetben nem tartós;
- log aggregation nélkül nem kereshető.

### 18.2. Strukturált log

```ts
export type LogRecord = Readonly<{
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  timestamp: string;
  requestId?: string;
  traceId?: string;
  deploymentId: string;
  fields?: Readonly<Record<string, unknown>>;
}>;
```

### 18.3. Kötelező redakció

A logger nem írhatja ki:

```text
Authorization
Cookie
Set-Cookie
DATABASE_URL
AUTH_SECRET
private key
access token
teljes request body
PII explicit allowlist nélkül
```

### 18.4. Fájl log adapter

Csak akkor használható, ha:

- a persistent volume garantált;
- a rotáció definiált;
- a permission és disk quota tesztelt;
- a log collector olvassa;
- a platform shutdownkor flushol;
- a log path nem user inputból származik.

---

<a id="log-szintek-debug-es-production"></a>

## 19. Logszintek, debug és production

A debug mód nem jelentheti azt, hogy minden érzékeny adat logolható.

### 19.1. Javasolt szintek

```text
debug
  → fejlesztői, részletes, de redaktált

info
  → normál üzemi esemény

warn
  → helyreállítható rendellenesség

error
  → sikertelen művelet vagy dependency hiba
```

### 19.2. Environmenthez kötés

Nem ajánlott kizárólag:

```ts
const level =
  process.env.NODE_ENV === 'production'
    ? 'info'
    : 'debug';
```

Használandó validált, capability-owned `LOG_LEVEL`.

### 19.3. Error stack

- Szerveroldali error backendbe küldhető.
- Kliensnek nem adható raw stack.
- Source map hozzáférés kontrollált.
- Production browser source map csak security és observability review után engedélyezhető.
- Stackben lévő path és query érték redaktálható.

### 19.4. Audit log

Az audit log nem azonos a technikai application loggal. Kritikus auditrekord tartós, integritásvédett tárolót és explicit retentiont igényel.

---

<a id="kernel-charset"></a>

## 20. `kernel.charset`: karakterkódolás

A Symfony kernel alapértelmezett karakterkódolása UTF-8. A Winzard szintén UTF-8 invariánst használ.

```text
source code
JSON
HTML
Markdown
log event
database text
message payload
```

alapértelmezetten UTF-8.

### 20.1. Nincs globális átállítás

Nem támogatott egy alkalmazásszintű:

```text
APP_CHARSET=ISO-8859-1
```

amely a teljes runtime-ot más kódolásra állítja.

Legacy input esetén boundary adapter:

```ts
export interface LegacyTextDecoder {
  decode(
    bytes: Uint8Array,
    sourceEncoding: LegacyEncoding,
  ): string;
}
```

### 20.2. HTTP

Példák:

```ts
return new Response(html, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
  },
});
```

```ts
return new Response(csv, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
  },
});
```

A JSON modern webes contractban UTF-8.

### 20.3. Normalizáció

Biztonsági vagy keresési contract esetén explicit döntés szükséges:

- Unicode normal form;
- case folding;
- accent sensitivity;
- confusable karakterek;
- fájlnév normalizáció;
- IDN host kezelés.

A byte limit és a karakterlimit nem azonos.

---

<a id="encoding-boundaryk"></a>

## 21. Encoding boundaryk és legacy input

Legacy rendszerből érkező payloadnál:

```text
bytes
→ Content-Type/declared charset
→ allowlist
→ decoder
→ UTF-8 string
→ runtime schema
→ domain value
```

### 21.1. Tiltások

- A `Content-Type` charsetét nem szabad korlátlanul elfogadni.
- Ismeretlen encoding ne kapjon silent fallbacket.
- Hibás byte sequence ne váljon észrevétlen karaktervesztéssé.
- A decoded stringet továbbra is validálni kell.
- A response ne tükrözze vissza raw, nem normalizált inputot HTML-be.

### 21.2. CSV és spreadsheet

UTF-8 BOM csak dokumentált consumer-kompatibilitás miatt használható. Formula injection ellen az első karakterek (`=`, `+`, `-`, `@`) külön escapinget igényelhetnek.

### 21.3. Log

A loggernek kezelnie kell a vezérlőkaraktereket és newline injectiont, különösen user inputból származó mezőknél.

---

<a id="kernel-bundles"></a>

## 22. `kernel.bundles`: capability-k, recipe-k és package-ek

A Symfony bundle regisztrálható framework- vagy alkalmazásmodul. Winzardban három külön fogalom szükséges:

```text
capability
recipe
package
```

### 22.1. Capability

A manifestben deklarált, strukturális képesség:

```json
{
  "capabilities": [
    "next-app",
    "forge",
    "modular-application",
    "prisma-postgresql"
  ]
}
```

A capability meghatározhat:

- kötelező fájlokat;
- dependency-ket;
- env-contractot;
- Forge-checket;
- dokumentációt;
- kompatibilitást.

### 22.2. Recipe

Telepítési és materializációs egység:

```text
files
dependencies
environment keys
provides
requires
conflicts
install/update/remove behavior
```

### 22.3. Package

Npm/Workspace csomag, public export contracttal.

### 22.4. Miért kell különválasztani?

Egy package telepítése nem feltétlenül aktivál capability-t. Egy capability több package-et és fájlt igényelhet. Egy recipe pedig egy capability telepítésének módja lehet.

---

<a id="kernel-bundles-metadata"></a>

## 23. `kernel.bundles_metadata`: capability- és package-metadata

A Symfony bundle metadata pathot és namespace-t is tárolhat. Winzardban a megfelelő metadata nem egyetlen globális mapből származik.

### 23.1. Lehetséges források

```text
package.json
winzard.json
recipe.json
package exports
workspace manifest
generated registry
consumer documentation manifest
```

### 23.2. Példa

```json
{
  "schemaVersion": 1,
  "name": "prisma-postgresql",
  "provides": [
    "prisma-postgresql"
  ],
  "requires": [
    "next-app",
    "forge"
  ],
  "environment": [
    "DATABASE_URL",
    "DATABASE_POOL_MAX"
  ],
  "files": [
    "prisma/schema.prisma",
    "src/platform/database/client.ts"
  ]
}
```

### 23.3. Security

Metadata nem adhat automatikusan:

- filesystem write jogot;
- secret read jogot;
- arbitrary command executiont;
- dynamic import pathot;
- network accesset;
- privileged runtime capability-t.

A recipe materializer allowlistelt műveleteket hajthat végre.

### 23.4. Diagnostics

A Forge később listázhatja:

```text
capability
provider recipe
package version
owned paths
env keys
documentation contract
status
```

A secretértékek nélkül.

---

<a id="capability-graph-es-kompatibilitas"></a>

## 24. Capability graph és kompatibilitás

A capability graph a Symfony bundle-regisztrációhoz hasonlóan megmutatja, mi aktív, de explicit függőségi irányt is ad.

```text
database-readiness
  → prisma-postgresql
    → next-app
    → forge
```

### 24.1. Invariánsok

- Ismeretlen capability hiba.
- Duplikált capability hiba.
- Hiányzó dependency hiba.
- Konfliktusban álló capability hiba.
- Hiányzó kötelező path hiba.
- Schema major eltérés hiba.
- Provider verzió inkompatibilitás hiba.

### 24.2. Environment matrix

Egy capability telepítve lehet, de egy adott processben nem feltétlenül aktív.

Példa:

```text
web process
  → database client aktív

migration CLI
  → Prisma CLI config aktív

static docs build
  → database runtime adapter nem aktív
```

A manifest struktúrát deklarál; az entrypoint aktivációját explicit composition adja.

### 24.3. Feature flag

Feature flag nem helyettesíti a capability-t. Hiányzó adapter, schema vagy migration nem válik elérhetővé attól, hogy a flag `true`.

---

<a id="kernel-container-build-time"></a>

## 25. `kernel.container_build_time`: reprodukálható build idő

A Symfony külön paraméterrel és `SOURCE_DATE_EPOCH` támogatással segíti a reprodukálható containerbuildet. Winzardban ugyanez a cél:

```text
azonos forrás
+ azonos lockfile
+ azonos toolchain
+ azonos buildinput
→ lehetőleg azonos artifact
```

### 25.1. Tilos a pillanatnyi idő beégetése

Nem ajánlott:

```ts
export const BUILD_TIME =
  new Date().toISOString();
```

ha ez a build outputba kerül, mert minden build eltérő lesz.

### 25.2. Használandó metadata

```ts
export type BuildMetadata = Readonly<{
  gitCommit: string;
  sourceDateEpoch?: number;
  buildId: string;
  nextVersion: string;
  nodeVersion: string;
}>;
```

### 25.3. `SOURCE_DATE_EPOCH`

A szabvány Unix timestampet használ. A Winzard buildscript:

- egész számként validálja;
- malformed értéknél hibát ad;
- UTC-ként kezeli;
- nem cseréli le pillanatnyi időre csendben release buildben;
- csak buildmetadatahoz használja;
- nem keveri deployment start idővel.

### 25.4. CI példa

```bash
export SOURCE_DATE_EPOCH="$(
  git log -1 --pretty=%ct
)"

pnpm install --frozen-lockfile
pnpm build
```

A Git commit ideje önmagában nem garantál teljes reprodukálhatóságot; minden nondeterminisztikus inputot kontrollálni kell.

---

<a id="source-date-epoch-contract"></a>

## 26. `SOURCE_DATE_EPOCH` contract

### 26.1. Parser

```ts
export function parseSourceDateEpoch(
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(
      'SOURCE_DATE_EPOCH egész Unix timestamp legyen.',
    );
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      'SOURCE_DATE_EPOCH kívül esik a safe integer tartományon.',
    );
  }

  return parsed;
}
```

### 26.2. Policy

| Környezet | Hiányzó érték |
| --- | --- |
| lokális dev | warning vagy opcionális |
| PR build | opcionális, ha artifact nem release |
| release candidate | kötelező |
| production release | kötelező |
| runtime | nem szükséges, ha artifact már készült |

### 26.3. Tiltott input

- fractional timestamp;
- locale date string;
- timezone-os human-readable timestamp;
- `Date.now()` fallback release buildben;
- request headerből származó érték;
- user által megadott query paraméter.

---

<a id="build-id"></a>

## 27. Next.js build ID

A Next.js build ID az adott build azonosítására szolgál. Több containernek ugyanazt a buildet kell futtatnia ugyanazzal a build ID-val.

### 27.1. Példa

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  generateBuildId: async () => {
    const gitCommit = process.env.GIT_COMMIT?.trim();

    if (!gitCommit) {
      throw new Error(
        'Release buildhez GIT_COMMIT szükséges.',
      );
    }

    return gitCommit;
  },
};

export default nextConfig;
```

### 27.2. Követelmények

- Stabil ugyanahhoz az artifacthoz.
- Nem tartalmaz secretet.
- URL- és logbarát.
- Ne legyen random.
- Ne legyen process start timestamp.
- Ne változzon instance-onként.
- A CI biztosítsa ugyanazt az értéket minden replica számára.

### 27.3. Build ID és source commit

A Git SHA jó kiindulás, de ha ugyanabból a commitból eltérő build featurekkel artifact készülhet, a build ID tartalmazhat kontrollált config fingerprintet is.

---

<a id="deployment-id"></a>

## 28. Deployment ID és rolling deployment

A deployment ID egy konkrét rolloutot azonosít, és különbözhet a build ID-tól.

```text
build ID
  → artifact identitás

deployment ID
  → egy rollout vagy environmentbeli kiadás identitása
```

### 28.1. Next.js konfiguráció

```ts
const nextConfig: NextConfig = {
  deploymentId:
    process.env.DEPLOYMENT_ID,
};
```

Vagy a `NEXT_DEPLOYMENT_ID` buildkörnyezeti változó használható.

### 28.2. Követelmények

- Egy rollout minden instance-a ugyanazt az ID-t használja.
- Következő rollout új ID-t kap.
- Nem tartalmaz secretet vagy useradatot.
- Telemetry és log rekordban szerepelhet.
- Cache namespace és version skew kezelés használhatja.
- A load balancer nem keverheti tartósan inkompatibilis artifactokat.

### 28.3. Rolling deployment

Tesztelendő:

```text
régi kliens + új szerver
új kliens + régi szerver
Server Action verzióeltérés
static asset verzióeltérés
cache entry schema eltérés
```

A deployment ID segíthet a kliensnek hard navigationre váltani verzióeltérésnél, de nem old meg minden backend schema-kompatibilitási problémát.

---

<a id="kernel-container-class"></a>

## 29. `kernel.container_class`: composition graph identitás

A Symfony egyedi containerosztályt generálhat environment és debug szerint. Winzardban nincs generált runtime DI-container osztály.

A megfelelő fogalom:

```text
composition graph ID
composition graph hash
generated registry version
configuration fingerprint
```

### 29.1. Példa fingerprint

```ts
import { createHash } from 'node:crypto';

export function compositionFingerprint(
  canonicalGraph: string,
): string {
  return createHash('sha256')
    .update(canonicalGraph)
    .digest('hex');
}
```

### 29.2. Canonical graph

A hash stabil inputja:

```text
service/operation ID
port ID
adapter ID
package version
capability
lifetime
decorator order
config schema version
```

Nem kerül bele:

- abszolút build path;
- process ID;
- current timestamp;
- secret érték;
- random ID;
- unordered object serialization.

### 29.3. Felhasználás

- diagnosztika;
- graph drift;
- release evidence;
- cache namespace, indokolt esetben;
- multi-instance consistency check;
- generated composition registry ellenőrzése.

Nem használható biztonsági titokként.

---

<a id="composition-graph-drift"></a>

## 30. Composition graph drift

Ha ugyanazon deployment instance-ai eltérő wiringot használnak, nehezen reprodukálható hibák jelenhetnek meg.

### 30.1. Driftforrások

- eltérő package verzió;
- environmentfüggő, nem dokumentált branch;
- random provider selection;
- runtime filesystem scan;
- eltérő feature flag bootstrap;
- hiányzó recipe file;
- case-sensitive import különbség;
- containerenként más env.

### 30.2. Startup check

```ts
export type ExpectedDeploymentContract = Readonly<{
  deploymentId: string;
  compositionHash: string;
}>;

export function assertDeploymentContract(
  expected: ExpectedDeploymentContract,
  actual: ExpectedDeploymentContract,
): void {
  if (
    expected.deploymentId !== actual.deploymentId ||
    expected.compositionHash !== actual.compositionHash
  ) {
    throw new Error(
      'A deployment composition contract eltér.',
    );
  }
}
```

### 30.3. Observability

Metric:

```text
winzard_build_info{
  deployment_id="...",
  composition_hash="...",
  app="..."
} 1
```

A labelkészlet maradjon alacsony kardinalitású.

---

<a id="kernel-debug"></a>

## 31. `kernel.debug`: debug policy

A Symfony kernel bootkor explicit debug flaget kap. Winzardban a debugviselkedés több beállításra bomlik:

```text
NODE_ENV
LOG_LEVEL
DEBUG_NAMESPACES
production browser source maps
framework development indicators
verbose diagnostics
test-only assertions
```

### 31.1. Nem azonos a stage-dzsel

```text
NODE_ENV=production
APP_STAGE=staging
LOG_LEVEL=debug
```

technikailag lehetséges, bár security és cost review szükséges.

### 31.2. Kötelező szabályok

- Production response nem tartalmaz raw stack trace-et.
- Debug nem oldhatja fel az authorizációt.
- Debug nem logolhat secretet.
- Debug endpoint nem lehet publikus védelem nélkül.
- Debug flag nem kapcsolhat ki TLS-ellenőrzést.
- Debug nem módosíthat üzleti semanticsot.
- Production source map hozzáférése kontrollált.
- Dev overlay nem tekinthető production observabilitynek.

### 31.3. Külön debugkonfiguráció

```ts
export type DebugPolicy = Readonly<{
  verboseLogs: boolean;
  exposeSafeDiagnostics: boolean;
  includeDependencyTimings: boolean;
  browserSourceMaps: boolean;
}>;
```

A `exposeSafeDiagnostics` továbbra is csak redaktált adatot jelent.

---

<a id="debug-es-forrasterkep"></a>

## 32. Debug, source map és diagnosztikai adat

A source map növeli a hibakereshetőséget, de a forráskód és belső path kiszivárgását okozhatja.

### 32.1. Production browser source map

Csak akkor engedélyezhető, ha:

- a hosting nem szolgálja ki publikus hozzáféréssel, vagy;
- autholt error backend használja;
- release artifact policy kezeli;
- incident response hozzáférés auditált;
- buildidő és artifactméret elfogadható.

### 32.2. Server source map

Szerveroldali stack trace backendbe küldhető, de:

- query string redaktálandó;
- file path szükség szerint rövidítendő;
- secretet tartalmazó error message tiltott;
- source context ne kerüljön felhasználói response-ba.

### 32.3. Diagnostics endpoint

Példa biztonságos response:

```json
{
  "status": "ok",
  "application": "catalog-web",
  "deploymentId": "catalog-web-2026-07-19-1",
  "buildId": "abc1234",
  "runtimeMode": "web"
}
```

Nem tartalmaz:

```text
env dump
package path
secret length
database URL
proxy CIDR
full dependency graph
```

---

<a id="kernel-environment"></a>

## 33. `kernel.environment`: configuration environment

A Symfony `kernel.environment` a használt konfigurációs módot jelenti. Next.jsben ennek legközelebbi megfelelője a `NODE_ENV`, amelynek támogatott értékei:

```text
development
production
test
```

### 33.1. Kötelező különbségtétel

`NODE_ENV` nem használható ezek helyett:

```text
staging
preview
qa
sandbox
demo
eu-production
customer-a
```

Ezek deployment stage, region vagy tenant fogalmak.

### 33.2. Contract

```ts
export type ConfigurationEnvironment =
  | 'development'
  | 'production'
  | 'test';

export function getConfigurationEnvironment(
  value: string | undefined,
): ConfigurationEnvironment {
  if (
    value === 'development' ||
    value === 'production' ||
    value === 'test'
  ) {
    return value;
  }

  throw new Error(
    'Érvénytelen NODE_ENV.',
  );
}
```

### 33.3. Build és runtime

A production buildet `NODE_ENV=production` mellett kell előállítani. A staging deployment is production buildet futtat, nem `NODE_ENV=staging` értéket.

---

<a id="kernel-runtime-environment"></a>

## 34. `kernel.runtime_environment`: deployment stage

A Symfony megkülönbözteti a configuration environmentet és a runtime deployment környezetet. Winzardban:

```text
NODE_ENV
  → framework configuration mode

APP_STAGE
  → deployment üzemi helye
```

### 34.1. Javasolt stage

```ts
export const stages = [
  'local',
  'development',
  'preview',
  'staging',
  'production',
] as const;

export type ApplicationStage =
  (typeof stages)[number];
```

### 34.2. Mire használható?

- endpoint és external service kiválasztás;
- telemetry environment label;
- feature rollout guard;
- secret provider path;
- cookie domain policy;
- canonical origin selection;
- retention policy;
- destructive operation gate.

### 34.3. Mire nem használható?

- business tenantként;
- authorizáció helyett;
- arbitrary stringként;
- compile-time tree shaking implicit forrásaként;
- `NODE_ENV` helyettesítésére;
- user requestből felülírva.

### 34.4. Explicit config

```ts
export type RuntimeEnvironment = Readonly<{
  stage: ApplicationStage;
  region?: string;
  deploymentId: string;
}>;
```

A region külön mező, ne legyen az `APP_STAGE` stringbe rejtve.

---

<a id="environment-matrix"></a>

## 35. Environment- és stage-mátrix

| Szenárió | `NODE_ENV` | `APP_STAGE` | Build |
| --- | --- | --- | --- |
| Lokális dev | `development` | `local` | dev server |
| Unit teszt | `test` | `local` vagy `test`-fixture | nincs production build |
| Preview | `production` | `preview` | immutable production build |
| Staging | `production` | `staging` | production build |
| Production | `production` | `production` | signed/promoted artifact |
| CLI migration stagingben | `production` | `staging` | külön CLI entrypoint |
| Worker productionben | `production` | `production` | worker artifact/entrypoint |

### 35.1. Invariánsok

- `APP_STAGE=production` mellett debug bypass tiltott.
- `NODE_ENV=development` production stage-ben startup hiba.
- Preview nem kaphat production secretet.
- Staging adatbázis nem lehet production DB.
- Stage- és regionkombináció allowlistelt.
- Cookie és canonical origin stage alapján tesztelendő.

### 35.2. Cross-field schema

```ts
const runtimeEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum([
      'development',
      'production',
      'test',
    ]),
    APP_STAGE: z.enum(stages),
  })
  .superRefine((value, context) => {
    if (
      value.APP_STAGE === 'production' &&
      value.NODE_ENV !== 'production'
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Production stage csak production NODE_ENV mellett futtatható.',
      });
    }
  });
```

---

<a id="kernel-runtime-mode"></a>

## 36. `kernel.runtime_mode`: process-szerep

A Symfony runtime mode jelölheti, hogy a process web, CLI vagy worker módban fut. Winzardban ezt nem ajánlott egy query string envből implicit módon levezetni.

A támogatott modell:

```text
pnpm start
  → web entrypoint

pnpm forge ...
  → CLI entrypoint

node dist/worker.js
  → worker entrypoint
```

### 36.1. Típus

```ts
export type RuntimeMode =
  | 'web'
  | 'cli'
  | 'worker';

export type RuntimeModeContext = Readonly<{
  mode: RuntimeMode;
  longRunning: boolean;
}>;
```

### 36.2. Explicit factory

```ts
export function createRuntimeMode(
  mode: RuntimeMode,
): RuntimeModeContext {
  return Object.freeze({
    mode,
    longRunning:
      mode === 'web' ||
      mode === 'worker',
  });
}
```

A „long running” nem mindig jelent örökké futó processt; serverless instance újrahasznosítható, de bármikor megszűnhet.

---

<a id="runtime-mode-web"></a>

## 37. `kernel.runtime_mode.web`: web mód

Web módban:

- HTTP requestek érkeznek;
- Page, Route Handler és Server Action entrypointok aktívak;
- request context és proxy trust releváns;
- streaming és response commit számít;
- cookie- és cache-policy érvényes;
- process több egymást követő requestet kezelhet.

### 37.1. Web composition

```ts
export type WebApplication = Readonly<{
  modules: ApplicationModules;
  requestContextFactory: RequestContextFactory;
  responsePolicy: ResponsePolicy;
}>;

export function createWebApplication(
  config: WebRuntimeConfig,
): WebApplication {
  // explicit adapter construction
  return Object.freeze({
    modules: createApplicationModules(config),
    requestContextFactory:
      createRequestContextFactory(config),
    responsePolicy:
      createResponsePolicy(config),
  });
}
```

### 37.2. Tiltott

- request actor processsingletonban;
- request header startup configként;
- web-only API CLI modulban;
- cookie store workerben;
- request body globális bufferben.

---

<a id="runtime-mode-cli"></a>

## 38. `kernel.runtime_mode.cli`: CLI mód

CLI módban nincs HTTP Request, Host header, cookie vagy browser origin.

### 38.1. CLI context

```ts
export type CliContext = Readonly<{
  command: string;
  cwd: string;
  actor: SystemActor;
  interactive: boolean;
}>;
```

### 38.2. Követelmények

- Az actor explicit system/service actor.
- Destruktív parancshoz approval és confirmation policy.
- Exit code stabil contract.
- stdout gépi outputhoz, stderr hibához használható.
- Secret nem kerül command-line argumentumba, mert process listában látszhat.
- A CLI saját env-contractot validál.
- HTTP-only config nem kötelező, ha nincs rá szükség.
- Relative path explicit project roothoz képest oldódik fel.

### 38.3. Ugyanaz az application művelet

A CLI és a web adapter ugyanazt az application service-t használhatja:

```text
CLI command
  → application command

Route Handler
  → ugyanaz az application command
```

A request mapper és output mapper különbözik.

---

<a id="runtime-mode-worker"></a>

## 39. `kernel.runtime_mode.worker`: worker mód

Worker módban a process tartósan vagy ismételten üzeneteket/jobokat dolgozhat fel.

### 39.1. Worker contract

```ts
export type WorkerConfig = Readonly<{
  concurrency: number;
  visibilityTimeoutMs: number;
  shutdownGraceMs: number;
  pollIntervalMs: number;
}>;
```

### 39.2. Kötelező invariánsok

- concurrency pozitív és korlátozott;
- visibility timeout hosszabb a tipikus jobidőnél;
- idempotencia;
- retry policy;
- dead-letter;
- graceful shutdown;
- in-flight job lezárás vagy lease-visszaadás;
- request-local state nincs újrahasznosítva jobok között;
- per-job correlation context reset;
- connection pool méret összehangolt concurrencyvel.

### 39.3. Worker nem `after()`

Tartós üzleti side effect worker/queue/outbox feladata, nem Next.js `after()` callback.

### 39.4. Build

A worker lehet külön package vagy entrypoint. A Next.js web build nem feltétlenül tartalmazza automatikusan a workerfájlt.

---

<a id="runtime-mode-feloldas"></a>

## 40. Runtime mode feloldása és tiltott heurisztikák

### 40.1. Használandó

- explicit executable;
- explicit factory argumentum;
- külön npm/pnpm script;
- külön deployment workload;
- külön process command.

### 40.2. Nem használandó

```ts
const mode =
  process.stdout.isTTY
    ? 'cli'
    : 'worker';
```

```ts
const mode =
  Boolean(process.env.PORT)
    ? 'web'
    : 'worker';
```

```ts
const mode =
  process.argv.includes('--worker')
    ? 'worker'
    : 'web';
```

ha nincs validált, dokumentált CLI-contract.

### 40.3. Több szerep egy processben

Nem ajánlott ugyanabban a processben webservert és queue workert futtatni, mert:

- scaling igényük eltér;
- failure domain összekapcsolódik;
- graceful shutdown bonyolult;
- resource quota versenyez;
- deployment és health contract összemosódik.

Kivétel csak dokumentált hostingkorlát mellett.

---

<a id="kernel-default-locale"></a>

## 41. `kernel.default_locale`: alapértelmezett locale

A Winzardban a default locale az i18n capability tulajdona.

```ts
export const supportedLocales = [
  'hu',
  'en',
] as const;

export type Locale =
  (typeof supportedLocales)[number];

export const DEFAULT_LOCALE: Locale =
  'hu';
```

### 41.1. Default használata

- hiányzó locale route átirányítása;
- dictionary fallback;
- dátum- és számformázás;
- email default nyelve;
- system actor által generált tartalom.

### 41.2. Nem használható

- hibás locale csendes elfedésére mindenhol;
- user preference felülírására;
- tenant policy ignorálására;
- unsupported locale tartalom kiszolgálására;
- authorizációs döntéshez.

### 41.3. Explicit context

Az application művelet csak akkor kap locale-t, ha üzleti jelentősége van. A presentation layer formázási locale-ja gyakran nem domain input.

---

<a id="kernel-enabled-locales"></a>

## 42. `kernel.enabled_locales`: támogatott locale-ok

A supported locale-lista:

- legyen zárt;
- legyen típusosan reprezentált;
- legyen route-validációval összhangban;
- legyen dictionarykkel szinkronban;
- legyen SEO metadata és sitemap által ismert;
- ne származzon közvetlenül user inputból.

### 42.1. Validator

```ts
export function isLocale(
  value: string,
): value is Locale {
  return (
    supportedLocales as readonly string[]
  ).includes(value);
}
```

### 42.2. Route

```tsx
import { notFound } from 'next/navigation';

export default async function LocaleLayout(
  props: LayoutProps<'/[locale]'>,
) {
  const { locale } = await props.params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale}>
      <body>{props.children}</body>
    </html>
  );
}
```

### 42.3. Static params

```ts
export function generateStaticParams() {
  return supportedLocales.map(
    (locale) => ({ locale }),
  );
}
```

### 42.4. Drift

CI-ben ellenőrizhető:

```text
enabled locale
↔ dictionary
↔ route generation
↔ hreflang
↔ default locale
```

---

<a id="locale-feloldasi-prioritas"></a>

## 43. Locale-feloldási prioritás

A locale több forrásból érkezhet:

```text
1. explicit URL szegmens
2. user profil preferencia
3. tenant default
4. locale cookie
5. Accept-Language
6. application default
```

A pontos sorrend projektcontract.

### 43.1. Biztonság és cache

- A locale allowlistelt.
- `Accept-Language` bizalmatlan input.
- Locale szerint változó response megfelelő `Vary` vagy URL-stratégiát igényel.
- Publikus cache-nél az URL-ben lévő locale egyértelműbb.
- Cookie-alapú locale személyre szabott cache-t eredményezhet.
- Locale nem tartalmazhat path traversalt.
- Domain-alapú locale csak trusted host után oldható fel.

### 43.2. Canonical URL

Egy tartalomhoz egy canonical locale URL legyen. Automatikus redirect ne hozzon loopot Proxy és route logic között.

---

<a id="kernel-error-controller"></a>

## 44. `kernel.error_controller`: error felületek

A Symfony egy error controllert konfigurálhat. Winzard/Next.js alatt több külön error surface van:

```text
error.tsx
global-error.tsx
not-found.tsx
forbidden/unauthorized felület, ha támogatott
Route Handler problem mapper
Server Action action state
instrumentation onRequestError
reverse proxy 5xx oldal
platform timeout response
```

### 44.1. Nincs egyetlen error controller

A hibatípus és entrypoint alapján más output szükséges:

| Helyzet | Felület |
| --- | --- |
| Page render váratlan hiba | `error.tsx` |
| Root layout hiba | `global-error.tsx` |
| Nem található erőforrás | `notFound()` + `not-found.tsx` |
| API expected hiba | explicit Problem Details |
| API váratlan hiba | generic 500 + error reporting |
| Server Action validation | action state |
| Proxy hiba | minimális redirect/response + telemetry |
| Hosting timeout | platform response |

### 44.2. Error mapping

```ts
export interface HttpProblemMapper {
  map(
    error: unknown,
    context: ErrorContext,
  ): HttpProblem;
}
```

A mapper:

- stabil publikus code-ot ad;
- redaktál;
- request ID-t hozzáadhat;
- nem teszi közzé a belső stack-et;
- expected application resultot nem exceptionként kezeli.

---

<a id="error-lifecycle-es-observability"></a>

## 45. Error lifecycle és observability

### 45.1. Expected hiba

Példák:

```text
validation failed
not found
conflict
forbidden
rate limited
precondition failed
```

Ezek stabil result union vagy explicit error type formájában kezelhetők.

### 45.2. Váratlan hiba

Példák:

```text
programhiba
dependency outage
invariant violation
serialization failure
render error
```

Ezeket:

- reportolni kell;
- redaktált response-ra kell képezni;
- correlation ID-val kell ellátni;
- nem szabad csendben 200-as válaszba csomagolni.

### 45.3. `instrumentation.ts`

```ts
import type { Instrumentation } from 'next';

export const onRequestError:
  Instrumentation.onRequestError =
  async (error, request, context) => {
    await reportServerError({
      error,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
    });
  };
```

A reporternek a headereket redaktálnia kell.

### 45.4. Error budget

A stage és deployment ID alapján mérhető:

```text
error rate
timeout rate
dependency failure rate
render error rate
Server Action error rate
```

A debug flag nem változtathatja meg a metric definícióját.

---

<a id="kernel-http-method-override"></a>

## 46. `kernel.http_method_override`: HTTP method override

A Symfony támogatja a HTTP-method override konfigurációját. Modern Winzard Route Handlerek explicit HTTP-metódus exportokat használnak:

```ts
export async function PATCH(
  request: Request,
): Promise<Response> {
  // ...
}
```

Alapértelmezett Winzard policy:

> **A HTTP method override tiltott. A tényleges request method az autoritatív.**

### 46.1. Miért?

- proxy és WAF method policy összezavarható;
- CSRF védelem megkerülhető;
- log és audit eltérhet;
- cache semantics hibás lehet;
- route handler selection nem feltétlenül követi az override-ot;
- signature verification eltérhet;
- request replay és idempotencia nehezebben érthető.

### 46.2. Legacy kivétel

Régi HTML form vagy kliens miatt külön adapter készíthető:

```text
POST /legacy/resource
X-HTTP-Method-Override: DELETE
```

De csak:

- explicit route-on;
- explicit capabilityvel;
- allowlistelt célmetódussal;
- CSRF védelemmel;
- auditloggal;
- proxy/WAF egyeztetéssel;
- rövid deprecation időszakkal.

---

<a id="allowed-http-method-override"></a>

## 47. `kernel.allowed_http_method_override`: engedélyezett override-ok

Ha legacy override mégis szükséges, a lista szűk legyen:

```ts
const allowedOverrides = [
  'PUT',
  'PATCH',
  'DELETE',
] as const;

type AllowedOverride =
  (typeof allowedOverrides)[number];
```

### 47.1. Kötelező szabályok

- Csak eredeti `POST` request esetén.
- `GET`, `HEAD`, `OPTIONS`, `CONNECT`, `TRACE` nem célozható.
- Header és body override egyszerre nem engedélyezett.
- Több override header hiba.
- A célmetódus pontos uppercase enum.
- A signature és idempotency fingerprint a tényleges, feloldott semanticsot rögzíti.
- A log tartalmazza az eredeti és feloldott metódust.
- A response `Vary` és cache policy ne legyen félreérthető.
- Proxyban és alkalmazásban ne történjen kétszeres override.

### 47.2. Adapter

```ts
export function resolveLegacyMethod(
  request: Request,
): AllowedOverride | 'POST' {
  if (request.method !== 'POST') {
    return 'POST';
  }

  const override = request.headers.get(
    'x-http-method-override',
  );

  if (!override) {
    return 'POST';
  }

  const normalized = override.toUpperCase();

  if (
    !allowedOverrides.includes(
      normalized as AllowedOverride,
    )
  ) {
    throw new Error(
      'Nem engedélyezett HTTP method override.',
    );
  }

  return normalized as AllowedOverride;
}
```

Ez nem változtatja meg automatikusan a Next.js route handler dispatchét; külön legacy endpointnak kell az application commandot kiválasztania.

---

<a id="method-override-security"></a>

## 48. Method override security és migráció

### 48.1. Threat model

Támadó megpróbálhat:

- GET-nek látszó delete-et küldeni;
- WAF által tiltott metódust POSTba rejteni;
- CSRF-védelmet metódusfüggően megkerülni;
- auditot félrevezetni;
- cache-t poisonolni;
- signature canonical stringet megváltoztatni.

### 48.2. Migráció

```text
1. usage telemetry
2. konkrét legacy route azonosítása
3. adapter és warning
4. kliensfrissítés
5. override letiltása
6. adapter eltávolítása
```

### 48.3. Acceptance

Az override capability csak akkor elfogadható, ha:

- minden használó ismert;
- removal date dokumentált;
- security review készült;
- negatív tesztek vannak;
- a default továbbra is disabled.

---

<a id="kernel-secret"></a>

## 49. `kernel.secret`: nincs globális alkalmazássecret

A Symfony `kernel.secret` több frameworkfunkció közös secretje lehet. Winzardban egyetlen globális `APP_SECRET` alapértelmezetten nem támogatott.

Helyette capability-specifikus kulcsok:

```text
AUTH_SECRET
SESSION_SIGNING_KEY
CSRF_SIGNING_KEY
SIGNED_URL_KEY
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
WEBHOOK_PROVIDER_SECRET
DATA_ENCRYPTION_KEY
```

### 49.1. Miért külön?

- eltérő rotation;
- eltérő audience;
- eltérő algoritmus;
- eltérő hozzáférési scope;
- compromise blast radius csökkentése;
- eltérő retention és audit;
- eltérő instance consistency.

### 49.2. Injektálás

```ts
export type SignedUrlConfig = Readonly<{
  activeKeyId: string;
  keys: ReadonlyMap<string, Uint8Array>;
  maximumTtlSeconds: number;
}>;
```

Az application layer csak `SignedUrlService` portot kap, raw kulcsot nem.

### 49.3. Tiltott

```text
NEXT_PUBLIC_APP_SECRET
secret a next.config env mezőben
secret README-ben
secret generated docsban
secret query stringben
secret logban
secret build ID-ban
```

---

<a id="secret-rotation"></a>

## 50. Secret rotation és többpéldányos működés

### 50.1. Dual-key read

Rotation alatt:

```text
write/sign
  → új aktív kulccsal

read/verify
  → új és előző kulccsal
```

### 50.2. Key ID

A token vagy envelope tartalmazhat publikus key ID-t, de nem a kulcsot.

### 50.3. Több instance

Ugyanazon deployment minden instance-ának kompatibilis kulcskészletet kell látnia. Eltérés esetén:

- Server Action dekódolás;
- session verification;
- signed URL;
- CSRF;
- encrypted payload

instabil lehet.

### 50.4. Startup check

Ellenőrizhető:

- aktív key ID létezik;
- key length megfelelő;
- duplicate ID nincs;
- deprecated key removal ideje nem járt le;
- productionben placeholder nincs;
- file permission megfelelő;
- provider elérhető.

### 50.5. Rotation evidence

- régi token még ellenőrizhető a grace windowban;
- új token új kulccsal készül;
- grace után régi token elutasított;
- log nem tartalmaz kulcsanyagot;
- instance matrix egységes.

---

<a id="kernel-trusted-headers"></a>

## 51. `kernel.trusted_headers`: megbízható forwardolt headerek

Forwardolt headerek például:

```text
Forwarded
X-Forwarded-For
X-Forwarded-Host
X-Forwarded-Proto
X-Forwarded-Port
X-Forwarded-Prefix
```

Ezeket csak trusted proxy boundary után szabad megbízhatónak tekinteni.

### 51.1. Alapértelmezés

Közvetlen internetes kliens által küldött `X-Forwarded-*` érték bizalmatlan.

### 51.2. Header allowlist

```ts
export type TrustedForwardedHeaders =
  Readonly<{
    forwardedFor: boolean;
    forwardedHost: boolean;
    forwardedProto: boolean;
    forwardedPort: boolean;
    forwardedPrefix: boolean;
  }>;
```

Nem minden platform ugyanazt a headert írja felül vagy tisztítja.

### 51.3. Kötelező infrastruktúra-contract

Dokumentálni kell:

- mely proxy állítja be;
- a kliens által küldött azonos nevű headert törli-e;
- hány hop van;
- milyen formátumot használ;
- IPv6 és port formátumot;
- proxy failover viselkedést;
- local dev különbséget.

### 51.4. Használat

Trusted feloldás után származtatható:

- canonical scheme;
- client IP, korlátozott célra;
- canonical host;
- origin;
- secure cookie decision.

Authorizáció kizárólag IP alapján nem ajánlott.

---

<a id="kernel-trusted-proxies"></a>

## 52. `kernel.trusted_proxies`: proxy trust boundary

A proxylista vagy hop count meghatározza, mely köztes komponensek headereiben bízunk.

### 52.1. Lehetséges modellek

```text
explicit CIDR allowlist
provider-managed trusted network
fixed proxy hop count
mutual TLS gateway identity
signed internal header
```

### 52.2. Kockázatok

- túl széles `0.0.0.0/0`;
- private network automatikus trust;
- változó hop count;
- CDN és load balancer kettős header;
- IPv4-mapped IPv6;
- direct-to-origin elérés;
- internal header spoof;
- proxy chain reorder.

### 52.3. Origin védelme

Ha a publikus proxy mögötti origin közvetlenül elérhető, a támadó megkerülheti a header sanitizationt. Az origin:

- hálózatilag legyen korlátozott;
- csak proxy security grouptól fogadjon;
- mTLS vagy belső auth használható;
- direct access smoke testtel ellenőrizhető.

### 52.4. Application adapter

A raw requestből a trusted proxy adapter készít normalizált contextet. Az application layer nem olvas `X-Forwarded-*` headert.

---

<a id="kernel-trusted-hosts"></a>

## 53. `kernel.trusted_hosts`: host allowlist

A Host header bizalmatlan input, még akkor is, ha a framework route-ol vele.

### 53.1. Host allowlist

```ts
export type HostPolicy = Readonly<{
  canonicalHosts: readonly string[];
  tenantDomains: readonly string[];
  allowPreviewDomains: boolean;
}>;
```

### 53.2. Normalizáció

- lowercase;
- trailing dot kezelése;
- port leválasztása szabályosan;
- IDN/punycode policy;
- bracketelt IPv6;
- whitespace és vezérlőkarakter tiltása;
- duplicate Host header elutasítása;
- maximum length.

### 53.3. Használat

Trusted hostból képezhető:

- canonical origin;
- absolute redirect;
- email link origin, ha explicit policy engedi;
- tenant domain resolution;
- cookie domain döntés.

### 53.4. Nem használható

Raw Host közvetlenül:

```ts
const resetUrl =
  `https://${request.headers.get('host')}/reset`;
```

Ez host header injectiont okozhat.

### 53.5. Tenant domain

Custom domain csak ellenőrzött ownership után aktiválható. Domain → tenant lookupnak tenant isolationt és cache namespace-t kell alkalmaznia.

---

<a id="canonical-origin"></a>

## 54. Canonical origin és abszolút URL

Az abszolút URL-generálás ne épüljön automatikusan a bejövő Host headerre.

### 54.1. Origin resolver

```ts
export interface ApplicationOriginResolver {
  publicOrigin(): URL;

  tenantOrigin(
    tenantId: TenantId,
  ): Promise<URL>;
}
```

### 54.2. Források

- stage-specifikus `APP_URL`;
- ellenőrzött tenant domain registry;
- provider deployment URL preview esetén;
- explicit canonical host mapping.

### 54.3. Követelmények

- csak `https`, kivéve local dev;
- username/password nélküli URL;
- path prefix explicit;
- trailing slash canonical;
- port allowlist;
- no fragment;
- host allowlist;
- tenant ownership verification.

### 54.4. Reverse proxy

A `X-Forwarded-Proto` csak trusted proxy után befolyásolhatja, hogy a request eredetileg HTTPS volt-e. Canonical originhez továbbra is explicit config ajánlott.

---

<a id="server-actions-allowed-origins"></a>

## 55. Server Actions és engedélyezett originök

Next.js a Server Action request Origin és Host egyezését ellenőrzi a CSRF-kockázat csökkentésére. Extra biztonságos originök explicit konfigurálhatók.

```ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'app.example.com',
        '*.preview.example.com',
      ],
    },
  },
};
```

### 55.1. Winzard-szabályok

- Csak ténylegesen szükséges origin kerüljön a listába.
- Wildcard legyen szűk.
- Preview domain ne kapjon production secretet.
- Az originlista ne származzon user inputból.
- A lista build- vagy deploymentconfig része.
- Reverse proxy host rewrite-ját dokumentálni kell.
- Ez nem helyettesíti az actionön belüli authot és authorizációt.
- Cookie-auth mutationnél további CSRF-policy szükséges lehet.
- CORS és Server Action allowed origin külön contract.

### 55.2. Drift

CI-ben ellenőrizhető:

```text
canonical hosts
↔ proxy hosts
↔ Server Action allowed origins
↔ cookie domain
↔ OAuth callback origins
```

A listák nem feltétlenül azonosak, de eltérésük dokumentált.

---

<a id="kernel-trust-x-sendfile"></a>

## 56. `kernel.trust_x_sendfile_type_header`: fájlkiszolgálás offload

A Symfony képes megbízni egy speciális headerben, amely alapján X-Sendfile típusú fájlkiszolgálás történhet. Winzardban nincs globális automatikus trust.

A támogatott minta:

```text
authorization
→ szerver által feloldott belső storage key
→ explicit offload adapter
→ X-Accel-Redirect vagy X-Sendfile response header
→ trusted reverse proxy
```

### 56.1. Alapszabály

> Bejövő kliensheader soha nem mondhatja meg, mely belső fájlt szolgálja ki a proxy.

### 56.2. Adapter

```ts
export interface InternalFileOffload {
  responseFor(
    file: AuthorizedFileReference,
  ): Response;
}
```

### 56.3. Nginx példa

Az alkalmazás csak belső URI-t ad:

```ts
return new Response(null, {
  status: 200,
  headers: {
    'X-Accel-Redirect':
      '/internal-downloads/abc123',
    'Content-Type':
      'application/octet-stream',
    'Content-Disposition':
      'attachment; filename="report.pdf"',
  },
});
```

Az internal location közvetlenül kívülről ne legyen elérhető.

### 56.4. Security

- nincs raw filesystem path headerben;
- nincs user inputból path;
- filename külön sanitizált;
- authorization előbb lefut;
- auditlog;
- range és cache policy;
- content type explicit;
- symlink/traversal védelem;
- proxy header stripping;
- object storage signed redirect alternatíva.

---

<a id="trusted-proxy-deployment"></a>

## 57. Reverse proxy deployment baseline

Self-hostingnál reverse proxy használata ajánlott a Next.js server előtt.

### 57.1. Proxy feladata

- malformed request elutasítása;
- connection és body limit;
- TLS termination;
- slow client védelem;
- rate limit, ha megfelelő;
- header sanitization;
- canonical Host;
- streaming buffering konfiguráció;
- static asset/CDN integráció;
- origin access korlátozás.

### 57.2. Application feladata

- műveletspecifikus validáció;
- auth és authorizáció;
- tenant isolation;
- business rate limit;
- idempotencia;
- response cache policy;
- trusted header adapter;
- error mapping.

### 57.3. Streaming

Proxy buffering kikapcsolása szükséges lehet RSC/Suspense/SSE streaminghez. A teljes infrastruktúraláncot tesztelni kell, nem csak local `next start`-ot.

### 57.4. Health

```text
/api/health/live
  → process él

/api/health/ready
  → csak telepített dependency-k readiness-e
```

Readiness endpoint ne bízzon forwardolt hostban vagy user identityben.

---

<a id="komplett-kernel-config-tipus"></a>

## 58. Komplett kernelkonfigurációs típus

A következő aggregált típus diagnosztikai és composition boundary célra használható. Nem exportálandó minden modulnak.

```ts
export type KernelConfiguration =
  Readonly<{
    identity: Readonly<{
      application: string;
      buildId: string;
      deploymentId: string;
      compositionHash?: string;
    }>;

    paths: ProjectPaths;

    environment: Readonly<{
      configuration:
        ConfigurationEnvironment;
      stage: ApplicationStage;
      region?: string;
      mode: RuntimeMode;
    }>;

    locales: Readonly<{
      defaultLocale: Locale;
      enabledLocales:
        readonly Locale[];
    }>;

    debug: DebugPolicy;

    proxy: Readonly<{
      trustedProxyMode:
        'none' | 'cidr' | 'fixed-hops';
      trustedHosts:
        readonly string[];
      forwardedHeaders:
        TrustedForwardedHeaders;
    }>;
  }>;
```

### 58.1. Szétosztás

A composition root ebből szűk configokat készít:

```text
KernelConfiguration
  → MailerConfig
  → DatabaseConfig
  → CacheNamespaceConfig
  → HostPolicy
  → LocaleConfig
```

Az application service nem kapja meg a teljes objektumot.

### 58.2. Immutable

- `Readonly`;
- `Object.freeze`, ahol indokolt;
- nincs runtime mutation;
- config update restart/deployment útján történik;
- request context külön objektum.

---

<a id="zod-kernel-schema"></a>

## 59. Típusos kernelkonfiguráció Zoddal

```ts
import { z } from 'zod';

const kernelEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum([
      'development',
      'production',
      'test',
    ]),

    APP_STAGE: z.enum([
      'local',
      'development',
      'preview',
      'staging',
      'production',
    ]),

    APP_NAME: z
      .string()
      .trim()
      .min(1),

    APP_URL: z.url(),

    DEPLOYMENT_ID: z
      .string()
      .trim()
      .min(1),

    GIT_COMMIT: z
      .string()
      .regex(
        /^[0-9a-f]{7,64}$/u,
      ),

    DEFAULT_LOCALE: z.enum([
      'hu',
      'en',
    ]),

    ENABLED_LOCALES: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),

    LOG_LEVEL: z.enum([
      'debug',
      'info',
      'warn',
      'error',
    ]),
  })
  .superRefine((value, context) => {
    if (
      value.APP_STAGE === 'production' &&
      value.NODE_ENV !== 'production'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NODE_ENV'],
        message:
          'Production stage production NODE_ENV-et igényel.',
      });
    }

    if (
      !value.ENABLED_LOCALES.includes(
        value.DEFAULT_LOCALE,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DEFAULT_LOCALE'],
        message:
          'A default locale szerepeljen az enabled listában.',
      });
    }
  });
```

### 59.1. Output

A parser ne adja tovább a raw envet. Explicit output object készüljön.

### 59.2. Secret

A secret sémák külön capabilitymodulban maradnak.

---

<a id="next-config-pelda"></a>

## 60. Teljes `next.config.ts` példa

```ts
import type { NextConfig } from 'next';

function requiredBuildValue(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Hiányzó buildérték: ${name}`,
    );
  }

  return value;
}

const deploymentId =
  requiredBuildValue('DEPLOYMENT_ID');

const nextConfig: NextConfig = {
  distDir: '.next',
  output: 'standalone',
  typedRoutes: true,
  poweredByHeader: false,

  deploymentId,

  generateBuildId: async () =>
    requiredBuildValue('GIT_COMMIT'),

  experimental: {
    serverActions: {
      allowedOrigins: [
        'app.example.com',
      ],
      bodySizeLimit: '1mb',
    },
  },

  cacheHandlers: {
    remote: require.resolve(
      './src/platform/cache/next-remote-cache-handler.js',
    ),
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 60.1. Megjegyzések

- A példa nem univerzális copy-paste.
- `cacheHandlers` csak telepített cache capability mellett.
- `allowedOrigins` stage szerint factoryból is készülhet.
- A buildérték hiánya release buildben fail-fast.
- Secret nem kerül a config outputba.
- `distDir` projektgyökéren belül marad.
- A security headerek teljes policyja külön dokumentum.

---

<a id="startup-validacio"></a>

## 61. Startup-validáció `instrumentation.ts` segítségével

A Next.js `instrumentation.ts` `register()` hookja új szerverinstance indulásakor, requestek fogadása előtt fut.

```ts
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !==
    'nodejs'
  ) {
    return;
  }

  const {
    validateKernelConfiguration,
  } = await import(
    './src/platform/kernel-config/validate-kernel-config.server'
  );

  await validateKernelConfiguration();
}
```

### 61.1. Validálható

- process-start env;
- app/stage invariant;
- default locale;
- deployment ID;
- composition fingerprint;
- secret provider elérhetőség;
- cache handler config;
- proxy trust schema;
- kötelező directory permission;
- read-only filesystem expectation;
- package/capability manifest.

### 61.2. Nem végezhető

- database migration;
- business mutation;
- emailküldés;
- outbox replay;
- useradat prefetch;
- hosszú, bizonytalan külső workflow;
- destructive cleanup.

### 61.3. Timeout

A startup dependency checknek rövid, explicit timeoutja legyen. Readiness és startup check szerepét ne keverjük.

---

<a id="read-only-es-ephemeral-filesystem"></a>

## 62. Read-only és ephemeral filesystem

### 62.1. Read-only root

Productionban ajánlott:

```text
application artifact
  → read-only

/tmp
  → korlátozott, ephemeral

durable state
  → external service
```

### 62.2. Írható szükségletek leltára

| Írás | Cél |
| --- | --- |
| Next/runtime cache | custom handler vagy engedélyezett disk |
| Temp upload | korlátozott temp directory |
| Log | stdout |
| Session | external store vagy signed cookie |
| User upload | object storage |
| Generated docs | build/development, nem request |
| Migration | külön CLI process |

### 62.3. Temp directory

- random, nem user path;
- permission;
- size limit;
- cleanup;
- noexec, ha lehetséges;
- sensitive file encryption, ha szükséges;
- process crash utáni retention;
- symlink védelem.

### 62.4. Serverless

Ephemeral disk új invocationnél eltűnhet és instance-ok között nem megosztott. Semmilyen durable business contract nem épülhet rá.

---

<a id="node-edge-es-static-runtime"></a>

## 63. Node, Edge/Proxy és static runtime

Kernelkonfiguráció runtime-kompatibilitása eltér.

### 63.1. Node runtime

Elérhető lehet:

- `process.env`;
- Node crypto;
- filesystem;
- TCP adatbázisdriver;
- hosszabb connection pool;
- `AsyncLocalStorage`.

### 63.2. Edge/Proxy

Korlátozott API-készlet, providerfüggő env és network semantics.

Proxyban ne használd:

- teljes database clientet;
- nagy dependency graphot;
- filesystem secret mountot;
- Node-only package-et;
- hosszú blokkot;
- komplex business authorizációt.

### 63.3. Static export

Nincs szerverruntime:

- nincs request-time secret;
- nincs Proxy;
- nincs Route Handler;
- nincs server session;
- nincs dynamic tenant host mapping.

A build-time publikus config artifactba kerül.

### 63.4. Contract metadata

Minden adapter deklarálhatja:

```ts
export type RuntimeSupport =
  | 'node'
  | 'edge'
  | 'static';
```

A Forge később ellenőrizheti az importgráfot.

---

<a id="fejlesztesi-es-teszt-kornyezet"></a>

## 64. Fejlesztési és tesztkörnyezet

### 64.1. Development

- `NODE_ENV=development`;
- app stage `local` vagy `development`;
- részletes, redaktált log;
- isolated dev build;
- local origin allowlist;
- fake vagy local dependency;
- gyors startup check;
- hot reload kompatibilis singleton kezelés.

### 64.2. Test

- determinisztikus env fixture;
- nincs developer `.env.local` függés;
- fix clock és ID generator, ahol kell;
- ephemeral temp;
- in-memory fake;
- explicit runtime mode;
- fixed build/deployment ID;
- secret placeholder csak test namespace-ben.

### 64.3. Test isolation

Minden teszt után resetelendő:

```text
process.env módosítás
module cache, ha szükséges
fake registry
temp directory
AsyncLocalStorage context
global fetch mock
timer
```

### 64.4. Negatív fixture

- hiányzó stage;
- hibás locale;
- repositoryn kívüli path;
- inconsistent deployment ID;
- invalid proxy CIDR;
- production placeholder secret;
- forbidden method override;
- writable-root feltételezés.

---

<a id="production-es-rolling-deployment"></a>

## 65. Production és rolling deployment

### 65.1. Build once

Ajánlott:

```text
source + lockfile
→ CI build
→ signed/hashed artifact
→ ugyanaz az artifact staging/production promotionnel
```

Ha buildtime `NEXT_PUBLIC_*` stage-specifikus, a build nem teljesen promotálható. Ezt dokumentálni kell.

### 65.2. Instance consistency

Minden instance ugyanazon rolloutban:

- ugyanaz a build ID;
- ugyanaz a deployment ID;
- kompatibilis secret set;
- kompatibilis composition graph;
- azonos capability manifest;
- kompatibilis cache schema;
- azonos locale-lista;
- azonos host/proxy policy.

### 65.3. Version skew

Backward compatibility szükséges:

- API response;
- Server Action;
- cache entry;
- queue message;
- database schema;
- session;
- signed token.

### 65.4. Rollback

A rollbackterv rögzíti:

- visszatehető artifact;
- adatbázis-kompatibilitás;
- cache namespace;
- secret grace period;
- deployment ID;
- worker version;
- migration irreverzibilitás.

---

<a id="kernelkonfiguracios-diagnosztika"></a>

## 66. Kernelkonfigurációs diagnosztika

### 66.1. Jelenleg használható parancsok

```bash
pnpm forge about --project .
pnpm forge env:check --project .
pnpm forge check --project .
pnpm forge doctor --project .
pnpm next info
pnpm next typegen
pnpm next build
```

A jelenlegi `env:check` capability-specifikus adatbázis- és authkövetelményeket ellenőrizhet, de nem teljes kernelkonfigurációs inventory.

### 66.2. Implementált parancsok

```bash
pnpm forge kernel-config:list
pnpm forge kernel-config:inspect project-root
pnpm forge kernel-config:check
pnpm forge kernel-config:diff staging production
pnpm forge kernel-config:fingerprint
pnpm forge runtime:mode
pnpm forge runtime:check
pnpm forge proxy:trust
pnpm forge locale:check
pnpm forge build:reproducibility
```

### 66.3. Safe output

```text
APP_STAGE                  production
DEPLOYMENT_ID              catalog-2026-07-19-1
DEFAULT_LOCALE             hu
ENABLED_LOCALES            hu,en,de
TRUSTED_PROXY_MODE         fixed-hops
AUTH_SECRET                present [redacted]
DATABASE_URL               present [redacted]
```

Nem jelenik meg érték, length vagy hash, ha az is érzékeny lehet.

### 66.4. Exit code

```text
0  success
1  contract violation
2  invalid CLI usage
3  unsupported runtime/platform
```

A parancsok stabil, machine-readable JSON outputot is adnak.

---

<a id="kernelkonfiguracios-teszteles"></a>

## 67. Kernelkonfigurációs tesztelés

### 67.1. Unit teszt

- path resolver;
- environment/stage schema;
- locale schema;
- build ID factory;
- deployment ID parser;
- host normalizer;
- forwarded header parser;
- method override resolver;
- cache namespace;
- secret metadata validator.

### 67.2. Integration teszt

- Next config betöltése;
- `instrumentation.register`;
- read-only filesystem;
- custom cache handler;
- multi-instance invalidation;
- reverse proxy header chain;
- X-Accel-Redirect;
- Server Action origin;
- locale redirect;
- error instrumentation.

### 67.3. Production smoke

```text
artifact indul
liveness ok
readiness capability szerint
build/deployment ID helyes
host spoof elutasított
forwarded proto csak proxyból hat
debug response redaktált
cache instance matrix konzisztens
streaming proxy mögött működik
```

### 67.4. Property-based vagy fuzz teszt

Hasznos:

- Host parser;
- forwarded header list;
- path resolver;
- locale parser;
- method override;
- Unicode encoding boundary.

---

<a id="ci-es-reprodukalthatosag"></a>

## 68. CI és reprodukálhatóság

Javasolt pipeline:

```text
checkout teljes szükséges historyval
toolchain pin
frozen dependency install
manifest check
kernel config schema unit tests
secret scan
SOURCE_DATE_EPOCH set
Next typegen
TypeScript
lint
unit tests
Forge checks
production build
artifact manifest
rebuild comparison, ha release
container read-only smoke
runtime smoke
proxy/security smoke
```

### 68.1. Rebuild comparison

Szigorú reproducibility esetén:

```text
build A hash
build B hash
→ egyezés
```

A két build azonos, explicit `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` értéket használ. A kulcs release/deployment secret; a CI kizárólag izolált, nem deployolható tesztkulcsot képezhet determinisztikusan. A canonical comparator:

- kihagyja a Next.js buildidő-mérési `trace` és `trace-build` fájlokat;
- a `prerender-manifest.json` véletlenszerű Draft Mode preview-secret mezőit redaktált placeholderre normalizálja;
- minden más fájlt relatív path, canonical byte length és SHA-256 szerint hasonlít össze.

Ezek a normalizálások dokumentált Next.js build-volatilitások; route-, chunk-, server-reference-, asset- vagy alkalmazáskód-eltérés továbbra is hibának számít.

Eltérésnél vizsgálni kell:

- timestamp;
- absolute path;
- random ID;
- package manager metadata;
- network result;
- locale/timezone;
- filesystem order;
- source map path;
- build cache contamination.

### 68.2. Release evidence

```json
{
  "gitCommit": "abc1234",
  "sourceDateEpoch": 1784419200,
  "buildId": "abc1234",
  "deploymentId": "catalog-2026-07-19-1",
  "artifactSha256": "..."
}
```

### 68.3. Secret

A CI artifact manifest és cache key nem tartalmaz secretet.

---

<a id="biztonsagi-fenyegetesi-modell"></a>

## 69. Biztonsági fenyegetési modell

### 69.1. Fő fenyegetések

- host header injection;
- `X-Forwarded-*` spoof;
- direct-to-origin bypass;
- open redirect;
- secret leak;
- debug stack exposure;
- path traversal;
- symlink escape;
- cache poisoning;
- cross-tenant cache leak;
- method override bypass;
- X-Sendfile arbitrary file read;
- stage confusion;
- preview production credential;
- composition drift;
- rolling deployment version skew;
- log injection;
- Unicode confusable;
- process-global request state.

### 69.2. Kötelező kontrollok

```text
explicit schema
least privilege
capability ownership
trusted proxy boundary
host allowlist
secret isolation
redacted diagnostics
immutable artifact
deployment identity
cache namespace
request isolation
negative tests
CI gate
```

### 69.3. Fail-closed

Biztonsági konfiguráció hiányakor:

```text
trusted proxy ismeretlen
→ ne bízz forwardolt headerben

host allowlist hiányos
→ request elutasítás vagy explicit canonical config

secret hiányzik
→ capability nem indul

method override config hibás
→ override tiltott

restricted file-offload config hibás
→ normál streaming vagy hiba, nem arbitrary path
```

---

<a id="célzott-hibakodok"></a>

## 70. Célzott hibakódok

Az implementált Forge/diagnosztikai felület stabil hibakódjai között szerepel:

```text
KERNEL_PROJECT_ROOT_MISSING
KERNEL_PROJECT_ROOT_OUTSIDE_REPOSITORY
KERNEL_APPLICATION_ROOT_AMBIGUOUS
KERNEL_BUILD_DIR_OUTSIDE_PROJECT
KERNEL_BUILD_ID_MISSING
KERNEL_DEPLOYMENT_ID_MISSING
KERNEL_DEPLOYMENT_ID_INCONSISTENT
KERNEL_SOURCE_DATE_EPOCH_INVALID
KERNEL_REPRODUCIBLE_BUILD_DRIFT
KERNEL_CACHE_NAMESPACE_MISSING
KERNEL_SHARED_CACHE_UNSAFE
KERNEL_LOG_SECRET_LEAK
KERNEL_CHARSET_UNSUPPORTED
KERNEL_CAPABILITY_METADATA_INVALID
KERNEL_COMPOSITION_HASH_DRIFT
KERNEL_DEBUG_EXPOSES_INTERNALS
KERNEL_NODE_ENV_INVALID
KERNEL_STAGE_INVALID
KERNEL_ENVIRONMENT_STAGE_CONFLICT
KERNEL_RUNTIME_MODE_AMBIGUOUS
KERNEL_LOCALE_DEFAULT_NOT_ENABLED
KERNEL_LOCALE_UNSUPPORTED
KERNEL_ERROR_MAPPER_MISSING
KERNEL_METHOD_OVERRIDE_ENABLED_GLOBALLY
KERNEL_METHOD_OVERRIDE_UNSAFE
KERNEL_GLOBAL_SECRET_USED
KERNEL_SECRET_PLACEHOLDER
KERNEL_SECRET_ROTATION_INVALID
KERNEL_TRUSTED_HEADER_UNSAFE
KERNEL_TRUSTED_PROXY_TOO_BROAD
KERNEL_TRUSTED_HOST_MISSING
KERNEL_HOST_HEADER_INJECTION
KERNEL_X_SENDFILE_UNSAFE
KERNEL_READ_ONLY_FILESYSTEM_VIOLATION
KERNEL_EDGE_NODE_IMPORT
```

A hibakód stabil machine contract lehet, az emberi üzenet változhat.

---

<a id="migracio-symfonybol"></a>

## 71. Migráció Symfony kernelkonfigurációból

### 71.1. Inventory

Gyűjtsd össze:

```text
kernel.* parameter usage
Kernel override metódusok
FrameworkBundle config
trusted proxies/hosts
locale config
APP_SECRET usage
cache/log directory assumptions
bundle registration
runtime mode
X-Sendfile integration
```

### 71.2. Osztályozás

Minden értéket sorolj be:

```text
build-time
process-start
request-time
deployment metadata
capability config
secret
diagnostics-only
```

### 71.3. Átültetés

| Symfony | Winzard |
| --- | --- |
| `getProjectDir()` | explicit project root resolver |
| `getBuildDir()` | `.next` / `distDir` |
| `getCacheDir()` | cache handler/capability |
| `getLogDir()` | stdout/telemetry |
| bundle registration | capability manifest + recipe |
| environment | `NODE_ENV` |
| runtime environment | `APP_STAGE` |
| runtime mode | explicit entrypoint |
| secret | capability-specific secrets |
| trusted proxies | infrastructure + adapter |
| error controller | error boundaries + mapper |

### 71.4. Kerülendő mechanikus másolás

Nem kell létrehozni:

```ts
class Kernel {
  get(name: string): unknown;
}
```

Nem kell minden `kernel.*` nevet envként lemásolni. A jelentést kell megőrizni, nem a PHP container API-t.

---

<a id="hibaelharitas-build-es-path"></a>

## 72. Hibaelhárítás: build- és pathproblémák

### 72.1. A build másik könyvtárba kerül

Ellenőrizd:

```text
next.config.ts distDir
build command app directory argumentuma
working directory
monorepo package root
CI artifact upload path
```

### 72.2. `next start` nem talál buildet

- ugyanaz az app root?
- ugyanaz a `distDir`?
- a build artifact bekerült a runtime image-be?
- a working directory helyes?
- standalone output megfelelően másolva?

### 72.3. Read-only filesystem hiba

Azonosítsd, melyik komponens ír:

```text
Next cache
image optimizer
temp upload
logger
generated file
database driver socket
```

Ne tedd az egész rootot írhatóvá vakon. Adj szűk adaptert vagy external storage-ot.

### 72.4. Monorepo path drift

A `process.cwd()` használatokat keresd meg. Cseréld explicit root argumentumra vagy stabil file URL alapú feloldásra.

---

<a id="hibaelharitas-environment-es-runtime"></a>

## 73. Hibaelhárítás: environment és runtime

### 73.1. Staging dev módot használ

Ellenőrizd:

```text
NODE_ENV
build command
runtime image
APP_STAGE
dev server vs next start
```

Stagingnek production buildet kell futtatnia.

### 73.2. Worker webconfigot követel

Valószínűleg globális env parser importálódik. Bontsd capability- és entrypoint-specifikus sémákra.

### 73.3. Külön instance eltérően viselkedik

Ellenőrizd:

```text
deployment ID
build ID
composition hash
secret version
capability manifest
locale list
cache handler config
proxy config
```

### 73.4. Serverless cold start intermittáló

Keress:

- import-time network callt;
- mutable module state-et;
- nem idempotens initializationt;
- process-specific random configot;
- túl hosszú startup validációt.

---

<a id="hibaelharitas-proxy-es-host"></a>

## 74. Hibaelhárítás: proxy, host és origin

### 74.1. Redirect HTTP-re HTTPS helyett

- trusted proxy beállítás;
- `X-Forwarded-Proto` sanitization;
- canonical `APP_URL`;
- proxy hop count;
- direct origin access.

### 74.2. Rossz host kerül emailbe

Ne a raw Host headert használd. Használj origin resolvert és ellenőrzött tenant domain registryt.

### 74.3. Server Action origin mismatch

Ellenőrizd:

- public host;
- reverse proxy host rewrite;
- `serverActions.allowedOrigins`;
- forwarded host trust;
- cookie domain;
- preview domain.

Ne adj túl széles wildcardot gyors javításként.

### 74.4. Kliens spoofolt IP-je jelenik meg

A forwardolt chain rossz oldalát választod, vagy a proxy nem törli a kliens headerét. Dokumentáld a pontos chain semanticsot.

### 74.5. X-Accel fájl 404

- internal location path egyezik?
- proxy engedi a headert?
- az app belső URI-t, nem filesystem pathot ad?
- authorization előbb lefut?
- Content-Disposition helyes?

---

<a id="implementacios-elfogadasi-kriteriumok"></a>

## 75. Implementációs elfogadási kritériumok

Egy Winzard projekt kernelkonfigurációja akkor tekinthető megfelelőnek, ha:

1. a repository- és application root explicit és tesztelt;
2. a build könyvtár projektgyökéren belül marad;
3. az artifact read-only deploymentben indul;
4. a build ID stabil ugyanahhoz az artifacthoz;
5. a deployment ID minden replica között egységes;
6. release buildben reprodukálható timestamp policy van;
7. build- és runtime cache külön contract;
8. shared cache multi-instance teszttel rendelkezik;
9. a log stdout/central sink alapú és redaktált;
10. UTF-8 az alapértelmezett encoding;
11. capability-k és recipe-k metadata-szerződése validált;
12. nincs globális mutable config bag;
13. `NODE_ENV` és `APP_STAGE` külön kezelt;
14. web/CLI/worker entrypoint explicit;
15. default locale szerepel az engedélyezett locale-ok között;
16. error surface és problem mapper dokumentált;
17. HTTP method override alapértelmezetten tiltott;
18. nincs globális közös `APP_SECRET`;
19. capability-specifikus secretek rotálhatók;
20. forwardolt header csak trusted proxy után megbízható;
21. host allowlist és canonical origin rendelkezésre áll;
22. Server Action originlista szűk;
23. X-Sendfile offload nem fogad kliens által adott pathot;
24. startup validáció fail-fast;
25. negatív security tesztek CI-ben futnak;
26. multi-instance és rolling deployment kompatibilitás ellenőrzött;
27. diagnostics nem szivárogtat secretet vagy belső pathot;
28. minden eltérés ADR-rel vagy explicit waiverrel rendelkezik.

---

<a id="reszletes-symfony-winzard-megfeleltetes"></a>

## 76. Részletes Symfony–Winzard megfeleltetés

| Symfony | Jelentés | Winzard | Megjegyzés |
| --- | --- | --- | --- |
| `kernel.build_dir` | read-only build output | `.next`, `distDir`, artifact root | runtime state ne kerüljön ide |
| `kernel.bundles` | aktív bundle-ök | capability-k | package és recipe külön fogalom |
| `kernel.bundles_metadata` | bundle path/namespace | recipe/package/capability metadata | nincs global runtime scan |
| `kernel.cache_dir` | írható runtime cache | cache handler és cache capability | több cacheosztály |
| `kernel.charset` | alkalmazás encoding | UTF-8 invariant | legacy decoder boundary |
| `kernel.container_build_time` | build timestamp | `SOURCE_DATE_EPOCH` | release reproducibility |
| `kernel.container_class` | container identity | composition graph hash | nincs runtime DI-container class |
| `kernel.debug` | debug flag | debug policy + `NODE_ENV` | secret soha nem exponálható |
| `kernel.default_locale` | default locale | `DEFAULT_LOCALE` | i18n capability |
| `kernel.enabled_locales` | locale allowlist | typed `supportedLocales` | route és dictionary drift check |
| `kernel.environment` | config mode | `NODE_ENV` | csak dev/prod/test |
| `kernel.error_controller` | error response | error boundaries + mappers | entrypointfüggő |
| `kernel.http_method_override` | override kapcsoló | disabled default | legacy adapter lehet |
| `kernel.allowed_http_method_override` | allowlist | explicit legacy enum | csak POSTból |
| `kernel.logs_dir` | log path | stdout/telemetry | file adapter opcionális |
| `kernel.project_dir` | project root | repository/app root resolver | monorepóban több root |
| `kernel.runtime_environment` | deployment helye | `APP_STAGE` | region külön mező |
| `kernel.runtime_mode` | runtime roles | explicit entrypoint | ne heurisztikából |
| `kernel.runtime_mode.web` | web mode | Next server workload | request context |
| `kernel.runtime_mode.cli` | CLI mode | Forge/command entrypoint | nincs HTTP context |
| `kernel.runtime_mode.worker` | long-running worker | worker workload | queue/outbox |
| `kernel.secret` | framework secret | capability-specific keys | blast radius csökkentés |
| `kernel.share_dir` | shared cache | Redis/KV/object storage | protokollspecifikus |
| `kernel.trust_x_sendfile_type_header` | proxy file offload | explicit offload adapter | raw client header tiltott |
| `kernel.trusted_headers` | forwarded header trust | allowlist + parser | proxy contract |
| `kernel.trusted_hosts` | allowed Host | host policy | canonical origin |
| `kernel.trusted_proxies` | trusted proxy list | CIDR/hop/mTLS policy | direct origin tiltás |

---

<a id="forrasok-es-attribucio"></a>

## 77. Források és attribúció

### 77.1. Symfony

- [Symfony Docs — Configuring in the Kernel](https://symfony.com/doc/current/reference/configuration/kernel.html)
- [Symfony Docs — Configuration Environments](https://symfony.com/doc/current/configuration.html)
- [Symfony Docs — Proxies and Load Balancers](https://symfony.com/doc/current/deployment/proxies.html)

### 77.2. Next.js

- [Next.js — `next.config` reference](https://nextjs.org/docs/app/api-reference/config/next-config-js)
- [Next.js — `distDir`](https://nextjs.org/docs/pages/api-reference/config/next-config-js/distDir)
- [Next.js — `generateBuildId`](https://nextjs.org/docs/app/api-reference/config/next-config-js/generateBuildId)
- [Next.js — `deploymentId`](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId)
- [Next.js — `cacheHandlers`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandlers)
- [Next.js — Self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js — Internationalization](https://nextjs.org/docs/app/guides/internationalization)
- [Next.js — Server Actions configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Next.js — Instrumentation](https://nextjs.org/docs/pages/api-reference/file-conventions/instrumentation)

### 77.3. Reproducible build és Node.js

- [SOURCE_DATE_EPOCH specification](https://reproducible-builds.org/specs/source-date-epoch/)
- [Node.js `path` API](https://nodejs.org/api/path.html)
- [Node.js `process` API](https://nodejs.org/api/process.html)

### 77.4. Ellenőrzési dátum

```text
2026-07-22
```

A Next.js konfigurációs opciói és hosting semanticsa változhat. Dokumentációfrissítéskor újra ellenőrizni kell legalább:

- a `distDir`, `output`, `generateBuildId` és `deploymentId` viselkedését;
- a cache handler API-t;
- a Server Action allowed origin contractot;
- az instrumentation hookokat;
- a Proxy runtime és self-hosting ajánlásokat;
- a build és runtime cache alapértelmezéseit.
