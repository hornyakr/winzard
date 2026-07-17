---
title: "Routing Winzard alkalmazásokban"
description: "A Next.js App Router útvonalainak teljes Winzard-szerződése: route-fa, dinamikus paraméterek, Route Handlerek, URL-generálás, átirányítás, lokalizáció, host-routing, biztonság, tesztelés és diagnosztika."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-17"
source_basis: "Symfony Docs — Routing"
nextjs_baseline: "16.2.10"
applies_to: "kitelepített Winzard projektek és a Winzard Reference App delivery rétege"
related_documents:
  - "winzard-page-creation.md"
  - "winzard-application-platform.md"
---

# Routing Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Routing”** fejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony routing dokumentációjának funkcionális témakészletét követi — route-ok létrehozása, paraméterek, követelmények, prioritás, aliasok, prefixek, átirányítások, lokalizáció, host-alapú routing, URL-generálás, aláírt URL-ek és hibakeresés —, de minden fogalmat a Winzard **Next.js App Router + moduláris application layer + ports and adapters** architektúrájához igazít.

A dokumentum központi döntése:

> **A Winzard nem vezet be a Next.js mellé második runtime routert. A publikus URL-tér forrásigazsága a Next.js App Router fájlrendszer-alapú route-fája.**

A Winzard feladata e fölött:

- stabil route-konvenciók meghatározása;
- architekturális határok érvényesítése;
- route-paraméterek és query stringek validálási szerződése;
- típusos URL-builder minták biztosítása;
- alias-, redirect-, rewrite-, locale- és host-routing szabályok rögzítése;
- route-diagnosztika és driftellenőrzés kialakítása;
- security-, cache- és authorization-követelmények ellenőrizhetővé tétele.

A dokumentum végére egy fejlesztő:

1. megérti, hogyan képeződik a fájlrendszerből a publikus URL-tér;
2. létre tud hozni HTML-oldalt és minden támogatott HTTP-metódust kezelő Route Handlert;
3. típusosan és biztonságosan kezeli a dinamikus, catch-all és opcionális catch-all paramétereket;
4. el tudja kerülni a route-ütközéseket és a rejtett prioritási függéseket;
5. helyesen választ path paraméter, query string, header, cookie és body között;
6. képes URL-aliasokat, redirecteket, rewrite-okat és deprecation átmeneteket tervezni;
7. lokalizált, host- vagy tenantfüggő route-okat tud kialakítani;
8. típusos URL-generáló felületet tud létrehozni szerveren és kliensen;
9. megérti a stateless, cache- és sessionhatásokat;
10. biztonságosan tud időkorlátos vagy célhoz kötött aláírt URL-eket tervezni;
11. route-teszteket, buildellenőrzést és diagnosztikát tud alkalmazni;
12. el tudja különíteni a Next.js route adaptert az application és domain rétegtől.

> [!IMPORTANT]
> A `src/app` könyvtár routing-, HTTP-, rendering- és UI-adapter. Üzleti szabály, ORM-hívás, repository-implementáció, tranzakciókezelés vagy dependency wiring nem kerülhet route entrypointba.

> [!IMPORTANT]
> A dokumentumban szereplő `forge route:list`, `forge route:inspect`, `forge route:match` és `forge route:check` parancsok **cél-CLI szerződések**, amíg a repositoryban tényleges implementációjuk nem jelenik meg. A dokumentum minden ilyen esetben megadja a jelenleg használható upstream vagy manuális ellenőrzési módot is.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Előfeltételek és hatókör](#2-előfeltételek-és-hatókör)
3. [A Winzard routingmodellje](#3-a-winzard-routingmodellje)
4. [A route-fa mint forrásigazság](#4-a-route-fa-mint-forrásigazság)
5. [Oldalak és layoutok útvonalai](#5-oldalak-és-layoutok-útvonalai)
6. [Route Handlerek és HTTP-metódusok](#6-route-handlerek-és-http-metódusok)
7. [Route-szegmensek elnevezése](#7-route-szegmensek-elnevezése)
8. [Környezettől függő és feltételes routing](#8-környezettől-függő-és-feltételes-routing)
9. [Route-diagnosztika alapjai](#9-route-diagnosztika-alapjai)
10. [Dinamikus route-paraméterek](#10-dinamikus-route-paraméterek)
11. [Paramétervalidáció és követelmények](#11-paramétervalidáció-és-követelmények)
12. [Opcionális paraméterek és alapértékek](#12-opcionális-paraméterek-és-alapértékek)
13. [Route-prioritás, specifikusság és ütközések](#13-route-prioritás-specifikusság-és-ütközések)
14. [Paraméterkonverzió és erőforrás-betöltés](#14-paraméterkonverzió-és-erőforrás-betöltés)
15. [Enum- és zárt értékkészletű paraméterek](#15-enum--és-zárt-értékkészletű-paraméterek)
16. [Speciális requestadatok](#16-speciális-requestadatok)
17. [Query string és extra paraméterek](#17-query-string-és-extra-paraméterek)
18. [Catch-all, opcionális catch-all és slash-tartalmú paraméterek](#18-catch-all-opcionális-catch-all-és-slash-tartalmú-paraméterek)
19. [Route-aliasok és deprecation](#19-route-aliasok-és-deprecation)
20. [Route groupok, prefixek és szervezési határok](#20-route-groupok-prefixek-és-szervezési-határok)
21. [Az aktuális route és request azonosítása](#21-az-aktuális-route-és-request-azonosítása)
22. [Közvetlen renderelés, redirect és rewrite](#22-közvetlen-renderelés-redirect-és-rewrite)
23. [Trailing slash és URL-kanonizálás](#23-trailing-slash-és-url-kanonizálás)
24. [Host-, subdomain- és tenant-routing](#24-host--subdomain--és-tenant-routing)
25. [Lokalizált route-ok](#25-lokalizált-route-ok)
26. [Stateless route-ok, session és cache](#26-stateless-route-ok-session-és-cache)
27. [URL-generálás alapelvei](#27-url-generálás-alapelvei)
28. [Típusos route-builder réteg](#28-típusos-route-builder-réteg)
29. [Navigáció Server és Client Componentből](#29-navigáció-server-és-client-componentből)
30. [URL-generálás parancsokból, jobokból és külső folyamatokból](#30-url-generálás-parancsokból-jobokból-és-külső-folyamatokból)
31. [Route-létezés és típusgenerálás](#31-route-létezés-és-típusgenerálás)
32. [HTTPS, origin és reverse proxy](#32-https-origin-és-reverse-proxy)
33. [Aláírt és időkorlátos URL-ek](#33-aláírt-és-időkorlátos-url-ek)
34. [`generateStaticParams`, `dynamicParams` és route-tér előállítása](#34-generatestaticparams-dynamicparams-és-route-tér-előállítása)
35. [Parallel és intercepting route-ok](#35-parallel-és-intercepting-route-ok)
36. [Routing és authorization](#36-routing-és-authorization)
37. [Routing és adatbiztonság](#37-routing-és-adatbiztonság)
38. [Routing és cache-biztonság](#38-routing-és-cache-biztonság)
39. [Tesztelési stratégia](#39-tesztelési-stratégia)
40. [Architekturális szabályok](#40-architekturális-szabályok)
41. [Tervezett Forge route-diagnosztika](#41-tervezett-forge-route-diagnosztika)
42. [Implementációs elfogadási kritériumok](#42-implementációs-elfogadási-kritériumok)
43. [Hibaelhárítás](#43-hibaelhárítás)
44. [Symfony–Winzard megfeleltetés](#44-symfonywinzard-megfeleltetés)
45. [Források és attribúció](#45-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy routing-, biztonsági, kompatibilitási, reprodukálhatósági, illetve architekturális hibát okozhat;
- **TILOS / MUST NOT**: a megoldás Winzard-kompatibilis projektben nem használható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak explicit és review-zott indokkal használható;
- **OPCIONÁLIS / MAY**: a projekt igénye szerint alkalmazható.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Fő fogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Route-fa** | A `src/app` fájlrendszerbeli szegmenseiből képzett publikus URL-tér és renderelési hierarchia. |
| **Route szegmens** | A route-fa egy mappája, például `products`, `[productId]`, `(admin)` vagy `@modal`. |
| **Page** | Egy URL-en renderelt HTML-felület, amelyet `page.tsx` tesz publikus végponttá. |
| **Layout** | Egy route-részfa közös, állapotot megtartó UI-kerete. |
| **Route Handler** | Web `Request`/`Response` API-ra épülő HTTP-adapter egy `route.ts` fájlban. |
| **Dinamikus szegmens** | Egyetlen path-elemet fogadó `[param]` szegmens. |
| **Catch-all szegmens** | Egy vagy több path-elemet tömbként fogadó `[...param]` szegmens. |
| **Opcionális catch-all** | Nulla vagy több path-elemet fogadó `[[...param]]` szegmens. |
| **Route group** | Zárójeles mappa, például `(admin)`, amely szervezési vagy layout-határt ad, de nem jelenik meg az URL-ben. |
| **Parallel route** | Named slot, például `@modal`, amely ugyanazon layoutban párhuzamos route-részfát renderel. |
| **Intercepting route** | Olyan route-konvenció, amely navigációkor másik route tartalmát az aktuális layoutkörnyezetben jeleníti meg. |
| **Proxy** | A Next.js request-előfeldolgozó belépési pontja; korábban middleware néven szerepelt. Redirectet, rewrite-ot, headermódosítást vagy korai választ adhat. |
| **Rewrite** | Belső URL-leképezés, amely a böngészőben látható URL-t nem változtatja meg. |
| **Redirect** | Olyan válasz vagy konfiguráció, amely a klienst másik URL-re irányítja. |
| **Kanonikus URL** | Ugyanazon erőforrás vagy művelet elsődleges, támogatott publikus címe. |
| **Route identity** | A Winzardban a route pattern, például `/products/[productId]`; nem egy külön runtime route-név. |
| **Route builder** | Típusos TypeScript-függvény, amely route-paraméterekből biztonságos relatív vagy abszolút URL-t állít elő. |
| **Delivery adapter** | Next.js-specifikus route entrypoint, amely requestadatot olvas, validál, application műveletet hív és választ képez. |
| **Origin** | Egy URL scheme, host és port része, például `https://example.com`. |
| **Signed URL** | Kriptográfiai aláírással védett URL, amelynek pathja, queryje, lejárata és célja manipuláció ellen ellenőrizhető. |

### 1.3. Symfony és Winzard routingfogalmak

A Symfony routingmodell tipikusan ezt a láncot használja:

```text
route konfiguráció
  -> route matcher
  -> controller
  -> request attribútumok
  -> Response
```

A Winzard megfelelője:

```text
src/app route-fa
  -> Next.js route resolution
  -> page.tsx vagy route.ts delivery adapter
  -> input schema
  -> application query vagy command
  -> DTO / application result
  -> React UI vagy Web Response
```

A Symfony route-neveket és route-konfigurációs objektumokat használ. A Next.js App Router ezzel szemben fájlrendszerből képez URL-t. A Winzard ezért nem próbál Symfony-szerű route registryt ráépíteni a runtime-ra.

### 1.4. Parancsok státusza

| Státusz | Jelentés |
| --- | --- |
| **Upstream parancs** | Jelenleg is használható Next.js-, TypeScript-, pnpm- vagy Git-parancs. |
| **Winzard célparancs** | A Forge tervezett publikus felülete, amely csak implementáció után tekinthető elérhetőnek. |
| **Manuális megfelelő** | A célparancs hiányában használható upstream ellenőrzés vagy kézi vizsgálat. |

---

## 2. Előfeltételek és hatókör

### 2.1. Technikai baseline

A példák az alábbi baseline-ra készültek:

```text
Node.js:    24.x LTS
pnpm:       11.x
Next.js:    16.2.10
React:      19.2.x
TypeScript: 5.9.x
App Router: igen
src/:       igen
```

A repositoryban rögzített verziók és a sikeres CI eredménye elsőbbséget élveznek az általános példákkal szemben.

### 2.2. Kötelező előfeltételek

A fejezet használata előtt KÖTELEZŐ:

1. a projektet a Winzard setup szerződése szerint beüzemelni;
2. az App Routert használni;
3. TypeScript strict módot használni;
4. az `@/*` aliast a projekt `src/*` könyvtárára irányítani;
5. a route entrypointokat vékony delivery adapterként kezelni;
6. minden külső requestadatot bizalmatlan inputnak tekinteni.

Ajánlott első ellenőrzés:

```bash
pnpm install --frozen-lockfile
pnpm typegen
pnpm typecheck
pnpm lint
pnpm dev
```

### 2.3. A fejezet hatóköre

A fejezet lefedi:

- HTML-route-ok;
- Route Handlerek;
- HTTP-metódusok;
- dinamikus és catch-all paraméterek;
- query stringek;
- route groupok és layout-határok;
- redirectek és rewrite-ok;
- locale- és host-routing;
- URL-generálás;
- route-típusok;
- cache-, auth- és security-határok;
- route-tesztelés és diagnosztika.

### 2.4. Ami nem tartozik ide

Külön dokumentáció tárgya:

- domain routing vagy workflow engine;
- message bus és queue routing;
- event routing;
- API gateway vagy service mesh konfiguráció;
- DNS és CDN teljes konfigurációja;
- auth provider részletes implementációja;
- általános observability platform.

---

## 3. A Winzard routingmodellje

### 3.1. Egy router, több architekturális réteg

A Winzard routingmodelljében:

```text
Next.js App Router
  = URL-felismerés + renderelési hierarchia + HTTP entrypoint

Winzard application layer
  = műveleti contract + authorization + orchestration

Winzard domain layer
  = üzleti invariánsok és állapotátmenetek

Winzard infrastructure
  = adatbázis, queue, külső szolgáltatás, runtime adapter
```

A route nem azonos az üzleti use case-szel. Ugyanazt az application műveletet több delivery adapter is használhatja:

```text
/products/[productId]       HTML page
/api/products/[productId]   JSON Route Handler
internal command            háttérfeladat
```

Mindhárom ugyanazt a `GetProduct` queryt hívhatja.

### 3.2. A route nem jogosultsági határ önmagában

Egy URL elrejtése vagy nem linkelése nem authorization.

```text
nincs link a menüben
≠
a route nem hívható
```

Minden védett műveletnél KÖTELEZŐ:

1. Actor vagy hitelesített request context előállítása;
2. input validálása;
3. policy vagy ability ellenőrzése;
4. csak ezután application művelet futtatása.

### 3.3. A route tree nem modulfa

A publikus URL-tér felhasználói információs architektúra. A modulfa üzleti ownership és függőségi határ.

Nem szükséges, hogy:

```text
src/app/admin/catalog/products
```

pontosan tükrözze ezt:

```text
src/modules/catalog/product
```

A kapcsolat a delivery adapter importján és a composition rooton keresztül explicit.

### 3.4. Támogatott route-célok

A Winzard route célja lehet:

- page;
- Route Handler;
- redirect;
- rewrite;
- not-found;
- error boundary;
- loading boundary;
- metadata előállítás;
- parallel slot;
- intercepting UI;
- locale vagy tenant feloldás.

A route célja nem lehet közvetlenül:

- Prisma modell;
- repository implementation;
- tranzakció;
- üzleti aggregátum mutation;
- külső provider SDK orchestration.

---

## 4. A route-fa mint forrásigazság

### 4.1. Fájlrendszer-alapú deklaráció

Példa:

```text
src/app/
  page.tsx
  products/
    page.tsx
    [productId]/
      page.tsx
      edit/
        page.tsx
  api/
    products/
      route.ts
      [productId]/
        route.ts
```

Publikus útvonalak:

```text
/
/products
/products/:productId
/products/:productId/edit
/api/products
/api/products/:productId
```

### 4.2. Mi tesz egy szegmenst publikus route-tá?

Egy mappa önmagában nem feltétlenül publikus végpont. Publikus HTML-végpontot a `page.tsx`, HTTP-végpontot a `route.ts` hoz létre.

A következő csak szervezési mappa:

```text
src/app/products/
```

amíg nincs benne vagy alatta route entrypoint.

### 4.3. A route-fa és a renderelési fa

A route-fa nem csak URL-matcher. Meghatározza:

- a layout öröklést;
- a loading boundaryt;
- az error boundaryt;
- a not-found boundaryt;
- a metadata-öröklést;
- a parallel slotokat;
- a statikus vagy request-time renderelési lehetőségeket.

Ezért route-átszervezés UI- és runtime-hatással is járhat akkor is, ha a publikus URL nem változik.

### 4.4. Tilos a második runtime route-registry

Nem támogatott:

```ts
export const routes = [
  { name: 'product_show', path: '/products/:id', handler: showProduct },
];
```

ha ez a registry saját matchert vagy dispatchert vezet be az App Router mellett.

Támogatott:

```ts
export const productRoutes = {
  list: () => '/products',
  detail: (productId: string) => `/products/${encodeURIComponent(productId)}`,
};
```

Ez URL-builder, nem runtime router.

### 4.5. Route metadata

A Winzard később tarthat route-hoz kapcsolódó **származtatott** metadata-indexet diagnosztikai célra, de:

- a route patternet nem duplikálhatja kézzel karbantartott registrybe;
- az indexet a route-fából kell generálni;
- drift esetén hibát kell adni;
- runtime matchingre a Next.js marad felelős.

---

## 5. Oldalak és layoutok útvonalai

### 5.1. Statikus oldal

```tsx
// src/app/about/page.tsx
export default function AboutPage() {
  return (
    <main>
      <h1>Rólunk</h1>
    </main>
  );
}
```

Útvonal:

```text
/about
```

### 5.2. Nested oldal

```text
src/app/account/settings/page.tsx
```

Útvonal:

```text
/account/settings
```

### 5.3. Layout

```tsx
// src/app/account/layout.tsx
import type { ReactNode } from 'react';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <nav aria-label="Fiók navigáció">...</nav>
      {children}
    </section>
  );
}
```

A layout nem hoz létre önálló `/account` oldalt. Ahhoz külön `page.tsx` szükséges.

### 5.4. Layouthatár mint architekturális döntés

Egy layout használható:

- publikus és admin UI elkülönítésére;
- eltérő navigációra;
- eltérő auth shellre;
- tenant- vagy locale-context átadására;
- parallel route-ok fogadására.

Nem használható üzleti service locatornak vagy repository-k tárolására.

### 5.5. Indexoldal és részletoldal

```text
src/app/products/page.tsx
src/app/products/[productId]/page.tsx
```

A list és detail két külön delivery adapter. Közös application queryket és presentation komponenseket használhatnak, de nem importálhatják egymás `page.tsx` fájlját.

---

## 6. Route Handlerek és HTTP-metódusok

### 6.1. Alapmodell

```ts
// src/app/api/products/route.ts
export async function GET(): Promise<Response> {
  return Response.json({ items: [] });
}
```

A Route Handler Web `Request` és `Response` API-t használ.

### 6.2. Támogatott metódusok

A Next.js Route Handler támogatja:

```text
GET
POST
PUT
PATCH
DELETE
HEAD
OPTIONS
```

Példa több metódussal:

```ts
export async function GET(): Promise<Response> {
  // query adapter
}

export async function POST(request: Request): Promise<Response> {
  // command adapter
}
```

### 6.3. Winzard metódusszabályok

- `GET` és `HEAD` nem okozhat üzleti state mutationt.
- `POST`, `PUT`, `PATCH`, `DELETE` inputját műveletspecifikus schema validálja.
- A Route Handler közvetlen ORM-hívása TILOS.
- Az authorization minden védett műveletnél KÖTELEZŐ.
- A response explicit DTO-t vagy hibaszerződést használjon.
- A cache-policyt tudatosan kell megadni.

### 6.4. Példa kanonikus POST adapterre

```ts
import { createProductInputSchema } from '@/modules/catalog/product/presentation/product.schemas';
import { catalogModule } from '@/composition/catalog';
import { getActor } from '@/platform/auth/get-actor.server';

export async function POST(request: Request): Promise<Response> {
  const actor = await getActor();
  const payload = createProductInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return Response.json(
      {
        code: 'INVALID_INPUT',
        issues: payload.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await catalogModule.commands.createProduct.execute({
    actor,
    input: payload.data,
  });

  return Response.json(result, {
    status: 201,
    headers: {
      Location: `/api/products/${encodeURIComponent(result.id)}`,
    },
  });
}
```

### 6.5. `HEAD` és `OPTIONS`

A Next.js automatikus viselkedést biztosíthat bizonyos esetekben, de explicit API-contractnál AJÁNLOTT a kívánt működést tesztelni.

CORS esetén az `OPTIONS` válasz nem lehet ad hoc minden route-ban. Közös policy vagy támogatott adapter szükséges.

### 6.6. Page és Route Handler azonos szegmensben

Ugyanazon route szegmensben a `page.tsx` és `route.ts` használata konfliktusos lehet, mert ugyanazt az útvonalat kétféle publikus végpontként definiálná. A JSON/API végpontokat AJÁNLOTT külön `/api` vagy más explicit namespace alatt tartani.

---

## 7. Route-szegmensek elnevezése

### 7.1. Publikus URL-ek

A publikus route-szegmens:

- legyen stabil;
- legyen rövid, de egyértelmű;
- lehetőleg főnévi erőforrásnevet használjon;
- ne szivárogtasson belső implementációs osztálynevet;
- ne függjön ORM-tábla nevétől.

Ajánlott:

```text
/products
/products/[productId]
/orders/[orderId]/cancel
```

Kerülendő:

```text
/prisma-products
/product-entity/[id]
/doCancelOrderUseCase
```

### 7.2. Kebab-case

Publikus URL-szegmenshez AJÁNLOTT a kebab-case:

```text
/password-reset
/order-history
```

A dinamikus paraméter neve TypeScript-azonosító, ezért camelCase lehet:

```text
[productId]
[orderNumber]
```

### 7.3. Erőforrás és művelet

CRUD-szerű route-ok:

```text
GET    /api/products
POST   /api/products
GET    /api/products/:productId
PATCH  /api/products/:productId
DELETE /api/products/:productId
```

Domainműveletnél explicit action subresource használható:

```text
POST /api/orders/:orderId/cancel
POST /api/invoices/:invoiceId/issue
```

A command ne legyen query stringbe rejtve:

```text
POST /api/orders/:orderId?action=cancel
```

kivéve, ha a külső protokoll ezt kényszeríti és az eltérés dokumentált.

### 7.4. Belső route group neve

Route group név nem publikus contract, de legyen jelentéssel bíró:

```text
(public)
(admin)
(authenticated)
(marketing)
```

Kerülendő:

```text
(group1)
(misc)
(temp)
```

---
## 8. Környezettől függő és feltételes routing

### 8.1. Symfony-megfelelő

A Symfony route konfigurációja környezethez köthető, illetve route matching expression használható host, header, request context vagy más feltétel alapján.

A Next.js App Routerben nincs közvetlen, route-entrypointon deklarálható Symfony-szerű `env` vagy expression matcher. A Winzard ezért három külön problémát különít el:

1. **build/deployment profil:** mely route-fájlok kerülnek az artifactba;
2. **request shaping:** redirect, rewrite vagy korai elutasítás Proxyban;
3. **üzleti hozzáférés:** authorization az application boundaryn.

### 8.2. Környezetfüggő route elrejtése

Nem ajánlott:

```ts
export default function DebugPage() {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return <DebugDashboard />;
}
```

Ez a route-ot továbbra is létezővé teheti, csak más választ renderel.

Támogatott megoldások:

- a route csak külön dev fixture-ben létezik;
- a route külön profile/template része;
- production build előtt determinisztikusan kizárt source tree készül;
- a route minden környezetben létezik, de explicit policy védi.

### 8.3. Feature flag

Feature flag nem helyettesíti a route contractot.

Ha egy route feature flag mögött van:

- a route létezése legyen dokumentált;
- a disabled állapot válasza legyen explicit;
- a cache kulcs vegye figyelembe a flag scope-ját;
- a security check ne csak a flagre épüljön;
- a flag provider hiba esetén fail-closed módon viselkedjen kritikus funkciónál.

Példa:

```ts
import { notFound } from 'next/navigation';

import { productModule } from '@/composition/catalog';
import { featureFlags } from '@/platform/features/feature-flags.server';

export default async function ProductComparePage() {
  const enabled = await featureFlags.isEnabled('product-compare');

  if (!enabled) {
    notFound();
  }

  const result = await productModule.queries.getComparison.execute();
  return <ProductComparisonView result={result} />;
}
```

### 8.4. Proxy mint request-előfeldolgozó

A `proxy.ts` használható:

- host- vagy locale-felismerésre;
- átirányításra;
- belső rewrite-ra;
- alacsony költségű header normalizálásra;
- karbantartási mód korai válaszára.

Nem ajánlott Proxyban:

- ORM-lekérdezés;
- domain service hívás;
- hosszú külső API-kérés;
- végleges authorization döntés minden adattal;
- üzleti command végrehajtás.

### 8.5. Matcher

A Proxy matcherét explicit módon kell szűkíteni. Matcher nélkül assetekre és más nem kívánt requestekre is lefuthat.

Példa:

```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

A regexet KÖTELEZŐ tesztelni. A túl tág matcher teljesítmény- és működési hibát okozhat.

### 8.6. Biztonsági alapelv

A route hiánya, redirectje vagy rewrite-ja nem végleges hozzáférés-ellenőrzés.

```text
Proxy redirect
  +
Route Handler policy
  +
Application use-case authorization
```

A kritikus műveletet az application boundary védi.

---

## 9. Route-diagnosztika alapjai

### 9.1. Jelenleg használható upstream ellenőrzések

```bash
pnpm next dev
pnpm next typegen
pnpm exec tsc --noEmit
pnpm next build
pnpm next build --debug
```

A `next typegen` route-, page-, layout- és handler-típusokat generál. A production build a route-fát is elemzi, és számos konfliktust vagy hibát buildidőben jelez.

### 9.2. Build route-tábla

A `next build` kimenete megmutathatja:

- a route patternöket;
- statikus vagy dinamikus renderelési besorolást;
- bundle- és route-információkat;
- debug módban redirect-, rewrite- és header-konfigurációt.

A build output nem feltétlenül stabil gépi API. Automatizált Winzard-ellenőrzés nem parse-olhat törékeny konzolszöveget tartós contractként, ha nincs támogatott strukturált forrás.

### 9.3. Manuális route-audit

Route-változáskor legalább ellenőrizni kell:

```text
1. új vagy módosított app könyvtárak;
2. page.tsx és route.ts entrypointok;
3. dinamikus szegmensnevek;
4. route groupok és layoutok;
5. redirects és rewrites;
6. Proxy matcher;
7. navigációs linkek és route builderök;
8. cache- és auth-hatások;
9. E2E route smoke tesztek.
```

### 9.4. Route snapshot

A projekt fenntarthat generált route snapshotot diagnosztikához:

```text
docs/90-generated/routing/route-map.md
```

Ez:

- generált;
- nem runtime source of truth;
- route patterneket, entrypointokat és capability-tulajdont mutathat;
- driftellenőrzött;
- nem tartalmazhat secretet vagy belső environmentértéket.

### 9.5. Tervezett Forge-parancsok

```bash
pnpm forge route:list
pnpm forge route:inspect /products/[productId]
pnpm forge route:match /products/123
pnpm forge route:check
```

A részletes célcontractot a 41. fejezet határozza meg.

---

## 10. Dinamikus route-paraméterek

### 10.1. Egyetlen dinamikus szegmens

```text
src/app/products/[productId]/page.tsx
```

Példa page:

```tsx
import { productIdSchema } from '@/modules/catalog/product/presentation/product.schemas';
import { catalogModule } from '@/composition/catalog';

export default async function ProductPage({
  params,
}: PageProps<'/products/[productId]'>) {
  const rawParams = await params;
  const parsed = productIdSchema.safeParse(rawParams.productId);

  if (!parsed.success) {
    // Az alkalmazás döntése szerint notFound vagy explicit bad request UI.
    throw new Error('Invalid product route parameter');
  }

  const result = await catalogModule.queries.getProduct.execute({
    productId: parsed.data,
  });

  return <ProductDetailView result={result} />;
}
```

### 10.2. A `params` async szerződése

A modern App Router page- és layout-propokban a `params` Promise. KÖTELEZŐ `await`-elni, illetve a generált `PageProps` vagy `RouteContext` helperrel típusosítani.

### 10.3. Route Handler paraméter

```ts
export async function GET(
  _request: Request,
  context: RouteContext<'/api/products/[productId]'>,
): Promise<Response> {
  const { productId } = await context.params;
  // validation + application query
}
```

### 10.4. Paraméternév mint publikus fejlesztői contract

A dinamikus szegmens neve megjelenik:

- a `params` típusban;
- route handler contextben;
- route builder API-ban;
- tesztekben;
- dokumentációban.

Ezért `[id]` helyett AJÁNLOTT a jelentéssel bíró név:

```text
[productId]
[orderNumber]
[locale]
```

### 10.5. Paraméter nem domainobjektum

A route-paraméter string vagy stringtömb. Nem tekinthető automatikusan:

- UUID-nak;
- számszerű adatnak;
- enumértéknek;
- adatbázisban létező azonosítónak;
- jogosult erőforrásnak.

A validáció és az erőforrás-feloldás külön lépés.

### 10.6. Decode és normalizálás

A Next.js az URL feldolgozását elvégzi, de a projektnek meg kell határoznia:

- case sensitivity;
- Unicode normalizálás;
- whitespace tiltás;
- slug-formátum;
- maximális hossz;
- kanonikus alak.

Például egy username lehet case-insensitive, míg egy aláírt token case-sensitive.

---

## 11. Paramétervalidáció és követelmények

### 11.1. Symfony `requirements` megfelelője

Symfonyban route-regex korlátozhatja a matchinget. Az App Routerben a dinamikus szegmens alapértelmezetten tetszőleges egyetlen path-elemet fogad.

A Winzardban a követelmény két rétegű:

```text
route shape
  = fájlrendszeri szegmensforma

semantic validation
  = műveletspecifikus schema a delivery boundaryn
```

### 11.2. Műveletspecifikus Zod schema

```ts
import { z } from 'zod';

export const productIdSchema = z
  .string()
  .uuid()
  .brand<'ProductId'>();
```

Használat:

```ts
const parsed = productIdSchema.safeParse(productId);

if (!parsed.success) {
  return Response.json(
    { code: 'INVALID_PRODUCT_ID' },
    { status: 400 },
  );
}
```

### 11.3. 400 vagy 404?

A választ a route contract határozza meg.

**400 Bad Request** indokolt, ha:

- API-kliens szintaktikailag érvénytelen paramétert adott;
- a hibát a kliensnek javítania kell;
- a paraméterformátum publikus API-contract.

**404 Not Found** indokolt, ha:

- HTML-route-nál nem kívánjuk megkülönböztetni az érvénytelen és nem létező azonosítót;
- security okból nem szivárogtatjuk az erőforrás létezését;
- a route minden nem feloldható azonosítóra ugyanazt a választ adja.

### 11.4. Regex használata

Regex használható schema részeként:

```ts
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
```

Követelmények:

- legyen `u` flag, ha Unicode-viselkedés releváns;
- legyen maximális hossz;
- kerülje a katasztrofális backtrackinget;
- legyenek negatív tesztek;
- ne próbáljon domainlétezést regexszel ellenőrizni.

### 11.5. Számparaméterek

Nem támogatott:

```ts
const page = Number(rawPage);
```

ellenőrzés nélkül, mert `NaN`, tört, negatív és túl nagy érték is keletkezhet.

Támogatott:

```ts
const pageSchema = z.coerce.number().int().min(1).max(10_000);
```

### 11.6. Többlépcsős validáció

```text
1. path string formátum
2. normalizált value object
3. erőforrás létezése
4. authorization
5. üzleti invariáns
```

Ezeket nem szabad egyetlen ORM-query paraméterbe összesűríteni.

### 11.7. Kanonikus redirect normalizálás után

Ha a paraméter érvényes, de nem kanonikus:

```text
/Products/ABC
→
/products/abc
```

használható permanent redirect, ha:

- a normalizálás determinisztikus;
- nincs securitykülönbség;
- nem változik az erőforrás jelentése;
- a query string szükséges részei megmaradnak.

---

## 12. Opcionális paraméterek és alapértékek

### 12.1. Symfony és App Router különbsége

Symfonyban egy route-paraméter alapértékkel opcionálissá tehető. App Routerben a `[page]` szegmens mindig jelen van az adott route patternben.

A következő két route különböző:

```text
/blog
/blog/[page]
```

### 12.2. Ajánlott lapozási modell

A lapozás legtöbbször query string:

```text
/products?page=2
```

Előnye:

- a collection route stabil;
- filterekkel együtt kezelhető;
- nem kell külön route-fát fenntartani;
- kanonikus URL egyszerűbb.

### 12.3. Külön route alapértékkel

Ha a path része a publikus SEO-contractnak:

```text
/articles
/articles/page/[page]
```

Az első route `page = 1` inputtal hívhatja ugyanazt a queryt.

```tsx
export default async function ArticlesPage() {
  const result = await articleModule.queries.listArticles.execute({ page: 1 });
  return <ArticleListView result={result} />;
}
```

### 12.4. Opcionális catch-all

```text
src/app/docs/[[...segments]]/page.tsx
```

Illeszkedik:

```text
/docs
/docs/getting-started
/docs/api/routes
```

A `segments` értéke lehet `undefined` vagy stringtömb.

### 12.5. Mikor ne használj opcionális catch-allt?

Nem ajánlott pusztán azért használni, hogy Symfony-szerű opcionális paramétert szimuláljunk.

Kerülendő:

```text
/products/[[...id]]
```

ha valójában csak:

```text
/products
/products/[productId]
```

szükséges.

### 12.6. Alapértékek helye

Az alapérték lehet:

- input schema defaultja;
- application query defaultja;
- route adapter explicit inputja.

A választást dokumentálni kell. Általános szabály:

- HTTP-specifikus default a presentation schema-ban;
- üzleti default az application/domain contractban;
- route-specifikus default a delivery adapterben.

### 12.7. Opcionális paraméterek sorrendje

A fájlrendszeri route-ban nincs Symfony-féle „az opcionális után minden paraméter opcionális” szabály. Az útvonalfa explicit. Ez előny: a route shape egyértelmű.

Ugyanakkor egy túl általános optional catch-all képes sok statikus útvonalat magába fogni. Az ütközéseket builddel és route-tesztekkel kell ellenőrizni.

---

## 13. Route-prioritás, specifikusság és ütközések

### 13.1. Ne függj definíciós sorrendtől

Symfony konfigurációban a route sorrend vagy explicit priority befolyásolhatja a matchinget. App Routerben a route-fa és a szegmenstípusok határozzák meg a feloldást.

A Winzard szabály:

> A route design legyen szemantikailag egyértelmű; ne próbálj fájlsorrenddel prioritást kódolni.

### 13.2. Statikus és dinamikus szegmens

Példa:

```text
/products/new
/products/[productId]
```

A statikus `new` route külön szegmens. Ennek ellenére a `productId` schema ne fogadjon el tiltott rezervált slugokat, ha ugyanazt más adapter vagy route builder felhasználhatja.

```ts
const productIdSchema = z.string().uuid();
```

jobb, mint egy tetszőleges slug, ha az ID valóban UUID.

### 13.3. Általános slug és rezervált szavak

Ha a detail route slugot használ:

```text
/articles/[slug]
/articles/archive
```

akkor a slug contract kezelje a rezervált értékeket:

```ts
const RESERVED_ARTICLE_SLUGS = new Set(['archive', 'new', 'search']);
```

### 13.4. Catch-all ütközés

A catch-all legyen egyértelműen egy namespace végén:

```text
/docs/[...segments]
```

Kerülendő túl magas szinten:

```text
/[...segments]
```

mert:

- nehezíti a hibakeresést;
- elnyelhet új route-intenciókat;
- rossz 404-viselkedést okozhat;
- security és cache scope-ja túl széles lehet.

### 13.5. Két route group ugyanarra az URL-re

Nem támogatott:

```text
src/app/(public)/about/page.tsx
src/app/(marketing)/about/page.tsx
```

Mindkettő `/about` lenne. A route group nem része a publikus URL-nek.

### 13.6. Több root layout

Több route group külön root layoutot adhat. A közöttük történő navigáció teljes page loadot okozhat. Ez nem URL-ütközés, de UX- és állapotkezelési hatás, amelyet tesztelni kell.

### 13.7. Konfliktusellenőrzés

Kötelező minimum:

```bash
pnpm typegen
pnpm typecheck
pnpm build
```

Ajánlott:

- route smoke tesztek;
- generált route map diff;
- route builder compile-time tesztek;
- reserved slug negatív tesztek.

---

## 14. Paraméterkonverzió és erőforrás-betöltés

### 14.1. Symfony automatikus konverziója

Symfony képes route-paraméterből automatikusan entityt vagy más objektumot feloldani. A Winzard ezt szándékosan nem másolja egy az egyben.

TILOS olyan magic, amely:

```text
route paraméter
→ automatikus ORM query
→ Prisma record a page propban
```

### 14.2. Explicit Winzard-folyamat

```text
raw route param
  -> presentation schema
  -> branded/value-object ID
  -> application query
  -> repository port
  -> DTO
```

Példa:

```ts
const parsed = productIdSchema.parse(productId);
const result = await catalogModule.queries.getProduct.execute({
  productId: parsed,
  actor,
});
```

### 14.3. Miért fontos az explicit lépés?

- látható a validáció;
- látható az authorization;
- tesztelhető a use case;
- az application nem függ Next.js-től;
- az ORM rekord nem szivárog a UI-ba;
- a nem található és tiltott állapot külön kezelhető;
- auditálható a repository-hívás.

### 14.4. Nem található erőforrás

Az application query stabil hibát adhat:

```ts
export class ProductNotFoundError extends Error {
  readonly code = 'PRODUCT_NOT_FOUND';
}
```

A page adapter:

```tsx
import { notFound } from 'next/navigation';

try {
  const product = await query.execute(input);
  return <ProductView product={product} />;
} catch (error) {
  if (error instanceof ProductNotFoundError) {
    notFound();
  }
  throw error;
}
```

Az API adapter ugyanazt 404 JSON-hibára képezheti.

### 14.5. Authorization és létezés

A query ne szivárogtassa ki automatikusan, hogy egy tiltott erőforrás létezik. A policy döntheti el, hogy:

- 403;
- 404;
- redacted DTO

a helyes külső viselkedés.

### 14.6. Több paraméterből feloldás

```text
/organizations/[organizationSlug]/projects/[projectKey]
```

A két paramétert együtt kell validálni és tenant-scope-ban feloldani.

Nem elég:

```ts
repository.findProjectByKey(projectKey)
```

Támogatott:

```ts
repository.findProject({ organizationId, projectKey })
```

### 14.7. Batch és N+1

Nested route-layoutok több szinten is kérhetnek adatot. A közös context és query design kerülje az észrevétlen N+1 lekérdezést. A route-fa nem indok közvetlen adatbázis-hozzáférésre minden layoutban.

---

## 15. Enum- és zárt értékkészletű paraméterek

### 15.1. Példa locale-ra

```ts
import { z } from 'zod';

export const localeSchema = z.enum(['hu', 'en', 'de']);
export type Locale = z.infer<typeof localeSchema>;
```

### 15.2. Route-paraméter validálása

```tsx
import { notFound } from 'next/navigation';

export default async function LocalizedPage({
  params,
}: PageProps<'/[locale]/products'>) {
  const { locale: rawLocale } = await params;
  const locale = localeSchema.safeParse(rawLocale);

  if (!locale.success) {
    notFound();
  }

  // locale.data típusosan használható
}
```

### 15.3. TypeScript union önmagában nem runtime validáció

Ez nem elég:

```ts
type Locale = 'hu' | 'en';
const locale = rawLocale as Locale;
```

A type assertion nem ellenőrzi a requestet.

### 15.4. Domain enum és presentation enum

Nem minden route enum domain enum.

Például:

```text
/products/grid
/products/list
```

lehet presentation preference, nem domainfogalom.

Ezzel szemben:

```text
/orders/status/paid
```

üzleti státuszt jeleníthet meg, de még ekkor is query filter input, nem automatikusan domain object.

### 15.5. Enum fejlődése

Új enumérték hozzáadásakor ellenőrizni kell:

- URL backward compatibility;
- statikus generálás;
- cache invalidation;
- analytics dimension;
- sitemap;
- route builder union;
- localization;
- API klienskompatibilitás.

### 15.6. Backed enum megfelelő

Symfony backed enum paraméterátadásának Winzard-megfelelője:

```text
runtime schema
+ TypeScript union/enum
+ explicit application input
```

Nincs automatikus framework-paraméterkonverzió.

---

## 16. Speciális requestadatok

### 16.1. Symfony speciális paraméterek megfeleltetése

| Symfony fogalom | Winzard / Next.js megfelelő |
| --- | --- |
| `_controller` | `page.tsx`, `route.ts`, `default.tsx` vagy más framework entrypoint |
| `_format` | explicit path/query/header negotiation és `Content-Type` |
| `_fragment` | kliensoldali URL hash; nem jut el HTTP-requestként a szerverhez |
| `_locale` | validált `[locale]` szegmens vagy request-derived locale context |
| `_query` | `searchParams` vagy `URLSearchParams` |
| request attribútumok | route params, headers, cookies, request context és explicit input DTO |

### 16.2. Formátum

Nem ajánlott a response formátumot implicit fájlkiterjesztésből kitalálni minden route-on.

Támogatott minták:

```text
/api/reports/[reportId]              JSON metadata
/api/reports/[reportId]/download     file response
/api/reports/[reportId]?format=csv   explicit, validált query
```

Vagy Accept-header negotiation, ha a publikus API contract ezt írja elő.

### 16.3. Fragment

A `#fragment` nem kerül elküldésre a szervernek.

```text
/products/123#reviews
```

A szerver csak ezt látja:

```text
/products/123
```

Fragment nem használható:

- authorization inputként;
- aláírt szerveroldali token részeként;
- cache kulcsként;
- server redirect feltételként.

### 16.4. Header

Header használható például:

- content negotiation;
- correlation ID;
- idempotency key;
- locale hint;
- conditional request;
- auth credential.

Minden header bizalmatlan input. A proxy által hozzáadott header sem feltétlenül megbízható, ha a trust boundary nincs konfigurálva.

### 16.5. Cookie

Cookie olvasása request-time és user-specific viselkedést okozhat. Cache-policy és privacy hatását dokumentálni kell.

Cookie nem alkalmas nagy vagy érzékeny üzleti payload tárolására.

### 16.6. Request body

A body:

- csak támogatott metódusoknál értelmezhető;
- méretkorláttal kezelendő;
- content type szerint parse-olandó;
- schema-val validálandó;
- nem adható közvetlenül ORM update-nek.

---

## 17. Query string és extra paraméterek

### 17.1. Mikor használj query stringet?

Query string AJÁNLOTT:

- pagination;
- sorting;
- filtering;
- optional projection;
- search;
- UI state, amely megosztható URL-ben;
- tracking paraméterek kontrollált kezelésére.

Path paraméter AJÁNLOTT:

- erőforrás identity;
- stabil hierarchy;
- locale vagy tenant, ha része a publikus URL-contractnak;
- explicit domain action route.

### 17.2. `searchParams` page-ben

```tsx
import { listProductsSearchSchema } from '@/modules/catalog/product/presentation/product.schemas';

export default async function ProductsPage({
  searchParams,
}: PageProps<'/products'>) {
  const raw = await searchParams;
  const parsed = listProductsSearchSchema.safeParse(raw);

  if (!parsed.success) {
    return <InvalidFilterView issues={parsed.error.issues} />;
  }

  const result = await catalogModule.queries.listProducts.execute(parsed.data);
  return <ProductListView result={result} />;
}
```

### 17.3. `URLSearchParams` Route Handlerben

```ts
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const input = listProductsSearchSchema.safeParse(
    Object.fromEntries(url.searchParams),
  );

  // ...
}
```

### 17.4. Ismételt paraméterek

```text
/products?status=active&status=draft
```

Az `Object.fromEntries()` az ismételt értékeket elveszítheti. Tömbparaméternél explicit `getAll()` szükséges.

```ts
const statuses = url.searchParams.getAll('status');
```

### 17.5. Ismeretlen query paraméterek

A contract dönthet:

- strip;
- reject;
- passthrough.

Publikus API-nál AJÁNLOTT explicit policy. Biztonságkritikus vagy aláírt URL-nél az ismeretlen query paraméter manipulációt jelenthet.

### 17.6. Query sorrend

A query paraméterek sorrendjére nem szabad üzleti jelentést építeni, kivéve ismételt azonos kulcs explicit listakontraktját.

Aláírt URL-nél kanonikus rendezés szükséges.

### 17.7. Secret a queryben

TILOS hosszú életű secretet query stringben átadni, mert megjelenhet:

- browser historyban;
- refererben;
- access logban;
- analyticsben;
- screenshoton;
- proxy cache-ben.

Egyszer használatos, rövid életű signed token csak dokumentált threat model mellett használható.

### 17.8. Canonicalization

Például:

```text
/products?page=1
→
/products
```

permanent redirecttel kanonizálható, ha a két URL tartalma valóban azonos.

A tracking paraméterek eltávolítása előtt mérlegelni kell az analytics és attribution hatást.

---

## 18. Catch-all, opcionális catch-all és slash-tartalmú paraméterek

### 18.1. Catch-all

```text
src/app/docs/[...segments]/page.tsx
```

A paraméter:

```ts
segments: string[]
```

Illeszkedik legalább egy szegmensre:

```text
/docs/getting-started
/docs/api/routing
```

### 18.2. Opcionális catch-all

```text
src/app/docs/[[...segments]]/page.tsx
```

Illeszkedik a gyökérre is:

```text
/docs
```

A paraméter lehet:

```ts
string[] | undefined
```

### 18.3. Slash-tartalmú Symfony paraméter megfelelője

Symfonyban egy paraméter regexszel slash-t is fogadhat. App Routerben erre a catch-all szegmens a természetes forma.

Nem egyetlen stringet érdemes kézzel újraparse-olni, hanem a szegmenstömböt validálni.

### 18.4. Példa dokumentációs slugokra

```ts
const documentationSegmentsSchema = z
  .array(z.string().regex(/^[a-z0-9-]+$/u).max(80))
  .min(1)
  .max(8);
```

### 18.5. Path traversal

A route-paraméter URL-szegmensként érkezik, de ha fájlrendszeri eléréshez használod, külön path traversal védelem szükséges.

TILOS:

```ts
const file = await readFile(path.join(contentRoot, ...segments));
```

ellenőrzés nélkül.

Kötelező:

- karakterkészlet szűkítése;
- `.` és `..` tiltása;
- symlink policy;
- feloldott path rooton belül tartása;
- fájlkiterjesztés allowlist;
- maximális mélység.

### 18.6. Encoded slash

Az encoded slash és dupla dekódolás proxy-, CDN- és runtimefüggő problémákat okozhat. A projekt ne építsen arra, hogy `%2F` biztonságosan egyetlen dinamikus szegmensben marad.

Hierarchy esetén catch-all tömböt használj.

### 18.7. Üres szegmens

A URL normalizálás és trailing slash viselkedés miatt az üres végszegmens nem megbízható üzleti érték. Opcionális értékhez optional catch-all vagy query paraméter használható.

### 18.8. Maximális mélység

Catch-all route-nál KÖTELEZŐ maximális szegmensszámot és szegmenshosszt meghatározni, különösen:

- fájlrendszeri tartalomnál;
- breadcrumbs generálásnál;
- adatbázis recursive querynél;
- redirects mapnél;
- tenant-scope feloldásnál.

---
## 19. Route-aliasok és deprecation

### 19.1. Nincs runtime route-név registry

Symfonyban egy route-névhez alias rendelhető, és az alias deprecálható. App Routerben nincs beépített route-név registry.

A Winzard három külön aliasfogalmat használ:

1. **bejövő URL-alias:** régi URL átirányítása vagy rewrite-ja;
2. **kódoldali route-builder alias:** régi TypeScript API ideiglenes wrapperje;
3. **dokumentációs alias:** korábbi route identity hivatkozása migration guide-ban.

### 19.2. Régi URL permanent redirectje

```ts
// next.config.ts
import type { NextConfig } from 'next';

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

export default nextConfig;
```

Permanent redirect csak akkor használható, ha az átmenet tartós és cache-elhető.

### 19.3. Ideiglenes redirect

Ideiglenes redirect indokolt:

- karbantartásnál;
- A/B tesztnél;
- rövid migrációs időszaknál;
- request-specifikus destination esetén;
- feature flag mögött.

### 19.4. Rewrite mint kompatibilitási réteg

Rewrite akkor használható, ha a kliens régi URL-t lásson, de az új route szolgálja ki.

```ts
async rewrites() {
  return [
    {
      source: '/legacy-products/:slug',
      destination: '/products/:slug',
    },
  ];
}
```

Rewrite veszélyei:

- analytics két URL-identitást láthat;
- canonical metadata eltérhet;
- cache kulcs és invalidation bonyolódhat;
- hibakeresésnél a látható URL nem azonos a belső route-tal;
- security logban mindkét identitást kezelni kell.

### 19.5. Kódoldali route-builder alias

```ts
export const productRoutes = {
  detail: (productId: string) =>
    `/products/${encodeURIComponent(productId)}` as const,

  /** @deprecated Használd a productRoutes.detail() függvényt. */
  show: (productId: string) =>
    `/products/${encodeURIComponent(productId)}` as const,
};
```

Ez compile-time migrációs segítség, nem runtime route alias.

### 19.6. Alias lifecycle

Minden URL-aliasnak legyen:

```text
source pattern
destination pattern
redirect vagy rewrite
ideiglenes vagy permanent
bevezetési dátum
eltávolítási feltétel
owner
analytics mérés
SEO/canonical döntés
teszt
```

### 19.7. Deprecation warning

Belső API vagy partner API esetén a régi route válasza deprecation headert vagy dokumentált warningot adhat. Publikus browser-route-nál ez általában nem látható a végfelhasználónak, ezért migration log és monitoring szükséges.

### 19.8. Alias lánc tilalma

Kerülendő:

```text
/old-a
→ /old-b
→ /products
```

Használandó:

```text
/old-a → /products
/old-b → /products
```

A redirect lánc késleltetést, cache-komplexitást és SEO-problémát okoz.

### 19.9. Alias collision

Új route létrehozásakor ellenőrizni kell, hogy:

- nem aktív redirect source;
- nem aktív rewrite source;
- nem reserved legacy path;
- nem locale vagy tenant prefix;
- nem Proxy matcher különleges esete.

---

## 20. Route groupok, prefixek és szervezési határok

### 20.1. Route group

```text
src/app/(admin)/admin/products/page.tsx
```

Publikus URL:

```text
/admin/products
```

A `(admin)` nem jelenik meg az URL-ben.

### 20.2. Symfony prefix megfelelője

Symfony route group prefixének App Router megfelelője egy tényleges mappaszegmens:

```text
src/app/admin/...
```

Ha a prefix nem jelenhet meg az URL-ben, route group használható szervezési vagy layout-határként:

```text
src/app/(authenticated)/account/...
```

### 20.3. Prefix és modulownership

Példa:

```text
src/app/
  (public)/
    products/
  (admin)/
    admin/
      products/
```

Mindkét route ugyanazt a catalog application modult használhatja, de eltérő:

- actor context;
- authorization policy;
- DTO projection;
- layout;
- cache policy;
- form/action adapter.

### 20.4. Route group nem security boundary

A `(admin)` mappanév nem védi a route-ot.

```text
(admin)
≠
admin authorization
```

A layout végezhet előzetes auth-ellenőrzést UX célra, de a mutation és az érzékeny query application boundaryn is ellenőrizendő.

### 20.5. Több root layout

Példa:

```text
src/app/
  (marketing)/
    layout.tsx
    page.tsx
  (application)/
    layout.tsx
    dashboard/page.tsx
```

Ha nincs közös root layout, a két csoport közötti navigáció teljes dokumentum reloadot okozhat. Ezt tudatosan kell elfogadni.

### 20.6. Group path collision

TILOS két groupban azonos publikus route:

```text
(public)/about/page.tsx
(marketing)/about/page.tsx
```

A group nevével nem oldható fel az URL-ütközés.

### 20.7. Route group elnevezés és scope

A group jelezheti:

- auth state;
- UI shell;
- csapat ownershipet;
- termékfelületet;
- locale/layout stratégiát.

Nem ajánlott túl sok, egymásba ágyazott technikai group, mert a fizikai path olvashatatlanná válik.

### 20.8. Prefix route builderben

A route builder a publikus URL-t használja, nem a route groupot.

```ts
export const adminProductRoutes = {
  list: () => '/admin/products',
};
```

Nem:

```ts
'/(admin)/admin/products'
```

### 20.9. Shared layout és application call

Közös layout csak olyan adatot töltsön be, amely valóban a teljes részfának szükséges. A route group nem indok arra, hogy minden requestnél teljes user-, tenant- és permission-gráfot betöltsünk.

---

## 21. Az aktuális route és request azonosítása

### 21.1. Szerveroldali route-paraméterek

Page és Route Handler a generált prop/context típusból ismeri a route pattern paramétereit.

```tsx
export default async function Page({
  params,
}: PageProps<'/products/[productId]'>) {
  const { productId } = await params;
}
```

### 21.2. Query string

```tsx
export default async function Page({
  searchParams,
}: PageProps<'/products'>) {
  const query = await searchParams;
}
```

### 21.3. Kliensoldali pathname

Client Componentben a Next.js navigációs hookjai használhatók az aktuális pathname vagy paraméter olvasására.

Ezeket presentation célra használd:

- aktív navigáció;
- breadcrumb UI;
- kliensoldali filter state;
- animáció.

Nem végleges authorizationra.

### 21.4. Route identity naplózása

A request log lehetőleg külön mezőben rögzítse:

```text
request_path
route_pattern
method
status
correlation_id
tenant_id, ha biztonságosan ismert
actor_id, ha engedélyezett
```

A raw path önmagában nagy cardinalityt okozhat metricsben. Route pattern aggregáció ajánlott.

### 21.5. Route pattern megszerzése

A Next.js nem minden contextben ad egyszerű Symfony-szerű `_route` nevet. A Winzard diagnosztikai réteg generált route pattern metadata-t adhat a log adapternek, de ez nem lehet kézzel duplikált registry.

### 21.6. Headerből érkező path

Reverse proxy headerből csak konfigurált trust boundary mellett olvass eredeti hostot vagy protokollt.

TILOS tetszőleges kliens által küldhető `X-Forwarded-*` headert megbízhatónak tekinteni anélkül, hogy az infrastruktúra felülírná vagy tisztítaná.

### 21.7. Aktuális route application rétegben

Az application use case ne függjön a route path stringtől.

Nem támogatott:

```ts
if (pathname.startsWith('/admin')) {
  // business authorization
}
```

Támogatott:

```ts
execute({ actor, operation: 'product.update', productId })
```

A route adapter állítja elő az application inputot.

---

## 22. Közvetlen renderelés, redirect és rewrite

### 22.1. HTML renderelés

A page React UI-t ad vissza. A rendereléshez szükséges adat application queryből származzon.

### 22.2. `redirect()`

Szerveroldali navigációhoz használható:

```ts
import { redirect } from 'next/navigation';

redirect('/login');
```

A helper megszakítja a normál control flow-t. Ne tedd olyan `try/catch` blokkba, amely véletlenül elnyeli a redirectet.

### 22.3. `permanentRedirect()`

Tartós erőforrás- vagy slugmigrációhoz:

```ts
import { permanentRedirect } from 'next/navigation';

permanentRedirect(`/products/${newSlug}`);
```

Csak akkor használd, ha a cél tartós és a cache/SEO hatás elfogadott.

### 22.4. Route Handler redirect

```ts
export function GET(request: Request): Response {
  return Response.redirect(new URL('/login', request.url), 307);
}
```

Dinamikus destinationt URL allowlisttel kell védeni.

### 22.5. Open redirect

TILOS:

```ts
redirect(searchParams.next as string);
```

Támogatott:

```ts
const safeNextPath = safeRelativeReturnPathSchema.parse(searchParams.next);
redirect(safeNextPath);
```

A schema csak:

- relatív, egyetlen slash-sel kezdődő pathot;
- támogatott locale/tenant scope-ot;
- tiltott scheme és protocol-relative URL nélküli értéket

fogadhat el.

### 22.6. `next.config` redirect

Alkalmas:

- stabil URL-migrációra;
- statikus route mapre;
- host- vagy headerfeltételes egyszerű átirányításra;
- locale kanonizálás bizonyos eseteire.

### 22.7. Proxy redirect

Alkalmas requestfüggő döntésre:

- host;
- cookie;
- header;
- locale;
- egyszerű feature routing.

A Proxy ne végezzen nehéz application queryt.

### 22.8. Rewrite

Rewrite használható:

- legacy URL támogatására;
- multi-tenant belső namespace-re;
- backend proxyzásra;
- publikus és belső route shape elválasztására.

Példa hostból tenant namespace-re:

```text
acme.example.com/products
→ belső rewrite
/_tenants/acme/products
```

A belső route-ot védeni kell a közvetlen publikus eléréstől, ha az nem támogatott.

### 22.9. Redirect prioritás

Általános feldolgozási sorrendnél számolni kell azzal, hogy a konfigurált redirects a Proxy előtt futhat. Az átfedő szabályokat ezért együtt kell tesztelni.

### 22.10. Redirect response body

API esetén a kliens nem mindig követ redirectet a kívánt módon. Publikus API-contractnál gyakran jobb explicit 3xx + `Location`, vagy domainhibából képzett JSON válasz, a kliensspecifikáció szerint.

---

## 23. Trailing slash és URL-kanonizálás

### 23.1. Alapértelmezett viselkedés

A Next.js alapértelmezetten a trailing slash-es URL-t trailing slash nélküli alakra irányítja:

```text
/about/
→
/about
```

### 23.2. Globális `trailingSlash`

```ts
const nextConfig = {
  trailingSlash: true,
};
```

Ekkor az ellenkező kanonikus forma érvényesülhet.

### 23.3. Döntési szabály

A projekt KÖTELEZŐEN egy globális stratégiát választ:

```text
trailing slash nélkül
vagy
trailing slash-sel
```

Ad hoc route-onkénti keverés nem ajánlott.

### 23.4. API-route-ok

API-kliensek és webhook providerek érzékenyek lehetnek a redirectre. A dokumentált endpoint pontos URL-jét tesztelni kell trailing slash-sel és nélküle.

### 23.5. Aláírt URL

Trailing slash kanonizálás aláírt URL-nél kritikus. Az aláírás előtt és ellenőrzéskor ugyanazt a kanonikus path-stratégiát kell használni.

### 23.6. Query és fragment

Canonical URL döntésnél külön kezeld:

- path slash;
- query defaultok;
- query sorrend;
- tracking paraméterek;
- fragment, amely kliensoldali.

### 23.7. Static export kivételek

Bizonyos statikus export- és fájlútvonalak eltérő végződést használhatnak. A deployment target konkrét viselkedését ellenőrizni kell.

### 23.8. Redirect loop

A CDN, reverse proxy és Next.js ne alkalmazzon ellentétes slash-szabályt, mert redirect loop keletkezhet.

Infrastruktúra-szerződés:

```text
CDN canonicalization
=
reverse proxy canonicalization
=
Next.js trailingSlash policy
```

---

## 24. Host-, subdomain- és tenant-routing

### 24.1. Symfony host requirement megfelelője

Symfony route hostmintát deklarálhat. App Routerben a fájlrendszer önmagában nem különít host szerint. A host-feloldás jellemzően Proxyban, reverse proxyban vagy deployment routingban történik.

### 24.2. Két stratégia

#### Path-alapú tenant

```text
/t/[tenantSlug]/products
```

Előny:

- egyszerű helyi fejlesztés;
- route-fa explicit;
- kisebb DNS/TLS komplexitás.

#### Host-alapú tenant

```text
acme.example.com/products
```

Előny:

- erős brand/tenant izoláció;
- rövidebb URL;
- külön cookie és origin stratégia lehetséges.

### 24.3. Host-alapú rewrite

Koncepcionális Proxy-minta:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const host = request.headers.get('host');
  const tenant = parseTenantHost(host);

  if (!tenant) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/_tenants/${tenant.slug}${url.pathname}`;
  return NextResponse.rewrite(url);
}
```

### 24.4. Host validálása

A Host header bizalmatlan input. Kötelező:

- lowercase normalizálás;
- port eltávolítás kontrollált módon;
- IDNA/punycode policy;
- allowlist vagy suffix ellenőrzés;
- reserved subdomain tiltás;
- maximális hossz;
- proxy trust boundary.

### 24.5. Tenant identity nem csak slug

A Proxy feloldhat slugot, de az application művelet tenant contextje stabil tenant ID-t használjon.

```text
host slug
→ tenant lookup/context
→ tenantId
→ application input
```

A tenant lookup költségét és cache-ét külön kell tervezni.

### 24.6. Tenant isolation

Minden repository query tenant-scope-os legyen. Nem elég a route prefix.

TILOS:

```ts
repository.getProduct(productId)
```

ha az ID tenantok között ütközhet vagy adat-hozzáférési kockázat van.

Támogatott:

```ts
repository.getProduct({ tenantId, productId })
```

### 24.7. Cookie scope

Host-alapú routingnál dönteni kell:

- host-only cookie;
- parent-domain cookie;
- cross-subdomain auth;
- SameSite;
- Secure;
- CSRF threat model.

### 24.8. Abszolút URL generálás

Tenant URL-generálásnál a destination origin nem képezhető vakon request headerből.

Támogatott:

```ts
const origin = tenantOriginRegistry.getOrigin(tenantId);
```

### 24.9. Egyedi domainek

Custom domain támogatásnál szükséges:

- domain ownership verification;
- TLS provisioning;
- canonical domain;
- redirect strategy;
- phishing és domain takeover védelem;
- cache és CDN configuration;
- auditálható domain lifecycle.

### 24.10. Lokális fejlesztés

Dokumentált stratégia lehet:

```text
acme.localhost:3000
```

vagy:

```text
localhost:3000/t/acme
```

A teszt- és production hostfeloldás ugyanazt a normalizáló függvényt használja.

---

## 25. Lokalizált route-ok

### 25.1. URL-prefix alapú locale

```text
/[locale]/products
/[locale]/products/[productId]
```

Példák:

```text
/hu/products
/en/products
/de/products
```

### 25.2. Locale feloldás Proxyban

A Proxy:

1. megvizsgálhatja a pathname-t;
2. ha nincs locale prefix, elemezheti az `Accept-Language` headert;
3. támogatott locale-ra redirectelhet;
4. nem támogatott locale-nál fallbacket alkalmazhat.

### 25.3. Locale validálás

```ts
const supportedLocales = ['hu', 'en', 'de'] as const;
const localeSchema = z.enum(supportedLocales);
```

A TypeScript típus nem helyettesíti a runtime checket.

### 25.4. Root layout helye

Locale-prefix esetén az app route-fája gyakran:

```text
src/app/[locale]/layout.tsx
src/app/[locale]/page.tsx
```

A locale layout:

- beállíthatja a `<html lang>` értéket;
- betöltheti a fordítási namespace-t;
- átadhat locale contextet;
- invalid locale-nál not-foundot adhat.

### 25.5. Lokalizált pathnevek

Két stratégia:

#### Azonos technikai path

```text
/hu/products
/en/products
```

#### Teljesen lokalizált path

```text
/hu/termekek
/en/products
```

A második összetettebb:

- route map locale-onként;
- redirect és canonical;
- route builder localization;
- analytics normalizálás;
- sitemap;
- content migration.

A Winzard kezdetben AJÁNLOTTAN azonos technikai pathot és lokalizált UI-t használ, hacsak SEO vagy termékigény nem indokolja a lokalizált slugot.

### 25.6. Domain-alapú locale

```text
example.hu
example.de
```

vagy locale subdomain:

```text
hu.example.com
```

Ez host-routing és locale-routing kombinációja. A locale és tenant feloldási sorrendet explicit meg kell határozni.

### 25.7. Default locale

Dönteni kell:

- mindig szerepel-e a pathban;
- default locale prefix nélküli-e;
- milyen redirect státusz használatos;
- a canonical URL melyik;
- cookie vagy browser preference felülírhatja-e.

### 25.8. `generateStaticParams`

Statikusan generálható locale-k:

```ts
export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}
```

A runtime validáció ettől még szükséges, ha dinamikus route kérhető.

### 25.9. Hreflang és metadata

Lokalizált oldalaknál AJÁNLOTT:

- locale-specifikus metadata;
- canonical;
- alternates/hreflang;
- locale-aware sitemap;
- helyes `lang` attribútum.

### 25.10. Locale nem authorization

Locale alapján nem szabad jogosultságot vagy tenantot implicit meghatározni.

---

## 26. Stateless route-ok, session és cache

### 26.1. Symfony `stateless` megfelelője

A Next.js route-nak nincs Symfony-szerű `stateless: true` kapcsolója. A Winzardban ez **viselkedési contract**.

Egy stateless route:

- nem indít sessiont;
- nem ír user-specific cookie-t;
- nem támaszkodik rejtett request-local mutable state-re;
- azonos input és jogosultsági context mellett reprodukálható;
- cache-policyja explicit.

### 26.2. Sessionhatást okozó inputok

A következők requestfüggő vagy user-specific viselkedést okozhatnak:

- cookies;
- auth session;
- request headers;
- geo/IP;
- feature flag user scope;
- tenant host;
- locale cookie;
- draft/preview state.

### 26.3. Stateless API

Egy bearer tokennel hitelesített API lehet sessionmentes, de nem feltétlenül cache-elhető. A stateless és public-cacheable külön fogalom.

### 26.4. Cache key

Ha a válasz függ:

```text
actor
tenant
locale
feature flag
permission
query
header
```

akkor a cache policy ezt figyelembe veszi, vagy a megosztott cache tiltott.

### 26.5. `Cache-Control`

Érzékeny user-specific API-válasz:

```text
Cache-Control: private, no-store
```

Publikus, verziózott tartalom:

```text
Cache-Control: public, max-age=..., s-maxage=...
```

A konkrét érték deployment- és frissességi contract.

### 26.6. Session mutation GET-ben

TILOS GET route-ban rejtetten:

- sessiont módosítani;
- auditált üzleti állapotot írni;
- egyszer használatos tokent elfogyasztani, ha link preview bot kiválthatja;
- side effectet indítani idempotency nélkül.

### 26.7. Preview és link scanner

Emailben küldött action linket bot vagy security scanner megnyithat. Kritikus mutationt ne egyetlen GET kérés végezzen el.

Ajánlott:

```text
GET signed confirmation page
→ user confirmation
→ POST command
```

### 26.8. Request memoization és shared cache

A renderelési folyamaton belüli deduplikáció nem azonos a cross-request shared cache-sel. A dokumentáció és teszt külön kezelje:

- request-local memoization;
- data cache;
- full route cache;
- CDN cache;
- application cache.

### 26.9. Route contract metadata

A Winzard későbbi route manifestje deklarálhat:

```yaml
session: none
cache_scope: public
personalized: false
```

de a metadata csak akkor megbízható, ha statikus elemzés és teszt ellenőrzi.

---

## 27. URL-generálás alapelvei

### 27.1. Ne szórj stringliterálokat

Egyszerű linknél közvetlen literal elfogadható:

```tsx
<Link href="/products">Termékek</Link>
```

Ismétlődő, dinamikus vagy cross-module URL-nél route builder ajánlott.

### 27.2. Relatív és abszolút URL

Relatív URL:

```text
/products/123
```

Abszolút URL:

```text
https://example.com/products/123
```

Böngészőn belüli navigációhoz általában relatív URL elegendő. Külső emailhez, webhookhoz, exporthoz vagy callbackhez abszolút URL szükséges.

### 27.3. Path paraméter encoding

Minden dinamikus pathértéket szegmensenként kell encode-olni:

```ts
encodeURIComponent(productId)
```

Nem szabad teljes pathot egyben encode-olni.

### 27.4. Query generálás

```ts
const query = new URLSearchParams();
query.set('page', String(page));
query.set('sort', sort);

const href = `/products?${query.toString()}`;
```

Előny:

- megfelelő encoding;
- ismételt paraméter explicit kezelése;
- kanonikus builder kialakítható.

### 27.5. Hash

Fragmentet kliensoldali UI célra lehet hozzáadni:

```ts
`${productRoutes.detail(id)}#reviews`
```

A szerveroldali aláírás és auth nem építhet rá.

### 27.6. Abszolút origin

TILOS:

```ts
const origin = `https://${request.headers.get('host')}`;
```

megbízhatósági ellenőrzés nélkül.

Támogatott források:

- validált `APP_URL` single-tenant projektnél;
- tenant origin registry;
- allowlistelt, infrastruktúra által hitelesített forwarded host;
- explicit callback origin konfiguráció.

### 27.7. Canonical builder

Ugyanahhoz a route-hoz egy kanonikus builder legyen. A redirect, metadata, email és UI ugyanazt használja.

### 27.8. Builder nem authorization

Az, hogy egy URL builder nem exportált kliensre, nem védi a route-ot. A route továbbra is közvetlenül hívható.

### 27.9. Builder és verziózás

Publikus URL törő változás. Route builder API és URL contract együtt verziózandó.

### 27.10. Extra paraméterek

A Symfony URL-generátor extra paramétereket query stringgé alakíthat. Winzard builderben ezt explicit típus jelölje:

```ts
productRoutes.list({ page: 2, status: ['active'] })
```

Ne fogadjon tetszőleges `Record<string, unknown>` értéket publikus API-ként.

---

## 28. Típusos route-builder réteg

### 28.1. Cél

A route-builder:

- központosítja a kanonikus URL-t;
- encode-olja a paramétereket;
- típusos inputot ad;
- minimalizálja a string driftet;
- használható metadata, redirect, link, email és teszt számára.

### 28.2. Egyszerű builder

```ts
import type { Route } from 'next';

export const productRoutes = Object.freeze({
  list: (): Route => '/products',

  detail: (productId: string): Route =>
    `/products/${encodeURIComponent(productId)}` as Route,

  edit: (productId: string): Route =>
    `/products/${encodeURIComponent(productId)}/edit` as Route,
});
```

### 28.3. Query input

```ts
export type ProductListRouteInput = Readonly<{
  page?: number;
  search?: string;
  status?: readonly ('active' | 'draft')[];
}>;

export function productListRoute(input: ProductListRouteInput = {}): Route {
  const query = new URLSearchParams();

  if (input.page !== undefined && input.page !== 1) {
    query.set('page', String(input.page));
  }

  if (input.search !== undefined && input.search !== '') {
    query.set('search', input.search);
  }

  for (const status of input.status ?? []) {
    query.append('status', status);
  }

  const suffix = query.toString();
  return (suffix === '' ? '/products' : `/products?${suffix}`) as Route;
}
```

### 28.4. Inputvalidáció a builderben

A builder belső, típusos hívóktól kaphat validált inputot. Ha publikus utility vagy konfigurációs inputot fogad, runtime assert is szükséges.

### 28.5. Route builder helye

Ajánlott:

```text
src/modules/catalog/product/presentation/product.routes.ts
```

vagy több adapter által használt route-contractnál:

```text
src/platform/routing/routes/product.routes.ts
```

A pontos helyet ownership alapján válaszd. A route builder presentation concern, nem domain logic.

### 28.6. Server/client kompatibilitás

A builder:

- ne importáljon `server-only` modult;
- ne olvasson secreteket;
- ne hívjon adatbázist;
- legyen pure;
- használjon webkompatibilis API-kat.

Így Server és Client Componentből is importálható.

### 28.7. `typedRoutes`

A Next.js `typedRoutes` lehetőség compile-time ellenőrzést ad a `Link` és navigációs API-k route-jaihoz.

Koncepcionális konfiguráció:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```

A route builder dinamikus stringjeinél szükség lehet `Route` típusra. A type assertion csak akkor elfogadható, ha a builder saját tesztje bizonyítja a pattern helyességét.

### 28.8. Builder teszt

```ts
import { describe, expect, it } from 'vitest';

it('kanonikus product detail URL-t generál', () => {
  expect(productRoutes.detail('a/b')).toBe('/products/a%2Fb');
});
```

Megjegyzés: olyan ID-típust válassz, amely ténylegesen támogatja vagy tiltja a slash karaktert. UUID esetén a schema ezt eleve kizárja.

### 28.9. Builder és locale

```ts
export function localizedProductRoute(
  locale: Locale,
  productId: ProductId,
): Route {
  return `/${locale}/products/${encodeURIComponent(productId)}` as Route;
}
```

A locale és ID csak validált branded/union típus legyen.

### 28.10. Builder és tenant origin

Abszolút URL builder külön service legyen:

```ts
export interface ProductUrlGenerator {
  absoluteDetail(input: {
    tenantId: TenantId;
    productId: ProductId;
  }): Promise<URL>;
}
```

Az origin feloldás infrastruktúra-adapter; a relatív path builder pure marad.

---
## 29. Navigáció Server és Client Componentből

### 29.1. `Link`

Belső navigációhoz alapértelmezetten `Link` használható:

```tsx
import Link from 'next/link';

<Link href={productRoutes.detail(product.id)}>
  {product.name}
</Link>
```

A `Link` támogatja a kliensoldali navigációt és a framework prefetch viselkedését.

### 29.2. Normál anchor

Normál `<a>` ajánlott:

- külső URL-re;
- letöltéshez;
- speciális protokollhoz;
- olyan response-hoz, amely nem Next.js page navigáció;
- teljes dokumentumváltást kívánó esetre.

Példa:

```tsx
<a href={downloadUrl} download>
  CSV letöltése
</a>
```

### 29.3. Programozott szerveroldali redirect

Mutation után:

```ts
'use server';

import { redirect } from 'next/navigation';

export async function createProductAction(input: unknown) {
  const result = await catalogModule.commands.createProduct.execute(/* ... */);
  redirect(productRoutes.detail(result.id));
}
```

Az action teljes input-, auth- és CSRF-contractját külön kell kezelni.

### 29.4. Kliensoldali router

Client Componentben programozott navigáció csak UI-interakció miatt használható.

```tsx
'use client';

import { useRouter } from 'next/navigation';

export function ProductCreatedNotice({ productId }: { productId: string }) {
  const router = useRouter();

  return (
    <button onClick={() => router.push(productRoutes.detail(productId))}>
      Részletek
    </button>
  );
}
```

### 29.5. Nem megbízható destination

A router API-nak adott URL nem származhat validálatlan user inputból. Különösen veszélyes:

```ts
router.push(userControlledUrl);
```

A projekt safe return-path schemát használjon.

### 29.6. Prefetch és érzékeny route

A prefetch nem authorization bypass, de érzékeny vagy drága route-nál meg kell vizsgálni:

- indít-e requestet a user explicit clickje előtt;
- van-e side effect;
- naplózást vagy rate limitet befolyásol-e;
- user-specific adat kerül-e cache-be;
- szükséges-e `prefetch={false}`.

### 29.7. Navigation state

A route-váltás közbeni állapotot loading boundary, transition vagy optimista UI kezelheti. A kliensoldali loading state nem helyettesíti a szerveroldali idempotency és hibakezelést.

### 29.8. Back/forward

A böngésző history viselkedését filter, modal és intercepting route esetén E2E tesztelje. A route állapot URL-ben tárolt része legyen reprodukálható refresh után.

### 29.9. External redirect

Külső destinationt allowlisttel és auditálással kezelj. SSO callbacknél a return URL aláírt vagy server-side tárolt legyen.

### 29.10. Accessibility

Navigációs elemek:

- szemantikusan linkek legyenek, ha navigálnak;
- gombok legyenek, ha műveletet hajtanak végre;
- route-váltás után a fókusz és cím frissüljön megfelelően;
- loading és error állapot legyen képernyőolvasó számára érthető.

---

## 30. URL-generálás parancsokból, jobokból és külső folyamatokból

### 30.1. Request nélküli környezet

Background job, CLI, queue worker vagy cron nem rendelkezik megbízható bejövő request originnel.

Ezért abszolút URL-generáláshoz explicit konfiguráció vagy tenant origin registry szükséges.

### 30.2. Single-tenant origin

```ts
import { z } from 'zod';

const appOriginSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.pathname === '/' && url.search === '' && url.hash === '';
});
```

A konfiguráció:

```dotenv
APP_URL=https://example.com
```

### 30.3. Abszolút URL összeállítása

```ts
export function absoluteUrl(origin: URL, route: string): URL {
  return new URL(route, origin);
}
```

A `route` kanonikus relatív builderből származzon.

### 30.4. Multi-tenant job

```ts
const origin = await tenantOriginPort.getCanonicalOrigin(tenantId);
const url = new URL(productRoutes.detail(productId), origin);
```

A job ne találja ki a domaint tenant slugból, ha custom domain támogatott.

### 30.5. Email link

Emailben küldött URL-nél ellenőrizni kell:

- canonical origin;
- locale;
- tenant;
- expiry;
- signed token szükségessége;
- analytics paraméterek;
- phishing elleni megjelenített domain;
- unsubscribe vagy security compliance.

### 30.6. Webhook callback URL

Külső provider konfigurációjához:

- fix, dokumentált route;
- HTTPS;
- signature verification;
- idempotency;
- retry contract;
- environment-specific origin;
- versioning

szükséges.

### 30.7. CLI output

CLI-ben generált URL ne tartalmazzon secretet. A logolt signed URL-t redaktálni vagy rövid élettartamúvá tenni kell.

### 30.8. Preview deployment

Preview origin nem válhat production email vagy webhook URL-lé véletlenül. A deployment environment külön explicit external origin policyt kapjon.

### 30.9. Queue payload

Lehetőleg ne teljes URL kerüljön hosszú életű queue payloadba, hanem stabil üzleti input:

```ts
{ tenantId, productId, locale }
```

Az URL-t a feldolgozáskor a jelenlegi route contract szerint generáld. Kivétel, ha a történeti URL megőrzése maga a követelmény.

### 30.10. Route migration

Background job által tárolt vagy külső rendszerben regisztrált URL-ek miatt route-migrációnál inventory szükséges:

- email template;
- queue payload;
- webhook config;
- mobile deep link;
- partner integration;
- sitemap;
- notification history;
- audit export.

---

## 31. Route-létezés és típusgenerálás

### 31.1. Symfony route existence megfelelője

Symfonyban route-név létezése ellenőrizhető. App Routerben az elsődleges compile-time eszköz a generált route típus és a build.

### 31.2. `next typegen`

```bash
pnpm next typegen apps/reference
```

vagy projektben:

```bash
pnpm typegen
```

A parancs generálhat:

- `PageProps` helper típusokat;
- `LayoutProps` helper típusokat;
- `RouteContext` helper típusokat;
- typed route információt.

### 31.3. Typecheck

```bash
pnpm exec tsc --noEmit
```

A generált típusok után futtatandó.

### 31.4. `typedRoutes`

Bekapcsolva a `Link`, `router.push` és kapcsolódó API-k támogatott route stringjei compile-time ellenőrzést kaphatnak.

Ez nem ellenőrzi automatikusan:

- runtime paraméterformátumot;
- authorizationt;
- redirect destination allowlistet;
- hostot;
- query semanticát;
- erőforrás létezését.

### 31.5. Route builder type test

A route builder exportjai compile-time és runtime tesztet is kapjanak.

```ts
const href = productRoutes.detail(productId);
const route: Route = href;
```

### 31.6. Dinamikus route runtime létezés

Egy pattern compile-time létezése nem jelenti, hogy az adott paraméterrel erőforrás létezik.

```text
/products/[productId] route létezik
≠
/products/abc erőforrás létezik
```

### 31.7. Route capability check

A Winzard későbbi `route:check` ellenőrizheti:

- builder pattern route-fában létezik;
- alias destination létezik;
- internal rewrite destination létezik;
- route dokumentációs owner megvan;
- route security metadata és teszt megvan.

### 31.8. Generated types lifecycle

A `.next/types` vagy hasonló generált állományokat nem kell kézzel szerkeszteni. CI mindig tiszta buildből generálja őket.

### 31.9. IDE

A typegen után az IDE képes route helper típusokat feloldani. Hibás vagy régi `.next` cache esetén törlés és újragenerálás segíthet.

### 31.10. Build az autoritatív integrációs ellenőrzés

A typecheck nem helyettesíti a production buildet. A route tree, rendering és bundling számos hibája csak buildkor jelenik meg.

---

## 32. HTTPS, origin és reverse proxy

### 32.1. HTTPS-generálás

A Winzard URL builder abszolút URL-nél explicit HTTPS origint használjon production környezetben.

### 32.2. Redirect HTTPS-re

Az HTTPS enforcement elsődlegesen infrastruktúra vagy trusted reverse proxy feladata lehet. Ha alkalmazásrétegben is történik:

- ne legyen redirect loop;
- forwarded proto csak trusted proxytól fogadható el;
- health endpoint kivételek dokumentáltak legyenek;
- local development működjön.

### 32.3. `X-Forwarded-Proto`

TILOS tetszőleges kliens által küldhető forwarded headert megbízhatónak tekinteni.

Az infrastruktúra:

- eltávolítja a bejövő hamis headert;
- saját értéket ír;
- dokumentálja a proxy hopokat;
- az alkalmazás csak ebből a trusted boundaryből olvas.

### 32.4. Origin allowlist

Callback, CORS vagy absolute URL esetén explicit origin allowlist szükséges.

Kerülendő:

```ts
if (origin.endsWith('.example.com'))
```

normalizálás nélkül, mert Unicode, port, trailing dot és hasonló edge case-ek lehetnek.

### 32.5. Host header injection

Host headerből épített password reset URL phishing kockázatot okozhat.

Támogatott:

```text
configurált canonical origin
vagy
ellenőrzött tenant origin registry
```

### 32.6. Absolute redirect

Ha külső originre redirectelünk:

- destination allowlist;
- HTTPS;
- path/query validáció;
- audit log;
- state/nonce;
- signed callback context

szükséges lehet.

### 32.7. CORS nem routing

A route elérhetősége és a böngésző CORS policy két külön dolog. CORS nem akadályoz meg server-to-server requestet, ezért nem authorization.

### 32.8. Base path

Ha az alkalmazás base path alatt fut:

```text
/platform/products
```

akkor:

- Next config;
- route builder;
- asset URL;
- redirect;
- webhook;
- proxy;
- tests

ugyanazt a base path contractot használja.

### 32.9. CDN és rewrite

A CDN rewrite ne ütközzön Next rewrite-tal. A teljes requestút dokumentálandó:

```text
client
→ CDN
→ ingress
→ reverse proxy
→ Next Proxy
→ App Router
```

### 32.10. Security headers

Routing szempontból releváns lehet:

- HSTS;
- CSP `frame-ancestors`;
- Referrer-Policy;
- X-Content-Type-Options;
- cache headers;
- CORS headers.

Ezeket közös policyból kell kezelni, nem véletlenszerű route-onként.

---

## 33. Aláírt és időkorlátos URL-ek

### 33.1. Symfony URI signer megfelelője

A Next.js nem ad általános, Symfony URI signerrel azonos Winzard application contractot. A Winzard ezért frameworkfüggetlen portot definiálhat.

```ts
export interface SignedUrlService {
  sign(input: SignUrlInput): Promise<URL>;
  verify(input: VerifySignedUrlInput): Promise<SignedUrlClaims>;
}
```

Ez célarchitektúra; csak tényleges adapter implementáció után használható kész képességként.

### 33.2. Kötelező claim-ek

Ajánlott minimum:

```text
path
canonical query
expiresAt
purpose
audience vagy tenant
keyId
nonce vagy tokenId, ha replayvédelem kell
```

### 33.3. Mit írunk alá?

Kanonikus string például:

```text
METHOD\n
PATH\n
CANONICAL_QUERY\n
EXPIRES_AT\n
PURPOSE\n
AUDIENCE
```

A pontos formátum verziózott contract.

### 33.4. Query canonicalization

Kötelező:

- kulcsok rendezése;
- ismételt kulcsok sorrendjének contractja;
- percent encoding egységesítése;
- signature paraméter kizárása az aláírandó inputból;
- default paraméterek kezelése;
- Unicode normalizálás.

### 33.5. Fragment kizárása

A fragment nem jut el a szerverhez, ezért nem lehet szerveroldali signature verification input.

### 33.6. Lejárat

A verification ellenőrizze:

- lejárati időt;
- clock skew toleranciát;
- maximális engedett élettartamot;
- hiányzó vagy túl távoli expiry-t.

### 33.7. Purpose binding

Ugyanaz a token ne legyen felhasználható más művelethez.

```text
email-verify
password-reset
invoice-download
unsubscribe
```

külön purpose.

### 33.8. Method binding

Ha az URL mutationt indít, az aláírás kösse a HTTP-metódust is. Jobb minta:

```text
signed GET confirmation page
→ user confirms
→ signed/CSRF-protected POST command
```

### 33.9. Key rotation

A token tartalmazhat `kid` értéket. A verifier:

- aktuális és grace-period kulcsokat fogad;
- régi kulcsot kontrollált ideig tart;
- ismeretlen key ID-t elutasít;
- nem próbál minden kulccsal korlátlanul verifikálni.

### 33.10. Constant-time összehasonlítás

A signature összehasonlítása constant-time primitive-et használjon.

### 33.11. Replay

A lejárat önmagában nem akadályozza meg a többszöri felhasználást. Egyszer használatos művelethez szükséges:

- nonce registry;
- token state;
- domain invariant;
- idempotency;
- audit trail.

### 33.12. URL-szivárgás

Signed URL továbbra is bearer capability lehet. Ne kerüljön:

- analyticsbe;
- access log teljes queryjébe;
- Referer headeren harmadik félhez;
- support ticketbe;
- screenshotba;
- hosszú cache-be.

### 33.13. Route adapter

```ts
export async function GET(request: Request): Promise<Response> {
  const verification = await signedUrlService.verify({
    url: new URL(request.url),
    expectedMethod: 'GET',
    expectedPurpose: 'invoice-download',
  });

  const result = await billingModule.queries.downloadInvoice.execute({
    actor: verification.actor,
    invoiceId: verification.subjectId,
  });

  return result.response;
}
```

A signature verification nem helyettesíti automatikusan a domain- és tenantellenőrzést.

### 33.14. Hiba response

Expired, invalid és replayed token külső válasza lehet azonos, hogy ne adjon oracle-t. A belső audit log részletes kódot rögzíthet secret nélkül.

---

## 34. `generateStaticParams`, `dynamicParams` és route-tér előállítása

### 34.1. `generateStaticParams`

Dinamikus route ismert paraméterei buildidőben előállíthatók:

```ts
export async function generateStaticParams() {
  const slugs = await publicCatalogIndex.listPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}
```

### 34.2. Architektúrahatár

A statikus paramétergenerálás is delivery/build adapter. Ne importáljon közvetlenül olyan infrastructure implementationt, amely megkerüli a modul contractját, hacsak a build adapter külön dokumentált kivétel.

Ajánlott:

```text
generateStaticParams
→ public build query port
→ adapter
```

### 34.3. Buildidő és runtime különbség

A build környezet:

- eltérő envet használhat;
- nem érhet el private hálózatot;
- snapshot időpontban lát adatot;
- sok route-nál nagy buildet okozhat;
- nem user-specific.

### 34.4. `dynamicParams`

A projekt dönthet arról, hogy csak előre generált params támogatott-e, vagy runtime új paraméter is kezelhető.

Ezt tesztelni kell:

```text
ismert param
ismeretlen param
újonnan publikált erőforrás
eltávolított erőforrás
revalidation
```

### 34.5. Nagy cardinality

Nem ajánlott milliónyi erőforrást mind statikusan generálni. Lehetséges stratégia:

- legnépszerűbb route-ok előgenerálása;
- runtime renderelés a többihez;
- cache/revalidation;
- sitemap particionálás.

### 34.6. Locale × tenant × slug robbanás

A kombinatorikus route-tér:

```text
locale × tenant × content
```

gyorsan túl nagy lehet. Minden dimenzió statikus generálását külön indokolni kell.

### 34.7. Security

Buildidőben generált page nem tartalmazhat:

- private user adatot;
- secretet;
- tenantközi adatot;
- requestfüggő permission eredményt.

### 34.8. Stale route

Törölt erőforrásnál kezelni kell:

- 404;
- redirect utódra;
- tombstone;
- cache invalidation;
- sitemap eltávolítás;
- canonical update.

### 34.9. Determinizmus

Ugyanazon source snapshotból a `generateStaticParams` determinisztikus, stabil rendezést adjon, ha a build reproducibility fontos.

### 34.10. Teszt

Unit tesztelhető a paramétergeneráló query, integrációs teszt pedig a build output és ismeretlen params viselkedés.

---

## 35. Parallel és intercepting route-ok

### 35.1. Parallel route

Named slot:

```text
src/app/dashboard/@analytics/page.tsx
src/app/dashboard/@activity/page.tsx
```

A layout propsként kapja a slotokat.

### 35.2. Használati esetek

- dashboard panelek;
- master-detail;
- modal slot;
- egymástól független loading/error boundaryk;
- feltételes navigációs részek.

### 35.3. Nem üzleti párhuzamosság

A parallel route UI-kompozíció. Nem message bus, nem párhuzamos transaction és nem CQRS-mechanizmus.

### 35.4. Slot URL-identitás

A `@slot` nem része az URL-nek. Két slot route-ja ugyanazon URL-állapot külön projekciója lehet.

### 35.5. Default fallback

Hard refreshnél a frameworknek tudnia kell, mit rendereljen nem aktív slotnál. Szükség lehet `default.tsx` fájlokra.

### 35.6. Intercepting route

Modal navigationnél az aktuális list contextben megjelenhet a detail route, miközben direct navigation teljes detail page-et ad.

Példa:

```text
/products
/products/[productId]
@modal/(.)products/[productId]
```

### 35.7. History és deep link

Kötelező E2E esetek:

- listáról modal nyitás;
- direct detail URL;
- refresh modal URL-en;
- back/forward;
- close modal;
- új tab;
- unauthorized detail;
- not-found detail.

### 35.8. Data query duplikáció

A modal és teljes page ugyanazt az application queryt használja. Ne duplikálja az adatbetöltési üzleti logikát.

### 35.9. Accessibility

Modal route esetén:

- fókusz trap;
- close action;
- Escape;
- háttér inert állapot;
- címkézés;
- history helyreállítás

szükséges.

### 35.10. Dokumentáció

Parallel/intercepting route használata architekturális magyarázatot igényel, mert a fizikai fájlszerkezet és a látható URL eltér.

---

## 36. Routing és authorization

### 36.1. Három szint

```text
navigációs láthatóság
route adapter authorization
application/domain authorization
```

Mindháromnak lehet szerepe, de a végső biztonsági döntés nem maradhat csak UI-ban.

### 36.2. Layout auth check

Layout használható arra, hogy auth nélküli felhasználót loginra irányítson. Ez UX-optimalizáció és közös shell-védelem.

Mutationnél és érzékeny querynél külön authorization szükséges.

### 36.3. Route Handler

```ts
const actor = await getActor(request);
const input = schema.parse(/* ... */);
const result = await command.execute({ actor, input });
```

A command vagy policy ellenőrzi a műveleti jogosultságot.

### 36.4. Object-level authorization

Nem elég, hogy actor rendelkezik `product.read` globális joggal. Lehet tenant-, ownership-, állapot- vagy mezőszintű policy.

### 36.5. 401, 403, 404

- **401:** nincs elfogadható hitelesítés;
- **403:** actor ismert, de a művelet tiltott;
- **404:** erőforrás nem létezik, vagy policy szerint létezése rejtendő.

A projekt konzisztens hibamappinget definiáljon.

### 36.6. Redirect loginra API esetén

Browser page loginra redirectelhet. JSON API-nál általában explicit 401 válasz jobb, mint HTML login oldalra redirect.

### 36.7. Return URL

Login utáni return path:

- csak safe relative path;
- vagy signed state;
- tenant/locale scope ellenőrzés;
- lejárat;
- open redirect védelem.

### 36.8. Proxy authorization

Proxy végezhet olcsó előszűrést, de nem feltétlenül rendelkezik minden domainadattal. A kritikus policy application rétegben marad.

### 36.9. Static page és authorization

User-specific védett oldalt nem szabad public statikus artifactként előállítani. Az authorization és cachemodell együtt vizsgálandó.

### 36.10. Audit

Érzékeny route logolhatja:

- operation;
- actor;
- tenant;
- resource ID;
- decision;
- policy version;
- correlation ID;

secret és érzékeny payload nélkül.

---

## 37. Routing és adatbiztonság

### 37.1. Route-paraméter adatbesorolása

URL-ben ne legyen:

- secret;
- access token hosszú élettartammal;
- egészségügyi vagy különleges személyes adat;
- teljes email cím, ha nem szükséges;
- belső adatbázis sequence, ha enumeration kockázat;
- nyers storage path.

### 37.2. ID enumeration

Szekvenciális ID önmagában nem security hiba, de növelheti enumeration kockázatát. Minden erőforrásnál object-level authorization szükséges.

Opaque ID nem helyettesíti az authorizationt.

### 37.3. Slug adatvédelme

A slug megjelenik logokban és historyban. Ne tartalmazzon érzékeny nevet vagy belső kategóriát indokolatlanul.

### 37.4. Query redaction

Logging middleware vagy Proxy redaktálja:

- token;
- code;
- signature;
- email;
- invite;
- reset paramétereket

az alkalmazás threat modelje szerint.

### 37.5. Error message

Route validation error ne echozza vissza kontrollálatlanul a teljes inputot. Strukturált issue-lista is redaktálja az érzékeny mezőket.

### 37.6. Path normalization

Fájl-, blob- vagy object storage útvonalnál:

- route ID → application query → storage key mapping;
- ne route stringből közvetlen path join;
- root containment;
- MIME/type allowlist;
- download authorization.

### 37.7. SSRF

TILOS URL-paraméterből tetszőleges szerveroldali fetch:

```text
/api/proxy?url=https://internal-service
```

Allowlist, URL parser, DNS/IP kontroll és redirect policy nélkül SSRF kockázat.

### 37.8. Referrer

Sensitive tokenes route külső assetet vagy linket csak megfelelő Referrer-Policy mellett használjon.

### 37.9. Browser cache

Érzékeny route response:

- `no-store`;
- megfelelő cookie flags;
- history/back cache mérlegelés;
- download header;
- content disposition

szerződést igényel.

### 37.10. Route dokumentáció

Minden securitykritikus route dokumentálja:

```text
threat model
authentication
authorization
sensitive inputs
logging redaction
cache policy
rate limit
idempotency
replay protection
```

---

## 38. Routing és cache-biztonság

### 38.1. A route shape nem cache policy

A `/public` vagy `/api` prefix nem mondja meg automatikusan, hogy a válasz cache-elhető-e.

### 38.2. Személyre szabott oldal

Ha a page cookies, actor vagy tenant alapján változik, shared public cache csak megfelelő vary/key partition mellett használható.

### 38.3. Cache poisoning

Bizalmatlan header vagy query ne kerüljön cache keybe kontrollálatlanul. Ellenkező esetben:

- cardinality attack;
- poisoning;
- cross-user leak;
- stale variant

lehetséges.

### 38.4. Rewrite és cache

A látható source URL és belső destination eltérhet. A CDN és Next cache kulcs viselkedését tesztelni kell, különösen host/tenant rewrite esetén.

### 38.5. Authorization után cache

User-specific authorization eredményét ne tedd globális cache-be actor/tenant scope nélkül.

### 38.6. `Vary`

A `Vary` header csak tudatosan használható, mert túl sok variáns cache hatékonyságot ront, hiányos `Vary` pedig adatszivárgást okozhat.

### 38.7. 404 cache

Dinamikus contentnél egy 404 később létezővé válhat. A negative cache TTL és invalidation dokumentált legyen.

### 38.8. Redirect cache

308 permanent redirect hosszú ideig cache-elődhet. Téves permanent redirect nehezen visszavonható.

### 38.9. Signed URL cache

Signed, user- vagy expiry-specifikus URL válasza tipikusan private/no-store, hacsak a signature kizárólag publikus immutable content capabilityje és a threat model engedi a cache-t.

### 38.10. Cache teszt

E2E vagy integration teszt ellenőrizze legalább:

- `Cache-Control`;
- `Vary`;
- tenant/user variáns;
- redirect cache status;
- 404 frissülés;
- rewrite isolation;
- locale isolation.

---
## 39. Tesztelési stratégia

### 39.1. Tesztpiramis

A routing tesztelése több rétegből áll:

```text
schema és builder unit teszt
route adapter unit/integration teszt
Proxy/redirect/rewrite contract teszt
production build
E2E navigáció és HTTP teszt
infrastruktúra edge teszt
```

Egyetlen snapshot vagy happy-path E2E nem elegendő.

### 39.2. Paraméterschema unit teszt

```ts
import { describe, expect, it } from 'vitest';

import { productIdSchema } from './product.schemas';

describe('productIdSchema', () => {
  it('elfogad UUID-t', () => {
    expect(
      productIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it.each(['', '123', '../secret', 'new'])('elutasítja: %s', (value) => {
    expect(() => productIdSchema.parse(value)).toThrow();
  });
});
```

### 39.3. Route builder unit teszt

```ts
expect(productRoutes.detail('a b')).toBe('/products/a%20b');
expect(productListRoute({ page: 1 })).toBe('/products');
expect(productListRoute({ page: 2 })).toBe('/products?page=2');
```

Negatív esetek:

- túl nagy page;
- ismeretlen enum;
- slash;
- Unicode;
- üres slug;
- reserved slug;
- query ismétlés.

### 39.4. Route Handler teszt

```ts
import { GET } from '@/app/api/products/[productId]/route';

it('400-at ad hibás ID-re', async () => {
  const response = await GET(
    new Request('http://localhost/api/products/not-a-uuid'),
    {
      params: Promise.resolve({ productId: 'not-a-uuid' }),
    },
  );

  expect(response.status).toBe(400);
});
```

A pontos context typinget a projekt Next.js baseline-jához kell igazítani.

### 39.5. Application teszt

A use case tesztje nem importál Next.js route fájlt. Fake portokkal vizsgálja:

- valid input;
- not-found;
- unauthorized;
- tenant mismatch;
- domain invariant;
- repository error mapping.

### 39.6. Page teszt

Async Server Component közvetlen unit tesztelése korlátozott lehet. Kiemelten:

- presentation komponens pure DTO-teszttel;
- application query unit teszttel;
- route behavior production E2E-vel

ellenőrizhető.

### 39.7. E2E route smoke

Kötelező esetek:

```text
GET list page
GET detail page
GET invalid ID
GET missing resource
GET unauthorized resource
API GET
API unsupported method
redirect alias
canonical slash
locale fallback
host/tenant isolation
```

### 39.8. Production server

A route E2E-t AJÁNLOTT production builden futtatni, nem kizárólag dev szerveren. A dev és production route/cache behavior eltérhet.

### 39.9. Redirect teszt

Ellenőrizd:

- státuszkód;
- `Location`;
- query megőrzés;
- fragment elvárt kliensviselkedése;
- redirect chain hiánya;
- open redirect elutasítása;
- permanent/temporary helyessége.

### 39.10. Rewrite teszt

Ellenőrizd:

- látható URL;
- belső destination;
- auth;
- cache isolation;
- host/tenant context;
- közvetlen internal route elérés;
- analytics route identity.

### 39.11. Proxy teszt

A Proxy pure részeit külön függvényekbe szervezd:

```ts
parseTenantHost()
resolveLocale()
shouldBypassProxy()
canonicalizePath()
```

Ezek determinisztikusan unit tesztelhetők.

### 39.12. Matcher negatív esetek

Teszteld, hogy a Proxy nem fut vagy bypassol:

```text
/_next/static/*
/_next/image/*
/favicon.ico
/robots.txt
/sitemap.xml
```

ha a contract ezt kívánja.

### 39.13. Locale teszt

- támogatott locale;
- unsupported locale;
- default locale;
- Accept-Language;
- cookie preference;
- canonical redirect;
- metadata alternates;
- locale × tenant kombináció.

### 39.14. Host-routing teszt

- valid subdomain;
- uppercase host;
- port;
- trailing dot;
- unknown host;
- reserved subdomain;
- custom domain;
- spoofolt forwarded host;
- tenantközi ID-hozzáférés.

### 39.15. Signed URL teszt

- valid signature;
- módosított path;
- módosított query;
- extra query;
- hiányzó query;
- expired;
- future expiry túl távol;
- rossz purpose;
- rossz method;
- rossz audience;
- ismeretlen key ID;
- replay;
- trailing slash különbség;
- query sorrend.

### 39.16. Static params teszt

- stabil rendezés;
- duplikált paraméter hiánya;
- locale/tenant scope;
- maximum route count;
- build fixture;
- unknown params behavior.

### 39.17. Parallel/intercepting E2E

- soft navigation;
- hard refresh;
- back/forward;
- close modal;
- focus;
- not-found;
- unauthorized;
- slot error boundary.

### 39.18. Route map golden test

A generált route map használható golden fixture-ként, ha:

- determinisztikus;
- frameworkverzióhoz kötött;
- explicit review történik változáskor;
- nem parse-ol instabil build logot támogatás nélkül.

### 39.19. Security teszt

- path traversal;
- SSRF;
- open redirect;
- IDOR;
- host header injection;
- cache leak;
- token log redaction;
- malformed encoding;
- oversized query/path;
- repeated parameter abuse.

### 39.20. Route contract evidence

A route-változás evidence-e megnevezi:

```text
commit
route pattern
futtatott parancs
unit/integration/E2E eredmény
build eredmény
security negatív esetek
redirect/rewrite diff
cache és auth hatás
```

---

## 40. Architekturális szabályok

### 40.1. App Router mint delivery adapter

A `src/app/**` importálhat:

- composition rootot;
- presentation schemát;
- explicit DTO-t;
- presentation komponenst;
- platform delivery helperét.

Nem importálhat közvetlenül:

- Prisma Clientet;
- ORM repository implementationt;
- adatbázis connectiont;
- külső provider konkrét SDK-ját, ha arra port létezik;
- domain aggregate internalt mutation célra;
- más route entrypointját.

### 40.2. Application réteg

Az application réteg nem importálhat:

- `next/*`;
- Reactot;
- `Request`-specifikus adaptert;
- `cookies()` vagy `headers()` API-t;
- route buildert, kivéve ha kifejezetten output portként modellezett notification URL-contract szükséges;
- infrastructure implementationt.

### 40.3. Route builder

A route builder:

- pure;
- client-safe;
- determinisztikus;
- encoding-aware;
- nem olvas envet;
- nem végez IO-t;
- nem authorization.

### 40.4. Composition root

A composition root:

- szerveroldali;
- `server-only` védelemmel rendelkezik;
- concrete adaptert injektál;
- nem kap raw requestet;
- nem route registry.

### 40.5. Input schema

A route input schema presentation concern. A domain invariáns továbbra is domainben marad.

Példa:

```text
UUID string formátum
  → presentation schema

product státuszátmenet
  → domain invariant
```

### 40.6. Saját HTTP API belső hívása

Server Component vagy Route Handler ne hívja ugyanazon alkalmazás saját `/api` route-ját HTTP-n keresztül.

Nem támogatott:

```ts
await fetch('http://localhost:3000/api/products');
```

Támogatott:

```ts
await catalogModule.queries.listProducts.execute(input);
```

### 40.7. Route-to-route import

TILOS:

```ts
import { GET } from '@/app/api/products/route';
```

production application kódban reuse célra. A közös logikát application service-be vagy delivery helperbe kell kiemelni.

Teszt importálhat route handlert adapterteszthez.

### 40.8. Redirect policy

A redirect destination validációja közös platform helper legyen, ha több route használja.

### 40.9. Error mapping

Application error → HTTP/UI mapping delivery concern.

```text
ProductNotFoundError
  → page: notFound()
  → API: 404 JSON
```

Az application error nem importál HTTP státuszkódot.

### 40.10. Route ownership

Minden jelentős route-namespace-nek legyen owner modul vagy platformkomponens. A route map ezt megjelenítheti.

### 40.11. Generated code

Route index, typed helper vagy adapter generált lehet, de:

- generált header;
- source manifest;
- drift check;
- kézi módosítás tiltása;
- determinisztikus output

szükséges.

### 40.12. Waiver

Architekturális kivételhez dokumentált waiver kell:

```text
szabály
indok
scope
owner
lejárat
kompenzáló kontroll
evidence
```

### 40.13. Minimális dependency irány

```text
app/presentation
  -> composition
    -> application
      -> domain

infrastructure
  -> application/domain portok implementációja
```

A routing nem fordíthatja meg ezt az irányt.

### 40.14. Route-manifest jövőbeli szerepe

Egy generált Winzard route-manifest csak származtatott contract lehet:

```json
{
  "pattern": "/products/[productId]",
  "entrypoint": "src/app/products/[productId]/page.tsx",
  "kind": "page",
  "owner": "catalog",
  "runtime": "nodejs"
}
```

A matcher továbbra is Next.js.

---

## 41. Tervezett Forge route-diagnosztika

### 41.1. Alapelv

A Forge route-parancsok nem implementálnak második routert. Feladatuk:

- route-fa feltérképezése;
- route contract ellenőrzése;
- diagnosztikai nézet;
- architecture és security szabályok;
- generált route map;
- alias/rewrite/redirect inventory.

### 41.2. `route:list`

Célparancs:

```bash
pnpm forge route:list --project .
```

Lehetséges emberi kimenet:

```text
METHOD  KIND     PATTERN                         ENTRYPOINT
GET     page     /                               src/app/page.tsx
GET     page     /products                       src/app/products/page.tsx
GET     page     /products/[productId]           src/app/products/[productId]/page.tsx
GET     handler  /api/products                   src/app/api/products/route.ts
POST    handler  /api/products                   src/app/api/products/route.ts
GET     handler  /api/products/[productId]       src/app/api/products/[productId]/route.ts
```

### 41.3. JSON-kimenet

```bash
pnpm forge route:list --json
```

Célforma:

```json
{
  "schemaVersion": 1,
  "routes": [
    {
      "kind": "page",
      "pattern": "/products/[productId]",
      "entrypoint": "src/app/products/[productId]/page.tsx",
      "methods": ["GET"],
      "dynamicSegments": ["productId"],
      "routeGroups": [],
      "parallelSlots": [],
      "runtime": "nodejs"
    }
  ]
}
```

### 41.4. `route:inspect`

```bash
pnpm forge route:inspect '/products/[productId]'
```

Mutassa:

- entrypoint;
- layout chain;
- loading/error/not-found boundary;
- dynamic segmentek;
- route groupok;
- runtime;
- statikus/dinamikus indikátorok;
- route builder hivatkozások;
- security/cache metadata;
- kapcsolódó redirect/rewrite;
- owner;
- tesztek.

### 41.5. `route:match`

```bash
pnpm forge route:match '/products/550e8400-e29b-41d4-a716-446655440000'
```

A parancs diagnosztikai pattern matchinget végezhet a generált route indexen, de egyértelműen jelezze:

```text
Diagnostic approximation; Next.js remains authoritative.
```

Különösen encoded path, Proxy rewrite és framework-internal prioritás esetén a production Next.js viselkedés a mérvadó.

### 41.6. `route:check`

Ellenőrizze:

- route collision;
- group collision;
- page/handler conflict;
- catch-all túl széles scope;
- hiányzó input schema dinamikus route-nál;
- közvetlen ORM import;
- saját API belső fetch;
- unsafe redirect;
- route builder drift;
- alias chain;
- redirect destination hiány;
- Proxy matcher túl széles volta;
- health route cache policy;
- securitykritikus route evidence.

### 41.7. `route:aliases`

Lehetséges célparancs:

```bash
pnpm forge route:aliases
```

Kimenet:

```text
SOURCE             DESTINATION        TYPE       STATUS       REMOVE_AFTER
/catalog/:slug     /products/:slug    redirect   deprecated   2027-01-01
/legacy/:path*     /docs/:path*       rewrite    transitional -
```

### 41.8. `route:graph`

Opcionális későbbi nézet:

```text
route
→ layout
→ composition root
→ application operation
→ policy
→ evidence
```

Nem kell teljes TypeScript call graphot garantálnia, ha az nem bizonyítható statikusan.

### 41.9. Route map dokumentáció

```bash
pnpm forge route:docs
```

Generálhat:

```text
docs/90-generated/routing/route-map.md
docs/90-generated/routing/redirect-map.md
docs/90-generated/routing/security-status.md
```

### 41.10. Frameworkverzió

A route parser és indexer Next.js-verzióhoz kötött. Ismeretlen major verziónál fail-closed vagy warning + explicit compatibility mode szükséges.

### 41.11. Nem cél

A Forge route-diagnosztika nem:

- dispatchol production requestet;
- helyettesíti a Next buildet;
- generál automatikusan authorizationt;
- találja ki a domainmodellt;
- tekinti a route-nevet üzleti operationnek;
- olvas production secretet.

### 41.12. Bevezetési sorrend

Ajánlott implementációs sorrend:

```text
1. route:list statikus fájlrendszerből
2. route:check collision és entrypoint szabályok
3. redirects/rewrites/Proxy inventory
4. layout/boundary chain
5. route builder drift
6. security/cache metadata
7. generated docs
8. advanced matching approximation
```

---

## 42. Implementációs elfogadási kritériumok

### 42.1. Dokumentációs Definition of Done

A routing dokumentáció akkor elfogadható, ha:

- lefedi a Symfony routing fejezet minden jelentős funkcionális területét;
- minden Symfony-fogalmat helyesen képez le vagy explicit nem megfelelőnek jelöl;
- nem sugall második runtime routert;
- külön jelöli az upstream és célparancsokat;
- a példák követik a Winzard architektúrát;
- a security és cache hatások szerepelnek;
- a források ellenőrzési dátuma rögzített.

### 42.2. Minimális kódimplementáció későbbi scope-ja

A dokumentumhoz tartozó első teljes implementáció legalább:

1. egy statikus page route;
2. egy dinamikus detail page;
3. GET Route Handler;
4. mutation Route Handler vagy Server Action;
5. Zod path- és query schema;
6. route builder;
7. alias redirect;
8. not-found mapping;
9. authorization példa;
10. unit és E2E tesztek;
11. route architecture check;
12. route map dokumentáció

részeket tartalmazzon.

### 42.3. Javasolt referencia-szelet

```text
/products
/products/[productId]
/products/[productId]/edit
/api/products
/api/products/[productId]
/catalog/[slug] → /products/[slug]
```

A tényleges implementáció csak a kapcsolódó product/domain specifikáció után készítendő el; a routing fejezet önmagában nem definiál teljes catalog domaint.

### 42.4. Kötelező architekturális bizonyíték

- `src/app` nem importál ORM-et;
- application nem importál Next.js-t;
- route input validált;
- actor/policy explicit;
- DTO explicit;
- route builder pure;
- API és page ugyanazt az application queryt használja;
- error mapping deliveryben történik.

### 42.5. Kötelező routing bizonyíték

- `next typegen` sikeres;
- TypeScript sikeres;
- production build sikeres;
- route E2E sikeres;
- redirect teszt sikeres;
- invalid params negatív teszt sikeres;
- cache header ellenőrzött;
- auth negatív eset ellenőrzött.

### 42.6. Compatibility bizonyíték

URL-módosításnál:

- régi URL inventory;
- redirect/rewrite döntés;
- status code;
- query migration;
- canonical metadata;
- eltávolítási terv;
- analytics mérés;
- mobile/partner/webhook hatás.

### 42.7. Security bizonyíték

Érzékeny route-nál:

- threat model;
- authorization test;
- IDOR test;
- open redirect test;
- secret redaction;
- cache isolation;
- rate-limit/idempotency döntés;
- signed URL esetén replay és expiry teszt.

### 42.8. Route documentation impact

Minden PR adjon routing hatásnyilatkozatot:

```yaml
routing_impact:
  routes_added: []
  routes_removed: []
  routes_changed: []
  redirects_added: []
  rewrites_added: []
  cache_changed: false
  authorization_changed: false
  public_url_breaking_change: false
```

### 42.9. Nem elfogadható shortcutok

Nem teljesített a scope, ha:

- csak létrejött a page fájl teszt nélkül;
- a paraméter `as any` castot kap;
- közvetlen Prisma query van a handlerben;
- a redirect user inputot fogad allowlist nélkül;
- a route builder kézzel duplikálja a pathot több helyen;
- a dokumentáció route-nevet állít forrásigazságnak;
- a build nem futott.

### 42.10. Handoff

A handoff rögzítse:

```text
route diff
entrypointok
builder diff
alias/redirect diff
Proxy diff
security/cache hatás
futtatott tesztek
build result
ismert korlátok
következő lépés
```

---

## 43. Hibaelhárítás

### 43.1. A route 404-et ad, pedig a mappa létezik

Ellenőrizd:

- van-e `page.tsx` vagy `route.ts`;
- helyes-e a fájlnév és kiterjesztés;
- jó app root alatt van-e;
- nem route group nevet írtál-e az URL-be;
- nem hiányzik-e dinamikus paraméter;
- nincs-e build/type error;
- nem intercepting/parallel route-ként értelmeződik-e.

### 43.2. A route group neve megjelenik az URL-ben

A route group pontosan zárójeles mappa:

```text
(admin)
```

Ha tényleges `admin` prefix kell, külön `admin/` mappa szükséges.

### 43.3. Két page ugyanarra az URL-re mutat

Vizsgáld meg a route groupokat. A zárójeles szegmens nem része az URL-nek, ezért két eltérő fizikai path publikus collisiont okozhat.

### 43.4. A `params` TypeScript hibás

A modern Next.js baseline-nál a `params` Promise lehet. Futtasd:

```bash
pnpm typegen
pnpm typecheck
```

Használd a generált `PageProps` vagy `RouteContext` helpert.

### 43.5. A query string érték tömb vagy ismeretlen típus

A `searchParams` user input. Ne castold vakon stringgé. A schema kezelje:

- string;
- string array;
- undefined;
- ismételt kulcs;
- üres string.

### 43.6. A statikus route-ot a dinamikus kezeli

Ellenőrizd:

- valóban külön statikus mappa van-e;
- nincs-e túl széles catch-all;
- nincs-e rewrite;
- nincs-e Proxy pathmódosítás;
- reserved slug contract.

### 43.7. A redirect loopol

Vizsgáld együtt:

```text
CDN redirect
reverse proxy redirect
next.config redirects
Proxy redirect
page/handler redirect
trailingSlash
locale canonicalization
```

Rögzítsd minden hop `Location` értékét.

### 43.8. A rewrite után rossz tenant adat jelenik meg

Lehetséges ok:

- tenant context nem része repository querynek;
- shared cache tenant nélkül;
- host parser hibás;
- Proxy header spoofolható;
- internal destination közvetlenül elérhető;
- route builder rossz origint használ.

### 43.9. A login utáni redirect külső oldalra visz

Open redirect. A `next` vagy `returnTo` paramétert safe relative path schema validálja. Protocol-relative `//evil.example` érték is tiltott.

### 43.10. A production build route-ja máshogy viselkedik, mint devben

Ellenőrizd:

- static/dynamic classification;
- cache;
- environment;
- build-time data;
- Proxy runtime;
- Edge/Node runtime;
- generated params;
- standalone/base path;
- deployment rewrites.

Mindig futtass production E2E-t.

### 43.11. A Route Handler 405-öt ad

Az adott metódus exportja hiányzik, vagy a route más entrypointtal konfliktusos. Ellenőrizd a támogatott metódusnevet nagybetűvel.

### 43.12. A JSON endpoint HTML-t ad

Lehetséges:

- redirect login page-re;
- hibás destination;
- page és API namespace keverése;
- reverse proxy fallback;
- not-found HTML;
- content negotiation hiba.

API auth esetén explicit JSON 401/403 ajánlott.

### 43.13. A signed URL mindig invalid

Ellenőrizd:

- kanonikus query sorrend;
- percent encoding;
- trailing slash;
- host/scheme benne van-e a signature inputban;
- clock skew;
- purpose/method;
- key ID;
- signature paraméter kizárása;
- query ismételt kulcsok.

### 43.14. A signed URL valid marad módosított paraméterrel

Valószínűleg nem minden securityreleváns paraméter része az aláírandó kanonikus stringnek. Ismeretlen extra paramétert is kezelni kell.

### 43.15. Az abszolút URL rossz hostot használ

Ne a raw request Host headerből generálj. Ellenőrizd az `APP_URL` vagy tenant origin registry konfigurációt, illetve a trusted proxy beállítást.

### 43.16. A locale redirect elveszíti a queryt

A redirect builder másolja át a támogatott query paramétereket. Secret vagy tiltott paramétert ne vigyen tovább automatikusan.

### 43.17. A locale route végtelenül redirectel

Ellenőrizd:

- default locale felismerés;
- path már tartalmaz-e locale-t;
- uppercase/lowercase normalizálás;
- trailing slash;
- cookie és header prioritás;
- Proxy matcher.

### 43.18. A Proxy minden assetre lefut

Szűkítsd a matchert, és adj unit tesztet a bypass pathokra.

### 43.19. A modal route refreshkor eltűnik vagy 404

Parallel/intercepting route-nál hiányozhat:

- teljes detail page;
- `default.tsx`;
- megfelelő intercepting convention;
- hard-navigation teszt.

### 43.20. A `Link` típusa elutasítja a builder outputot

- futtasd a typegent;
- ellenőrizd a `typedRoutes` beállítást;
- a builder return típusa legyen `Route`;
- ne használj ellenőrizetlen tetszőleges stringet;
- nézd meg, hogy a route ténylegesen létezik-e.

### 43.21. A cache más felhasználó adatát adja

Azonnal security incidentként kezeld. Vizsgáld:

- public cache;
- missing tenant/actor key;
- rewrite host isolation;
- `Vary`;
- response headers;
- data cache scope;
- route static classification;
- auth check utáni cache.

### 43.22. A régi URL még használatban van

Ne távolítsd el vakon az aliast. Mérd:

- access log;
- referer;
- partner traffic;
- email template;
- search index;
- mobile app;
- webhook.

### 43.23. Route builder és route-fa eltér

A későbbi Forge drift check feladata. Addig:

- typegen;
- typedRoutes;
- builder unit teszt;
- grep/import inventory;
- E2E;
- route map review.

### 43.24. Route Handler közvetlen ORM-et használ

Emeld ki:

```text
application query/command
repository port
composition wiring
```

A route csak validáljon és mapeljen.

### 43.25. Server Component saját API-t hív

Cseréld közvetlen application query hívásra. A saját HTTP API belső hívása felesleges hálózati és auth/cache komplexitást okoz.

---

## 44. Symfony–Winzard megfeleltetés

### 44.1. Fogalmi megfeleltetés

| Symfony routing | Winzard / Next.js megfelelő |
| --- | --- |
| Route collection | `src/app` route-fa |
| Route configuration | fájlrendszeri convention + `next.config` + Proxy |
| Route name | nincs runtime megfelelő; route pattern és TypeScript builder |
| Path | app mappaszegmensek |
| Controller | `page.tsx`, `route.ts`, Server Action mint delivery adapter |
| HTTP method restriction | Route Handler exportok: `GET`, `POST`, stb. |
| `requirements` | route shape + runtime input schema |
| Default parameter | query/schema/application default vagy külön route |
| Optional parameter | külön statikus route, query vagy `[[...segments]]` |
| Route priority | egyértelmű route-fa; statikus/dinamikus/catch-all specifikusság |
| ParamConverter / entity mapping | explicit schema → application query → repository port → DTO |
| Backed enum | runtime schema + TypeScript union/enum |
| `_controller` | route entrypoint fájl |
| `_format` | explicit response/media-type contract |
| `_fragment` | kliensoldali hash |
| `_locale` | validált locale szegmens/context |
| `_query` | `searchParams` / `URLSearchParams` |
| Slash-t fogadó paraméter | catch-all `[...segments]` |
| Route alias | redirect/rewrite vagy deprecated route builder wrapper |
| Deprecated alias | dokumentált URL migration lifecycle |
| Route group/prefix | valódi mappaprefix vagy `(group)` |
| Route group name prefix | TypeScript export namespace; nincs runtime route-name prefix |
| Current route name | route pattern/path; generált diagnosztikai metadata később |
| Direct template route | egyszerű `page.tsx`, de üzleti adatnál application query |
| Redirect controller | `redirect`, `permanentRedirect`, config redirect, Proxy redirect |
| Trailing slash handling | globális `trailingSlash` és canonical redirect |
| Subdomain route | host-feloldás Proxyban/infrastruktúrában |
| Localized route | `[locale]` szegmens + Proxy + metadata |
| Stateless route | explicit session/cache behavior contract |
| URL generator | pure TypeScript route builder |
| URL generator service | relative builder + origin/tenant URL service |
| Template URL helper | `Link` + route builder |
| JavaScript URL generation | client-safe route builder; nincs teljes route registry export |
| Commandból URL | explicit `APP_URL` vagy tenant origin registry |
| Route exists | typegen + typedRoutes + build + későbbi Forge check |
| HTTPS URL | trusted canonical origin |
| Signed URI | célként `SignedUrlService` port + crypto adapter |
| `debug:router` | `next build`, `typegen`, későbbi `forge route:list` |
| `router:match` | E2E/Next runtime; későbbi diagnosztikai `route:match` |

### 44.2. Lényegi különbségek

#### Symfony

- route collection objektumokat épít;
- route-neveket használ;
- controller resolutiont konfigurál;
- matching requirements és priority route metadata;
- URL generator a route collectionből dolgozik.

#### Next.js App Router

- route-fát fájlrendszerből épít;
- layout/rendering hierarchy része a routingnak;
- Server Component és Route Handler entrypointok;
- generated route typing;
- redirect/rewrite/Proxy külön konfigurációs felületek.

#### Winzard

- nem másolja át a Symfony routert;
- megtartja a Next.js source of truthot;
- explicit application boundaryt ad;
- route buildert és diagnosztikát definiál;
- security/cache/ownership contractot érvényesít;
- később Forge ellenőrzéseket ad.

### 44.3. Amit a Symfonyból átveszünk

- route contract tudatosság;
- HTTP-metódusok explicit kezelése;
- paraméterkövetelmények;
- alias és deprecation lifecycle;
- prefixek és lokalizáció;
- host routing;
- URL-generálás központosítása;
- route diagnosztika;
- signed URL threat model;
- route troubleshooting fegyelem.

### 44.4. Amit nem veszünk át

- külön runtime route-registry;
- route-name alapú dispatch;
- automatikus ORM entity injection;
- rejtett param converter magic;
- YAML/PHP route konfiguráció az App Router mellett;
- route ordering mint architektúra;
- controller class mint kötelező központi absztrakció.

### 44.5. Végső modell

```text
Symfony routing fegyelem
+
Next.js App Router route-fa és renderingmodell
+
Winzard application-, security- és diagnosztikai contract
```

---

## 45. Források és attribúció

### 45.1. Symfony szerkezeti kiindulópont

- [Symfony Docs — Routing](https://symfony.com/doc/current/routing.html)

A Symfony fejezet funkcionális témái közül a dokumentum átülteti:

- route-létrehozást;
- HTTP-metódusokat;
- környezet- és feltételfüggő matchinget;
- route-debuggingot;
- paraméterkövetelményeket és alapértékeket;
- prioritást;
- paraméterkonverziót;
- enumokat;
- speciális és extra paramétereket;
- slash-tartalmú paramétereket;
- aliasokat és deprecationt;
- groupokat és prefixeket;
- aktuális route-információt;
- redirecteket;
- trailing slash kezelését;
- host- és localized route-okat;
- stateless működést;
- URL-generálást;
- route-létezést;
- HTTPS és signed URI témákat;
- troubleshootingot.

A dokumentum nem másolja szó szerint a Symfony szövegét vagy kódját. A funkcionális kérdéseket a Winzard saját technológiájával és architektúrájával válaszolja meg.

### 45.2. Next.js hivatalos források

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Dynamic Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Redirecting](https://nextjs.org/docs/app/guides/redirecting)
- [`redirect`](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [`permanentRedirect`](https://nextjs.org/docs/app/api-reference/functions/permanentRedirect)
- [Rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- [Redirects](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
- [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Internationalization](https://nextjs.org/docs/app/guides/internationalization)
- [`typedRoutes`](https://nextjs.org/docs/app/api-reference/config/next-config-js/typedRoutes)
- [`trailingSlash`](https://nextjs.org/docs/app/api-reference/config/next-config-js/trailingSlash)
- [`generateStaticParams`](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
- [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
- [Intercepting Routes](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes)
- [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next)

### 45.3. Kapcsolódó Winzard dokumentumok

- [Az első oldal létrehozása Winzardban](winzard-page-creation.md)
- [Winzard alkalmazásplatform Next.js fölött](winzard-application-platform.md)
- [A Winzard telepítése és beállítása](winzard-setup.md)
- [Humán és AI dokumentáció Winzard projektekben](winzard-human-ai-documentation.md)

### 45.4. Ellenőrzési dátum

```text
2026-07-17
```

### 45.5. Újraellenőrzendő változó felületek

Dokumentációfrissítéskor KÖTELEZŐ újra ellenőrizni:

- a Next.js aktuális stabil verzióját;
- a `params` és `searchParams` async szerződését;
- a `PageProps`, `LayoutProps` és `RouteContext` helper típusokat;
- a `typedRoutes` státuszát;
- a Proxy elnevezését, runtime-ját és matcher contractját;
- a redirects és Proxy feldolgozási sorrendjét;
- a Route Handler támogatott metódusait és cache-defaultjait;
- a trailing slash viselkedést;
- a parallel/intercepting route conventionöket;
- a `next build --debug` kimenetét;
- a `next typegen` működését;
- a Winzard Forge route-parancsok tényleges implementációs státuszát.

---

## Rövid ellenőrzőlista

Új vagy módosított route előtt:

```text
[ ] A route pattern a felhasználói információs architektúrát követi.
[ ] Nincs második runtime route-registry.
[ ] A dinamikus paraméter neve jelentéssel bíró.
[ ] Path és query input műveletspecifikus schema-val validált.
[ ] A page/handler nem importál ORM-et.
[ ] Az application művelet explicit.
[ ] Authorization és tenant scope explicit.
[ ] DTO és error mapping explicit.
[ ] Route builder vagy literal használata tudatos.
[ ] Redirect/rewrite/canonical hatás dokumentált.
[ ] Cache és session hatás dokumentált.
[ ] Locale/host/origin input validált.
[ ] Open redirect, traversal, SSRF és IDOR negatív eset vizsgált.
[ ] Typegen, typecheck és production build lefutott.
[ ] Unit/integration/E2E evidence elérhető.
[ ] Publikus URL törésnél migration és alias terv készült.
```
