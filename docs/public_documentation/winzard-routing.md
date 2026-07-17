---
title: "Routing és URL-kezelés Winzardban"
description: "A Next.js App Router fájlrendszer-alapú útvonalainak, paramétereinek, URL-generálásának, átirányításainak, proxyfeltételeinek, lokalizációjának, biztonságának és diagnosztikájának teljes Winzard-szerződése."
status: "implemented-specification"
document_version: "0.2.0"
last_verified: "2026-07-17"
source_basis: "Symfony Docs — Routing"
nextjs_baseline: "16.2.10"
applies_to: "kitelepített vagy generált Winzard projektek"
excludes:
  - "a Winzard alaprendszer belső routing implementációja"
  - "egy második runtime router vagy route registry"
  - "alkalmazás-runtime API gateway és service mesh konfiguráció"
---

# Routing és URL-kezelés Winzardban

## A dokumentum célja

Ez a dokumentum a Symfony **„Routing”** fejezetének Winzard-specifikus, önálló szakmai átültetése. Nem szó szerinti fordítás. A Symfony routing dokumentációjának teljes funkcionális ívét követi — route létrehozása, HTTP-metódusok, paraméterek, követelmények, prioritás, aliasok, prefixek, hostfeltételek, lokalizáció, URL-generálás, aláírt URL-ek, hibakeresés és tesztelés —, de minden fogalmat a Winzard **Next.js App Router-alapú** célarchitektúrájához igazít.

A Symfonyban a route tipikusan külön konfigurációs objektum, amely URL-mintát, nevet, controllert, defaultokat, követelményeket, metódusokat, hostot és egyéb opciókat rendel egymáshoz. A Next.js App Routerben ezzel szemben a route-ok elsődleges forrása a fájlrendszer:

```text
src/app/products/page.tsx
src/app/products/[slug]/page.tsx
src/app/api/products/[id]/route.ts
```

A Winzard ezért **nem vezet be második runtime routert**. A Next.js router marad az autoritatív útvonal-feloldó. A Winzard ehhez ad:

- architekturális határokat;
- műveletspecifikus inputvalidációt;
- stabil URL-builder konvenciót;
- route-kompatibilitási szabályokat;
- diagnosztikai és dokumentációs contractot;
- route-inventory és drift-ellenőrzési célfelületet;
- biztonsági és multi-tenant korlátokat;
- tesztelési és release-követelményeket.

> [!IMPORTANT]
> A `src/app` könyvtár delivery-, routing-, rendering- és HTTP-adapter. A route fájl nem válhat domain-, application-, persistence- vagy policy-réteggé.

> [!IMPORTANT]
> A repository implementálja a `forge route:list`, `forge route:inspect`, `forge route:match`, `forge route:check`, `forge route:aliases` és `forge route:docs` diagnosztikai parancsokat. A statikus fájlrendszer- és AST-inventory bizonyítékot ad, de nem helyettesíti a Next.js typegen, build és E2E ellenőrzését.

> [!NOTE]
> A fejezet a kitelepített Winzard-projektek publikus contractját írja le. Nem dokumentálja a Winzard alaprendszer belső routing fejlesztési taskjait, belső roadmapjét vagy maintainer-specifikus implementációs részleteit.

A dokumentum végére egy fejlesztő:

1. megérti a Next.js route-feloldási modelljét és annak Winzard-határait;
2. statikus, dinamikus, catch-all és opcionális catch-all route-ot tud létrehozni;
3. helyesen választ `page.tsx`, `route.ts`, redirect, rewrite és `proxy.ts` között;
4. műveletspecifikus sémával validálja a path- és query-paramétereket;
5. frameworkfüggetlen application use case-en keresztül old fel erőforrást;
6. kezeli a route-kompatibilitást, aliasokat és deprecált URL-eket;
7. biztonságosan generál relatív, abszolút és aláírt URL-eket;
8. kialakít lokalizált, subdomain- vagy tenantfüggő útvonalakat;
9. explicit cache-, rendering- és stateless policyt alkalmaz;
10. route-szintű diagnosztikát, unit-, integration- és E2E-teszteket tud készíteni;
11. felismeri azokat a Symfony routing funkciókat, amelyeknek nincs egy az egyben Next.js megfelelőjük;
12. meg tudja különböztetni a Next.js runtime route-ját a Winzard dokumentációs route contractjától.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Technikai baseline, hatókör és kizárások](#2-technikai-baseline-hatókör-és-kizárások)
3. [A router autoritása és az egyetlen route-forrás elve](#3-a-router-autoritása-és-az-egyetlen-route-forrás-elve)
4. [A request route-feloldási életciklusa](#4-a-request-route-feloldási-életciklusa)
5. [Publikus route-ok és speciális route-fájlok](#5-publikus-route-ok-és-speciális-route-fájlok)
6. [Statikus oldalak és statikus HTTP-végpontok](#6-statikus-oldalak-és-statikus-http-végpontok)
7. [HTTP-metódusok és Route Handlerek](#7-http-metódusok-és-route-handlerek)
8. [`page.tsx` és `route.ts` közötti döntés](#8-pagetsx-és-routets-közötti-döntés)
9. [Dinamikus route-szegmensek](#9-dinamikus-route-szegmensek)
10. [Path-paraméterek validálása](#10-path-paraméterek-validálása)
11. [Catch-all, opcionális catch-all és perjelek](#11-catch-all-opcionális-catch-all-és-perjelek)
12. [Route-prioritás, precedencia és ütközések](#12-route-prioritás-precedencia-és-ütközések)
13. [Paraméterkonverzió és erőforrás-feloldás](#13-paraméterkonverzió-és-erőforrás-feloldás)
14. [Enumok és domainértékek route-paraméterként](#14-enumok-és-domainértékek-route-paraméterként)
15. [Speciális route-paraméterek Symfony és Winzard között](#15-speciális-route-paraméterek-symfony-és-winzard-között)
16. [Query string, defaultok és kanonikus keresési szerződés](#16-query-string-defaultok-és-kanonikus-keresési-szerződés)
17. [Route groupok, prefixek, layoutok és base path](#17-route-groupok-prefixek-layoutok-és-base-path)
18. [Route-aliasok és visszafelé kompatibilis URL-ek](#18-route-aliasok-és-visszafelé-kompatibilis-url-ek)
19. [Átirányítások](#19-átirányítások)
20. [Rewrite-ok és maszkolt célútvonalak](#20-rewrite-ok-és-maszkolt-célútvonalak)
21. [Feltételes route-kezelés és Proxy](#21-feltételes-route-kezelés-és-proxy)
22. [Környezetspecifikus útvonalak](#22-környezetspecifikus-útvonalak)
23. [Host-, subdomain- és tenantfüggő routing](#23-host--subdomain--és-tenantfüggő-routing)
24. [Lokalizált és nemzetköziesített routing](#24-lokalizált-és-nemzetköziesített-routing)
25. [Stateless működés, rendering és cache](#25-stateless-működés-rendering-és-cache)
26. [Az aktuális route, pathname, params és search params olvasása](#26-az-aktuális-route-pathname-params-és-search-params-olvasása)
27. [URL-generálás és typed route-ok](#27-url-generálás-és-typed-route-ok)
28. [Abszolút URL-ek és az alkalmazás publikus originje](#28-abszolút-url-ek-és-az-alkalmazás-publikus-originje)
29. [URL-generálás különböző rétegekben](#29-url-generálás-különböző-rétegekben)
30. [Route-létezés és route contractok ellenőrzése](#30-route-létezés-és-route-contractok-ellenőrzése)
31. [Aláírt és lejáró URL-ek](#31-aláírt-és-lejáró-url-ek)
32. [HTTPS, trusted proxy és Host-header biztonság](#32-https-trusted-proxy-és-host-header-biztonság)
33. [`notFound`, hibák, redirect és response mapping](#33-notfound-hibák-redirect-és-response-mapping)
34. [Route inventory, route contract és generált metadata](#34-route-inventory-route-contract-és-generált-metadata)
35. [Route-diagnosztika](#35-route-diagnosztika)
36. [Tesztelési stratégia](#36-tesztelési-stratégia)
37. [Biztonsági követelmények](#37-biztonsági-követelmények)
38. [Architekturális szabályok](#38-architekturális-szabályok)
39. [Ajánlott projektstruktúra](#39-ajánlott-projektstruktúra)
40. [Hibaelhárítás](#40-hibaelhárítás)
41. [Symfony–Winzard megfeleltetés](#41-symfonywinzard-megfeleltetés)
42. [Implementációs elfogadási kritériumok](#42-implementációs-elfogadási-kritériumok)
43. [Források és attribúció](#43-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy routing-, biztonsági, kompatibilitási, SEO-, cache- vagy architekturális hibát okozhat;
- **TILOS / MUST NOT**: a megoldás Winzard-kompatibilis projektben nem használható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést ADR-ben, specificationben vagy waiverben dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak mérhető vagy dokumentált okkal alkalmazható;
- **OPCIONÁLIS / MAY**: a projekt igénye és aktív capability-je szerint használható.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Fő routingfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Router** | A Next.js runtime része, amely a bejövő URL-t fájlrendszerbeli route-hoz rendeli. |
| **Route tree** | A `src/app` könyvtár route-szegmenseiből, layoutjaiból és speciális fájljaiból létrejövő útvonalfa. |
| **Route szegmens** | Egy mappa a route tree-ben; lehet statikus, dinamikus, catch-all, opcionális catch-all vagy route group. |
| **Page** | HTML-felület, amelyet egy route szegmensben a `page.tsx` tesz publikussá. |
| **Route Handler** | Web `Request`/`Response` API-t használó HTTP-végpont egy `route.ts` fájlban. |
| **Proxy** | A route renderelése előtt futó, globális vagy matcherrel szűkített request-előfeldolgozó a `proxy.ts` fájlban. |
| **Redirect** | Olyan válasz, amely új URL-re irányítja a klienst, és megváltoztatja a böngésző címsorát. |
| **Rewrite** | Olyan belső útvonal-átképezés, amely másik célból szolgálja ki a választ, miközben a látható URL változatlan maradhat. |
| **Path paraméter** | Dinamikus route-szegmensből származó érték, például `slug` vagy `id`. |
| **Search paraméter** | A query stringből származó, felhasználó által kontrollált érték. |
| **Route contract** | A route publikus jelentésének, inputjának, response-jának, policyjának és kompatibilitásának dokumentációs szerződése. |
| **URL builder** | Típusos, központi függvény, amely route-specifikus URL-t állít elő. |
| **Canonical URL** | Az erőforrás vagy oldal elsődleges, támogatott publikus URL-je. |
| **Alias URL** | Régi vagy alternatív URL, amely a canonical URL-re mutat vagy átirányít. |
| **Route collision** | Két fájlrendszerbeli route ugyanahhoz a publikus URL-hez vezetne. |
| **Delivery adapter** | Next.js-specifikus belépési pont, amely inputot validál, Actort állít elő, use case-t hív és választ képez. |
| **Request-time rendering** | Olyan renderelés, amely a beérkező kéréshez kötötten fut. |
| **Prerendering** | Buildkor vagy cache-be kerüléskor előállított route-output. |
| **Stateless route** | Olyan route, amely nem támaszkodik felhasználói sessionállapotra és explicit cache-/cookie-szerződéssel rendelkezik. |
| **Signed URL** | Integritásvédett, jellemzően lejáró URL, amelynek paramétereit HMAC vagy más megfelelő aláírás védi. |

### 1.3. Symfony és Winzard fogalmi különbsége

A Symfonyban egy route tipikusan rendelkezik:

```text
név
path pattern
controller
defaultok
követelmények
HTTP-metódusok
host
condition
locale
priority
stateless flag
```

A Next.js App Routerben ugyanezek több külön mechanizmusra oszlanak:

```text
fájlrendszerbeli elhelyezés
+ page.tsx vagy route.ts
+ dinamikus mappanév
+ Next.js route context
+ next.config redirects/rewrites/headers
+ proxy.ts matcher
+ Zod vagy más operation schema
+ application policy
+ explicit cache/rendering config
+ URL builder
+ dokumentációs route contract
```

A megfeleltetés ezért funkcionális, nem szintaktikai.

### 1.4. Route-név és route-azonosító

A Next.js App Router nem használ Symfony-szerű runtime route-neveket:

```php
#[Route('/products/{id}', name: 'product_show')]
```

A Winzardban három külön azonosító létezhet:

1. **fájlrendszerbeli route pattern**, például `/products/[slug]`;
2. **TypeScript URL-builder szimbólum**, például `productUrls.detail`;
3. **dokumentációs route contract ID**, például `ATLAS-ROUTE-012`.

Ezek közül csak az első a Next.js runtime route-forrása.

> [!WARNING]
> TILOS egy kézzel karbantartott route registryből runtime route-ot feloldani a Next.js router mellett. A registry elavulhat és route split-brain állapotot hozhat létre.

---

## 2. Technikai baseline, hatókör és kizárások

### 2.1. Baseline

A példák a következő célkörnyezetre készültek:

```text
Node.js:       24.x LTS
pnpm:          11.x
Next.js:       16.2.10
React:         19.2.x
TypeScript:    5.9.x
App Router:    igen
src/ layout:   igen
strict mode:   igen
```

Az aktuális repositoryban rögzített verziók és sikeres CI eredmények elsőbbséget élveznek az általános példákkal szemben.

### 2.2. Előfeltételek

A fejezet alkalmazásához AJÁNLOTT:

```bash
pnpm install --frozen-lockfile
pnpm typegen
pnpm typecheck
pnpm forge check --project <PROJECT>
pnpm dev
```

A route-változtatás után legalább:

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

futtatandó.

### 2.3. Lefedett területek

A dokumentum lefedi:

- App Router route-feloldását;
- pages és Route Handlerek létrehozását;
- HTTP-metódusokat;
- dinamikus és catch-all paramétereket;
- route inputvalidációt;
- erőforrás-feloldást;
- route groupokat és prefixeket;
- aliasokat, redirecteket és rewrite-okat;
- host-, header-, cookie- és query-feltételeket;
- lokalizációt és subdomain routingot;
- stateless és cache-viselkedést;
- URL-generálást és signed URL-eket;
- route-diagnosztikát;
- tesztelést és biztonsági korlátokat.

### 2.4. Nem része ennek a fejezetnek

Külön specification tárgya:

- Server Actionök teljes command- és formcontractja;
- autentikációs provider implementáció;
- policy/ability rendszer teljes API-ja;
- API-verziózás teljes modellje;
- GraphQL router;
- külső API gateway;
- service mesh vagy ingress controller;
- edge/CDN vendor konfiguráció;
- több alkalmazást összefogó domain gateway;
- általános resource-generátor;
- parallel és intercepting route-ok teljes UI-contractja.

A fejezet ezekhez routing alapelveket adhat, de nem tekinthető teljes implementációs specifikációnak.

### 2.5. Aktív capability-k

A routing alapszerződés a `next-app` capability mellett értelmezhető.

További viselkedést aktiválhat például:

```text
modular-application
authentication
project-documentation
ai-delivery
liveness
database-readiness
```

A capability nem hozhat létre második routert. Csak route-fájlokat, proxy-, config-, policy-, dokumentációs vagy ellenőrzési elemeket adhat hozzá.

---

## 3. A router autoritása és az egyetlen route-forrás elve

### 3.1. Autoritatív route tree

A runtime route tree autoritatív forrása:

```text
src/app/**
next.config.ts
src/proxy.ts vagy proxy.ts
```

A fő route-fájlok:

```text
page.tsx
route.ts
layout.tsx
loading.tsx
not-found.tsx
error.tsx
template.tsx
default.tsx
```

A routingot tovább befolyásolhatja:

```text
redirects()
rewrites()
headers()
basePath
trailingSlash
proxy matcher
```

### 3.2. Nem autoritatív projekciók

Nem runtime route-forrás:

```text
route inventory Markdown
OpenAPI dokumentum
AGENTS.md
resource manifest
URL-builder fájl
navigation config
sitemap-generátor input
route-list CLI output
tesztfixture
```

Ezek a route tree-t leírhatják, ellenőrizhetik vagy használhatják, de nem írhatják felül.

### 3.3. Egyirányú származtatás

Támogatott irány:

```text
Next.js route tree
  ↓ typegen/build/inspection
route inventory
  ↓
dokumentáció, URL builder ellenőrzés, tesztfixture
```

Nem támogatott:

```text
kézzel írt inventory
  ↓
runtime route feloldás
```

### 3.4. Miért kritikus ez?

Két route-forrás esetén:

- ugyanaz az URL két eltérő contractot kaphat;
- a build sikeres lehet, miközben a dokumentáció hibás;
- egy redirect vagy rewrite elkerülheti a saját registryt;
- a Next.js upgrade megváltoztathatja a route typingot;
- az auth vagy cache policy rossz route-hoz kapcsolódhat;
- a generátor elavult fájlt állíthat elő;
- az AI kontextusa nem a tényleges runtime-ot írja le.

### 3.5. Route-manifest használata

Egy későbbi Winzard route-manifest csak akkor támogatott, ha:

1. generált vagy ellenőrzött projekció;
2. tartalmazza a source route pathot;
3. tartalmazza a generator és Next.js verziót;
4. hash alapján driftre ellenőrizhető;
5. nem vesz részt a runtime matchingben;
6. törlésével az alkalmazás továbbra is route-olható.

---

## 4. A request route-feloldási életciklusa

### 4.1. Magas szintű folyamat

```text
HTTP request
  ↓
platform / reverse proxy
  ↓
Next.js headers config
  ↓
Next.js redirects config
  ↓
proxy.ts
  ↓
beforeFiles rewrites
  ↓
filesystem route-ok és statikus assetek
  ↓
afterFiles rewrites
  ↓
dinamikus route-ok
  ↓
fallback rewrites
  ↓
page.tsx vagy route.ts
  ↓
Winzard delivery adapter
  ↓
Actor + validation + policy
  ↓
application use case
  ↓
DTO / application result
  ↓
React render vagy Web Response
```

### 4.2. Külső reverse proxy

A CDN, ingress vagy hosting platform már a Next.js előtt módosíthatja:

- a scheme-et;
- a hostot;
- a path prefixet;
- a forwarded headereket;
- a client IP-t;
- a TLS terminációt;
- a request body limitet.

Ezért az alkalmazás abszolút URL-generálása, auditja és tenantfeloldása nem épülhet vakon nyers headerekre.

### 4.3. `next.config` szint

A `headers`, `redirects` és `rewrites` build- és szerverkonfiguráció. Használható:

- statikus kompatibilitási redirecthez;
- globális vagy pathfüggő headerhez;
- régi URL-ek migrációjához;
- külső backend maszkolásához;
- route-prefix átvezetéséhez.

Nem alkalmas:

- per-user authorizációra;
- domain policyra;
- adatbázisfüggő üzleti route-választásra;
- secretet igénylő döntésre;
- requestenként változó alkalmazási műveletre.

### 4.4. Proxy

A `proxy.ts` a renderelés előtt fut. Alkalmas:

- locale feloldásra;
- host normalizationre;
- egyszerű redirectre;
- rewrite-ra;
- request/response header módosításra;
- coarse-grained request előszűrésre;
- globális request correlation ID létrehozására.

A Proxy **nem lehet az egyetlen authorizációs gate**. Az application művelet minden érzékeny műveletnél saját policyellenőrzést végez.

### 4.5. Filesystem matching

A filesystem route kiválasztása a route tree alapján történik. A Winzard route adapter csak azután fut, hogy a Next.js kiválasztotta a megfelelő `page.tsx` vagy `route.ts` fájlt.

### 4.6. Delivery adapter

A delivery adapter feladata:

1. request context olvasása;
2. paraméterek validálása;
3. Actor vagy security context előállítása;
4. application input DTO létrehozása;
5. use case meghívása;
6. application error HTTP/rendering eredménnyé alakítása;
7. response header és cache policy beállítása.

A delivery adapter nem:

- ír közvetlenül ORM-be;
- valósít meg üzleti tranzakciót;
- találja ki a domain defaultokat;
- duplikál policyt;
- épít tenant SQL-filtert kézzel;
- hívja saját belső HTTP API-ját szerveroldalon.

### 4.7. Server Functionök

A Server Function nem külön route-fájl a matchingláncban. A hozzá tartozó request a használat helyének route-jához kötődik.

Következmény:

- Proxy matcher változtatása módosíthatja a Server Function lefedettségét;
- patháthelyezés után újra kell ellenőrizni az authot;
- a Server Function belsejében továbbra is kötelező input-, Actor- és policyellenőrzés.

---

## 5. Publikus route-ok és speciális route-fájlok

### 5.1. Mappa önmagában nem route

Ez nem publikus oldal:

```text
src/app/products/
```

Publikus HTML-route akkor keletkezik, ha van:

```text
src/app/products/page.tsx
```

Publikus HTTP-végpont akkor keletkezik, ha van:

```text
src/app/api/products/route.ts
```

### 5.2. Layout nem publikus végpont

A `layout.tsx` UI-határt és közös renderelési struktúrát ad, de nem teszi önmagában publikussá a szegmenst.

```text
src/app/admin/layout.tsx
```

nem garantálja a `/admin` oldal létezését.

### 5.3. Metadata fájlok

A Next.js speciális metadata route-okat is létrehozhat:

```text
robots.ts
sitemap.ts
manifest.ts
opengraph-image.tsx
twitter-image.tsx
icon.tsx
```

Ezeket route-inventory és Proxy matcher készítésekor külön kell kezelni. Egy túl széles Proxy matcher nem ronthatja el a metadata-útvonalak kiszolgálását.

### 5.4. Private folder és colocated code

A route tree-ben a nem publikus segédkódot AJÁNLOTT:

- route szegmensen kívüli modulba;
- `_components`, `_lib` vagy más private folderbe;
- `src/modules/**/presentation` alá;
- `src/platform` vagy `src/composition` megfelelő helyére

tenni.

A mappanév és a speciális route-fájl együtt határozza meg, hogy valami publikussá válik-e.

### 5.5. Route group

A zárójeles mappa:

```text
src/app/(public)/products/page.tsx
```

URL-je:

```text
/products
```

A `(public)` szervezési szegmens, nem URL-rész.

### 5.6. Dinamikus szegmens

```text
src/app/products/[slug]/page.tsx
```

route patternje:

```text
/products/[slug]
```

például:

```text
/products/red-shoe
```

### 5.7. Catch-all

```text
src/app/docs/[...segments]/page.tsx
```

például:

```text
/docs
```

nem feltétlenül illeszkedik; a `[...segments]` legalább egy szegmenst vár:

```text
/docs/getting-started
/docs/reference/routing
```

A nullaszegmenses esethez:

```text
src/app/docs/[[...segments]]/page.tsx
```

használandó.

---

## 6. Statikus oldalak és statikus HTTP-végpontok

### 6.1. Minimális statikus oldal

```tsx
// src/app/about/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rólunk',
};

export default function AboutPage() {
  return (
    <main>
      <h1>Rólunk</h1>
      <p>Ez egy statikus információs oldal.</p>
    </main>
  );
}
```

Publikus URL:

```text
/about
```

### 6.2. Winzard-kompatibilis statikus oldal

Egy valóban statikus, üzleti műveletet nem végző oldal közvetlen JSX-et renderelhet. Nem szükséges mesterséges application use case-t létrehozni pusztán a rétegezés kedvéért.

A következő esetekben viszont külön application query AJÁNLOTT:

- adatbázisból olvas;
- külső szolgáltatást használ;
- jogosultságfüggő;
- tenantfüggő;
- üzleti defaultot számol;
- auditálható döntést hoz;
- több delivery adapter ugyanazt az adatot használja.

### 6.3. Statikus JSON-végpont

```ts
// src/app/api/version/route.ts
export function GET(): Response {
  return Response.json(
    {
      name: 'atlas',
      apiVersion: '1',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  );
}
```

A statikus jelleg nem pusztán attól függ, hogy a függvény szinkron. Az adatforrások, dynamic API-k, cache config és a Next.js buildelemzés együtt határozzák meg a viselkedést.

### 6.4. Explicit cache policy

Minden publikus Route Handlerhez AJÁNLOTT dokumentálni:

```text
cacheability
max age
shared cache használhatóság
Vary headerek
user-specific tartalom
tenant-specific tartalom
invalidation
```

Érzékeny vagy request-specifikus válasznál:

```ts
return Response.json(payload, {
  headers: {
    'Cache-Control': 'private, no-store',
  },
});
```

### 6.5. Static generation dinamikus route-hoz

```tsx
// src/app/docs/[slug]/page.tsx
export async function generateStaticParams() {
  return [
    { slug: 'getting-started' },
    { slug: 'routing' },
  ];
}

export default async function DocumentationPage({
  params,
}: PageProps<'/docs/[slug]'>) {
  const { slug } = await params;

  return <article>{slug}</article>;
}
```

A `generateStaticParams()` nem inputvalidáció. A visszatérő vagy runtime paramétereket továbbra is a route adapternek kell validálnia.

### 6.6. Ismeretlen dinamikus paraméterek

Az, hogy a build milyen paramétereket prerenderel, és az, hogy a runtime elfogad-e más paramétert, két külön döntés.

A contractban rögzíteni kell:

```text
pre-renderelt értékek halmaza
runtime dinamikus érték engedélyezett-e
ismeretlen érték 404-et ad-e
cache-be kerülhet-e runtime
```

Ha csak előre ismert értékek engedélyezettek, a route config és a use case contract együtt biztosítsa ezt. A kizárólag route configra épülő tiltás nem helyettesíti a domainvalidációt.

---

## 7. HTTP-metódusok és Route Handlerek

### 7.1. Támogatott metódusok

Egy `route.ts` az alábbi exportokat használhatja:

```text
GET
POST
PUT
PATCH
DELETE
HEAD
OPTIONS
```

Példa:

```ts
// src/app/api/products/route.ts
export async function GET(request: Request): Promise<Response> {
  // list query
  return Response.json([]);
}

export async function POST(request: Request): Promise<Response> {
  // create command
  return Response.json({ id: 'new-id' }, { status: 201 });
}
```

### 7.2. Egy route, több művelet

Az azonos URL-en elérhető eltérő HTTP-metódusok külön application műveletek legyenek:

```text
GET    /api/products  -> ListProducts
POST   /api/products  -> CreateProduct
```

Nem ajánlott:

```ts
export async function handler(request: Request) {
  if (request.method === 'GET') {
    // ...
  }

  if (request.method === 'POST') {
    // ...
  }
}
```

A metódusonkénti export:

- jobban típusozható;
- világosabb auditfelület;
- könnyebb tesztelni;
- természetesebben illeszkedik a Next.js API-jához;
- elkülöníti a query és command műveleteket.

### 7.3. Route Handler mint delivery adapter

```ts
// src/app/api/products/[id]/route.ts
import { z } from 'zod';

import { catalogModule } from '@/composition/catalog';

const ParamsSchema = z.object({
  id: z.uuid(),
});

export async function GET(
  _request: Request,
  context: RouteContext<'/api/products/[id]'>,
): Promise<Response> {
  const parsed = ParamsSchema.safeParse(await context.params);

  if (!parsed.success) {
    return Response.json(
      {
        code: 'INVALID_ROUTE_PARAMETERS',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await catalogModule.queries.getProduct.execute({
    id: parsed.data.id,
  });

  if (!result) {
    return Response.json(
      { code: 'PRODUCT_NOT_FOUND' },
      { status: 404 },
    );
  }

  return Response.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}
```

### 7.4. Body validálása

```ts
const CreateProductBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  priceMinor: z.number().int().nonnegative(),
});

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const parsed = CreateProductBodySchema.safeParse(raw);

  if (!parsed.success) {
    return Response.json(
      {
        code: 'VALIDATION_FAILED',
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  // Actor + policy + use case
  // ...
  return Response.json({}, { status: 201 });
}
```

A request body TILOS közvetlenül ORM `data` objektumként használni.

### 7.5. `HEAD`

A `HEAD` response ugyanazokat a releváns headereket adja, mint a `GET`, de body nélkül.

Ha a framework automatikus viselkedése nem elég, explicit export használható:

```ts
export async function HEAD(
  request: Request,
  context: RouteContext<'/api/products/[id]'>,
): Promise<Response> {
  const response = await GET(request, context);

  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
```

Az ilyen delegálás csak akkor biztonságos, ha a `GET` nem végez nem idempotens side effectet.

### 7.6. `OPTIONS` és CORS

Cross-origin API esetén explicit CORS contract szükséges:

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.example.com',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '600',
};

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
```

TILOS hitelesítő adatot használó API-nál kontrollálatlanul visszatükrözni az `Origin` headert.

### 7.7. Method override

Symfony vagy legacy rendszerek támogathatnak formmezőből vagy headerből method override-ot.

Winzardban alapértelmezetten:

```text
POST + _method=DELETE
```

nem támogatott.

Ha legacy integráció miatt szükséges:

- Proxy vagy külön adapter normalizálja;
- csak szűk allowlist legyen;
- CSRF- és auth-ellenőrzés kötelező;
- auditban az eredeti és effektív metódus is szerepeljen;
- publikus contract dokumentálja;
- modern API-k ne épüljenek rá.

### 7.8. Idempotencia

Routing szinten dokumentálni kell:

| Metódus | Tipikus elvárás |
| --- | --- |
| `GET` | safe és idempotens |
| `HEAD` | safe és idempotens |
| `OPTIONS` | safe és idempotens |
| `PUT` | idempotens |
| `DELETE` | idempotens eredményre törekvő |
| `POST` | általában nem idempotens |
| `PATCH` | contractfüggő |

Pénzügyi vagy külső side effectet indító `POST` esetén idempotency key capability lehet szükséges. Ez application contract, nem pusztán route config.

---

## 8. `page.tsx` és `route.ts` közötti döntés

### 8.1. HTML-felület

`page.tsx` használatos, ha a route elsődleges eredménye React UI:

```text
/products
/products/[slug]
/admin/orders/[id]
```

### 8.2. Web API vagy fájlválasz

`route.ts` használatos, ha az eredmény:

- JSON;
- XML;
- CSV;
- webhook response;
- fájlletöltés;
- image vagy más bináris adat;
- machine-to-machine API;
- health endpoint;
- callback endpoint.

### 8.3. Azonos szegmensben nem keverhető

Azonos route szegmensben a `page.tsx` és `route.ts` ütközhet, mert mindkettő ugyanazt a route pathot birtokolná.

Nem támogatott:

```text
src/app/products/page.tsx
src/app/products/route.ts
```

Helyette:

```text
src/app/products/page.tsx
src/app/api/products/route.ts
```

vagy tudatosan külön szegmens:

```text
src/app/products/page.tsx
src/app/products/feed/route.ts
```

### 8.4. Belső szerveroldali adatlekérés

Server Componentből TILOS a saját Route Handlert HTTP-n keresztül hívni:

```tsx
// Nem támogatott
const response = await fetch('http://localhost:3000/api/products');
```

Helyette mindkét delivery adapter ugyanazt az application queryt használja:

```text
page.tsx
  └─ ListProducts

route.ts
  └─ ListProducts
```

### 8.5. Miért?

A saját HTTP-kör:

- felesleges hálózati és serializációs költség;
- deployment URL-függés;
- hibás cache-layer;
- auth context elvesztése;
- tesztelési nehézség;
- dupla DTO mapping;
- belső API-t publikus szerződéssé emelhet;
- build vagy prerender alatt nem elérhető szervert feltételezhet.

### 8.6. Route Handler nem UI-layout része

A Route Handler nem React route. Nem örököl UI layoutot, nem vesz részt a kliensnavigáció renderfájában, és nem használható page helyett pusztán azért, mert „controller-szerűbb”.

---

## 9. Dinamikus route-szegmensek

### 9.1. Alapszintaxis

```text
src/app/products/[slug]/page.tsx
```

A `slug` paraméter Promise-on keresztül érhető el:

```tsx
export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const { slug } = await params;

  return <main>{slug}</main>;
}
```

### 9.2. Route Handler context

```ts
export async function GET(
  _request: Request,
  context: RouteContext<'/api/products/[id]'>,
): Promise<Response> {
  const { id } = await context.params;

  return Response.json({ id });
}
```

### 9.3. A paraméter mindig külső input

A fájlrendszerből ismert paraméternév nem jelent validált értéket.

```text
slug: string
```

nem bizonyítja:

- a hosszkorlátot;
- az engedélyezett karaktereket;
- az erőforrás létezését;
- a tenant-hozzáférést;
- az enumtagságot;
- a canonical formát;
- a dekódolt érték biztonságát.

### 9.4. Több paraméter

```text
src/app/shops/[shopSlug]/products/[productSlug]/page.tsx
```

```tsx
export default async function ProductPage({
  params,
}: PageProps<'/shops/[shopSlug]/products/[productSlug]'>) {
  const { shopSlug, productSlug } = await params;

  // Mindkettő külön validálandó.
  // ...
}
```

### 9.5. Paraméternév jelentése

AJÁNLOTT:

```text
[id]           technikai azonosító
[slug]         emberbarát slug
[locale]       locale
[tenant]       tenant slug
[year]         év
[...segments]  hierarchikus útvonal
```

Kerülendő:

```text
[value]
[param]
[key]
[data]
[x]
```

A route paraméternév része a route contractnak és a generált típusoknak.

### 9.6. Paraméter átnevezése

```text
/products/[id]
  → /products/[productId]
```

A publikus URL nem feltétlenül változik, de:

- a `params` kulcsa változik;
- PageProps/RouteContext típus változik;
- tesztek változnak;
- dokumentáció változik;
- link builder implementáció változhat;
- route inventory változik.

Ezért paraméternév-átnevezés belső breaking change lehet akkor is, ha a böngészőben látható URL azonos marad.

---

## 10. Path-paraméterek validálása

### 10.1. Symfony route requirement megfelelője

A Symfony route requirement gyakran regexszel korlátozza a paramétert.

Winzardban az alapmegoldás:

```text
route pattern
+ operation-specific schema
+ application validation
```

Nem szükséges minden validációt a route matcherbe kényszeríteni.

### 10.2. UUID

```ts
import { z } from 'zod';

export const ProductIdParamsSchema = z.object({
  id: z.uuid(),
});
```

### 10.3. Slug

```ts
export const ProductSlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
});
```

### 10.4. Numerikus ID

```ts
export const NumericIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive().safe()),
});
```

TILOS egyszerűen:

```ts
const id = Number(params.id);
```

használni ellenőrzés nélkül, mert:

```text
Number('')
Number('  ')
Number('1e3')
Number('0x10')
```

nem feltétlenül felel meg a route contractnak.

### 10.5. Dátum

```ts
export const ArchiveParamsSchema = z.object({
  year: z.string().regex(/^\d{4}$/u).transform(Number),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/u).transform(Number),
});
```

A naptári érvényességet application szinten is ellenőrizni kell.

### 10.6. Hibaválasz HTML-oldalnál

Érvénytelen path-paraméter esetén a page tipikusan:

```tsx
import { notFound } from 'next/navigation';

const parsed = ParamsSchema.safeParse(await params);

if (!parsed.success) {
  notFound();
}
```

A 404 akkor helyes, ha a route contract szerint az érték nem reprezentálható erőforrást jelent.

### 10.7. Hibaválasz API-nál

API esetén érdemes megkülönböztetni:

```text
400 Invalid route syntax
404 Syntaktikailag érvényes, de nem létező erőforrás
403 Létezik, de az Actor nem jogosult
```

A konkrét információszivárgási policy felülírhatja ezt, például 403 helyett 404-et alkalmazhat.

### 10.8. Regex és üzleti szabály határa

Route schema kezelje:

- formátumot;
- karakterkészletet;
- hosszkorlátot;
- egyszerű típustranszformációt;
- alapvető strukturális konzisztenciát.

Application vagy domain réteg kezelje:

- létezést;
- státuszfüggő hozzáférést;
- tenantownershipot;
- időablakot;
- workflow-állapotot;
- domaininvariánst.

### 10.9. ReDoS

Felhasználói inputon használt regex:

- legyen egyszerű;
- ne tartalmazzon kontrollálatlan nested quantifiert;
- legyen hosszkorláttal kombinálva;
- kapjon negatív teszteket;
- ne fusson nagy, kontrollálatlan stringen.

---

## 11. Catch-all, opcionális catch-all és perjelek

### 11.1. Catch-all

```text
src/app/docs/[...segments]/page.tsx
```

```tsx
type DocumentationParams = Readonly<{
  segments: string[];
}>;

export default async function DocumentationPage({
  params,
}: {
  params: Promise<DocumentationParams>;
}) {
  const { segments } = await params;

  return <article>{segments.join('/')}</article>;
}
```

### 11.2. Opcionális catch-all

```text
src/app/docs/[[...segments]]/page.tsx
```

Itt:

```text
/docs
```

esetén a `segments` hiányozhat, más esetben tömb.

```ts
const SegmentsSchema = z.object({
  segments: z.array(z.string()).max(10).optional(),
});
```

### 11.3. Maximum mélység

Catch-all route KÖTELEZŐEN alkalmazzon:

- maximális elemszámot;
- elemenkénti hosszkorlátot;
- engedélyezett karakterkészletet;
- összhosszkorlátot;
- traversal tiltást;
- normalizációt.

```ts
const SafeSegmentSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u)
  .refine((value) => value !== '.' && value !== '..');

const DocumentationPathSchema = z.object({
  segments: z.array(SafeSegmentSchema).min(1).max(8),
});
```

### 11.4. Catch-all nem fájlrendszerpath

TILOS:

```ts
const filePath = path.join(documentRoot, ...segments);
return readFile(filePath);
```

közvetlenül, canonicalization és root containment ellenőrzés nélkül.

Jobb:

```text
route segments
  → dokumentumkulcs
  → application query
  → allowlisted repository/adatforrás
```

### 11.5. Kódolt perjel

A path szegmens percent-decoding viselkedése és a köztes proxyk eltérései miatt a route contract ne támaszkodjon arra, hogy egy kódolt `/` biztonságosan egyetlen paraméterként végighalad.

Hierarchikus adatnál használj catch-all route-ot.

### 11.6. Trailing slash

A projektnek egyetlen globális trailing slash policyja legyen.

Alapértelmezett forma:

```text
/about
```

Opcionális konfiguráció:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  trailingSlash: true,
};

export default nextConfig;
```

A változtatás:

- globális URL-kompatibilitási döntés;
- redirecteket okozhat;
- cache keyt változtathat;
- SEO canonical URL-t érint;
- webhook callback URL-t érinthet;
- signed URL aláírást érvényteleníthet.

Ezért release- és upgrade-dokumentáció szükséges hozzá.

### 11.7. Dupla perjel és normalizáció

Az alkalmazás ne építsen URL-t stringkonkatenációval:

```ts
const href = `${base}/${segment}/${child}`;
```

Helyette URL builder és szegmensenkénti encoding használatos.

---

## 12. Route-prioritás, precedencia és ütközések

### 12.1. Nincs Symfony-szerű integer priority

Symfonyban az egymással átfedő route-oknál explicit priority használható.

A Next.js App Router route-precedenciája fájlrendszeri és frameworkszabályokból következik. Winzardban nincs támogatott:

```ts
priority: 100
```

runtime route-opció.

### 12.2. Statikus és dinamikus route

Példa:

```text
src/app/products/new/page.tsx
src/app/products/[slug]/page.tsx
```

A statikus `/products/new` route elkülönül a dinamikus route-tól.

A route schema ettől függetlenül tilthat rezervált slugokat:

```ts
const RESERVED_PRODUCT_SLUGS = new Set([
  'new',
  'edit',
  'api',
  'admin',
]);

const ProductSlugSchema = z
  .string()
  .refine((slug) => !RESERVED_PRODUCT_SLUGS.has(slug));
```

### 12.3. Route group collision

Nem támogatott:

```text
src/app/(shop)/about/page.tsx
src/app/(marketing)/about/page.tsx
```

Mindkettő:

```text
/about
```

URL-t hozna létre.

### 12.4. Page és Route Handler collision

Nem támogatott ugyanazon szegmensben:

```text
src/app/products/page.tsx
src/app/products/route.ts
```

### 12.5. Több root layout

Route groupokkal több root layout kialakítható. A külön root layoutok közötti navigáció teljes dokumentumreloadot okozhat, ezért:

- E2E teszt szükséges;
- globális state nem feltételezhető;
- analytics és auth bootstrap újrafuthat;
- user experience dokumentálandó.

### 12.6. Rewrite-prioritás

A rewrite-oknak saját feldolgozási fázisuk van:

```text
beforeFiles
afterFiles
fallback
```

TILOS üzleti prioritásként használni őket. A fázis technikai route resolution, nem domain decision engine.

### 12.7. Ambiguitás kerülése

AJÁNLOTT:

```text
/api/v1/products/[id]
/admin/products/[id]
/public/products/[slug]
```

Kerülendő:

```text
/[tenant]/[resource]/[action]/[[...rest]]
```

ha a route contract csak futásidőben tudja eldönteni, mi mit jelent.

A túl generikus route:

- gyenge typed route támogatást ad;
- nehéz cache policyt rendelni;
- nehéz auth scope-ot meghatározni;
- rossz hibaválaszokat eredményez;
- könnyen elfedi a 404-eket;
- route inventoryban kevéssé informatív.

---

## 13. Paraméterkonverzió és erőforrás-feloldás

### 13.1. Symfony param converter megfelelője

Symfonyban a route-paraméterből gyakran automatikusan entity vagy value object készül.

Winzardban az automatikus ORM-entity injection nem támogatott. A támogatott folyamat:

```text
raw route param
  ↓
operation schema
  ↓
application input
  ↓
query vagy command
  ↓
repository port
  ↓
DTO / domain result
```

### 13.2. Miért nincs automatikus Prisma record?

A Prisma record közvetlen átadása a page-nek vagy Route Handlernek:

- ORM-függést visz a delivery rétegbe;
- megkerüli a policyt;
- túl sok mezőt szivárogtathat;
- összekeveri a persistence és domain identitást;
- nehézzé teszi a cache- és tenantpolicyt;
- veszélyes Client Component propot eredményezhet.

### 13.3. HTML-route példa

```tsx
// src/app/products/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { catalogModule } from '@/composition/catalog';
import { ProductDetailView } from '@/modules/catalog/product/presentation/product-detail-view';

const ParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
});

export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const parsed = ParamsSchema.safeParse(await params);

  if (!parsed.success) {
    notFound();
  }

  const product = await catalogModule.queries.getProductBySlug.execute({
    slug: parsed.data.slug,
  });

  if (!product) {
    notFound();
  }

  return <ProductDetailView product={product} />;
}
```

### 13.4. API-route példa

```ts
export async function GET(
  _request: Request,
  context: RouteContext<'/api/products/[id]'>,
): Promise<Response> {
  const parsed = ProductIdParamsSchema.safeParse(await context.params);

  if (!parsed.success) {
    return Response.json(
      { code: 'INVALID_PRODUCT_ID' },
      { status: 400 },
    );
  }

  const product = await catalogModule.queries.getProduct.execute({
    id: parsed.data.id,
  });

  if (!product) {
    return Response.json(
      { code: 'PRODUCT_NOT_FOUND' },
      { status: 404 },
    );
  }

  return Response.json(product);
}
```

### 13.5. Lookup és authorizáció sorrendje

Érzékeny erőforrásnál két tipikus policy létezik.

#### Létezés után policy

```text
lookup
→ policy
→ result
```

Előnye: részletes belső diagnosztika.

Kockázata: existence oracle.

#### Tenant/policy scope-pal együtt lookup

```text
Actor + tenant + ID
→ authorized repository query
→ result vagy not found
```

Előnye: kevésbé szivárogtat létezési információt.

A választást security specification rögzítse.

### 13.6. Composite key

```text
/shops/[shopSlug]/orders/[orderNumber]
```

A query input:

```ts
type GetOrderInput = Readonly<{
  actor: Actor;
  shopSlug: string;
  orderNumber: string;
}>;
```

A repository port ne csak `orderNumber` alapján keressen, ha a route tenant- vagy shop-scope-ot fejez ki.

### 13.7. Canonical slug

Ha egy erőforrás slugja megváltozott, a query visszaadhat canonical route adatot:

```ts
type ProductRouteResolution =
  | Readonly<{
      kind: 'found';
      product: ProductDetailDto;
      canonicalSlug: string;
    }>
  | Readonly<{
      kind: 'not-found';
    }>;
```

A page:

```tsx
if (result.kind === 'not-found') {
  notFound();
}

if (result.canonicalSlug !== parsed.data.slug) {
  permanentRedirect(productUrls.detail(result.canonicalSlug));
}
```

Az átirányítás decisionje lehet application eredmény, de maga a `permanentRedirect()` Next.js delivery mapping.

### 13.8. Batch route paraméter

```text
/products/compare/[...ids]
```

Nem ajánlott korlátlan ID-listára. KÖTELEZŐ:

- elemszámkorlát;
- egyedi értékek;
- formátumvalidáció;
- request URL-hossz figyelembevétele;
- stabil rendezés;
- authorizáció minden elemre;
- részleges hibák contractja.

---

## 14. Enumok és domainértékek route-paraméterként

### 14.1. String enum schema

```ts
const ProductStatusSchema = z.enum([
  'draft',
  'active',
  'archived',
]);

type ProductStatus = z.infer<typeof ProductStatusSchema>;
```

Route:

```text
/admin/products/status/[status]
```

### 14.2. TypeScript enum helyett string union

Publikus URL-hez AJÁNLOTT stabil stringértékeket használni:

```ts
const ORDER_VIEWS = [
  'all',
  'open',
  'completed',
  'cancelled',
] as const;

type OrderView = (typeof ORDER_VIEWS)[number];
```

A numerikus enum:

```text
/status/2
```

kevésbé olvasható és könnyebben törik enum-átrendezéskor.

### 14.3. Backed enum megfeleltetés

A Symfony backed enum konverziójának Winzard megfelelője:

```ts
const LanguageSchema = z.enum(['hu', 'en', 'de']);

const parsed = LanguageSchema.safeParse(rawLang);

if (!parsed.success) {
  notFound();
}

const language = parsed.data;
```

### 14.4. Domain value object

Az application réteg készíthet value objectet:

```ts
export class ProductSlug {
  private constructor(readonly value: string) {}

  static create(value: string): ProductSlug {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
      throw new InvalidProductSlugError(value);
    }

    return new ProductSlug(value);
  }
}
```

A route schema továbbra is használható korai, biztonságos inputvalidációra. A domain value object az üzleti invariánst birtokolja.

### 14.5. URL-stabilitás

Publikus enumérték megváltoztatása:

```text
/completed
  → /fulfilled
```

routing breaking change.

Kötelező:

- alias vagy redirect;
- canonical URL frissítés;
- sitemap frissítés;
- URL-builder frissítés;
- route contract deprecation;
- E2E teszt;
- analytics mapping;
- signed URL hatásvizsgálat.

### 14.6. Ismeretlen enumérték

HTML-oldalnál általában:

```ts
notFound();
```

API-nál:

```json
{
  "code": "UNSUPPORTED_ORDER_VIEW",
  "allowed": ["all", "open", "completed", "cancelled"]
}
```

A válaszban az allowlist csak akkor adható vissza, ha nem biztonságérzékeny.

---

## 15. Speciális route-paraméterek Symfony és Winzard között

### 15.1. `_controller`

Symfonyban a route `_controller` defaultja kijelölheti a végrehajtandó controllert.

Next.js-ben a controller megfelelőjét a fájlrendszer választja ki:

```text
page.tsx
route.ts
```

Winzardban TILOS requestből vagy route metadatából tetszőleges module pathot importálni vagy végrehajtandó handlernevet feloldani.

### 15.2. `_route`

Symfonyban az aktuális route neve request attribútumként elérhető.

Next.js-ben nincs általános, stabil, Symfony-szerű route-név. Használható:

- kliensen `usePathname()`;
- kliensen `useParams()`;
- page vagy layout `params`;
- Route Handler `RouteContext`;
- dokumentációs route contract ID;
- request correlation context.

A route contract ID nem feltétlenül áll rendelkezésre runtime-on. Ha auditban szükséges, a delivery adapter explicit konstansként adja át:

```ts
const ROUTE_CONTRACT = 'ATLAS-ROUTE-012';

audit.log({
  routeContract: ROUTE_CONTRACT,
  // ...
});
```

Ez dokumentációs/audit azonosító, nem route matcher.

### 15.3. `_route_params`

A Next.js megfelelője:

```text
params
```

és külön:

```text
searchParams
request.nextUrl.searchParams
```

A kettőt TILOS összemosni, mert eltérő cache-, typing- és canonical URL jelentésük van.

### 15.4. `_locale`

Winzardban a locale forrása lehet:

- `[lang]` route szegmens;
- locale cookie;
- user preference;
- tenant default;
- `Accept-Language`;
- domain vagy subdomain;
- Proxy által normalizált header.

A canonical locale-t explicit locale resolver állítsa elő. A raw header nem domainérték.

### 15.5. `_format`

Symfonyban `_format` gyakran response formátumot választ.

Winzard alapértelmezés:

- HTML: `page.tsx`;
- JSON/API: `route.ts`, jellemzően `/api`;
- fájlformátum: külön Route Handler vagy explicit végpont;
- content negotiation: csak dokumentált API-contract mellett.

Kerülendő:

```text
/products/42.html
/products/42.json
```

ha nincs valódi kompatibilitási igény.

Ha szükséges:

```text
/products/[id]/export/[format]
```

vagy:

```text
/api/products/[id]?format=csv
```

műveletspecifikus allowlisttel.

### 15.6. `_fragment`

A URL fragment:

```text
/products#pricing
```

nem része a szervernek küldött HTTP requestnek.

A szerveroldali route nem validálhatja és nem használhatja authorizációra.

Fragmentet kliensoldali navigáció vagy UI state használhat:

```tsx
<Link href="/products#pricing">Árazás</Link>
```

### 15.7. `_stateless`

Nincs egyetlen Winzard vagy Next.js boolean, amely önmagában garantálja a stateless viselkedést.

A stateless contract több szabályból áll:

```text
nincs sessionfüggés
nincs user-specific shared cache
nincs implicit cookie mutation
explicit Cache-Control
idempotens safe metódusok
Actor forrása dokumentált
```

### 15.8. `_canonical_route`

A Winzard route contract opcionálisan kijelölhet canonical buildert:

```ts
export const productRouteContract = {
  id: 'ATLAS-ROUTE-012',
  canonical: productUrls.detail,
} as const;
```

Ez továbbra sem runtime route registry.

---

## 16. Query string, defaultok és kanonikus keresési szerződés

### 16.1. Page `searchParams`

Next.js 16-ban a page `searchParams` értéke aszinkron:

```tsx
export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  const raw = await searchParams;

  return <pre>{JSON.stringify(raw)}</pre>;
}
```

A `searchParams` használata request-time viselkedést válthat ki, ezért cache- és renderinghatása van.

### 16.2. Route Handler query

```ts
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest): Response {
  const query = request.nextUrl.searchParams.get('query');

  return Response.json({ query });
}
```

### 16.3. Műveletspecifikus query schema

```ts
const ProductListSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', '-name', 'createdAt', '-createdAt']).default('name'),
});
```

### 16.4. `URLSearchParams` átalakítása

```ts
function searchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    result[key] = values.length === 1 ? values[0] ?? '' : values;
  }

  return result;
}
```

A duplikált query kulcsok contractját explicit kezelni kell.

### 16.5. Page search param shape

Page esetén a framework olyan értéket adhat, ahol egy kulcs:

```text
string
string[]
undefined
```

A schema ennek megfelelő adaptert kapjon; ne feltételezzen kizárólag stringet.

### 16.6. Defaultok helye

Két defaulttípust különböztess meg.

#### Transport default

Például hiányzó `page`:

```text
page = 1
```

Ez operation schema része lehet.

#### Üzleti default

Például:

```text
a user alapértelmezett warehouse-a
a tenant default currency-je
a policy szerint elérhető első státusz
```

Ez application vagy domain réteg feladata.

### 16.7. Unknown query paraméter

AJÁNLOTT döntések:

- publikus keresőoldal: figyelmen kívül hagyhat, ha kompatibilitási ok indokolja;
- admin/API: szigorúan elutasíthat;
- signed URL: minden paraméter az aláírás része legyen;
- cache key: csak canonicalizált, ismert paraméterek kerüljenek bele.

A választást a route contract rögzítse.

### 16.8. Query canonicalization

Canonical query sorrend:

```text
query
status
sort
page
pageSize
```

Példa builder:

```ts
function productListPath(
  input: Readonly<{
    query?: string;
    status?: 'active' | 'archived';
    page?: number;
    pageSize?: number;
    sort?: 'name' | '-name' | 'createdAt' | '-createdAt';
  }> = {},
): string {
  const params = new URLSearchParams();

  if (input.query) params.set('query', input.query);
  if (input.status) params.set('status', input.status);
  if (input.sort && input.sort !== 'name') params.set('sort', input.sort);
  if (input.page && input.page !== 1) params.set('page', String(input.page));
  if (input.pageSize && input.pageSize !== 25) {
    params.set('pageSize', String(input.pageSize));
  }

  const query = params.toString();

  return query ? `/products?${query}` : '/products';
}
```

Defaultértéket nem szükséges minden canonical URL-be kiírni.

### 16.9. Query string és secretek

TILOS query stringben:

- access tokent;
- API keyt;
- session secretet;
- személyes azonosítót szükségtelenül;
- jelszóreset plaintext tokent logvédelem nélkül;
- production credentialt

továbbítani.

A query string gyakran megjelenik:

- browser historyban;
- logban;
- analyticsben;
- Referer headerben;
- monitoringban;
- screenshoton.

### 16.10. Filter állapot és UI

A URL-be való állapot jó jelölt, ha:

- megosztható;
- bookmarkolható;
- visszaállítható;
- nem érzékeny;
- stabil contract.

Klienslokális state jobb, ha:

- átmeneti;
- nagy;
- nem sorosítható;
- érzékeny;
- nem része a navigáció jelentésének.

---

## 17. Route groupok, prefixek, layoutok és base path

### 17.1. Route group

```text
src/app/
  (public)/
    products/
      page.tsx
  (admin)/
    admin/
      products/
        page.tsx
```

Publikus URL-ek:

```text
/products
/admin/products
```

A route group neve nem kerül az URL-be.

### 17.2. Symfony route prefix megfelelője

Symfonyban route-csoporthoz prefix rendelhető.

Next.js-ben a publikus prefix közönséges mappa:

```text
src/app/admin/products/page.tsx
```

A `/admin` prefix a route tree része.

A route group:

```text
src/app/(admin)/products/page.tsx
```

nem hoz létre `/admin` prefixet.

### 17.3. Közös layout

```tsx
// src/app/admin/layout.tsx
export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <section>
      <AdminNavigation />
      {children}
    </section>
  );
}
```

A layout közös presentation context, nem globális application singleton.

### 17.4. Prefix és policy

Az `/admin` prefix önmagában nem authorizáció.

Kötelező:

```text
URL prefix
+ Actor
+ policy
+ use-case authorization
```

A UI layout elrejthet navigációt, de nem véd adatot.

### 17.5. Prefix változtatása

```text
/admin
  → /backoffice
```

érint:

- linkeket;
- bookmarkokat;
- redirecteket;
- Proxy matchereket;
- auth callbacket;
- CSP/navigation policyt;
- E2E teszteket;
- analytics dashboardot;
- sitemapot;
- documentation route contractot.

Kompatibilitási redirect szükséges lehet.

### 17.6. `basePath`

Ha az egész alkalmazás subpath alatt fut:

```ts
const nextConfig: NextConfig = {
  basePath: '/atlas',
};
```

A publikus alkalmazás URL-je például:

```text
https://example.com/atlas/products
```

A `basePath` build-time érték; megváltoztatásához új build szükséges.

### 17.7. Base path és URL builder

Belső navigationhez `Link` használata AJÁNLOTT:

```tsx
<Link href="/products">Termékek</Link>
```

A Next.js a konfigurált base pathot kezeli.

Kézzel generált abszolút URL-nél az alkalmazás publikus origin- és base-path contractját egy helyen kell kezelni.

### 17.8. Assetek

`basePath` mellett az asset URL-ek és külső szolgáltatások callbackjei külön ellenőrzést igényelhetnek. Ne feltételezd, hogy minden nyers string URL automatikusan prefixet kap.

### 17.9. Több alkalmazás egy domainen

Ha több Next.js app osztozik:

```text
/example-a
/example-b
```

prefixen, a routing contractnak rögzítenie kell:

- ownershipot;
- cross-app navigációt;
- cookie pathot;
- auth callbacket;
- CSP-t;
- shared hostname-et;
- reverse proxy rewrites szabályt;
- canonical URL-t.

---

## 18. Route-aliasok és visszafelé kompatibilis URL-ek

### 18.1. Symfony route alias megfelelője

A Symfony route alias route-névre ad kompatibilitást.

Next.js-ben két külön kompatibilitás létezik:

1. **URL-kompatibilitás**: régi path átirányítása vagy rewrite-ja;
2. **kódszintű builder-kompatibilitás**: régi TypeScript export delegál az új builderre.

### 18.2. Régi URL átirányítása

```ts
// next.config.ts
const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/catalog/:slug',
        destination: '/products/:slug',
        permanent: true,
      },
    ];
  },
};
```

### 18.3. Builder alias

```ts
export const productUrls = {
  detail(slug: string): Route {
    return `/products/${encodeURIComponent(slug)}` as Route;
  },
} as const;

/**
 * @deprecated Használd a productUrls.detail függvényt.
 */
export function catalogProductPath(slug: string): Route {
  return productUrls.detail(slug);
}
```

### 18.4. Dokumentációs alias

Route contract:

```yaml
id: ATLAS-ROUTE-012
canonical_pattern: /products/[slug]
aliases:
  - /catalog/[slug]
deprecated_aliases:
  - pattern: /catalog/[slug]
    removal_release: "3.0.0"
```

Ez csak dokumentációs contract. A redirectet külön `next.config.ts` vagy Proxy valósítja meg.

### 18.5. Alias deprecáció

Kötelező rögzíteni:

- bevezetés dátuma;
- canonical destination;
- redirect státuszkód;
- query továbbítás;
- fragment kliensoldali hatása;
- eltávolítási release;
- telemetry;
- külső integrációk;
- signed URL kompatibilitás.

### 18.6. Permanent vagy temporary?

Általános irány:

- tartós URL-migráció: permanent redirect;
- ideiglenes karbantartás vagy rollout: temporary redirect;
- auth flow és POST utáni navigáció: use-case-specifikus redirect.

A böngészők és köztes cache-ek a permanent redirectet agresszívan megjegyezhetik. Teszt és rolloutterv szükséges.

### 18.7. Alias ciklus

TILOS:

```text
/a -> /b
/b -> /a
```

és kerülendő:

```text
/a -> /b -> /c -> /d
```

A redirect chain:

- növeli latencyt;
- cache-bizonytalanságot okoz;
- SEO-t ronthat;
- signed queryt elveszíthet;
- monitoringot zajosít.

A régi alias lehetőleg közvetlenül a végső canonical URL-re mutasson.

---

## 19. Átirányítások

### 19.1. Átirányítási mechanizmusok

Winzard projektben több redirect felület létezik:

| Mechanizmus | Tipikus használat |
| --- | --- |
| `redirect()` | Renderelés vagy Server Function közbeni ideiglenes navigáció |
| `permanentRedirect()` | Canonical URL tartós változása |
| `next.config.ts#redirects()` | Statikus, nagy volumenű kompatibilitási redirect |
| `proxy.ts` | Requestfüggő, host-, header-, cookie- vagy locale-alapú redirect |
| `Response.redirect()` | Route Handler vagy Proxy közvetlen Web Response |
| Kliensrouter | Felhasználói interakció utáni kliensoldali navigáció |

### 19.2. `redirect()`

```tsx
import { redirect } from 'next/navigation';

export default async function LegacyAccountPage() {
  redirect('/account/profile');
}
```

A `redirect()` control-flow megszakítás. Ne helyezd olyan `try/catch` blokkba, amely véletlenül application errornak tekinti.

### 19.3. `permanentRedirect()`

```tsx
import { permanentRedirect } from 'next/navigation';

export default async function ProductPage({
  params,
}: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const resolution = await resolveProductRoute(slug);

  if (resolution.kind === 'moved') {
    permanentRedirect(productUrls.detail(resolution.canonicalSlug));
  }

  // ...
}
```

### 19.4. POST utáni redirect

Form vagy Server Action után a redirect a Post/Redirect/Get flow része lehet.

Követelmények:

- a command sikeresen commitoljon;
- a redirect URL csak biztonságos outputból épüljön;
- user-controlled external URL ne legyen elfogadva;
- cache invalidation a redirect előtt történjen;
- retry és idempotencia contract legyen tiszta.

### 19.5. Open redirect

Nem támogatott:

```ts
redirect(searchParams.returnTo as string);
```

Biztonságos relatív cél:

```ts
function safeInternalReturnPath(
  value: unknown,
  fallback: Route,
): Route {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;

  let parsed: URL;

  try {
    parsed = new URL(value, 'https://internal.invalid');
  } catch {
    return fallback;
  }

  if (parsed.origin !== 'https://internal.invalid') {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}` as Route;
}
```

Érzékeny flow esetén explicit allowlist vagy signed state jobb.

### 19.6. Query továbbítása

Redirectnél tudatosan döntsd el:

- mely query kulcsok maradnak;
- melyek dobódnak el;
- van-e PII;
- részei-e az aláírásnak;
- canonical URL tartalmazza-e;
- tracking paraméterek megmaradnak-e.

Nem ajánlott a teljes query string vak továbbítása.

### 19.7. Fragment

A fragmentet a szerver nem kapja meg. Szerveroldali redirect nem tudja megbízhatóan megőrizni a bejövő fragmentet, ha azt a request nem tartalmazza.

Kliensoldali linkben explicit megadható:

```tsx
<Link href="/docs/routing#signed-urls">Aláírt URL-ek</Link>
```

### 19.8. Redirect és HTTP-metódus

Redirectnél vizsgálni kell:

- megmarad-e az eredeti metódus;
- GET-re vált-e a kliens;
- body újraküldhető-e;
- cache-elhető-e;
- webhook követi-e;
- browser és API-client azonosan kezeli-e.

Nem szabad csak a „temporary/permanent” címkéből levezetni az üzleti biztonságot.

### 19.9. Redirect megfigyelés

Deprecated URL-ekhez AJÁNLOTT mérni:

```text
hit count
user agent
referrer domain
tenant
utolsó használat
redirect target
response status
```

PII és request query redaction mellett.

### 19.10. Redirect eltávolítása

Alias csak akkor távolítható el, ha:

- deprecation időszak lejárt;
- telemetry szerint elfogadható;
- külső callbackek frissültek;
- sitemap és canonical link friss;
- dokumentáció friss;
- support és release notes tájékoztat;
- rollback ismert.

---

## 20. Rewrite-ok és maszkolt célútvonalak

### 20.1. Rewrite jelentése

Rewrite esetén a böngészőben látható URL eltérhet a tényleges kiszolgáló route-tól.

```text
visible:    /legacy-products/42
internal:   /products/42
```

### 20.2. `next.config` példa

```ts
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/legacy-products/:id',
        destination: '/products/:id',
      },
    ];
  },
};
```

### 20.3. External rewrite

```ts
{
  source: '/support/:path*',
  destination: 'https://support.example.com/:path*',
}
```

Ilyen esetben rögzíteni kell:

- upstream ownership;
- timeout;
- authentication;
- header forwarding;
- cookie isolation;
- body limit;
- CORS;
- CSP;
- observability;
- fallback;
- adatbesorolás;
- URL canonicalization.

### 20.4. Rewrite és canonical URL

Mivel a látható URL változatlan maradhat, explicit canonical metadata lehet szükséges:

```tsx
export const metadata: Metadata = {
  alternates: {
    canonical: '/products',
  },
};
```

A canonical URL-t nem szabad felhasználói Host headerből generálni.

### 20.5. Rewrite és auth

Egy rewrite másik route-ra viszi a requestet, de nem garantál authorizációt.

Kötelező:

```text
Proxy vagy rewrite
+ cél route Actor feloldása
+ application policy
```

### 20.6. Rewrite és cache

A cache key a látható és belső URL, hosting platform és response header függvényében eltérhet. Tesztelendő:

- két alias ugyanazt a cache entryt használja-e;
- tenant host része-e a keynek;
- user-specific válasz shared cache-be kerülhet-e;
- Vary header megfelelő-e;
- invalidation mindkét URL-t érinti-e.

### 20.7. Rewrite és logging

Auditban AJÁNLOTT rögzíteni:

```text
original URL
normalized URL
rewrite destination
route contract ID
tenant
correlation ID
```

Secret és teljes érzékeny query nélkül.

### 20.8. `beforeFiles`, `afterFiles`, `fallback`

A rewrite-fázisok külön jelentése:

- `beforeFiles`: filesystem route előtt is fut;
- `afterFiles`: statikus route-próba után;
- `fallback`: végső fallback a route tree sikertelensége után.

Minél későbbi és általánosabb a fallback, annál nagyobb a veszélye, hogy:

- valós 404-et elfed;
- hibás API-t más backendhez küld;
- typo URL-t sikeresnek mutat;
- security boundaryt átlép;
- monitoringban eltűnik a hibaarány.

### 20.9. Rewrite helyett redirect

Redirect AJÁNLOTT, ha:

- publikus URL végleg változott;
- SEO canonicalizáció kell;
- kliensnek tudnia kell az új helyet;
- bookmark frissüljön;
- API contract új endpointot jelöl.

Rewrite AJÁNLOTT, ha:

- reverse proxy jellegű integráció kell;
- fokozatos migráció során a publikus URL változatlan;
- A/B vagy locale routing technikai okból szükséges;
- backend for frontend elfedi a szolgáltatást.

### 20.10. Rewrite dokumentáció

Minden nem triviális rewrite kapjon route contractot vagy architecture specificationt:

```text
source pattern
destination
phase
conditions
canonical URL
auth boundary
cache policy
observability
failure mode
owner
removal plan
```

---

## 21. Feltételes route-kezelés és Proxy

### 21.1. `proxy.ts`

Next.js 16-ban a korábbi `middleware` konvenció neve `proxy`.

Elhelyezés:

```text
src/proxy.ts
```

ha az alkalmazás `src/app` szerkezetű.

### 21.2. Egyszerű Proxy

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/old-dashboard') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/old-dashboard', '/dashboard/:path*'],
};
```

### 21.3. Matcher konstans legyen

A matchernek statikusan elemezhető értéknek kell lennie.

Támogatott:

```ts
export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
};
```

Nem ajánlott dinamikusan envből építeni:

```ts
const prefix = process.env.ADMIN_PREFIX;

export const config = {
  matcher: [`${prefix}/:path*`],
};
```

### 21.4. Headerfeltétel

```ts
export const config = {
  matcher: [
    {
      source: '/preview/:path*',
      has: [
        {
          type: 'header',
          key: 'x-preview-mode',
          value: 'enabled',
        },
      ],
    },
  ],
};
```

A header jelenléte nem authorizáció. Aláírás, session, Actor és policy továbbra is szükséges lehet.

### 21.5. Cookie-feltétel

```ts
export const config = {
  matcher: [
    {
      source: '/onboarding/:path*',
      missing: [
        {
          type: 'cookie',
          key: 'onboarding-complete',
        },
      ],
    },
  ],
};
```

A kliens által írható cookie nem megbízható biztonsági döntés.

### 21.6. Query-feltétel

```ts
export const config = {
  matcher: [
    {
      source: '/campaign',
      has: [
        {
          type: 'query',
          key: 'source',
          value: 'partner',
        },
      ],
    },
  ],
};
```

A matcher technikai requestválasztás, nem üzleti jogosultság.

### 21.7. Negative matcher

```ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
```

Minden negatív matcherhez tesztelendő:

- API route;
- statikus asset;
- image optimizer;
- metadata route;
- Server Function request;
- lokalizált URL;
- base path;
- trailing slash;
- encoded path.

### 21.8. Proxy és security

Proxy használható coarse-grained előszűrésre:

```text
nincs session cookie
→ login redirect
```

De a célroute-ban szükséges:

```text
session hitelesítés
→ Actor
→ policy
→ use case
```

A támadó közvetlenül, más deployment pathon, stale matcherrel vagy refaktor után is elérheti a route-ot.

### 21.9. Proxy és megosztott state

Proxy ne támaszkodjon process-global mutable state-re:

```ts
const cache = new Map();
```

A deployment platform külön invokációkat, régiókat vagy runtime környezetet használhat.

### 21.10. Proxy és adatbázis

NEM AJÁNLOTT minden requestnél adatbázist hívni Proxyból. Inkább:

- rövid, hitelesített cookie claim;
- edge-kompatibilis session lookup;
- coarse-grained routing;
- route/use-case szintű részletes policy;
- cache-elt tenant domain map;
- explicit availability fallback.

### 21.11. Proxy response

Proxy:

- folytathatja a requestet;
- átirányíthat;
- rewrite-olhat;
- response headert állíthat;
- request headert adhat a downstreamnak;
- közvetlen response-t adhat.

A downstream header neveket namespacelni kell:

```text
x-winzard-request-id
x-winzard-normalized-host
x-winzard-locale
```

A downstream nem bízhat vakon olyan headerben, amelyet a külső kliens is beállíthat. Az ingressnek vagy Proxy-nak előbb törölnie/újraírnia kell.

### 21.12. Route condition üzleti logikával

Symfony expression conditionök összetett requestfeltételeket tudnak használni.

Winzardban a felosztás:

```text
transportfeltétel
  → Proxy/matcher

inputfeltétel
  → Zod schema

jogosultság
  → policy

üzleti állapot
  → application/domain

response negotiation
  → delivery adapter
```

TILOS minden feltételt Proxyba sűríteni.

---

## 22. Környezetspecifikus útvonalak

### 22.1. Symfony környezeti route megfelelője

Symfony route konfiguráció környezethez köthető.

Next.js fájlrendszeres route esetén egy committed `page.tsx` vagy `route.ts` a build route tree része lehet akkor is, ha runtime env alapján 404-et ad.

### 22.2. Runtime 404 nem route-hiány

```tsx
export default function DebugPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <DebugPanel />;
}
```

Ez nem ugyanaz, mint hogy a route nincs a production buildben.

Kockázatok:

- route inventoryban megjelenhet;
- bundle tartalmazhat debug kódot;
- matcher lefedi;
- source map vagy build artifact szivárogtathat;
- hibás env konfiguráció publikálhatja;
- teszt kihagyhatja.

### 22.3. Valóban dev-only route

Biztonságérzékeny dev route esetén AJÁNLOTT:

- külön development app;
- külön template/capability;
- build előtt materializált source;
- külön package;
- hosting/platform szintű hozzáférés;
- nem production branchre kerülő fixture;
- explicit internal auth.

### 22.4. Feature flag route

Feature flag alapján lehet:

1. route létezik, de UI nem linkeli;
2. route létezik, de policy 404/403;
3. Proxy redirectel;
4. route külön deploymentben van;
5. build-time capability választja ki.

A route contractnak meg kell mondania, melyik.

### 22.5. Preview route

Preview route követelményei:

- strong authentication;
- no-store;
- noindex;
- explicit tenant scope;
- audit;
- lejáró hozzáférés;
- production data redaction;
- query token helyett cookie vagy header;
- public sitemapből kizárás.

### 22.6. Health route környezetenként

Liveness általában minden deploymentben létezhet.

Database readiness csak aktív database capability mellett.

Debug vagy diagnostics route ne legyen automatikusan publikus productionben.

### 22.7. Build-time env

Route tree-t befolyásoló build-time konfiguráció változtatása:

- új buildet igényel;
- artifact-identitás része;
- release manifestben szerepeljen;
- preview és production között driftet okozhat;
- reprodukálható CI-t igényel.

### 22.8. Környezeti ellenőrzés

E2E mátrix:

```text
development
test
preview
staging
production
```

legalább a kritikus route-oknál ellenőrizze:

```text
létezik-e
status
auth
cache
robots/noindex
redirect
headers
```

---

## 23. Host-, subdomain- és tenantfüggő routing

### 23.1. Host-alapú route

Példa:

```text
admin.example.com
app.example.com
tenant-a.example.com
```

A Next.js route tree önmagában pathot old fel. Hostfüggő döntés Proxyban vagy application tenant resolverben készülhet.

### 23.2. Host normalizálása

```ts
function normalizeHost(raw: string | null): string | null {
  if (!raw) return null;

  const withoutPort = raw.toLowerCase().replace(/:\d+$/u, '');

  if (!/^[a-z0-9.-]+$/u.test(withoutPort)) {
    return null;
  }

  return withoutPort;
}
```

IPv6, punycode, proxy és platform sajátosságai miatt productionben robusztus, tesztelt resolver szükséges.

### 23.3. Host allowlist

```ts
const PUBLIC_HOSTS = new Set([
  'app.example.com',
  'admin.example.com',
]);

if (!PUBLIC_HOSTS.has(host)) {
  return new Response('Unknown host', { status: 421 });
}
```

Dinamikus tenant domain esetén repository vagy cache-alapú mapping lehet szükséges.

### 23.4. Tenant subdomain

```text
{tenant}.example.com/products
```

A Proxy normalizált tenant slugot továbbíthat:

```ts
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-winzard-tenant-slug', tenantSlug);

return NextResponse.next({
  request: {
    headers: requestHeaders,
  },
});
```

A downstreamnak biztosítania kell, hogy a külső kliens eredeti `x-winzard-tenant-slug` headerét a Proxy eltávolította vagy felülírta.

### 23.5. Tenant nem csak route paraméter

A tenant context:

```text
host/path/header
→ tenant resolver
→ canonical TenantId
→ Actor tenant memberships
→ policy
→ repository scope
```

TILOS pusztán:

```ts
where: { tenantSlug: params.tenant }
```

alapján authorizálni.

### 23.6. Custom domain

Tenant custom domain:

```text
shop.customer-domain.example
```

contractja tartalmazza:

- DNS ownership verification;
- TLS;
- domain canonicalization;
- alias domain redirect;
- cookie domain;
- auth callback;
- signed URL origin;
- cache partition;
- domain removal grace period;
- takeover elleni védelem.

### 23.7. Admin subdomain

```text
admin.example.com
```

nem authorizáció. Az admin route use case továbbra is role/policy checket végez.

### 23.8. Host és abszolút URL

TILOS közvetlenül:

```ts
const url = new URL('/reset-password', `https://${headers().get('host')}`);
```

használni, ha a Host nincs trusted proxy és allowlist alapján validálva.

### 23.9. Domain redirect

```text
www.example.com
  → example.com
```

tartós redirectként kezelhető.

A path és támogatott query paraméterek megőrzése tesztelendő.

### 23.10. Cache partition

Tenant host vagy tenant ID minden olyan cache key része legyen, ahol ugyanaz a path több tenant eltérő adatát adja.

TILOS:

```ts
cache.get(`/products/${id}`)
```

ha az ID csak tenanton belül egyedi.

---

## 24. Lokalizált és nemzetköziesített routing

### 24.1. Locale szegmens

```text
src/app/[lang]/layout.tsx
src/app/[lang]/page.tsx
src/app/[lang]/products/page.tsx
```

Példa URL-ek:

```text
/hu/products
/en/products
/de/products
```

### 24.2. Locale schema

```ts
export const SUPPORTED_LOCALES = [
  'hu',
  'en',
  'de',
] as const;

export const LocaleSchema = z.enum(SUPPORTED_LOCALES);

export type Locale = z.infer<typeof LocaleSchema>;
```

### 24.3. Locale layout

```tsx
import { notFound } from 'next/navigation';

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  const parsed = LocaleSchema.safeParse(lang);

  if (!parsed.success) {
    notFound();
  }

  return (
    <html lang={parsed.data}>
      <body>{children}</body>
    </html>
  );
}
```

Ha a root layout nem itt található, a tényleges több-root-layout szerkezetet külön kell kialakítani és tesztelni.

### 24.4. Locale feloldási sorrend

Javasolt precedence:

```text
explicit URL locale
→ user preference
→ tenant default
→ signed invitation locale
→ locale cookie
→ Accept-Language
→ application default
```

A pontos sorrend product specification része.

### 24.5. Locale redirect Proxyban

```ts
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (hasSupportedLocalePrefix(pathname)) {
    return NextResponse.next();
  }

  const locale = resolvePreferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;

  return NextResponse.redirect(url);
}
```

Kizárandó:

```text
/api
/_next
/static assetek
robots
sitemap
well-known
auth callbackek, ha provider contractja más
```

### 24.6. Lokalizált slugok

Két modell:

#### Azonos slug minden nyelven

```text
/hu/products/red-shoe
/en/products/red-shoe
```

#### Fordított slug

```text
/hu/termekek/piros-cipo
/en/products/red-shoe
```

A másodikhoz külön route mapping és canonical slug resolver szükséges. Nem ajánlott route-fájlok tömeges duplikációja.

### 24.7. Lokalizált route builder

```ts
export const localizedProductUrls = {
  list(locale: Locale): Route {
    return `/${locale}/products` as Route;
  },

  detail(locale: Locale, slug: string): Route {
    return `/${locale}/products/${encodeURIComponent(slug)}` as Route;
  },
} as const;
```

### 24.8. `generateStaticParams`

```ts
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}
```

Dinamikus tartalomnál locale és tartalomparaméter kombinációjának buildmérete vizsgálandó.

### 24.9. `hreflang` és canonical

Lokalizált oldalak metadata contractja kezelje:

- canonical URL;
- language alternates;
- default locale;
- region-specifikus locale;
- nem indexelendő preview;
- hiányzó fordítás fallbackje;
- átirányított locale.

### 24.10. Locale cookie

Locale cookie:

- ne legyen auth credential;
- legyen megfelelő SameSite;
- dokumentált expiry;
- szükség szerint Secure;
- consent policy szerint kezelendő;
- URL-ben megadott locale általában írja felül.

### 24.11. Domain-alapú locale

```text
example.hu
example.de
example.com
```

a host- és locale routing kombinációja. Különösen fontos:

- domain allowlist;
- canonical origin;
- cookie scope;
- auth callback;
- sitemap;
- signed URL host;
- tenant és locale feloldási sorrend.

### 24.12. API-lokalizáció

API-knál AJÁNLOTT különválasztani:

- gépi hibakód;
- emberi lokalizált message;
- locale forrása;
- log nyelve;
- domainadat lokalizációja.

A stabil API contract ne kizárólag lokalizált szövegre épüljön.

---

## 25. Stateless működés, rendering és cache

### 25.1. Symfony stateless route megfelelője

Symfonyban route jelölhető statelessként.

Winzardban a stateless route contract explicit tulajdonságok összessége.

### 25.2. Stateless minimum

Egy route statelessként csak akkor dokumentálható, ha:

- nem olvas szerveroldali sessiont;
- nem ír sessiont;
- nem támaszkodik process memóriára;
- minden szükséges identity requestből vagy hitelesített tokenből származik;
- cache policy explicit;
- cookie side effect explicit vagy nincs;
- retry viselkedés dokumentált;
- horizontálisan skálázható;
- application use case nem feltételez sticky sessiont.

### 25.3. Stateless nem jelent publicot

Egy Bearer tokenes API stateless lehet, miközben erősen védett.

Egy cookie nélküli webhook stateless lehet, miközben HMAC aláírást igényel.

### 25.4. Static, dynamic és request-time

A route három külön kérdést kezel:

1. mikor renderelődik;
2. hol cache-elhető;
3. milyen adatok felhasználóspecifikusak.

A „dynamic” nem automatikusan `no-store`, és a „static” nem automatikusan public adat.

### 25.5. `connection()`

Ha a renderelés requesthez kötése szükséges, de nem olvasol konkrét request API-t:

```tsx
import { connection } from 'next/server';

export default async function RequestTimePage() {
  await connection();

  return <p>{Date.now()}</p>;
}
```

`connection()` után a további renderelés bejövő kéréshez kötött.

### 25.6. Dynamic route config

```ts
export const dynamic = 'force-dynamic';
```

használható, de NEM AJÁNLOTT univerzális javításként.

Előbb értsd meg:

- mely adat uncached;
- kell-e user context;
- a route prerenderelhető-e;
- milyen fetch/cache policy kell;
- miért nem elég `connection()`;
- milyen hosting költsége van.

### 25.7. Route segment config jövőállósága

Bizonyos route segment config opciók Cache Components mellett eltérhetnek vagy később deprecálódhatnak. A Winzard route contract inkább a kívánt szemantikát dokumentálja:

```text
request-time
public-cacheable
private-no-store
revalidate-300
static-known-params
runtime-unknown-params
```

A Next.js-specifikus export adapter részlet.

### 25.8. `searchParams` hatása

Page `searchParams` használata request-time adatnak számíthat.

Ezért a kereső/lista route:

- ne kerüljön tévesen statikusnak dokumentálásra;
- canonicalizálja a queryt;
- védje a cache keyt;
- limitálja az inputot;
- ne szivárogtasson user adatot shared cache-be.

### 25.9. Cookie és header

`cookies()` vagy `headers()` használata request contextet visz a renderelésbe.

Minden ilyen route-nál dokumentálandó:

```text
mely header/cookie
ki írja
megbízható-e
cache partition
Vary
redaction
fallback
```

### 25.10. Cache-Control példák

Publikus verzióinfo:

```text
public, max-age=300, stale-while-revalidate=3600
```

User dashboard:

```text
private, no-store
```

Webhook response:

```text
no-store
```

Tenantfüggő publikus katalógus:

- vagy host szerint cache-particionált;
- vagy explicit `Vary`/platform cache key;
- vagy private/no-store.

### 25.11. `Vary`

A `Vary` header csak akkor hasznos, ha a köztes cache tiszteletben tartja.

Veszélyes lehet:

```text
Vary: Cookie
```

mert cache cardinality robbanást okozhat.

### 25.12. Cache invalidation

Route contract rögzítse:

- cache source;
- key;
- tags;
- revalidation;
- mutation utáni invalidation;
- alias URL-ek;
- localized URL-ek;
- tenant scope;
- failure mode.

### 25.13. Random és időfüggő adat

A build alatt futó:

```ts
Math.random()
Date.now()
```

prerenderelt, rögzített outputot okozhat, ha nincs request-time boundary.

A route semantics szerint használj:

- `connection()`;
- explicit dynamic rendering;
- kliensoldali értéket;
- cache nélküli application queryt.

### 25.14. Session write GET-ben

TILOS GET route-ban rejtett mutationt végezni:

```text
lastSeen frissítés
audit domain event
kosár létrehozás
session inicializálás
```

ha az cache-, retry- vagy prefetchbiztonságot sért.

Technikai access log külön observability rétegben történhet.

---

## 26. Az aktuális route, pathname, params és search params olvasása

### 26.1. Server Component

Page és layout a route paramétereket propsból kapja:

```tsx
export default async function ProductPage({
  params,
  searchParams,
}: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const query = await searchParams;

  // ...
}
```

A Server Component ne importáljon klienshookot pusztán az aktuális URL olvasásához.

### 26.2. Route Handler

```ts
export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/products/[id]'>,
) {
  const { id } = await context.params;
  const include = request.nextUrl.searchParams.getAll('include');

  // ...
}
```

### 26.3. Client Component pathname

```tsx
'use client';

import { usePathname } from 'next/navigation';

export function ActiveNavigationItem() {
  const pathname = usePathname();

  return <span data-pathname={pathname}>Termékek</span>;
}
```

A `usePathname()` miatt a komponens Client Component lesz. Tartsd a client boundaryt kicsiben.

### 26.4. Client Component params

```tsx
'use client';

import { useParams } from 'next/navigation';

export function ProductRouteIndicator() {
  const params = useParams<{ slug: string }>();

  return <span>{params.slug}</span>;
}
```

A generikus típus fejlesztői segítség, nem runtime validáció.

### 26.5. Search params kliensen

Kliensoldali interaktív szűrő használhat `useSearchParams()` hookot. A kanonikus query builder továbbra is központi legyen, hogy:

- a szerver és kliens ugyanazt a kulcsot használja;
- defaultok azonosak;
- unknown param kezelés azonos;
- encoding azonos;
- analytics stabil.

### 26.6. Route contract ID runtime

Ha route-szintű audit vagy metrics label szükséges:

```ts
export const PRODUCT_DETAIL_ROUTE = {
  contractId: 'ATLAS-ROUTE-012',
  pattern: '/products/[slug]',
} as const;
```

A konstans:

- nem végzi a route matchinget;
- nem helyettesíti a Next.js typegent;
- lehet metrics label;
- bekerülhet dokumentációs inventoryba;
- E2E-ben összevethető a route-tal.

### 26.7. Raw pathname biztonsága

A pathname felhasználói input. Ne használd:

- fájlpathként;
- SQL fragmentként;
- import specifierként;
- log labelként kontrollálatlan cardinalityvel;
- redirect destinationként validáció nélkül;
- authorization role-ként.

### 26.8. Referer

A `Referer` header nem megbízható route context:

- hiányozhat;
- manipulálható;
- privacy policy levághatja;
- külső origin lehet;
- érzékeny queryt tartalmazhat.

Navigációs UX-hez használható óvatosan, authhoz nem.

### 26.9. Route template vs konkrét pathname

Metricsben:

```text
/products/[slug]
```

route template jobb, mint:

```text
/products/red-shoe
/products/blue-shoe
```

külön label, mert elkerüli a nagy cardinalityt.

A route template kinyerését generált inventory vagy explicit route contract adhatja, nem a raw pathname-ből történő bizonytalan regexheurisztika.

---

## 27. URL-generálás és typed route-ok

### 27.1. Miért ne legyen nyers string mindenhol?

Nyers URL-ek:

```tsx
<Link href={`/products/${product.slug}`}>...</Link>
```

szétszórva problémát okoznak:

- route átnevezésnél sok helyen törnek;
- encoding eltérhet;
- default query eltérhet;
- canonicalization eltérhet;
- locale/base path kezelés eltérhet;
- tesztelés nehéz;
- signed URL logika duplikálódik.

### 27.2. `typedRoutes`

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```

A Next.js generált típusai segítik a `Link`, `router` és `Route` típus ellenőrzését.

### 27.3. Statikus typed link

```tsx
import Link from 'next/link';

export function ProductNavigation() {
  return <Link href="/products">Termékek</Link>;
}
```

### 27.4. Dinamikus typed route

```ts
import type { Route } from 'next';

export const productUrls = {
  list(): Route {
    return '/products';
  },

  detail(slug: string): Route {
    return `/products/${encodeURIComponent(slug)}` as Route;
  },

  edit(id: string): Route {
    return `/admin/products/${encodeURIComponent(id)}/edit` as Route;
  },
} as const;
```

A type assertion dinamikus stringnél nem helyettesíti:

- slug validálását;
- canonicalizationt;
- route létezésének E2E ellenőrzését;
- base path és locale contractot;
- query paraméter schema-ját.

### 27.5. Branded route input

```ts
declare const productSlugBrand: unique symbol;

export type ProductSlug = string & {
  readonly [productSlugBrand]: true;
};

export function parseProductSlug(value: string): ProductSlug {
  const parsed = ProductSlugSchema.parse(value);
  return parsed as ProductSlug;
}

export function productDetailPath(slug: ProductSlug): Route {
  return `/products/${encodeURIComponent(slug)}` as Route;
}
```

Ez csökkenti annak esélyét, hogy tetszőleges string kerüljön a builderbe.

### 27.6. Query builder

```ts
export function productListPath(
  input: Readonly<{
    query?: string;
    page?: number;
    status?: 'active' | 'archived';
  }> = {},
): Route {
  const parameters = new URLSearchParams();

  if (input.query) parameters.set('query', input.query);
  if (input.page && input.page > 1) {
    parameters.set('page', String(input.page));
  }
  if (input.status) parameters.set('status', input.status);

  const suffix = parameters.toString();

  return (suffix ? `/products?${suffix}` : '/products') as Route;
}
```

### 27.7. URL builder tulajdonosa

A builder elhelyezése lehet:

```text
src/modules/catalog/product/presentation/product.urls.ts
```

ha termékspecifikus.

Platformszintű builder:

```text
src/platform/routing/
```

csak valóban általános műveleteket tartalmazzon:

- absolute origin;
- canonical query;
- signed URL;
- safe return path;
- locale prefix.

### 27.8. Domain réteg és URL

A domain réteg ne importálja:

```ts
import type { Route } from 'next';
```

A domain legfeljebb route-semleges identifier vagy slug value objectet ad.

A URL delivery/presentation concern.

### 27.9. Application output és navigáció

Application result tartalmazhat szemantikus navigation hintet:

```ts
type UpdateProductResult = Readonly<{
  productId: string;
  canonicalSlug: string;
}>;
```

A delivery adapter ebből URL-t generál:

```ts
redirect(productUrls.detail(result.canonicalSlug));
```

Ne adjon vissza a use case Next.js `Route` típust.

### 27.10. Builder API kompatibilitás

Builder átnevezésnél:

- deprecated alias;
- compile-time deprecation;
- migráció;
- route E2E;
- consumer contract;
- removal release.

### 27.11. Relative vs absolute

Alapértelmezett internal navigationhez relatív path használatos:

```text
/products
```

Abszolút URL csak akkor kell, ha:

- email;
- webhook;
- external callback;
- sitemap;
- canonical metadata;
- Open Graph;
- third-party integration;
- QR code;
- downloadable link.

### 27.12. Hash fragment

```ts
export function pricingSectionPath(): Route {
  return '/products#pricing';
}
```

A fragmentet encode-olni kell, ha dinamikus. Nem része a server route matchingnek.

---

## 28. Abszolút URL-ek és az alkalmazás publikus originje

### 28.1. Publikus origin contract

```ts
import { z } from 'zod';

const PublicOriginSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost';
  });

export type PublicOrigin = z.infer<typeof PublicOriginSchema>;
```

### 28.2. Környezeti változó

```dotenv
APP_PUBLIC_ORIGIN=https://app.example.com
```

A publikus origin:

- nem secret;
- environment-specific;
- HTTPS productionben;
- trailing slash nélkül canonicalizált;
- allowlistelt;
- release config része.

### 28.3. URL builder

```ts
import type { Route } from 'next';

export function absoluteApplicationUrl(
  origin: string,
  route: Route,
): URL {
  const parsedOrigin = PublicOriginSchema.parse(origin);
  return new URL(route, parsedOrigin);
}
```

### 28.4. Base path

Ha base path aktív, az abszolút builder egyetlen helyen kezelje:

```ts
const APPLICATION_BASE_PATH = '/atlas';

export function absoluteApplicationUrl(
  origin: string,
  route: Route,
): URL {
  const base = new URL(APPLICATION_BASE_PATH, origin);
  const normalizedBase = base.pathname.endsWith('/')
    ? base
    : new URL(`${base.pathname}/`, base);

  return new URL(route.replace(/^\//u, ''), normalizedBase);
}
```

A pontos implementációt tesztelni kell root és subpath deploymenttel.

### 28.5. Host header kerülése

Nem támogatott:

```ts
const host = (await headers()).get('host');
return new URL('/reset-password', `https://${host}`);
```

Host-header poisoning:

- phishing reset linket;
- cache poisoningot;
- rossz canonical URL-t;
- OAuth callback eltérést;
- signed URL origin eltérést

okozhat.

### 28.6. Trusted request origin

Ha valóban request hostból kell dolgozni, szükséges:

- trusted reverse proxy;
- forwarded header policy;
- host allowlist;
- scheme allowlist;
- port policy;
- tenant custom domain verification;
- canonical domain mapping;
- unit és integration teszt.

### 28.7. Email link

```ts
const resetUrl = signedUrlService.sign({
  purpose: 'password-reset',
  method: 'GET',
  url: absoluteApplicationUrl(
    environment.publicOrigin,
    accountUrls.resetPassword(tokenId),
  ),
  expiresAt,
});
```

A raw reset secretet ne logold.

### 28.8. Sitemap

Sitemap URL-generálás:

- canonical originből;
- canonical locale-ből;
- canonical slugból;
- csak publikálható erőforrásból;
- tenant/public domain policy szerint;
- deterministic módon.

### 28.9. Preview deployment

Preview origin ne kerüljön production emailbe vagy sitemapbe. A deploy environment és az application public origin külön változó legyen.

### 28.10. Több canonical origin

Multi-domain alkalmazásnál az origin a tenant/domain resolver outputja lehet:

```ts
type CanonicalOriginResolver = Readonly<{
  resolveForTenant(tenantId: string): Promise<URL>;
}>;
```

A resolver validált domain registryből dolgozzon, ne raw request Hostból.

---

## 29. URL-generálás különböző rétegekben

### 29.1. Server Component

```tsx
import Link from 'next/link';

import { productUrls } from '@/modules/catalog/product/presentation/product.urls';

export function ProductLink({
  slug,
  name,
}: Readonly<{
  slug: ProductSlug;
  name: string;
}>) {
  return <Link href={productUrls.detail(slug)}>{name}</Link>;
}
```

### 29.2. Client Component

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function ProductSearchResult({
  href,
}: Readonly<{
  href: Route;
}>) {
  const router = useRouter();

  return (
    <button type="button" onClick={() => router.push(href)}>
      Megnyitás
    </button>
  );
}
```

Ha egyszerű link elég, `Link` jobb a programozott navigációnál.

### 29.3. Server Action

```ts
'use server';

import { redirect } from 'next/navigation';

export async function createProductAction(
  _previousState: unknown,
  formData: FormData,
) {
  const result = await createProductFromForm(formData);

  redirect(productUrls.detail(result.slug));
}
```

A redirect target application resultből, validált builderrel készül.

### 29.4. Route Handler

```ts
export async function POST(request: Request) {
  const result = await createProduct(request);

  return Response.json(
    result,
    {
      status: 201,
      headers: {
        Location: productUrls.apiDetail(result.id),
      },
    },
  );
}
```

A `Location` lehet relatív vagy absolute az API contract szerint.

### 29.5. Application service

Az application service ne függjön Next.js `Route` típustól.

Ha external notification URL-re van szüksége, használjon portot:

```ts
export interface ProductLinkFactory {
  absoluteProductUrl(slug: string): URL;
}
```

Ez akkor indokolt, ha a URL application output side effect része, például email küldés. A port implementációja a platform/presentation adapterben található.

### 29.6. Background job

Worker környezetben nincs request Host. Csak explicit public origin vagy tenant origin resolver használható.

### 29.7. CLI

Console command:

```text
pnpm app invite:create
```

ugyancsak explicit origin configot igényel.

### 29.8. Email template

A template DTO már kész URL-t kaphat:

```ts
type PasswordResetEmailDto = Readonly<{
  recipientName: string;
  resetUrl: string;
  expiresAt: string;
}>;
```

A template ne generáljon route-ot.

### 29.9. Client API URL

Böngészőből saját originre hívott API:

```ts
fetch('/api/products');
```

elfogadható Client Componentben.

Server Componentben ugyanaz a minta kerülendő; közvetlen use case hívás kell.

### 29.10. Külső API URL

Külső szolgáltatás URL builder külön adapter:

```ts
export interface ShippingProviderUrlBuilder {
  trackingUrl(trackingNumber: string): URL;
}
```

Ne keverd az alkalmazás saját route builderével.

---

## 30. Route-létezés és route contractok ellenőrzése

### 30.1. Compile-time typed route

A `typedRoutes` és `next typegen` segít statikus linkek és route-aware props típusozásában.

```bash
pnpm next typegen
pnpm exec tsc --noEmit
```

### 30.2. Typegen korlátja

A typegen nem bizonyítja automatikusan:

- a route authorizationját;
- a status code-ot;
- a response DTO-t;
- a redirect targetot;
- a cache policyt;
- a canonical URL-t;
- a signed URL érvényességét;
- a runtime adatlétezést;
- a rewrite végső viselkedését.

### 30.3. Build

```bash
pnpm next build
```

A build:

- route tree-t fordít;
- type és bundling hibát találhat;
- prerendering hibát jelezhet;
- route outputot mutathat;
- statikus/dinamikus viselkedésre utalhat.

### 30.4. Debug build

```bash
pnpm next build --debug
```

További route-, rewrite-, redirect- és headerinformációt adhat.

Prerender hibánál:

```bash
pnpm next build --debug-prerender
```

Szűkített build path:

```bash
pnpm next build --debug-build-paths="app/products/**"
```

Az elérhető flaget mindig a repositoryban rögzített Next.js verzióhoz kell ellenőrizni.

### 30.5. Route smoke

```bash
curl -i http://localhost:3000/products
curl -i http://localhost:3000/api/products
curl -i -X OPTIONS http://localhost:3000/api/products
```

A curl önmagában nem elég teljes E2E-nek, de gyors diagnosztika.

### 30.6. Route existence helper

Winzard URL builder unit teszt:

```ts
describe('productUrls', () => {
  it('canonical product route-ot épít', () => {
    expect(productUrls.detail('red-shoe' as ProductSlug))
      .toBe('/products/red-shoe');
  });
});
```

E2E bizonyítja, hogy a buildben valóban létezik.

### 30.7. Implementált diagnosztikai parancsok

A repositoryban elérhető Winzard felület:

```bash
pnpm forge route:list --project <PROJECT>
pnpm forge route:inspect /products/[slug] --project <PROJECT>
pnpm forge route:match /products/red-shoe --method=GET --project <PROJECT>
pnpm forge route:check --project <PROJECT>
pnpm forge route:aliases --project <PROJECT>
pnpm forge route:docs --check --project <PROJECT>
```

Elvárt jelentés:

```text
route pattern
source file
entry type
HTTP methods
runtime
rendering/cache policy
route contract ID
URL builder
auth/policy
aliases
redirects/rewrites
tests
documentation
drift
```

### 30.8. Nincs hamis runtime garancia

A `route:list` vagy `route:check` csak akkor tekinthető erős bizonyítéknak, ha:

- a Next.js compiler/typegen outputjából dolgozik;
- verziózott extractorral működik;
- fixture-ekkel tesztelt;
- nem puszta regexszel olvas mappaneveket;
- kezeli route groupot, metadata route-ot, Proxyt, redirectet és rewrite-ot;
- builddel és E2E-vel egészül ki.

A jelenlegi Forge extractor statikus fájlrendszer- és TypeScript AST-vizsgálatot végez. Ezért a `route:*` output diagnosztikai bizonyíték; a Next.js typegen, build és futó E2E marad az autoritatív runtime ellenőrzés. A generált route dokumentáció driftjét a `route:docs --check` ellenőrzi.

### 30.9. Route contract ID létezése

A dokumentációs route ID egyedi és stabil legyen:

```text
ATLAS-ROUTE-012
```

De egy route ID létezése nem bizonyítja runtime route létezését. A traceability:

```text
route contract ID
→ source file
→ build route
→ URL builder
→ tests
```

együtt szükséges.

---

## 31. Aláírt és lejáró URL-ek

### 31.1. Cél

Signed URL akkor használható, ha a link:

- integritásvédett paramétereket visz;
- korlátozott időre érvényes;
- meghatározott purpose-ra használható;
- nem teljes session vagy általános auth helyettesítője.

Példák:

```text
email verification
password reset
download link
invitation
webhook verification callback
one-click unsubscribe
temporary preview
```

### 31.2. Nem titkosítás

Az aláírás nem rejti el az URL tartalmát. A query és path továbbra is látható.

Érzékeny adatot ne tegyél bele plaintextként.

### 31.3. Aláírási payload

Minimum:

```text
version
HTTP method
canonical pathname
canonical query
purpose
expiresAt
tenant vagy audience
nonce vagy token ID, ha kell
```

### 31.4. Canonicalization

Aláírás előtt rögzíteni kell:

- query kulcsok sorrendjét;
- duplikált kulcsok kezelését;
- percent encodingot;
- trailing slash policyt;
- host része-e a payloadnak;
- base pathot;
- locale-t;
- fragment kizárását;
- default portot;
- case sensitivityt.

### 31.5. HMAC példa

```ts
import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

function base64Url(input: Buffer): string {
  return input.toString('base64url');
}

function signaturePayload(input: Readonly<{
  version: 'v1';
  method: string;
  pathname: string;
  canonicalQuery: string;
  purpose: string;
  expiresAtEpochSeconds: number;
  audience: string;
}>): string {
  return [
    input.version,
    input.method.toUpperCase(),
    input.pathname,
    input.canonicalQuery,
    input.purpose,
    String(input.expiresAtEpochSeconds),
    input.audience,
  ].join('\n');
}

export function signPayload(
  secret: string,
  payload: string,
): string {
  return base64Url(
    createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest(),
  );
}

export function signaturesEqual(
  expected: string,
  received: string,
): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

### 31.6. Secret

Signed URL secret:

- legalább megfelelő entrópiájú;
- secret managerből jön;
- rotálható;
- purpose vagy key ID szerint verziózható;
- nem kerül kliensbundle-be;
- nem kerül logba;
- nem azonos session secrettel automatikusan.

### 31.7. URL előállítása

```ts
export function createSignedDownloadUrl(input: Readonly<{
  origin: URL;
  fileId: string;
  expiresAtEpochSeconds: number;
  audience: string;
  secret: string;
}>): URL {
  const url = new URL(
    `/downloads/${encodeURIComponent(input.fileId)}`,
    input.origin,
  );

  url.searchParams.set('expires', String(input.expiresAtEpochSeconds));
  url.searchParams.set('aud', input.audience);
  url.searchParams.set('v', '1');

  const canonicalQuery = canonicalizeSignedQuery(url.searchParams);
  const payload = signaturePayload({
    version: 'v1',
    method: 'GET',
    pathname: url.pathname,
    canonicalQuery,
    purpose: 'download',
    expiresAtEpochSeconds: input.expiresAtEpochSeconds,
    audience: input.audience,
  });

  url.searchParams.set('signature', signPayload(input.secret, payload));

  return url;
}
```

A `signature` maga ne legyen a canonical query része.

### 31.8. Ellenőrzés sorrendje

1. parse URL;
2. schema validate;
3. signature mező eltávolítása;
4. canonical query;
5. key/version kiválasztás;
6. HMAC számítás;
7. timing-safe összehasonlítás;
8. expiry;
9. purpose;
10. audience/tenant;
11. token revocation vagy single-use check;
12. application policy;
13. resource lookup.

### 31.9. Expiry

Az óraeltérésre dokumentált tolerancia lehet, de ne legyen túl nagy.

```text
now <= expiresAt + allowedClockSkew
```

A link kiállítási ideje is rögzíthető.

### 31.10. Single-use

Single-use linkhez state szükséges:

```text
token ID
consumedAt
revokedAt
purpose
subject
expiresAt
```

Ez már nem teljesen stateless.

### 31.11. Replay

Idempotens letöltésnél replay engedhető expiryig.

Password reset vagy account action esetén replay tiltandó, single-use storage szükséges.

### 31.12. Host az aláírásban

Ha a link csak egy canonical hoston használható, az origin/audience legyen az aláírás része.

Multi-tenant custom domainnél a tenant canonical domainje használható, de domain változtatás hatását kezelni kell.

### 31.13. Redirect és signed URL

A signed URL-t átirányítani veszélyes lehet, ha:

- a path változik;
- query sorrend változik;
- host változik;
- trailing slash változik;
- aláírás nem fedi a cél URL-t.

Signed URL route migrációhoz verziózott verifier és átmeneti kompatibilitás szükséges.

### 31.14. Signed URL nem auth helyettesítő

Egy signed URL bizonyíthatja, hogy a linket a rendszer állította elő és nem módosították. Nem feltétlenül bizonyítja:

- ki kattintott;
- a user még aktív;
- a tenant membership fennáll;
- az erőforrás továbbra is elérhető;
- a művelet engedélyezett.

Application policy továbbra is szükséges lehet.

---

## 32. HTTPS, trusted proxy és Host-header biztonság

### 32.1. HTTPS kötelező productionben

Production publikus route-oknál KÖTELEZŐ a HTTPS, kivéve dokumentált, elszigetelt belső hálózati esetet.

A HTTPS nem csak titkosítás:

- origin identity;
- secure cookie;
- HSTS;
- OAuth callback biztonság;
- signed link konzisztencia;
- service worker;
- modern browser API-k;
- mixed-content védelem.

### 32.2. TLS termináció reverse proxyn

Ha TLS a reverse proxyn terminál:

```text
client HTTPS
→ proxy
→ internal HTTP
→ Next.js
```

az alkalmazásnak trusted forwarded header policy kell.

### 32.3. Forwarded headerek

Gyakori headerek:

```text
Forwarded
X-Forwarded-Proto
X-Forwarded-Host
X-Forwarded-Port
X-Forwarded-For
```

Ezeket csak ismert proxyból szabad megbízhatónak tekinteni.

### 32.4. Header spoofing

Ha az ingress nem törli a kliens által küldött forwarded headert, a támadó:

- hamis scheme-et;
- hamis hostot;
- hamis client IP-t;
- hamis tenantot;
- rossz redirect targetot

kényszeríthet ki.

### 32.5. Canonical host redirect

A canonical host redirectet lehetőleg az edge/hosting réteg vagy validált Proxy végezze.

```ts
if (host === 'www.example.com') {
  const target = request.nextUrl.clone();
  target.host = 'example.com';
  target.protocol = 'https:';

  return NextResponse.redirect(target, 308);
}
```

A `host` előtte validálandó.

### 32.6. HSTS

HSTS header csak akkor kapcsolható be biztonságosan, ha:

- minden aldomain HTTPS-képes a választott scope mellett;
- nincs legacy HTTP integráció;
- preload döntés dokumentált;
- rollback következménye ismert.

### 32.7. Secure cookie

Authentication route-oknál:

- `Secure`;
- megfelelő `HttpOnly`;
- `SameSite`;
- szűk `Path`;
- szükség szerinti `Domain`;
- prefixek, például `__Host-`

megfontolandók.

A cookie konfiguráció auth capability contract, de routing változás befolyásolhatja a `Path` és domain értéket.

### 32.8. Absolute redirect

Abszolút redirectnél a target origin:

- configból;
- verified tenant domain registryből;
- szűk allowlistből

származzon.

### 32.9. Local development

Localhost HTTP használható fejlesztésben. A code path ne kapcsolja ki production HTTPS-követelményt egyszerűen user-controlled header alapján.

### 32.10. Scheme-dependent route

Symfony képes route-hoz scheme-követelményt rendelni.

Winzardban inkább globális HTTPS enforcement és canonical origin ajánlott. Ritka HTTP-only route külön infrastructure/ingress concern.

### 32.11. Proxy loop

HTTPS vagy host redirect loop oka lehet:

- proxy rossz scheme-et továbbít;
- alkalmazás nem bízik a megfelelő headerben;
- CDN és app mindkettő canonicalizál;
- base path duplázódik;
- trailing slash policy ütközik.

E2E-teszt valódi hostinghoz közeli proxykonfigurációval szükséges.

### 32.12. 421 és ismeretlen host

Ismeretlen hostnál:

```text
421 Misdirected Request
```

vagy explicit 404 használható architecture/security döntés szerint.

TILOS az ismeretlen Hosttal generált branded oldalon reset- vagy callback URL-t visszaadni.

---

## 33. `notFound`, hibák, redirect és response mapping

### 33.1. Application error taxonomy

Ajánlott:

```text
ValidationError
NotFoundError
ForbiddenError
ConflictError
RateLimitError
DependencyUnavailableError
UnexpectedError
```

A delivery adapter képezi HTTP/rendering eredménnyé.

### 33.2. HTML not found

```tsx
import { notFound } from 'next/navigation';

if (!product) {
  notFound();
}
```

A `notFound()` leállítja az adott route szegmens renderelését és a legközelebbi `not-found.tsx` felületet használja.

### 33.3. API not found

```ts
return Response.json(
  {
    code: 'PRODUCT_NOT_FOUND',
  },
  {
    status: 404,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  },
);
```

### 33.4. Forbidden

HTML-route dönthet:

- 403 oldal;
- 404 information hiding;
- login redirect;
- request access flow.

A policy és security specification határozza meg.

### 33.5. Unauthorized és forbidden különbség

```text
401: nincs vagy érvénytelen hitelesítés
403: hitelesített Actor nem jogosult
```

Browser UI-nál login redirect lehet UX mapping, de az application eredmény továbbra is megkülönböztetheti.

### 33.6. Validation error

Path syntax:

```text
400 vagy 404
```

route contract szerint.

Query/body validation:

```text
400 vagy 422
```

API contract szerint.

### 33.7. Conflict

Példák:

- version mismatch;
- duplicate slug;
- invalid state transition;
- idempotency conflict.

```ts
return Response.json(
  {
    code: 'PRODUCT_SLUG_CONFLICT',
  },
  { status: 409 },
);
```

### 33.8. Rate limit

```text
429 Too Many Requests
Retry-After
```

A route contract dokumentálja a scope-ot:

```text
IP
Actor
tenant
API key
route contract
global
```

### 33.9. Dependency unavailable

```text
503 Service Unavailable
```

és szükség esetén:

```text
Retry-After
```

A belső exception részlete ne kerüljön publikus response-ba.

### 33.10. Error boundary

`error.tsx` váratlan renderelési hibák boundaryja. Nem ajánlott expected application errorokat exceptionként ráterhelni.

Expected flow:

```text
Result / typed error
→ delivery mapping
```

Unexpected flow:

```text
throw
→ logging
→ error boundary / 500 response
```

### 33.11. Redirect mint eredmény

Application use case ne hívjon `redirect()`-et.

Lehet eredménye:

```ts
type CompleteOnboardingResult =
  | Readonly<{
      kind: 'completed';
      accountId: string;
    }>
  | Readonly<{
      kind: 'already-completed';
      accountId: string;
    }>;
```

A delivery adapter dönt a navigációról.

### 33.12. Noindex

Nem található vagy érzékeny hibafelület ne legyen indexelhető. A Next.js `notFound()` a megfelelő keresőrobot-meta viselkedést is támogatja, de custom error/403 oldalaknál explicit metadata szükséges lehet.

### 33.13. Response DTO

TILOS nyers error objectet JSON-ná alakítani:

```ts
return Response.json(error);
```

Explicit DTO:

```ts
type ApiErrorDto = Readonly<{
  code: string;
  message?: string;
  issues?: readonly Readonly<{
    path: string;
    code: string;
  }>[];
  correlationId: string;
}>;
```

### 33.14. Correlation ID

Minden váratlan vagy integrációs hibához AJÁNLOTT correlation ID, amely:

- response-ban safe;
- loghoz kapcsolható;
- nem secret;
- nem user PII;
- nem route paraméterből készül.

---

## 34. Route inventory, route contract és generált metadata

### 34.1. Miért kell inventory?

A Next.js route tree runtime forrás, de egy nagy projektnek szüksége lehet emberi és gépi nézetre:

- ownership;
- auth;
- cache;
- response type;
- aliases;
- deprecation;
- tests;
- documentation;
- operation;
- SLO;
- observability.

### 34.2. Route contract dokumentum

Példa:

```yaml
---
schema_version: 1
id: ATLAS-ROUTE-012
title: Termék részletező oldal

scope: generated-project
kind: contract
subtype: route-contract
authority: normative

document_status: accepted
implementation_status: implemented
verification_status: verified

owner: role:catalog-maintainer
approvers:
  - role:architecture-owner

classification: internal
ai_access: allowed
context_priority: relevant

source_files:
  - src/app/products/[slug]/page.tsx

route_pattern: /products/[slug]
entry_type: page
methods:
  - GET
canonical: true
authentication: optional
authorization: catalog.product.view
cache_policy: public-product-detail
runtime: nodejs

url_builder:
  - productUrls.detail

aliases:
  - /catalog/[slug]

evidence:
  - ATLAS-EVIDENCE-0042
---
```

A konkrét dokumentációs schema a `project-documentation` capability verziójához igazodjon. A fenti kiterjesztett példa célmodell.

### 34.3. Route contract nem registry

A route contract:

- nem importálódik runtime matchinghez;
- nem választ controllert;
- nem írja felül a Next.js route tree-t;
- nem generál automatikusan auth policyt;
- review- és traceability-forrás.

### 34.4. Colocated metadata

Opcionális TypeScript metadata:

```ts
export const routeContract = {
  id: 'ATLAS-ROUTE-012',
  pattern: '/products/[slug]',
  entryType: 'page',
  cachePolicy: 'public-product-detail',
} as const;
```

Csak akkor használd, ha:

- statikusan elemezhető;
- nem tartalmaz secretet;
- nem kerül Client Component bundle-be szükségtelenül;
- dokumentációval driftre ellenőrzött;
- nem duplikál túl sok normatív mezőt.

### 34.5. Inventory output

```text
ID                METHOD  PATTERN                    SOURCE
ATLAS-ROUTE-001   GET     /products                  src/app/products/page.tsx
ATLAS-ROUTE-012   GET     /products/[slug]           src/app/products/[slug]/page.tsx
ATLAS-ROUTE-021   GET     /api/products/[id]         src/app/api/products/[id]/route.ts
ATLAS-ROUTE-022   PATCH   /api/products/[id]         src/app/api/products/[id]/route.ts
```

### 34.6. Generated vs developer-owned

Developer-owned:

- route contract;
- operation schema;
- policy mapping;
- URL builder;
- aliases/deprecation intent.

Generated:

- route inventory;
- source hash;
- route graph;
- test coverage report;
- current Next.js route extraction;
- documentation status.

### 34.7. Drift

Hibák:

```text
contract source file nem létezik
source route nincs inventoryban
inventory route-nak nincs contract, pedig kötelező
contract pattern eltér a compilertől
URL builder target eltér
alias redirect hiányzik
method export eltér
verified evidence stale
```

### 34.8. Route ownership

Route owner nem feltétlenül a mappa Git owner. Rögzíthető:

```text
business owner
technical owner
security approver
on-call service
```

### 34.9. Route capability

Egy route kapcsolódhat product capabilityhez:

```text
ATLAS-CAP-012
→ ATLAS-ROUTE-012
→ ATLAS-SPEC-023
→ source
→ tests
```

### 34.10. Route contract lifecycle

URL eltávolítás előtt:

```text
accepted
→ deprecated
→ alias/redirect időszak
→ removal planned
→ archived
```

A runtime source törlése és a contract archiválása ugyanazon release-ben vagy dokumentált átmenettel történjen.

---

## 35. Route-diagnosztika

### 35.1. Első diagnosztika

```bash
pnpm next info --verbose
pnpm next typegen
pnpm exec tsc --noEmit
pnpm next build
```

### 35.2. Route build output

A build output segíthet azonosítani:

- statikus route;
- dinamikus route;
- prerenderelt paraméter;
- route handler;
- buildhiba;
- prerenderhiba.

A pontos jelöléseket a rögzített Next.js verzió szerint értelmezd.

### 35.3. Debug

```bash
pnpm next build --debug
```

Hasznos:

- redirectek;
- rewrite-ok;
- headerek;
- route output;
- build pathok

vizsgálatára.

### 35.4. Prerender hiba

```bash
pnpm next build --debug-prerender
```

Csak ellenőrzött környezetben, mert részletes stack és source információt adhat.

### 35.5. Szűkített build

```bash
pnpm next build --debug-build-paths="app/products/**"
```

Nagy projektben gyors diagnosztika, de teljes release buildet nem helyettesít.

### 35.6. Dev server

```bash
pnpm dev
```

Vizsgáld:

- route elérhető;
- hot reload;
- params;
- status;
- headers;
- redirect;
- rewrite;
- auth;
- locale;
- Proxy log.

### 35.7. Curl

```bash
curl -i http://127.0.0.1:3000/products
curl -i http://127.0.0.1:3000/products/red-shoe
curl -i http://127.0.0.1:3000/api/products/123
curl -i -X POST http://127.0.0.1:3000/api/products \
  -H 'Content-Type: application/json' \
  --data '{"name":"Example","priceMinor":1000}'
```

### 35.8. Redirect követés

```bash
curl -I http://127.0.0.1:3000/catalog/red-shoe
curl -IL http://127.0.0.1:3000/catalog/red-shoe
```

Az első a redirectet, a második a teljes chainet mutatja.

### 35.9. Host teszt

```bash
curl -i \
  -H 'Host: tenant-a.example.test' \
  http://127.0.0.1:3000/products
```

Csak local integration setupban; production securityt nem bizonyít.

### 35.10. Query teszt

```bash
curl -G -i http://127.0.0.1:3000/api/products \
  --data-urlencode 'query=red shoe' \
  --data-urlencode 'page=2'
```

### 35.11. Response header

Ellenőrizd:

```text
Content-Type
Cache-Control
Location
Vary
Set-Cookie
Content-Security-Policy
X-Content-Type-Options
Retry-After
```

route contract szerint.

### 35.12. Logok

Route log:

- structured;
- route contract ID;
- method;
- normalized route;
- status;
- duration;
- actor/tenant pseudonymized ID;
- correlation ID;
- error code;
- cache result.

Raw query, secret, cookie, Authorization header ne kerüljön logba.

### 35.13. Forge diagnosztikai parancs

```bash
pnpm forge route:inspect /products/[slug] --project <PROJECT>
```

elvárt output:

```text
Source:              src/app/products/[slug]/page.tsx
Entry:               page
Methods:             GET/HEAD
Runtime:             nodejs
Rendering:           request-time
Contract:            ATLAS-ROUTE-012
URL builder:         productUrls.detail
Policy:              catalog.product.view
Aliases:             /catalog/[slug]
Evidence:            verified
Drift:               none
```

A jelenlegi implementáció statikus, közelítő inventoryt ad. A typegen, build és E2E továbbra is az autoritatív ellenőrzés; route contract ID, URL builder, policy és evidence mező csak akkor jelenhet meg erős bizonyítékként, ha külön, verziózott contractforrásból származik.

---

## 36. Tesztelési stratégia

### 36.1. Tesztpiramis

```text
schema unit
URL builder unit
application use case unit
delivery adapter unit/integration
Proxy/config test
route contract check
production build
E2E
hosting smoke
```

### 36.2. Paraméter schema unit teszt

```ts
describe('ProductSlugParamsSchema', () => {
  it.each([
    'red-shoe',
    'product-123',
  ])('elfogadja: %s', (slug) => {
    expect(
      ProductSlugParamsSchema.parse({ slug }),
    ).toEqual({ slug });
  });

  it.each([
    '',
    'Red-Shoe',
    '../secret',
    'a'.repeat(121),
  ])('elutasítja: %s', (slug) => {
    expect(() =>
      ProductSlugParamsSchema.parse({ slug }),
    ).toThrow();
  });
});
```

### 36.3. URL builder unit teszt

```ts
describe('productUrls', () => {
  it('encode-olja a dinamikus szegmenst', () => {
    const slug = parseProductSlug('red-shoe');

    expect(productUrls.detail(slug))
      .toBe('/products/red-shoe');
  });

  it('elhagyja a default page paramétert', () => {
    expect(productListPath({ page: 1 }))
      .toBe('/products');
  });
});
```

### 36.4. Route Handler teszt

```ts
describe('GET /api/products/[id]', () => {
  it('400-at ad hibás ID-ra', async () => {
    const response = await GET(
      new Request('http://localhost/api/products/not-a-uuid'),
      {
        params: Promise.resolve({ id: 'not-a-uuid' }),
      },
    );

    expect(response.status).toBe(400);
  });
});
```

A Next.js globális helper típusok és server-only importok miatt megfelelő test adapter vagy integration environment szükséges.

### 36.5. Application query teszt

A query fake repositoryval tesztelendő, Next.js nélkül.

```ts
const result = await query.execute({
  actor,
  slug: 'red-shoe',
});

expect(result).toEqual(expectedDto);
```

### 36.6. Proxy teszt

Tesztelendő:

- matcherben benne;
- matcherből kizárt asset;
- locale redirect;
- ismeretlen host;
- external header spoof;
- Server Function path;
- auth nélküli request;
- valid auth után downstream;
- canonical host.

### 36.7. Redirect teszt

```text
old URL status
Location
query megőrzés
chain hossza
canonical target
method behavior
cache
```

### 36.8. Rewrite teszt

Ellenőrizd:

- böngészőben látható URL;
- kiszolgált tartalom;
- cél auth;
- cache;
- header forwarding;
- 404 fallback;
- external upstream failure.

### 36.9. E2E page

```ts
test('a termékoldal canonical slugot használ', async ({ page }) => {
  await page.goto('/catalog/red-shoe');

  await expect(page).toHaveURL('/products/red-shoe');
  await expect(page.getByRole('heading', { name: 'Red Shoe' }))
    .toBeVisible();
});
```

### 36.10. E2E API

```ts
const response = await request.get('/api/products/not-a-uuid');

expect(response.status()).toBe(400);
expect(await response.json()).toMatchObject({
  code: 'INVALID_PRODUCT_ID',
});
```

### 36.11. Negative security tesztek

Minimum:

```text
open redirect
host poisoning
path traversal
encoded slash
duplicate query key
oversized catch-all
unknown locale
cross-tenant ID
unauthorized admin URL
signed URL expiry
signed URL tamper
signature replay
Proxy header spoof
shared cache user leak
```

### 36.12. Production build teszt

Dev és production route behavior eltérhet prerendering, cache, bundling és config miatt. Route feature csak production build + smoke után tekinthető verifikáltnak.

### 36.13. Snapshot kerülése

Teljes HTML snapshot helyett preferáld:

- status;
- role/text;
- canonical URL;
- response DTO;
- header;
- redirect;
- route inventory;
- accessibility;
- structured contract.

### 36.14. Route compatibility fixture

Minden deprecated aliasra legyen fixture:

```text
source URL
expected status
expected canonical target
removal release
query policy
```

### 36.15. Signed URL fixture

Determinista:

- fixed secret;
- fixed time;
- fixed URL;
- fixed signature;
- tampered cases;
- expiry boundary;
- wrong purpose;
- wrong method;
- wrong audience.

Production secretet soha ne használj tesztben.

---

## 37. Biztonsági követelmények

### 37.1. Minden route input user-controlled

Ide tartozik:

```text
path params
search params
body
headers
cookies
Host
Origin
Referer
method
content type
file name
locale
tenant slug
redirect target
```

### 37.2. Inputvalidáció

KÖTELEZŐ:

- schema;
- length limit;
- cardinality limit;
- allowlist;
- normalization;
- negative tests;
- unknown key policy;
- content-type check;
- body size limit.

### 37.3. Authorizáció

Route path vagy UI-elérhetőség nem jogosultság.

Minden érzékeny művelet:

```text
authenticate
→ Actor
→ policy
→ use case
```

### 37.4. Tenant isolation

Tenant context minden repository queryben és cache keyben érvényesüljön.

### 37.5. Direct ORM tiltás

TILOS `src/app/**` alatt:

```ts
import { db } from '@/platform/database/client';
import { PrismaClient } from '@prisma/client';
```

### 37.6. Mass assignment

TILOS:

```ts
await db.product.update({
  where: { id },
  data: await request.json(),
});
```

Explicit mapping szükséges.

### 37.7. CSRF

Cookie-alapú hitelesítés mellett state-changing route:

- SameSite policy;
- origin check;
- CSRF token vagy framework/library contract;
- method;
- content type;
- replay;
- CORS

védelmet igényel.

### 37.8. CORS

CORS nem auth.

TILOS credentialed API-nál:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

kombinációt használni.

### 37.9. SSRF

User-controlled URL-t a server ne fetch-eljen allowlist és URL policy nélkül.

Különösen veszélyes:

```text
redirect preview
webhook tester
image fetcher
import URL
OpenGraph crawler
```

### 37.10. Path traversal

Catch-all és download route ne képezzen raw fájlpathot.

### 37.11. Open redirect

`returnTo`, `next`, `redirect`, `callback` paraméter:

- relatív internal allowlist;
- signed state;
- exact origin allowlist;
- protocol tiltás;
- `//` tiltás;
- control char tiltás.

### 37.12. Host poisoning

Absolute URL és canonical metadata csak config/verified registry alapján.

### 37.13. Cache poisoning

Ellenőrizd:

- unkeyed header;
- Host;
- forwarded host;
- cookie;
- query;
- locale;
- tenant;
- auth;
- `Vary`;
- redirect cache.

### 37.14. Information disclosure

Hibaválasz ne tartalmazzon:

- stack trace;
- SQL;
- internal path;
- ORM model;
- secret;
- upstream credential;
- tenant létezési részlet;
- policy internals;
- raw validation input szükségtelenül.

### 37.15. Response splitting

User input ne kerüljön validáció nélkül headerbe:

```ts
headers.set('Location', userInput);
headers.set('Content-Disposition', userInput);
```

### 37.16. Signed URL

Követelmények:

- canonicalization;
- HMAC;
- timing-safe compare;
- expiry;
- purpose;
- audience;
- key rotation;
- replay policy;
- logging redaction.

### 37.17. Rate limit

Kritikus route-ok:

```text
login
password reset
verification
invitation
search
export
webhook
signed download
admin mutation
```

rate-limit contractot kaphatnak.

### 37.18. Security header

Route vagy globális config szerint:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
Strict-Transport-Security
Cross-Origin-*
```

A header policy külön security specification, de route kivétel csak dokumentáltan megengedett.

### 37.19. Upload/download

Fájlroutingnál:

- MIME sniffing védelem;
- Content-Disposition;
- filename sanitize;
- authorization;
- size limit;
- virus scanning;
- storage key != user filename;
- range request policy;
- signed URL;
- cache.

### 37.20. Webhook

Webhook route:

- provider signature;
- raw body követelmény;
- timestamp tolerance;
- replay védelem;
- idempotencia;
- gyors ACK;
- async processing;
- no-store;
- rate limit;
- audit.

---

## 38. Architekturális szabályok

### 38.1. Függőségi irány

```text
app / route delivery
        ↓
composition
        ↓
application
        ↓
domain / ports
        ↑
infrastructure adapters
```

A pontos wiringben az infrastructure adaptert a composition root adja az applicationnek, miközben az application csak portot ismer.

### 38.2. `src/app` feladata

Megengedett:

- Next.js import;
- Request/Response;
- params/searchParams;
- input schema;
- Actor adapter;
- composition root;
- DTO → response/view mapping;
- `notFound`, redirect;
- metadata;
- cache/rendering config.

Tiltott:

- Prisma;
- SQL;
- domain mutation;
- üzleti default;
- policy duplikáció;
- transaction orchestration;
- külső szolgáltatás SDK közvetlenül;
- saját belső API server-side fetch.

### 38.3. Application réteg

TILOS importálnia:

```text
next
next/*
react
server-only
node:* ha nem explicit port adapter
src/app
presentation
infrastructure
composition
ORM
```

### 38.4. Presentation

Presentation komponens explicit DTO-t kapjon.

TILOS Client Componentnek átadni:

- Prisma record;
- Date nem normalizált contract nélkül;
- bigint;
- class instance;
- secret;
- server service;
- repository;
- Actor teljes session;
- authorization internals.

### 38.5. Composition root

```ts
import 'server-only';
```

és explicit wiring.

A route csak a szükséges module facade-ot importálja.

### 38.6. URL builder réteg

A URL builder:

- presentation/platform concern;
- pure;
- determinisztikus;
- encode-ol;
- defaultot canonicalizál;
- typed;
- unit tesztelt.

### 38.7. Route schema

A route schema:

- delivery boundary;
- operation-specific;
- nem globális entity schema;
- nem ORM-generated input;
- explicit unknown-key policy.

### 38.8. Error mapping

Application error nem ismeri a HTTP státuszt kötelezően. Delivery mapping külön.

### 38.9. Proxy

Proxy:

- coarse-grained;
- gyors;
- stateless;
- szűk matcher;
- nem final policy;
- header spoof ellen védett.

### 38.10. Route docs

Publikus route change ugyanabban a PR-ban frissítse:

- route contract;
- URL builder;
- redirect/alias;
- tests;
- API reference;
- user docs;
- consumer impact.

### 38.11. Generated route artifact

Generált inventory kézi módosítása drift. Forrásban vagy generatorban javítandó.

### 38.12. Forge checks jövőbeli scope

Tervezett route architecture check:

```text
APP_DIRECT_ORM_IMPORT
APP_INTERNAL_HTTP_CALL
ROUTE_PARAM_SCHEMA_MISSING
ROUTE_CONTRACT_MISSING
ROUTE_BUILDER_DRIFT
ROUTE_ALIAS_REDIRECT_MISSING
ROUTE_CACHE_POLICY_MISSING
ROUTE_POLICY_MAPPING_MISSING
ROUTE_TEST_EVIDENCE_MISSING
PROXY_SECURITY_ONLY_GATE
ABSOLUTE_URL_UNTRUSTED_HOST
SIGNED_URL_CANONICALIZATION_MISSING
```

Nem minden szabály automatikusan bizonyítható; warning és human review is lehet.

---

## 39. Ajánlott projektstruktúra

```text
src/
  app/
    (public)/
      products/
        page.tsx
        [slug]/
          page.tsx
          loading.tsx
          not-found.tsx

    (admin)/
      admin/
        products/
          page.tsx
          [id]/
            edit/
              page.tsx

    [lang]/
      layout.tsx
      products/
        page.tsx

    api/
      products/
        route.ts
        [id]/
          route.ts
      webhooks/
        payment-provider/
          route.ts
      downloads/
        [fileId]/
          route.ts

    robots.ts
    sitemap.ts

  proxy.ts

  modules/
    catalog/
      product/
        domain/
          product-id.ts
          product-slug.ts
          product.errors.ts

        application/
          commands/
            create-product.ts
            update-product.ts
          queries/
            get-product.ts
            get-product-by-slug.ts
            list-products.ts
          dto/
            product-detail.dto.ts
            product-list-item.dto.ts
          ports/
            product.repository.ts
            product-read.repository.ts

        infrastructure/
          persistence/
            prisma-product.repository.ts
          routing/
            product-link-factory.server.ts

        presentation/
          product.urls.ts
          product.route-schemas.ts
          components/
            product-detail-view.tsx
            product-list-view.tsx

        index.server.ts

  platform/
    routing/
      public-origin.ts
      safe-return-path.ts
      signed-url.ts
      canonical-query.ts
      locale.ts
      tenant-origin.ts

    auth/
      actor.ts
      session.server.ts
      policy.ts

    observability/
      request-context.ts
      route-metrics.ts

  composition/
    catalog.ts
    application.ts

docs/
  30-architecture/
    specifications/
      ATLAS-SPEC-ROUTING-001.md
      ATLAS-ROUTE-012.md

  40-delivery/
    evidence/

  80-winzard/
    platform-contracts/

  90-generated/
    indexes/
      route-inventory.md
    traceability/
      route-contracts.md

tests/
  unit/
    routing/
    modules/

  integration/
    routes/
    proxy/

  e2e/
    routing/
```

### 39.1. Colocation

Route-specifikus kis schema colocated lehet a route mellett, de ha HTML és API ugyanazt használja, a module presentation rétegbe kerüljön.

### 39.2. Barrel export

`index.server.ts` csak támogatott szerveroldali felületet exportáljon.

### 39.3. Circular dependency

URL builder ne importálja a page-et. Page importálhatja a buildert.

```text
page → urls
urls ✗ page
```

### 39.4. Routing platform package

Csak akkor emelj közös package-be, ha legalább több valós modul használja, és az API stabil.

---

## 40. Hibaelhárítás

### 40.1. 404 a létező fájlra

Ellenőrizd:

- `page.tsx` vagy `route.ts` pontos név;
- `src/app` tényleges app root;
- route group;
- dynamic segment syntax;
- base path;
- locale prefix;
- Proxy matcher;
- redirect/rewrite;
- build output;
- case sensitivity;
- deployment artifact.

### 40.2. `params` undefined vagy Promise

Next.js 16-ban `params` aszinkron.

Használd:

```ts
const { slug } = await params;
```

### 40.3. `searchParams` miatt dynamic route

Ez várható lehet. Dokumentáld request-time viselkedést, vagy szervezd át a UI-t, ha a query nem kell server renderhez.

### 40.4. Page és route conflict

Mozgasd az API-t külön `/api` vagy más szegmensre.

### 40.5. Route group nem jelenik meg az URL-ben

Ez tervezett. Publikus prefixhez normál mappa kell.

### 40.6. `new` slug a dinamikus route-ra megy

Hozz létre statikus `/new` route-ot és rezervált slug policyt.

### 40.7. Proxy nem fut

Ellenőrizd:

- fájlnév `proxy.ts`;
- elhelyezés `src/app` mellett;
- export neve;
- matcher;
- konstans konfiguráció;
- base path;
- excluded asset;
- Next.js verzió.

### 40.8. Proxy túl sok route-on fut

Szűkítsd a matchert, zárd ki:

```text
api ha nem kell
_next/static
_next/image
metadata
asset extension
well-known
```

### 40.9. Auth megkerülhető

Ne csak Proxyban ellenőrizd. Add hozzá a use case policyt és negatív E2E-t.

### 40.10. Redirect loop

Vizsgáld:

- canonical host;
- scheme;
- trailing slash;
- locale prefix;
- Proxy;
- next.config redirects;
- CDN redirect;
- base path.

### 40.11. Rewrite rossz oldalt ad

Nézd meg a fázist:

```text
beforeFiles
afterFiles
fallback
```

és a filesystem/dynamic precedence-t.

### 40.12. URL builder rosszul encode-ol

Szegmensenként `encodeURIComponent`, queryhez `URLSearchParams`.

TILOS teljes pathra egyszerre `encodeURIComponent`:

```ts
encodeURIComponent('/products/red-shoe')
```

### 40.13. Abszolút URL rossz domainnel

Ne request Hostból építs. Ellenőrizd az `APP_PUBLIC_ORIGIN` és tenant domain registryt.

### 40.14. Signed URL mindig érvénytelen

Ellenőrizd:

- query sorrend;
- signature kizárása canonical queryből;
- method;
- path;
- trailing slash;
- base path;
- host;
- expiry timezone/epoch;
- key version;
- encoding.

### 40.15. Signed URL lejártnak látszik

Epoch seconds vs milliseconds gyakori hiba.

```text
Date.now()           milliseconds
Math.floor(Date.now()/1000) seconds
```

### 40.16. Route statikus lett, pedig random adatot ad

Használj request-time boundaryt, például `connection()`, vagy explicit dynamic policyt.

### 40.17. Shared cache user adatot ad másnak

Azonnal:

- kapcsold no-store/private módba;
- invalidáld cache-t;
- vizsgáld a Vary/keyt;
- incidentet nyiss;
- auditáld az érintett adatot;
- adj regressziós tesztet.

### 40.18. `Link` típushiba

Futtasd:

```bash
pnpm next typegen
```

Ellenőrizd a `typedRoutes` configot és a dynamic builder assertiont.

### 40.19. Route type stale

Töröld csak a támogatott generated build outputot, majd:

```bash
pnpm next typegen
pnpm typecheck
```

Ne szerkeszd kézzel a `.next/types` fájlokat.

### 40.20. Dev működik, build elbukik

Tipikus ok:

- prerender alatt request API;
- env hiány;
- server-only/client import;
- dynamic data;
- `generateStaticParams`;
- serializáció;
- URL builder build-time origin;
- external fetch;
- route collision.

### 40.21. Windows/macOS működik, Linux CI nem

Case-sensitive path:

```text
[Slug]
[slug]
Products
products
```

eltérhet. A route mappanevek legyenek konzisztensen lowercase, kivéve Next.js bracket syntax.

### 40.22. Lokalizált route végtelen redirect

A locale detector felismerje a meglévő prefixet és zárja ki az asseteket/API-t.

### 40.23. Custom domain rossz tenantot ad

Ellenőrizd:

- host normalization;
- port;
- punycode;
- registry;
- cache key;
- stale domain mapping;
- header spoof;
- canonical redirect.

### 40.24. API `OPTIONS` hibás

Adj explicit `OPTIONS` exportot és CORS headereket, ha cross-origin contract szükséges.

### 40.25. 405 helyett furcsa válasz

Ellenőrizd, hogy a `route.ts` exportálja-e a metódust, nincs-e Proxy/redirect/rewrite, és a kliens valóban a várt URL-t hívja.

---

## 41. Symfony–Winzard megfeleltetés

| Symfony routing fogalom | Winzard / Next.js megfelelő | Megjegyzés |
| --- | --- | --- |
| Route attribute/config | `src/app` fájlrendszer | Nincs külön runtime route deklaráció |
| Route name | URL-builder szimbólum + route contract ID | Nem Next.js runtime név |
| Controller | `page.tsx`, `route.ts`, Server Function delivery adapter | Vékony adapter |
| Path | Mappastruktúra | Route group nem része az URL-nek |
| Requirement regex | Zod/operation schema | Domainvalidáció külön |
| Default parameter | Schema vagy application default | Business default ne a route-ban |
| HTTP methods | `GET`, `POST`, stb. exportok | `route.ts` |
| Host requirement | Proxy + host resolver | Policy továbbra is kell |
| Condition expression | Proxy/schema/policy/use case | Felelősség szerint bontva |
| Environment route | Capability/build composition vagy runtime gate | Runtime 404 nem route-hiány |
| Priority | Fájlrendszeri precedence, rewrite phase | Nincs integer priority |
| Optional parameter | `[[...segment]]` vagy query | Egyetlen optional scalar path nem azonos modell |
| Catch-all | `[...segments]` | Array param |
| Param converter | Schema + application query + repository port | Nincs automatikus ORM record |
| Backed enum | `z.enum()` / value object | Stabil stringérték |
| `_controller` | Fájlrendszerbeli entry file | Nem user-selected |
| `_route` | Route contract ID/path template | Nincs általános runtime route name |
| `_route_params` | `params` | Promise |
| `_locale` | `[lang]`, Proxy, locale resolver | Explicit precedence |
| `_format` | Külön Route Handler vagy content negotiation | Ne rejtett default |
| `_fragment` | Client URL hash | Nem kerül szerverre |
| `_stateless` | Explicit session/cache/cookie contract | Nincs egy flag |
| Route alias | Redirect + deprecated URL builder | Külön URL és kódcompat |
| Route prefix/group | Normál mappa / route group / layout | Route group nem prefix |
| Current route name | Explicit contract ID vagy pathname | Metricshez template kell |
| Render template route | `page.tsx` statikus view | Külön special controller nem kell |
| Redirect route | `redirect`, `permanentRedirect`, config, Proxy | Mechanizmus scope szerint |
| Subdomain route | Proxy + host/tenant resolver | Host validation |
| Localized route | `[lang]` + Proxy + builders | Hreflang/canonical |
| URL generator | Typed URL builders + `Link` | Nincs `UrlGeneratorInterface` közvetlen megfelelő |
| Absolute URL | Validált public origin builder | Ne raw Host |
| Signed URI | Saját/recipe HMAC signed URL service | Purpose, expiry, replay |
| Debug router | typegen, build debug, cél `forge route:*` | Compiler marad source |

### 41.1. Amit nem kell másolni

Nem szükséges Symfony-szerű:

- YAML/PHP route config;
- controller string;
- route loader;
- service container route injection;
- automatikus entity injection;
- runtime route name registry;
- integer priority;
- expression language a route matcherben.

### 41.2. Amit érdemes átvenni

Érdemes átvenni:

- explicit route contract;
- paraméterkövetelmények;
- HTTP-metódusok dokumentálása;
- alias/deprecation fegyelem;
- host és locale tudatos kezelése;
- URL-generálás központosítása;
- signed URL integritás;
- diagnosztikai parancsok;
- route-list és route-match gondolkodás;
- tesztelhető canonical URL;
- kompatibilitási lifecycle.

### 41.3. Winzard többlet

A Winzard hozzáadja:

- application layer határt;
- port/adapters modellt;
- DTO-kötelezettséget;
- Actor/policy contractot;
- capability-aware ellenőrzést;
- route documentation traceabilityt;
- AI contextbe illeszthető route contractot;
- generated driftet;
- consumer documentation packet;
- route security negatív fixture-eket.

---

## 42. Implementációs elfogadási kritériumok

Egy új vagy módosított route akkor tekinthető Winzard-kompatibilisnek, ha az alábbi releváns feltételek teljesülnek.

### 42.1. Route source

- [ ] A route a `src/app` fájlrendszerben egyértelmű.
- [ ] Nincs második runtime route registry.
- [ ] Nincs route collision.
- [ ] A route group és publikus prefix helyesen különül el.
- [ ] A page/route fájltípus megfelelő.

### 42.2. Input

- [ ] Minden path paraméter validált.
- [ ] Minden query paraméter validált vagy explicit ignorált.
- [ ] Request body schema validált.
- [ ] Hossz- és cardinality limit van.
- [ ] Unknown key policy dokumentált.
- [ ] Catch-all traversal ellen védett.

### 42.3. Architecture

- [ ] A delivery adapter vékony.
- [ ] Nincs közvetlen ORM import.
- [ ] Nincs saját belső HTTP API server-side fetch.
- [ ] A use case frameworkfüggetlen.
- [ ] A composition root explicit.
- [ ] A presentation explicit DTO-t kap.

### 42.4. Security

- [ ] Actor feloldás dokumentált.
- [ ] Policy/use-case authorization megtörténik.
- [ ] Tenant isolation tesztelt.
- [ ] Open redirect nincs.
- [ ] Host header nem megbízhatatlan source.
- [ ] CORS/CSRF contract helyes.
- [ ] Secretek nem kerülnek URL-be/logba.
- [ ] Signed URL esetén expiry/purpose/audience/replay kezelt.
- [ ] Cache nem szivárogtat user/tenant adatot.

### 42.5. HTTP

- [ ] Metódusok explicit exportok.
- [ ] Status code-ok dokumentáltak.
- [ ] Response DTO explicit.
- [ ] Content-Type helyes.
- [ ] Cache-Control explicit.
- [ ] `Location`, `Retry-After`, `Vary` szükség szerint helyes.
- [ ] OPTIONS/CORS szükség szerint tesztelt.
- [ ] Safe/idempotent semantics nem sérül.

### 42.6. URL

- [ ] Van canonical URL.
- [ ] Dinamikus szegmensek encode-olva.
- [ ] Query canonicalizált.
- [ ] URL builder unit tesztelt.
- [ ] Alias/redirect lifecycle dokumentált.
- [ ] Trailing slash/base path/locale kezelve.
- [ ] Abszolút URL validált originből készül.

### 42.7. Rendering és cache

- [ ] Static/dynamic/request-time döntés dokumentált.
- [ ] `searchParams`, cookie, header hatása értett.
- [ ] Prerender paraméterek contractja ismert.
- [ ] Shared cache partition helyes.
- [ ] Mutation után invalidation történik.
- [ ] Random/time-dependent output nem rögzül tévesen buildkor.

### 42.8. Compatibility

- [ ] Breaking URL change azonosított.
- [ ] Régi URL redirect vagy dokumentált megszüntetés.
- [ ] External callbackek felmérve.
- [ ] Sitemap/canonical frissült.
- [ ] Signed URL hatás vizsgált.
- [ ] Release/upgrade guide szükség szerint frissült.

### 42.9. Documentation

- [ ] Route contract friss.
- [ ] Source file link friss.
- [ ] Owner és approver ismert.
- [ ] URL builder hivatkozás szerepel.
- [ ] Auth/cache/runtime policy szerepel.
- [ ] Evidence kapcsolva.
- [ ] Publikus user/API dokumentáció friss.

### 42.10. Verification

- [ ] `pnpm next typegen`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] unit tesztek
- [ ] route adapter teszt
- [ ] Proxy/config teszt, ha releváns
- [ ] `pnpm forge check --project <PROJECT>`
- [ ] `pnpm forge docs:check --project <PROJECT>`, ha aktív
- [ ] production build
- [ ] E2E route smoke
- [ ] negatív security esetek

### 42.11. Definition of Done

A route nem tekinthető késznek kizárólag azért, mert:

```text
böngészőben megnyílik
```

A kész route:

```text
runtime route
+ input contract
+ application operation
+ policy
+ response contract
+ URL compatibility
+ cache/rendering policy
+ tests
+ documentation
+ evidence
```

---

## 43. Források és attribúció

### 43.1. Symfony szerkezeti referencia

- [Symfony Docs — Routing](https://symfony.com/doc/current/routing.html)

A Symfony routing dokumentáció a route-létrehozás, HTTP-metódusok, környezeti és feltételes route-ok, paraméterkövetelmények, opcionális paraméterek, prioritás, paraméterkonverzió, enumok, speciális paraméterek, aliasok, prefixek, hostok, lokalizáció, stateless működés, URL-generálás, signed URI és hibakeresés témáit adja a fejezet funkcionális kiindulópontjaként.

A Winzard dokumentum ezeket nem szó szerinti szövegként vagy Symfony API-ként másolja. A routingproblémákat Next.js App Router és Winzard alkalmazásarchitektúra szerint oldja meg.

### 43.2. Next.js hivatalos források

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Dynamic Route Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes)
- [`page.js` convention](https://nextjs.org/docs/app/api-reference/file-conventions/page)
- [`route.js` convention](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [`proxy.js` convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Redirecting](https://nextjs.org/docs/app/building-your-application/routing/redirecting)
- [`redirect()`](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [`permanentRedirect()`](https://nextjs.org/docs/app/api-reference/functions/permanentRedirect)
- [Rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- [Redirects configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
- [`typedRoutes`](https://nextjs.org/docs/app/api-reference/config/next-config-js/typedRoutes)
- [`basePath`](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
- [`trailingSlash`](https://nextjs.org/docs/app/api-reference/config/next-config-js/trailingSlash)
- [`generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
- [`notFound()`](https://nextjs.org/docs/app/api-reference/functions/not-found)
- [`connection()`](https://nextjs.org/docs/app/api-reference/functions/connection)
- [Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating)
- [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next)
- [Data Security](https://nextjs.org/docs/app/guides/data-security)

### 43.3. Kapcsolódó Winzard dokumentumok

- [A Winzard telepítése és beállítása](./winzard-setup.md)
- [Winzard termékhatárok, profilok és opcionális capability-k](./winzard-setup-capabilities.md)
- [Az első oldal létrehozása Winzardban](./winzard-page-creation.md)
- [Winzard alkalmazásplatform Next.js fölött](./winzard-application-platform.md)
- [Humán és AI dokumentáció Winzard projektekben](./winzard-human-ai-documentation.md)
- [Kitelepített projekt-dokumentációs CLI referencia](./winzard-project-documentation-cli.md)

### 43.4. Ellenőrzési dátum

```text
2026-07-17
```

Dokumentációfrissítéskor újra ellenőrizendő legalább:

- a Next.js aktuális verziója;
- `params` és `searchParams` async contractja;
- `PageProps`, `LayoutProps` és `RouteContext`;
- Route Handler metódusok és caching;
- Proxy név, matcher és execution order;
- redirect státuszkódok;
- rewrite fázisok;
- route segment config és Cache Components kapcsolat;
- `typedRoutes`;
- typegen és build debug flag-ek;
- `basePath` és `trailingSlash`;
- metadata route-ok;
- a Forge ténylegesen implementált `route:*` parancsai.

### 43.5. Verzióelsőbbség

Az általános dokumentumpéldákkal szemben elsőbbséget élvez:

1. a projekt lockfile-ja;
2. a projekt `package.json` fájlja;
3. a projekt sikeres CI-je;
4. a használt Next.js verzió hivatalos dokumentációja;
5. az accepted projekt-ADR és specification;
6. a telepített Winzard consumer documentation pack.

---
