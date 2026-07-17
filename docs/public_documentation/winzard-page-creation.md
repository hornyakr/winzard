---
title: "Az első oldal létrehozása Winzardban"
description: "HTML-oldalak és JSON-végpontok létrehozása a Next.js App Router delivery rétegében, Winzard-kompatibilis application, composition és presentation határokkal."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-17"
source_basis: "Symfony Docs — Create your First Page in Symfony"
nextjs_baseline: "16.2.10"
---

# Az első oldal létrehozása Winzardban

## A dokumentum célja

Ez a dokumentum a Symfony **„Create your First Page in Symfony”** fejezetének Winzard-specifikus, önálló szakmai átültetése. Nem szó szerinti fordítás. A referenciaoldal funkcionális ívét követi — útvonal, controller, válasz, template, diagnosztika és projektstruktúra —, de minden fogalmat a Winzard Next.js App Router-alapú célarchitektúrájához igazít.

A dokumentum végére egy fejlesztő:

1. megérti, hogyan lesz egy fájlrendszerbeli route szegmensből publikus URL;
2. létre tud hozni HTML-oldalt és JSON Route Handlert;
3. meg tudja különböztetni a Next.js-minimumot a Winzard-kompatibilis megoldástól;
4. képes a `page.tsx` fájlt vékony delivery adapterként használni;
5. application queryn és composition rooton keresztül tud adatot adni a nézetnek;
6. helyesen kezeli a statikus, dinamikus és request-time renderelést;
7. típusosan kezeli a route paramétereket és a query stringet;
8. meg tudja határozni a layout-, metadata-, loading-, not-found- és error-határokat;
9. tudja, mikor kell Server Componentet és mikor Client Componentet használni;
10. ellenőrizni tudja a route-okat, a típusokat, a buildet és az első oldal tesztjeit.

A Winzard alapelve változatlan:

> A `src/app` könyvtár HTTP-, routing-, rendering- és UI-adapter. Az üzleti szabályok, alkalmazási műveletek, adat-hozzáférés és dependency wiring nem költözhetnek a route fájlokba.

> [!IMPORTANT]
> A dokumentumban szereplő `forge route:list`, `forge route:inspect` és hasonló parancsok egy része **cél-CLI szerződés**. Ahol a parancs még nem implementált, a dokumentum upstream vagy manuális ellenőrzési módot is ad.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Előfeltételek és hatókör](#2-előfeltételek-és-hatókör)
3. [Mi számít oldalnak Winzardban?](#3-mi-számít-oldalnak-winzardban)
4. [A request–response életciklus](#4-a-requestresponse-életciklus)
5. [Az első oldal: a Next.js-minimum](#5-az-első-oldal-a-nextjs-minimum)
6. [Miért nem ez a végleges Winzard-megoldás?](#6-miért-nem-ez-a-végleges-winzard-megoldás)
7. [A kanonikus Winzard vertikális szelet](#7-a-kanonikus-winzard-vertikális-szelet)
8. [Az application port és DTO](#8-az-application-port-és-dto)
9. [Az application query](#9-az-application-query)
10. [Az infrastruktúra-adapter](#10-az-infrastruktúra-adapter)
11. [A composition root](#11-a-composition-root)
12. [A `page.tsx` mint vékony delivery adapter](#12-a-pagetsx-mint-vékony-delivery-adapter)
13. [A nézet renderelése](#13-a-nézet-renderelése)
14. [JSON-végpont létrehozása](#14-json-végpont-létrehozása)
15. [Statikus, dinamikus és cache-elt renderelés](#15-statikus-dinamikus-és-cache-elt-renderelés)
16. [Dinamikus route paraméterek](#16-dinamikus-route-paraméterek)
17. [Query string és `searchParams`](#17-query-string-és-searchparams)
18. [Layoutok, route groupok és metadata](#18-layoutok-route-groupok-és-metadata)
19. [Navigáció](#19-navigáció)
20. [Loading, not-found és error felületek](#20-loading-not-found-és-error-felületek)
21. [Server és Client Component határ](#21-server-és-client-component-határ)
22. [Route-diagnosztika és hibakeresés](#22-route-diagnosztika-és-hibakeresés)
23. [A releváns projektstruktúra](#23-a-releváns-projektstruktúra)
24. [Tesztelési stratégia](#24-tesztelési-stratégia)
25. [Biztonsági és architekturális szabályok](#25-biztonsági-és-architekturális-szabályok)
26. [Implementációs elfogadási kritériumok](#26-implementációs-elfogadási-kritériumok)
27. [Hibaelhárítás](#27-hibaelhárítás)
28. [Symfony–Winzard megfeleltetés](#28-symfonywinzard-megfeleltetés)
29. [Források és attribúció](#29-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy architekturális, biztonsági, reprodukálhatósági hibát okozhat;
- **TILOS / MUST NOT**: a megoldás Winzard-kompatibilis kódban nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni kell;
- **OPCIONÁLIS / MAY**: a projekt igénye szerint használható.

### 1.2. A fejezet fő fogalmai

| Fogalom | Jelentés |
| --- | --- |
| **Route szegmens** | A `src/app` könyvtár egy URL-szegmensnek megfelelő mappája. |
| **Page** | Egy route szegmens publikus HTML-felülete, amelyet a `page.tsx` tesz elérhetővé. |
| **Route Handler** | Web `Request`/`Response` API-ra épülő HTTP-végpont egy `route.ts` fájlban. |
| **Delivery adapter** | Next.js-specifikus belépési pont, amely request-adatot olvas, validál, use case-t hív, majd választ képez. |
| **Presentation komponens** | React-komponens, amely explicit DTO-ból UI-t renderel. |
| **Application query** | Olvasási jellegű alkalmazási művelet, amely frameworkfüggetlen bemenetből DTO-t állít elő. |
| **Port** | Az application réteg által megfogalmazott interfész egy külső képességhez. |
| **Adapter** | Egy port konkrét implementációja, például Node.js crypto vagy Prisma. |
| **Composition root** | A szerveroldali wiring réteg, ahol az application objektumok megkapják a konkrét adaptereket. |
| **Server Component** | Alapértelmezetten szerveren futó React-komponens, amely nem kerül kliensoldali JavaScriptként a böngészőbe. |
| **Client Component** | `"use client"` direktívával jelölt komponens, amely böngészőoldali interakciót, állapotot vagy API-t használhat. |
| **DTO** | A rendereléshez vagy válaszhoz szükséges, explicit és minimális adatstruktúra. |
| **Request-time rendering** | Olyan renderelés, amely a beérkező kéréskor fut, nem buildidőben vagy megosztott cache-ből. |

### 1.3. Symfony-terminológia és Winzard-terminológia

A Symfony első oldal dokumentációja a **route + controller + Response + Twig template** modellt tanítja.

A Winzard ennek funkcionális megfelelőjét így bontja fel:

```text
URL / HTTP request
  -> Next.js route resolution
  -> page.tsx vagy route.ts delivery adapter
  -> application query / command
  -> port
  -> infrastructure adapter
  -> explicit DTO
  -> React Server Component view vagy Web Response
```

A `page.tsx` ezért részben controller, részben framework által felismert route entrypoint, de **nem lehet application service**.

---

## 2. Előfeltételek és hatókör

### 2.1. Kötelező előfeltételek

A fejezet megkezdése előtt KÖTELEZŐ:

1. a Winzard setup dokumentáció szerinti projektet létrehozni vagy beüzemelni;
2. a függőségeket telepíteni;
3. a fejlesztői szervert elindítani;
4. a kezdőoldalt böngészőben elérni;
5. a TypeScript strict módot használni;
6. az `@/*` aliasnak a `src/*` könyvtárra mutatnia.

Ajánlott ellenőrzés:

```bash
pnpm install --frozen-lockfile
pnpm doctor
pnpm typecheck
pnpm dev
```

Ha a `doctor` script még nem érhető el:

```bash
node --version
pnpm --version
pnpm next info
pnpm next typegen
pnpm exec tsc --noEmit
```

A fejlesztői alkalmazás alapértelmezett címe:

```text
http://localhost:3000
```

### 2.2. A fejezet technikai baseline-ja

A példák az alábbi célkörnyezetre készültek:

```text
Node.js:    24.x LTS
pnpm:       11.x
Next.js:    16.2.10
React:      19.2.x
TypeScript: 5.9.x
App Router: igen
src/:       igen
```

### 2.3. Hatókör

A fejezet lefedi:

- HTML-oldal létrehozását;
- JSON GET végpont létrehozását;
- route és file-system convention kapcsolatát;
- Server Component renderelést;
- route paramétereket;
- query stringet;
- route-szintű metadata, layout és hibafelületeket;
- elsődleges diagnosztikai és tesztelési workflow-t.

A fejezet nem végleges specifikációja:

- a teljes routing szabályrendszernek;
- a Server Actionöknek és formoknak;
- az authentikációnak és authorizációnak;
- a resource CRUD generátornak;
- a caching platform teljes modelljének;
- a nemzetköziesített routingnak;
- az intercepting vagy parallel route-oknak.

Ezek külön dokumentációs szeletekben készülnek el.

---

## 3. Mi számít oldalnak Winzardban?

### 3.1. A publikus route feltétele

A Next.js App Router fájlrendszer-alapú routingot használ. Egy mappa önmagában még nem tesz publikus útvonalat elérhetővé.

HTML-oldal akkor jön létre, ha a route szegmensben van egy `page.tsx`:

```text
src/app/about/page.tsx
```

A hozzá tartozó URL:

```text
/about
```

JSON- vagy egyéb HTTP-végpont akkor jön létre, ha a szegmensben van egy `route.ts`:

```text
src/app/api/about/route.ts
```

A hozzá tartozó URL:

```text
/api/about
```

### 3.2. Mappa és speciális fájl szerepe

```text
src/app/lucky/number/page.tsx
        │      │       └── a route publikus HTML-oldala
        │      └────────── URL-szegmens: number
        └───────────────── URL-szegmens: lucky
```

Eredmény:

```text
/lucky/number
```

A mappaszerkezet adja a route pathot, a `page.tsx` pedig az adott route levélszintű UI-ját.

### 3.3. Page és Route Handler nem ütközhet

Ugyanazon route szegmensben nem lehet egyszerre `page.tsx` és `route.ts`, mert mindkettő átvenné ugyanazt az útvonalat.

Nem érvényes:

```text
src/app/lucky/number/page.tsx
src/app/lucky/number/route.ts
```

Érvényes:

```text
src/app/lucky/number/page.tsx
src/app/api/lucky/number/route.ts
```

A Winzard alapértelmezett konvenciója:

- böngészőoldali UI: `/...`;
- külső vagy explicit HTTP API: `/api/...`;
- Server Componentből belső use case hívás, nem saját `/api` végpont fetch-elése.

### 3.4. A route nem azonos a modulstruktúrával

A route path felhasználói információarchitektúra. A modulstruktúra üzleti és technikai határ.

Példa:

```text
URL: /admin/products/123/edit
```

nem jelenti azt, hogy az üzleti kódot az alábbi helyre kell tenni:

```text
src/app/admin/products/[id]/edit/business-logic.ts
```

A helyes szétválasztás:

```text
src/app/(admin)/admin/products/[id]/edit/page.tsx
src/modules/catalog/product/application/commands/update-product.ts
src/modules/catalog/product/presentation/product-form.tsx
src/composition/catalog.ts
```

---

## 4. A request–response életciklus

### 4.1. HTML-oldal

Egy böngészőből érkező GET kérés tipikus folyamata:

```text
GET /lucky/number
  -> Next.js felismeri a route szegmenseket
  -> betölti a releváns layoutokat
  -> meghívja a page.tsx Server Componentet
  -> a page meghívja az application queryt
  -> az application query DTO-t ad vissza
  -> a presentation komponens React UI-t renderel
  -> Next.js HTML/RSC választ streamel
```

### 4.2. JSON-végpont

```text
GET /api/lucky/number
  -> Next.js felismeri a route.ts fájlt
  -> meghívja az exportált GET handlert
  -> a handler meghívja ugyanazt az application queryt
  -> a handler explicit JSON response-t állít elő
```

### 4.3. A fontos architekturális különbség

A HTML-oldal és a JSON-végpont két külön delivery adapter lehet, de ugyanazt az application műveletet használhatja.

```text
page.tsx --------┐
                 ├──> GetLuckyNumber
route.ts --------┘
```

TILOS az application logikát lemásolni a két adapterben.

### 4.4. A controller fogalom Winzardban

A Symfony controller explicit osztálymetódus, amely `Response` objektumot ad vissza.

A Winzardban nincs egyetlen kötelező `Controller` osztálytípus. Controller-szerepet tölthet be:

- egy `page.tsx` Server Component;
- egy `route.ts` HTTP method handler;
- egy Server Action;
- később egy CLI command adapter vagy queue handler.

A közös szabály:

> A controller-szerepű adapter transportot kezel, nem üzleti döntést hoz.

---

## 5. Az első oldal: a Next.js-minimum

### 5.1. A példa célja

Először készül egy minimális, kizárólag routingot és renderelést bemutató oldal:

```text
/lucky/number
```

A route minden kéréskor 0 és 100 közötti számot jelenít meg.

Hozd létre:

```text
src/app/lucky/number/page.tsx
```

Tartalom:

```tsx
import { connection } from 'next/server';

export default async function LuckyNumberPage() {
  await connection();

  const number = Math.floor(Math.random() * 101);

  return (
    <main>
      <h1>A szerencseszámod: {number}</h1>
    </main>
  );
}
```

Indítsd el a fejlesztői szervert:

```bash
pnpm dev
```

Nyisd meg:

```text
http://localhost:3000/lucky/number
```

### 5.2. Mi történt?

A fájl útvonala:

```text
src/app/lucky/number/page.tsx
```

automatikusan az alábbi route-ot jelenti:

```text
/lucky/number
```

A default export egy React-komponens. A page alapértelmezetten Server Component, ezért a függvény szerveren futhat.

Az `await connection()` jelzi, hogy az alatta lévő kódnak beérkező requestre kell várnia, ezért a szám nem buildidőben rögzül.

### 5.3. A route külön deklarációja nem szükséges

Symfonyban a route és a controller összerendelése külön metadata vagy konfiguráció.

Next.js App Routerben a route deklarációja maga a fájl helye:

```text
src/app/lucky/number/page.tsx
```

Nincs szükség külön route attribútumra vagy YAML-bejegyzésre.

### 5.4. A példa státusza

> [!WARNING]
> Ez a megoldás kizárólag a Next.js routing minimumát mutatja be. Oktatási példaként elfogadható, de a randomgenerálás és az alkalmazási döntés közvetlenül a delivery adapterben van, ezért nem ez a Winzard kanonikus végállapot.

---

## 6. Miért nem ez a végleges Winzard-megoldás?

### 6.1. A minimális page több felelősséget kever

A példában a `page.tsx`:

1. request-time renderelést választ;
2. számot generál;
3. meghatározza a tartományt;
4. UI-t renderel.

Egy éles alkalmazásban ugyanez a minta könnyen ide vezet:

```tsx
export default async function ProductPage({ params }: PageProps<'/products/[id]'>) {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });

  if (!product) {
    return <div>Nincs ilyen termék.</div>;
  }

  if (product.status === 'ARCHIVED') {
    // üzleti szabály a route-ban
  }

  return <ProductEditor product={product} />;
}
```

Ez összekeveri:

- a route paraméter feldolgozását;
- a persistence hozzáférést;
- az üzleti döntést;
- a DTO-képzést;
- a UI-t.

### 6.2. A tesztelhetőség romlik

Ha a randomgenerálás közvetlenül a page-ben van:

- a kimenet nem determinisztikus;
- a logika csak Next.js környezetben érhető el;
- ugyanaz a művelet JSON-végpontból csak másolással használható;
- a randomforrás nem cserélhető tesztben;
- a Node-, Edge- vagy böngészőruntime-különbség elmosódik.

### 6.3. A kanonikus szabály

A végleges megoldásban:

- a `page.tsx` választja ki a request-time renderelést;
- az application query határozza meg a művelet szerződését;
- egy port írja le a randomforrást;
- egy infrastruktúra-adapter valósítja meg a portot;
- a composition root köti össze a queryt az adapterrel;
- a presentation komponens explicit DTO-t kap.

---

## 7. A kanonikus Winzard vertikális szelet

### 7.1. Célstruktúra

```text
src/
  app/
    (public)/
      lucky/
        number/
          page.tsx
    api/
      lucky/
        number/
          route.ts

  modules/
    demo/
      lucky-number/
        application/
          dto/
            lucky-number.dto.ts
          errors/
            invalid-lucky-number-range.error.ts
          ports/
            random-integer-generator.ts
          queries/
            get-lucky-number.ts
            get-lucky-number.test.ts
        infrastructure/
          random/
            node-crypto-random-integer-generator.ts
        presentation/
          lucky-number-view.tsx
          lucky-number.schemas.ts
        index.server.ts

  composition/
    demo.ts
```

### 7.2. Miért nincs domain réteg a példában?

A szerencseszám-generálásnak nincs érdemi üzleti állapota, aggregátuma vagy tartós invariánsa.

Ezért TILOS csak a rétegszám kedvéért üres domainmodellt gyártani.

A példa a `reference` vagy egyszerű query jellegű profilhoz áll közel:

```text
presentation -> application -> port <- infrastructure
                         ^
                         |
                    composition
```

Ha később valódi üzleti fogalom jelenik meg — például sorsolás, jegy, nyeremény, auditált húzás —, akkor indokolt lehet domainréteg és persistence.

### 7.3. Egyetlen publikus application művelet

A példában a publikus művelet:

```text
GetLuckyNumber.execute()
```

Ezt használja:

- a HTML-oldal;
- a JSON Route Handler;
- a unit teszt;
- később akár CLI-parancs.

---

## 8. Az application port és DTO

### 8.1. A randomforrás portja

Hozd létre:

```text
src/modules/demo/lucky-number/application/ports/random-integer-generator.ts
```

```ts
export interface RandomIntegerGenerator {
  betweenInclusive(minimum: number, maximum: number): number;
}
```

A port az application igényét írja le. Nem mondja meg, hogy a szám:

- Node.js `crypto` API-ból;
- teszt-fake-ből;
- külső szolgáltatásból;
- determinisztikus seedelt generátorból

származik.

### 8.2. A kimeneti DTO

Hozd létre:

```text
src/modules/demo/lucky-number/application/dto/lucky-number.dto.ts
```

```ts
export type LuckyNumberDto = Readonly<{
  value: number;
  minimum: number;
  maximum: number;
}>;
```

A DTO:

- explicit;
- immutable szerződésként kezelhető;
- nem persistence modell;
- nem React-specifikus;
- JSON-ná alakítható;
- kizárólag a művelethez szükséges adatot tartalmazza.

### 8.3. Application hibatípus

Hozd létre:

```text
src/modules/demo/lucky-number/application/errors/invalid-lucky-number-range.error.ts
```

```ts
export class InvalidLuckyNumberRangeError extends Error {
  readonly code = 'INVALID_LUCKY_NUMBER_RANGE';

  constructor(
    readonly minimum: number,
    readonly maximum: number,
    message = 'A szerencseszám-tartomány érvénytelen.',
  ) {
    super(message);
    this.name = 'InvalidLuckyNumberRangeError';
  }
}
```

A hiba application szintű, mert a művelet érvényes bemeneti tartományát jelzi.

### 8.4. Miért nem használunk `any` vagy nyers objektumot?

Nem megfelelő:

```ts
export function getLuckyNumber(input: any): any {
  // ...
}
```

A nyers típusok elrejtik:

- a kötelező mezőket;
- a hibakezelés szerződését;
- a szerializálható kimenetet;
- a későbbi generátor számára szükséges metadatahatárt.

---

## 9. Az application query

### 9.1. Implementáció

Hozd létre:

```text
src/modules/demo/lucky-number/application/queries/get-lucky-number.ts
```

```ts
import type { LuckyNumberDto } from '../dto/lucky-number.dto';
import { InvalidLuckyNumberRangeError } from '../errors/invalid-lucky-number-range.error';
import type { RandomIntegerGenerator } from '../ports/random-integer-generator';

export type GetLuckyNumberInput = Readonly<{
  minimum?: number;
  maximum?: number;
}>;

const DEFAULT_MINIMUM = 0;
const DEFAULT_MAXIMUM = 100;
const MAXIMUM_ALLOWED_SPAN = 10_000;

export class GetLuckyNumber {
  constructor(private readonly randomIntegerGenerator: RandomIntegerGenerator) {}

  execute(input: GetLuckyNumberInput = {}): LuckyNumberDto {
    const minimum = input.minimum ?? DEFAULT_MINIMUM;
    const maximum = input.maximum ?? DEFAULT_MAXIMUM;

    this.assertValidRange(minimum, maximum);

    return Object.freeze({
      value: this.randomIntegerGenerator.betweenInclusive(minimum, maximum),
      minimum,
      maximum,
    });
  }

  private assertValidRange(minimum: number, maximum: number): void {
    const validIntegers = Number.isSafeInteger(minimum) && Number.isSafeInteger(maximum);
    const validOrder = minimum <= maximum;
    const validSpan = maximum - minimum <= MAXIMUM_ALLOWED_SPAN;

    if (!validIntegers || !validOrder || !validSpan) {
      throw new InvalidLuckyNumberRangeError(minimum, maximum);
    }
  }
}
```

### 9.2. A query felelőssége

A query:

- alapértelmezett tartományt választ;
- ellenőrzi az application inputot;
- meghívja a randomforrás portját;
- explicit DTO-t ad vissza.

A query nem:

- olvas HTTP requestet;
- importál Next.js API-t;
- renderel JSX-et;
- készít `Response` objektumot;
- tudja, melyik URL hívta meg;
- ír logot közvetlenül globális loggerrel;
- használ Prisma Clientet.

### 9.3. Szinkron vagy aszinkron művelet

A jelenlegi port szinkron, ezért az `execute()` is szinkron.

Ha az adapter később hálózati vagy persistence műveletet használna, a port és a query lehetne aszinkron:

```ts
export interface RandomIntegerGenerator {
  betweenInclusive(minimum: number, maximum: number): Promise<number>;
}
```

A publikus szerződést csak valós szükség esetén kell aszinkronná tenni.

### 9.4. Miért class?

A class-alapú query előnye:

- konstruktoros dependency injection;
- explicit példányosítás a composition rootban;
- egyszerű fake adapter használat tesztben;
- későbbi policy, clock vagy tracing port hozzáadható.

Egyszerű funkcionális factory is elfogadható lenne, ha ugyanazokat a határokat megtartja. A lényeg nem a class, hanem az explicit dependency graph.

---

## 10. Az infrastruktúra-adapter

### 10.1. Node.js crypto adapter

Hozd létre:

```text
src/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator.ts
```

```ts
import 'server-only';

import { randomInt } from 'node:crypto';

import type { RandomIntegerGenerator } from '../../application/ports/random-integer-generator';

export class NodeCryptoRandomIntegerGenerator implements RandomIntegerGenerator {
  betweenInclusive(minimum: number, maximum: number): number {
    return randomInt(minimum, maximum + 1);
  }
}
```

### 10.2. Miért `server-only`?

A modul Node.js-specifikus API-t használ, ezért kliensoldali bundle-ba nem kerülhet.

Az `import 'server-only'` buildhibát okoz, ha Client Component vagy kliensoldali importlánc eléri ezt a modult.

### 10.3. Miért nem `Math.random()`?

A példa nem biztonsági tokeneket generál, ezért `Math.random()` funkcionálisan elegendő lenne. A Node `crypto.randomInt()` használata mégis jobb adapterpélda, mert:

- világossá teszi a runtime-függőséget;
- elkülöníti a forrást az application rétegtől;
- tesztben egyszerűen cserélhető;
- nem ösztönzi a `Math.random()` közvetlen elterjedését üzleti kódban.

> [!WARNING]
> A `randomInt()` példája sem használható automatikusan titkos token, jelszó-visszaállító kulcs vagy kriptográfiai protokoll teljes implementációjaként. Az ilyen feladat külön biztonsági specifikációt igényel.

### 10.4. Runtime-következmény

Mivel az adapter `node:crypto` API-t használ, az őt elérő route-ok Node.js runtime-ot igényelnek.

A page és Route Handler példák ezért explicit módon rögzíthetik:

```ts
export const runtime = 'nodejs';
```

---

## 11. A composition root

### 11.1. Wiring

Hozd létre:

```text
src/composition/demo.ts
```

```ts
import 'server-only';

import { GetLuckyNumber } from '@/modules/demo/lucky-number/application/queries/get-lucky-number';
import { NodeCryptoRandomIntegerGenerator } from '@/modules/demo/lucky-number/infrastructure/random/node-crypto-random-integer-generator';

const randomIntegerGenerator = new NodeCryptoRandomIntegerGenerator();

export const demoModule = Object.freeze({
  queries: Object.freeze({
    getLuckyNumber: new GetLuckyNumber(randomIntegerGenerator),
  }),
});
```

### 11.2. A composition root felelőssége

A composition root:

- konkrét adaptert választ;
- példányosítja az application queryt;
- stabil publikus modulfelületet exportál;
- szerveroldali marad.

Nem megfelelő:

```ts
// application/queries/get-lucky-number.ts
const random = new NodeCryptoRandomIntegerGenerator();

export const getLuckyNumber = new GetLuckyNumber(random);
```

Ez az application réteget konkrét infrastruktúrához kötné.

### 11.3. Modul public server entrypoint

OPCIONÁLISAN létrehozható:

```text
src/modules/demo/lucky-number/index.server.ts
```

```ts
import 'server-only';

export type { LuckyNumberDto } from './application/dto/lucky-number.dto';
export { InvalidLuckyNumberRangeError } from './application/errors/invalid-lucky-number-range.error';
```

A `index.server.ts` csak stabil, engedélyezett exportszerződést adjon. TILOS minden belső implementációt wildcarddal újraexportálni.

---

## 12. A `page.tsx` mint vékony delivery adapter

### 12.1. Kanonikus page

Hozd létre:

```text
src/app/(public)/lucky/number/page.tsx
```

A `(public)` route group nem jelenik meg az URL-ben.

```tsx
import type { Metadata } from 'next';
import { connection } from 'next/server';

import { demoModule } from '@/composition/demo';
import { LuckyNumberView } from '@/modules/demo/lucky-number/presentation/lucky-number-view';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Szerencseszám',
  description: 'A Winzard első request-time renderelt példaoldala.',
};

export default async function LuckyNumberPage() {
  await connection();

  const result = demoModule.queries.getLuckyNumber.execute();

  return <LuckyNumberView result={result} />;
}
```

Publikus URL:

```text
/lucky/number
```

### 12.2. Mi maradt a page-ben?

A page kizárólag:

1. rögzíti a route runtime-ját;
2. deklarálja a route metadataját;
3. request-time renderelést választ;
4. meghívja az application queryt;
5. átadja a DTO-t a view-nak.

### 12.3. Mi nem lehet a page-ben?

TILOS közvetlenül:

- Prisma Clientet használni;
- SQL-t futtatni;
- policy döntést implementálni;
- üzleti állapotátmenetet végezni;
- teljes ORM rekordot Client Componentnek továbbadni;
- saját belső `/api` végpontot `fetch()`-elni;
- request adatot validálatlanul use case-nek átadni;
- titkot vagy szerverkonfigurációt JSX propként továbbadni.

### 12.4. Miért a page hívja a `connection()` függvényt?

A request-time renderelés Next.js-specifikus delivery döntés.

Ezért helyes:

```text
page.tsx -> connection() -> application query
```

és nem helyes:

```text
application query -> next/server connection()
```

Az application query így Next.js nélkül is tesztelhető és más adapterből is meghívható.

---

## 13. A nézet renderelése

### 13.1. A React-komponens mint template

Symfonyban a Twig template külön fájlban kap változókat a controllertől.

Winzardban a funkcionális megfelelő egy explicit propszerződésű React-komponens.

Hozd létre:

```text
src/modules/demo/lucky-number/presentation/lucky-number-view.tsx
```

```tsx
import type { LuckyNumberDto } from '../application/dto/lucky-number.dto';

type LuckyNumberViewProps = Readonly<{
  result: LuckyNumberDto;
}>;

export function LuckyNumberView({ result }: LuckyNumberViewProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">
          Winzard példaoldal
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          A szerencseszámod: {result.value}
        </h1>
      </header>

      <p className="text-zinc-600">
        A szám a {result.minimum}–{result.maximum} tartományból származik.
      </p>

      <nav aria-label="Szerencseszám műveletek" className="flex flex-wrap gap-4">
        <a className="underline" href="/lucky/number">
          Másik szám kérése
        </a>
        <a className="underline" href="/api/lucky/number">
          JSON-válasz megnyitása
        </a>
      </nav>
    </main>
  );
}
```

### 13.2. Miért normál `<a>` a frissítés?

A „Másik szám kérése” célja új HTTP request indítása ugyanarra az URL-re.

A normál `<a>` teljes navigációt indít. A Next.js `<Link>` elsődleges választás alkalmazáson belüli navigációhoz, de ugyanazon dinamikus oldal explicit újrakéréséhez a natív anchor vagy egy célzott kliensoldali `router.refresh()` komponens érthetőbb.

### 13.3. DTO, nem ORM rekord

A view ezt kapja:

```ts
LuckyNumberDto
```

Egy adatbázisos példában sem kaphat automatikusan teljes Prisma rekordot.

Helyes:

```ts
type ProductDetailDto = Readonly<{
  id: string;
  name: string;
  publicPrice: string;
}>;
```

Nem helyes:

```ts
import type { Product } from '@/generated/prisma/client';
```

### 13.4. JSX escaping

A React alapértelmezetten escape-eli a JSX-ben megjelenített stringértékeket.

TILOS ellenőrizetlen felhasználói HTML-t `dangerouslySetInnerHTML` segítségével renderelni. Ha gazdag HTML-tartalom valóban szükséges, külön sanitization és content-security szabály kell.

### 13.5. Layout öröklés

A Twig base template funkcionális megfelelője a Next.js layout hierarchy.

A page nem köteles saját `<html>` és `<body>` elemet renderelni. Ezeket a root layout biztosítja.

---

## 14. JSON-végpont létrehozása

### 14.1. Route Handler

Hozd létre:

```text
src/app/api/lucky/number/route.ts
```

```ts
import { demoModule } from '@/composition/demo';

export const runtime = 'nodejs';

export function GET(): Response {
  const result = demoModule.queries.getLuckyNumber.execute();

  return Response.json(result, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
```

URL:

```text
http://localhost:3000/api/lucky/number
```

Példaválasz:

```json
{
  "value": 42,
  "minimum": 0,
  "maximum": 100
}
```

### 14.2. Miért ugyanaz a query?

A Route Handler nem másolja a randomgenerálás vagy tartományellenőrzés logikáját.

```text
HTML adapter: page.tsx
JSON adapter: route.ts
közös művelet: GetLuckyNumber
```

### 14.3. Route Handler methodok

A `route.ts` az alábbi HTTP method exportokat támogathatja:

```text
GET
POST
PUT
PATCH
DELETE
HEAD
OPTIONS
```

A jelen fejezet csak `GET` végpontot használ.

### 14.4. A Route Handler publikus endpoint

Minden Route Handlert publikus HTTP-felületként kell kezelni.

A későbbi, bemenetet vagy védett adatot kezelő endpointoknál KÖTELEZŐ:

- input parsing;
- content type ellenőrzés;
- request body méretkorlát;
- authentication;
- authorization;
- tenant/ownership scope;
- rate limiting, ahol indokolt;
- explicit response DTO;
- biztonságos hibakód és hibaválasz;
- audit és korrelációs azonosító, ahol szükséges.

### 14.5. Belső Server Component ne hívja ezt az API-t

Nem megfelelő:

```tsx
export default async function LuckyNumberPage() {
  const response = await fetch('http://localhost:3000/api/lucky/number');
  const result = await response.json();

  return <LuckyNumberView result={result} />;
}
```

Ez:

- felesleges HTTP round tripet okoz;
- duplikálja a hibakezelést;
- build- és deploymentfüggő hostnevet igényel;
- elrejti a típusos application szerződést;
- nehezíti az authorizációs kontextus továbbadását.

A helyes belső hívás:

```ts
const result = demoModule.queries.getLuckyNumber.execute();
```

---

## 15. Statikus, dinamikus és cache-elt renderelés

### 15.1. Miért fontos már az első oldalon?

A Symfony példában a controller tipikusan minden requestnél lefut.

Next.js-ben egy route lehet:

- buildidőben prerenderelt statikus tartalom;
- request-time dinamikus tartalom;
- cache-elt vagy részben cache-elt tartalom;
- streamelt statikus és dinamikus részek kombinációja.

Ezért a randomszám példánál explicit dönteni kell.

### 15.2. Request-time random érték

Ha a számnak minden új requestnél változnia kell:

```tsx
import { connection } from 'next/server';

export default async function Page() {
  await connection();

  const value = Math.random();

  return <span>{value}</span>;
}
```

A `connection()` alatti renderelés nem kerül buildidőben prerenderelésre.

### 15.3. Mi történik `connection()` nélkül?

Egy request-adatot vagy uncached adatforrást nem használó page statikusan prerenderelhető. Ebben az esetben a random érték buildidőben vagy prerenderelési fázisban rögzülhetne, és több felhasználó ugyanazt az értéket látná.

### 15.4. Mikor nem kell `connection()`?

Nem kell külön `connection()`, ha a page már request-time dinamikus API-t használ, például:

- `searchParams` page prop;
- `cookies()`;
- `headers()`;
- uncached adatbázis-hozzáférés a query adapteren keresztül.

A renderelési módot azonban nem szabad véletlen mellékhatásként kezelni. A route szerződésében dokumentálni kell, hogy miért statikus vagy dinamikus.

### 15.5. Route Handler cache

A Route Handlerek alapértelmezetten nem cache-eltek. A példában a válaszhoz explicit:

```http
Cache-Control: no-store
```

header tartozik, hogy köztes proxy vagy CDN se ossza meg a random választ.

### 15.6. Nem minden dinamikus oldal legyen `force-dynamic`

Kerülendő reflex:

```ts
export const dynamic = 'force-dynamic';
```

minden route-on.

Ez elrejti a renderelési döntés okát és letilthat optimalizációkat.

A Winzard preferenciája:

1. request-adat használatakor a megfelelő API;
2. kizárólag request-time, nem követett értéknél `connection()`;
3. explicit cache policy a query- vagy route-szerződésben;
4. `force-dynamic` csak indokolt kompatibilitási vagy route-szintű kényszerként.

### 15.7. Build output ellenőrzése

Futtasd:

```bash
pnpm build
```

A Next.js route táblában jellemzően:

```text
○  statikus, prerenderelt route
ƒ  request-time dinamikus route
```

A szerencseszám-oldalnak dinamikus route-ként kell megjelennie.

### 15.8. Cache és személyes adat

Felhasználó-, tenant- vagy jogosultságfüggő DTO nem kerülhet megosztott cache-be megfelelő scope nélkül.

A cache kulcsnak vagy tagnak tartalmaznia kell minden olyan kontextust, amely a látható adatot befolyásolja.

---

## 16. Dinamikus route paraméterek

### 16.1. Dinamikus szegmens

Dinamikus szegmenst szögletes zárójelű mappa hoz létre.

Példa:

```text
src/app/(public)/lucky/number/range/[minimum]/[maximum]/page.tsx
```

URL:

```text
/lucky/number/range/10/20
```

### 16.2. Típusos `PageProps`

A `next typegen`, `next dev` vagy `next build` létrehozza a route helper típusokat.

```tsx
import { notFound } from 'next/navigation';

import { demoModule } from '@/composition/demo';
import { LuckyNumberView } from '@/modules/demo/lucky-number/presentation/lucky-number-view';
import { luckyNumberRangeParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';

export default async function LuckyNumberRangePage(
  props: PageProps<'/lucky/number/range/[minimum]/[maximum]'>,
) {
  const parsed = luckyNumberRangeParamsSchema.safeParse(await props.params);

  if (!parsed.success) {
    notFound();
  }

  const result = demoModule.queries.getLuckyNumber.execute(parsed.data);

  return <LuckyNumberView result={result} />;
}
```

### 16.3. A route schema

Hozd létre vagy bővítsd:

```text
src/modules/demo/lucky-number/presentation/lucky-number.schemas.ts
```

```ts
import { z } from 'zod';

export const luckyNumberRangeParamsSchema = z
  .object({
    minimum: z.coerce.number().int().min(0).max(10_000),
    maximum: z.coerce.number().int().min(0).max(10_000),
  })
  .refine(({ minimum, maximum }) => minimum <= maximum, {
    message: 'A minimum nem lehet nagyobb a maximumnál.',
    path: ['maximum'],
  });
```

### 16.4. A route paraméter felhasználói input

A `[minimum]`, `[maximum]`, `[id]`, `[slug]` és minden más dinamikus route paraméter felhasználói inputnak számít.

TILOS:

```ts
const { id } = await props.params;
const product = await repository.findById(id as ProductId);
```

validáció nélkül.

### 16.5. 404 vagy 400?

HTML route-nál egy szintaktikailag érvénytelen path paraméter gyakran 404-ként kezelhető, mert nincs ilyen címezhető erőforrás.

API Route Handlernél ugyanez tipikusan `400 Bad Request` választ igényel.

A döntést route-szerződésenként dokumentálni kell.

### 16.6. Catch-all szegmensek

A Next.js támogat:

```text
[slug]       egy szegmens
[...slug]    egy vagy több szegmens
[[...slug]]  nulla vagy több szegmens
```

A catch-all route-ok széles inputfelületet nyitnak, ezért Winzardban csak indokolt esetben használhatók. A normalizálás és authorizáció KÖTELEZŐ.

---

## 17. Query string és `searchParams`

### 17.1. Példa URL

```text
/lucky/number?minimum=10&maximum=20
```

A query string nem része a route fájlrendszerbeli feloldásának, de a page `searchParams` propján keresztül elérhető.

### 17.2. Page implementáció

```tsx
import { demoModule } from '@/composition/demo';
import { LuckyNumberView } from '@/modules/demo/lucky-number/presentation/lucky-number-view';
import { luckyNumberSearchParamsSchema } from '@/modules/demo/lucky-number/presentation/lucky-number.schemas';

export const runtime = 'nodejs';

export default async function LuckyNumberSearchPage(
  props: PageProps<'/lucky/number'>,
) {
  const parsed = luckyNumberSearchParamsSchema.safeParse(await props.searchParams);

  if (!parsed.success) {
    return (
      <main>
        <h1>Érvénytelen tartomány</h1>
        <p>A minimum és maximum egész szám legyen, helyes sorrendben.</p>
      </main>
    );
  }

  const result = demoModule.queries.getLuckyNumber.execute(parsed.data);

  return <LuckyNumberView result={result} />;
}
```

### 17.3. Query schema

```ts
export const luckyNumberSearchParamsSchema = z
  .object({
    minimum: z.coerce.number().int().min(0).max(10_000).default(0),
    maximum: z.coerce.number().int().min(0).max(10_000).default(100),
  })
  .refine(({ minimum, maximum }) => minimum <= maximum, {
    message: 'A minimum nem lehet nagyobb a maximumnál.',
    path: ['maximum'],
  });
```

### 17.4. A `searchParams` Promise

A Next.js 16 page API-ban a `searchParams` Promise.

Helyes:

```ts
const query = await props.searchParams;
```

Kerülendő régi minta:

```ts
const query = props.searchParams;
```

### 17.5. A `searchParams` dinamikussá teszi a page-et

A query string értéke csak requestkor ismert. A `searchParams` használata request-time renderelést igényel, ezért ugyanabban a page-ben a random érték előtt külön `connection()` általában nem szükséges.

### 17.6. Plain object, nem `URLSearchParams`

A page `searchParams` prop plain objektum.

Lehetséges érték:

```ts
{
  tag: ['typescript', 'nextjs'],
  page: '2',
}
```

Az azonos kulcs többször szerepelhet, ezért az input lehet `string | string[] | undefined`. A Zod schema csak az elfogadott formát normalizálhatja.

### 17.7. Query paraméterek felhasználási esetei

AJÁNLOTT:

- lapozás;
- rendezés;
- szűrés;
- keresés;
- nem érzékeny UI állapot;
- megosztható nézetkonfiguráció.

TILOS query stringben:

- secret;
- session token;
- jelszó;
- személyes adat indokolatlanul;
- authorizációs döntéshez megbízhatóként kezelt role vagy tenant ID.

---

## 18. Layoutok, route groupok és metadata

### 18.1. Root layout

Minden App Router alkalmazásnak szüksége van root layoutra:

```text
src/app/layout.tsx
```

A root layout tartalmazza az `<html>` és `<body>` elemeket.

```tsx
import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Winzard',
    template: '%s | Winzard',
  },
  description: 'Convention-driven application platform built on Next.js.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
```

### 18.2. Nested layout

A lucky oldalak közös kerete:

```text
src/app/(public)/lucky/layout.tsx
```

```tsx
export default function LuckyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <section>
      <header>
        <a href="/">Winzard</a>
      </header>
      {children}
    </section>
  );
}
```

A nested layout megőrzi a közös UI-t a gyermek route-ok között.

### 18.3. Route group

A zárójelezett mappa:

```text
(public)
```

szervezési csoport, nem URL-szegmens.

```text
src/app/(public)/lucky/number/page.tsx
```

URL-je továbbra is:

```text
/lucky/number
```

Route group használható:

- publikus és admin route-ok szétválasztására;
- külön layoutokhoz;
- csapat- vagy felület-alapú szervezéshez.

### 18.4. Route group ütközés

TILOS két külön csoportban ugyanazt a publikus pathot létrehozni:

```text
src/app/(public)/about/page.tsx
src/app/(marketing)/about/page.tsx
```

Mindkettő `/about` lenne, ezért buildhiba keletkezik.

### 18.5. Statikus metadata

A page exportálhat statikus metadata objektumot:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Szerencseszám',
  description: 'Request-time generált szám Winzard architektúrával.',
};
```

### 18.6. Dinamikus metadata

Erőforrásfüggő title esetén használható a `generateMetadata()`.

Az adatlekérésnek ugyanazt a query/DAL határt kell használnia, mint a page-nek. TILOS csak a metadata kedvéért közvetlen Prisma-hívást bevezetni.

### 18.7. Metadata és érzékeny adat

A metadata a HTML headben, keresőmotorok és külső kliensek számára is látható lehet.

TILOS benne:

- személyes azonosító indokolatlanul;
- belső státusz;
- jogosultsági információ;
- secret vagy token;
- nem publikus árazás;
- stack trace vagy hibaüzenet.

---

## 19. Navigáció

### 19.1. `Link` alkalmazáson belüli navigációhoz

```tsx
import Link from 'next/link';

export function HomeNavigation() {
  return <Link href="/lucky/number">Szerencseszám</Link>;
}
```

A `Link` a Next.js elsődleges belső navigációs komponense.

### 19.2. Mikor használható normál anchor?

Normál `<a>` indokolt lehet:

- külső URL-nél;
- letöltésnél;
- teljes dokumentumnavigáció szándékos kikényszerítésénél;
- ugyanazon request-time route explicit újrakérésénél;
- nem Next.js által kezelt cél esetén.

### 19.3. Programozott navigáció

Client Componentben használható `useRouter()`, ha a navigáció eseménykezelés eredménye.

TILOS egy egyszerű statikus linket programozott routerhívással helyettesíteni.

### 19.4. Route típusok

A route helper típusokat generáld:

```bash
pnpm typegen
```

A `PageProps<'/...'>` és `RouteContext<'/...'>` globális helperként használható a typegen után.

A jövőbeli Winzard route registrynek ezeket nem kell lemásolnia. A `forge` feladata a diagnosztika és az architekturális metadata, nem a Next.js route compiler helyettesítése.

### 19.5. Külső URL és open redirect

Felhasználói inputból képzett redirect cél csak allowlist vagy biztonságos relatív path validáció után használható.

Nem megfelelő:

```ts
redirect(searchParams.returnTo as string);
```

---

## 20. Loading, not-found és error felületek

### 20.1. `loading.tsx`

Egy route szegmenshez azonnali loading UI adható:

```text
src/app/(public)/lucky/number/loading.tsx
```

```tsx
export default function LuckyNumberLoading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <h1>Szerencseszám készül…</h1>
    </main>
  );
}
```

A loading UI különösen hasznos request-time vagy lassú adatlekérésnél.

### 20.2. `not-found.tsx`

Dinamikus route-nál:

```text
src/app/(public)/lucky/number/not-found.tsx
```

```tsx
export default function LuckyNumberNotFound() {
  return (
    <main>
      <h1>A kért szerencseszám-oldal nem található.</h1>
      <a href="/lucky/number">Vissza az alapértelmezett tartományhoz</a>
    </main>
  );
}
```

A page-ben:

```ts
import { notFound } from 'next/navigation';

if (!parsed.success) {
  notFound();
}
```

A `notFound()` megszakítja az adott route szegmens renderelését.

### 20.3. `error.tsx`

Váratlan renderelési hibához:

```text
src/app/(public)/lucky/number/error.tsx
```

```tsx
'use client';

import { useEffect } from 'react';

export default function LuckyNumberError({
  error,
  unstable_retry,
}: Readonly<{
  error: Error & { digest?: string };
  unstable_retry: () => void;
}>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>A szerencseszám nem készíthető el.</h1>
      <button type="button" onClick={() => unstable_retry()}>
        Újrapróbálás
      </button>
    </main>
  );
}
```

Az error boundary Client Component, mert interaktív újrapróbálást kezel.

### 20.4. Várt és váratlan hibák

**Várt hiba**:

- validation failure;
- nem található üzleti erőforrás;
- engedélyezett műveletelutasítás;
- conflict;
- quota limit.

Ezeket explicit eredményként vagy ismert application hibatípusként kell kezelni.

**Váratlan hiba**:

- programhiba;
- infrastruktúra összeomlás;
- megsértett belső invariáns;
- ismeretlen exception.

Ezeket error boundary és központi observability kezeli.

### 20.5. Hibaüzenet-szivárgás

Production környezetben a szerveroldali exception részlete nem kerülhet a kliensre.

A kliens számára:

- stabil, lokalizálható üzenet;
- biztonságos hibakód;
- szükség esetén korrelációs azonosító

adható vissza.

Stack trace, SQL, fájlútvonal, secret vagy belső hostnév TILOS.

---

## 21. Server és Client Component határ

### 21.1. Alapértelmezés

A page-ek és layoutok alapértelmezetten Server Components.

Ez lehetővé teszi:

- server-only module importját;
- adatforrás közvetlen szerveroldali elérését application adapteren keresztül;
- secret környezeti változók használatát szerveroldali platformkódban;
- kisebb kliensoldali JavaScript bundle-t;
- async renderelést és streaminget.

### 21.2. Mikor kell Client Component?

`"use client"` csak akkor indokolt, ha szükséges:

- `useState`, `useReducer` vagy más kliensállapot;
- eseménykezelő;
- `useEffect`;
- `window`, `document`, `localStorage` vagy más browser API;
- kliensoldali router hook;
- interaktív harmadik fél komponens.

### 21.3. A klienshatár legyen kicsi

Helyes:

```tsx
// Server Component
export default async function ProductPage() {
  const dto = await productModule.queries.get.execute(...);

  return (
    <ProductView product={dto}>
      <FavoriteButton productId={dto.id} />
    </ProductView>
  );
}
```

Csak a `FavoriteButton` klienskomponens.

Kerülendő:

```tsx
'use client';

export default function ProductPage() {
  // az egész route kliensoldali lett
}
```

### 21.4. Szerveradat átadása kliensnek

Client Component csak minimális, szerializálható DTO-t kaphat.

TILOS átadni:

- Prisma Client objektumot;
- class instance-t véletlenszerűen;
- adatbázis connectiont;
- logger példányt;
- secretet;
- teljes user rekordot;
- permission setet, ha csak egy boolean képesség kell;
- szerveroldali függvényt, kivéve szabályosan deklarált Server Actiont.

### 21.5. `server-only` védelem

Minden olyan modul, amely:

- adatbázist;
- secretet;
- Node-only API-t;
- belső policy implementációt;
- privát külső API credentialt

használ, AJÁNLOTTAN importálja:

```ts
import 'server-only';
```

### 21.6. A page ne legyen automatikusan Client Component

Route paraméter olvasásához, adatlekéréshez vagy HTML rendereléshez nincs szükség `"use client"` direktívára.

---

## 22. Route-diagnosztika és hibakeresés

### 22.1. Next.js CLI

A projekt CLI-je:

```bash
pnpm next --help
```

A releváns parancsok:

```bash
pnpm next dev
pnpm next build
pnpm next start
pnpm next info
pnpm next typegen
```

### 22.2. Route típusgenerálás

```bash
pnpm typegen
pnpm exec tsc --noEmit
```

A `next typegen`:

- route típusokat generál;
- létrehozza a `PageProps` helperhez szükséges definíciókat;
- ellenőrizhetővé teszi a route literalokat;
- nem futtat teljes production buildet.

### 22.3. Route tábla a buildben

```bash
pnpm build
```

A build output információt ad az egyes route-okról és azok statikus vagy dinamikus jellegéről.

Részletesebb output:

```bash
pnpm next build --debug
```

Egyetlen route célzott hibakeresése:

```bash
pnpm next build --debug-build-paths="src/app/**/lucky/**/page.tsx"
```

### 22.4. Manuális route-lista

Amíg a Winzard route-listázó parancsa nem implementált:

```bash
find src/app \
  \( -name 'page.tsx' -o -name 'route.ts' \) \
  -print | sort
```

Ez fájllistát ad, de nem oldja fel teljesen:

- a route groupokat;
- a dinamikus szegmenseket;
- a methodokat;
- a metadata- és runtime-beállításokat;
- az ütközéseket.

Ezeket a Next.js compiler és build ellenőrzi.

### 22.5. Tervezett `forge route:list`

Célparancs:

```bash
pnpm forge route:list
```

Elvárt emberi kimenet:

```text
METHOD  PATH                                      KIND   RUNTIME  SOURCE
GET     /lucky/number                             page   nodejs   src/app/(public)/lucky/number/page.tsx
GET     /api/lucky/number                         route  nodejs   src/app/api/lucky/number/route.ts
GET     /lucky/number/range/[minimum]/[maximum]  page   nodejs   src/app/(public)/lucky/number/range/[minimum]/[maximum]/page.tsx
```

A parancs nem helyettesíti a Next.js compilert. Diagnosztikai nézetet ad a Winzard-konvenciókhoz.

### 22.6. Tervezett `forge route:inspect`

```bash
pnpm forge route:inspect /lucky/number
```

Elvárt információ:

```text
Path:             /lucky/number
Kind:             page
Runtime:          nodejs
Rendering:        dynamic/request-time
Layout chain:     src/app/layout.tsx
                  src/app/(public)/lucky/layout.tsx
Entrypoint:       src/app/(public)/lucky/number/page.tsx
Composition:      demoModule.queries.getLuckyNumber
Client boundary:  none
```

Az application query automatikus felismerése csak explicit manifest vagy generált route metadata alapján legyen támogatott. TILOS megbízhatatlan stringkeresésből architekturális igazságot állítani.

### 22.7. Next.js fejlesztői jelző és error overlay

Development módban a Next.js:

- route- és renderelési kontextust jelző on-screen indikátort adhat;
- build- és runtime hibákat overlayben jelenít meg;
- terminálban server logot és compiler hibát ad;
- Fast Refresh-t használ.

Ez nem teljes Symfony Web Debug Toolbar megfelelő.

### 22.8. Hibakereső eszközök

AJÁNLOTT:

- böngésző DevTools Network panel;
- React Developer Tools;
- VS Code vagy JetBrains debugger;
- Node inspector;
- `pnpm dev --inspect`;
- szerveroldali strukturált log;
- OpenTelemetry a későbbi observability szeletben.

### 22.9. Symfony Web Debug Toolbar különbség

A Symfony profiler requestenként egységes route-, controller-, log-, query- és teljesítményadatot ad.

A Winzard első verziójában ugyanez több forrásból áll:

| Információ | Elsődleges eszköz |
| --- | --- |
| route és renderelési mód | Next.js build/dev indicator |
| TypeScript route contract | `next typegen` + `tsc` |
| klienskomponensek | React DevTools |
| hálózati requestek | Browser Network |
| szerverhiba | Next.js overlay + terminal |
| dependency/architecture | `forge check` |
| környezet | `forge doctor` / `next info` |
| trace és query timing | későbbi observability platform |

### 22.10. Production diagnosztika

Productionban TILOS development overlayt vagy részletes belső debug UI-t publikusan elérhetővé tenni.

A production diagnosztika:

- strukturált log;
- metrics;
- traces;
- health/readiness endpoint;
- biztonságos error digest;
- audit esemény

alapú legyen.

---

## 23. A releváns projektstruktúra

### 23.1. Gyökérszint

```text
.
├── docs/
├── prisma/
├── public/
├── src/
├── tools/
├── next.config.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 23.2. `src/app`

Feladata:

- file-system routing;
- page, layout, route handler;
- Next.js metadata;
- loading, not-found, error boundary;
- request/response transport;
- Server Action adapter;
- delivery-specifikus mapping.

Nem feladata:

- domainmodell;
- repository implementáció;
- Prisma query;
- globális service locator;
- üzleti workflow;
- teljes form domainlogika.

### 23.3. `src/modules`

Minden üzleti vagy funkcionális modul belső rétegei:

```text
module/
  feature/
    domain/
    application/
    infrastructure/
    presentation/
```

Nem minden feature igényel minden réteget. A lucky-number példában nincs domain és persistence.

### 23.4. `src/composition`

Feladata:

- dependency wiring;
- adapterválasztás;
- modulfelület összeállítása;
- szerveroldali singletonok kontrollált létrehozása.

A composition root importálhat applicationt és infrastructure-t. Az application nem importálhat compositiont.

### 23.5. `src/platform`

Közös platformprimitívek:

- config;
- database;
- auth;
- result/error;
- logging;
- event bus;
- cache;
- request context;
- observability.

A feature-specifikus random adapter a demomodulban marad. Csak több modul által valóban használt, stabil képesség emelhető platformszintre.

### 23.6. `public`

Publikusan elérhető statikus fájlok:

```text
public/logo.svg -> /logo.svg
```

TILOS ide helyezni:

- secretet;
- privát exportot;
- adatbázis dumpot;
- source mapet indokolatlanul;
- felhasználói fájlt kontrollálatlan névvel;
- belső dokumentumot.

### 23.7. `tools/forge`

Projektlokális generáló és diagnosztikai CLI.

A page creation szelet későbbi kódoldali céljai:

- `route:list`;
- `route:inspect`;
- route adapter sablon;
- route architecture check;
- saját API-t fetch-elő Server Component felismerése;
- közvetlen ORM-import felismerése `src/app` alatt.

### 23.8. `.next`

Automatikusan generált build és type artifactok.

TILOS kézzel szerkeszteni vagy verziókezelésbe tenni.

### 23.9. `node_modules`

Package manager által kezelt függőségek. TILOS kézzel módosítani vagy commitolni.

---

## 24. Tesztelési stratégia

### 24.1. Tesztpiramis erre a szeletre

```text
application unit test
  -> adapter contract test
    -> route handler adapter test
      -> page E2E smoke test
```

### 24.2. Determinisztikus fake randomforrás

```ts
import type { RandomIntegerGenerator } from '../ports/random-integer-generator';

export class FixedRandomIntegerGenerator implements RandomIntegerGenerator {
  constructor(private readonly value: number) {}

  betweenInclusive(minimum: number, maximum: number): number {
    if (this.value < minimum || this.value > maximum) {
      throw new Error('A fake értéke kívül esik a kért tartományon.');
    }

    return this.value;
  }
}
```

### 24.3. Application unit teszt

```text
src/modules/demo/lucky-number/application/queries/get-lucky-number.test.ts
```

```ts
import { describe, expect, it } from 'vitest';

import { InvalidLuckyNumberRangeError } from '../errors/invalid-lucky-number-range.error';
import type { RandomIntegerGenerator } from '../ports/random-integer-generator';
import { GetLuckyNumber } from './get-lucky-number';

class FixedRandomIntegerGenerator implements RandomIntegerGenerator {
  constructor(private readonly value: number) {}

  betweenInclusive(): number {
    return this.value;
  }
}

describe('GetLuckyNumber', () => {
  it('az alapértelmezett tartományból ad vissza DTO-t', () => {
    const query = new GetLuckyNumber(new FixedRandomIntegerGenerator(42));

    expect(query.execute()).toEqual({
      value: 42,
      minimum: 0,
      maximum: 100,
    });
  });

  it('elfogad egyedi tartományt', () => {
    const query = new GetLuckyNumber(new FixedRandomIntegerGenerator(15));

    expect(query.execute({ minimum: 10, maximum: 20 })).toEqual({
      value: 15,
      minimum: 10,
      maximum: 20,
    });
  });

  it('elutasítja a fordított tartományt', () => {
    const query = new GetLuckyNumber(new FixedRandomIntegerGenerator(15));

    expect(() => query.execute({ minimum: 20, maximum: 10 })).toThrow(
      InvalidLuckyNumberRangeError,
    );
  });
});
```

### 24.4. Infrastructure adapter contract teszt

A contract ellenőrizze több futással:

- az eredmény egész szám;
- `minimum <= value <= maximum`;
- az inclusive felső határ elérhető lehet;
- érvénytelen bemenet nem az adapterre hárul, hanem application validációban áll meg.

A randomeloszlás statisztikai bizonyítása nem unit teszt feladata.

### 24.5. Route Handler adapter teszt

A handler közvetlen importja és hívása lehetséges, de a composition konkrét random adaptere miatt a válaszértéket nem kell fixen ellenőrizni.

```ts
import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /api/lucky/number', () => {
  it('200-as, no-store JSON-választ ad', async () => {
    const response = GET();
    const body = (await response.json()) as {
      value: number;
      minimum: number;
      maximum: number;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.value).toBeGreaterThanOrEqual(body.minimum);
    expect(body.value).toBeLessThanOrEqual(body.maximum);
  });
});
```

Egy kiforrottabb rendszerben a route adapter factory vagy test composition determinisztikus queryt injektálhat.

### 24.6. Presentation komponens teszt

A `LuckyNumberView` szinkron komponens, ezért Vitest + React Testing Library segítségével tesztelhető.

Ellenőrizendő:

- heading tartalmazza az értéket;
- tartomány megjelenik;
- JSON link helyes;
- szemantikus elemek és accessible name-ek stabilak.

### 24.7. Async Server Component teszt

A page async Server Component. A jelenlegi Next.js tesztelési ajánlás szerint az ilyen komponenseket elsődlegesen E2E teszttel kell ellenőrizni, mert a Vitest nem támogat minden async Server Component esetet.

### 24.8. Playwright E2E smoke test

```ts
import { expect, test } from '@playwright/test';

test('a szerencseszám-oldal renderelődik', async ({ page }) => {
  await page.goto('/lucky/number');

  await expect(
    page.getByRole('heading', { name: /A szerencseszámod:/ }),
  ).toBeVisible();

  await expect(page.getByText(/0–100 tartományból/)).toBeVisible();
});

test('a JSON-végpont érvényes tartományt ad', async ({ request }) => {
  const response = await request.get('/api/lucky/number');
  const body = (await response.json()) as {
    value: number;
    minimum: number;
    maximum: number;
  };

  expect(response.ok()).toBe(true);
  expect(body.value).toBeGreaterThanOrEqual(body.minimum);
  expect(body.value).toBeLessThanOrEqual(body.maximum);
});
```

### 24.9. Architecture teszt

Kötelező szabályok:

- `src/app/**` nem importálhat Prisma Clientet;
- `application/**` nem importálhat `next/*`, Reactot vagy infrastructure-t;
- Client Component nem importálhat `*.server.ts` vagy `server-only` modult;
- page nem hívhat localhostos vagy saját relatív `/api` endpointot;
- page csak engedélyezett module public surface-t vagy composition exportot használhat;
- route paraméter schema nélkül ne jusson repositoryhoz.

### 24.10. Ellenőrző parancsok

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm forge check
pnpm build
pnpm test:e2e
```

Ha a Playwright még nincs telepítve, a `test:e2e` célparancs a következő implementációs szelet része lehet.

---

## 25. Biztonsági és architekturális szabályok

### 25.1. Vékony adapter szabály

Egy page vagy Route Handler:

- transport inputot olvas;
- operation-specific schemával validál;
- auth contextet kér;
- use case-t hív;
- ismert hibát transportválasszá képez;
- explicit DTO-t renderel vagy szerializál.

Nem hoz önálló üzleti döntést.

### 25.2. Közvetlen ORM-hozzáférés tiltása

TILOS:

```tsx
import { db } from '@/platform/database/client';

export default async function ProductsPage() {
  const products = await db.product.findMany();

  return <ProductTable products={products} />;
}
```

A page application queryt hívjon.

### 25.3. Saját HTTP API belső hívásának tiltása

TILOS Server Componentből:

```ts
await fetch('/api/products');
```

A saját Route Handler külső transportadapter, nem belső service boundary.

### 25.4. Mass assignment tiltása

Route Handler vagy Server Action nem adhat validálatlan objektumot ORM update-nek:

```ts
await db.product.update({
  where: { id },
  data: await request.json(),
});
```

### 25.5. Paramétervalidáció

KÖTELEZŐ validálni:

- `params`;
- `searchParams`;
- request body;
- headerből olvasott üzleti érték;
- cookie-ból olvasott nem hitelesített adat;
- külső API response;
- environment configuration.

### 25.6. Authentication és authorization

A page elrejtése nem authorizáció.

Védett use case esetén:

```text
page / route
  -> requireActor()
  -> use case
  -> policy.assertCan...
  -> scoped repository
```

A mérvadó jogosultsági döntés az application use case-ben vagy annak policyjában történik.

### 25.7. Tenant scope

Tenant-erőforrásnál a repository port ne tegye opcionálissá a tenantot.

Helyes:

```ts
findById(tenantId: TenantId, productId: ProductId)
```

Kerülendő:

```ts
findById(productId: ProductId, tenantId?: TenantId)
```

### 25.8. DTO minimalizálás

A page vagy Route Handler csak a szükséges mezőket kapja.

A kliensre kerülő DTO felülvizsgálatánál kérdezd meg:

- szükséges-e minden mező a UI-hoz;
- szerepel-e benne belső ID, költség vagy auditadat;
- jogosultságfüggő-e valamely mező;
- lehet-e a teljes objektumot véletlenül Client Componentnek átadni;
- stabil publikus API-e vagy csak belső view model.

### 25.9. Renderelés alatti mellékhatások

Server Component renderelés közben TILOS nem idempotens mellékhatást végezni:

- email küldés;
- fizetés indítása;
- adatbázis update;
- audit nélküli állapotmódosítás;
- queue publish;
- külső rendszer mutation.

A render többször futhat. Mutation külön command/Server Action/Route Handler útvonalon történjen.

### 25.10. Random érték és cache

Random, idő- vagy requestfüggő értéket nem szabad véletlenül statikusan prerenderelni vagy megosztott cache-be tenni.

### 25.11. Client boundary audit

Minden `"use client"` fájlnál ellenőrizni kell:

- mi indokolja a klienshatárt;
- milyen propszerződést kap;
- van-e érzékeny mező;
- importál-e server-only kódot;
- túl nagy subtree került-e kliensre.

### 25.12. Route Handler response

API response:

- explicit státuszkódot;
- stabil content type-ot;
- biztonságos cache headert;
- minimális DTO-t;
- konzisztens hibaformátumot

használjon.

---

## 26. Implementációs elfogadási kritériumok

### 26.1. Dokumentációs készültség

A dokumentáció akkor tekinthető elfogadottnak, ha:

- a setup fejezetre épül;
- megkülönbözteti a Next.js-minimumot és a Winzard végállapotot;
- HTML- és JSON-adaptert is bemutat;
- ugyanazt az application queryt használja mindkettő;
- dokumentálja a request-time renderelést;
- dokumentálja a route paraméter és query validációt;
- tartalmaz projektstruktúrát, tesztet és anti-patternöket;
- minden upstream állítás dátumozott forráshoz köthető.

### 26.2. A későbbi kódimplementáció minimális scope-ja

A fejezet teljes kódszintű megvalósításához szükséges:

1. `demo/lucky-number` application port, DTO, error és query;
2. Node crypto random adapter;
3. `src/composition/demo.ts`;
4. `/lucky/number` page;
5. `/api/lucky/number` Route Handler;
6. presentation view;
7. unit teszt a queryhez;
8. Route Handler adapter teszt;
9. legalább egy E2E smoke teszt;
10. architecture check szabályok az `app` réteghez.

### 26.3. Opcionális scope

- dinamikus minimum/maximum route;
- query string alapú tartomány;
- loading, not-found és error fájlok;
- `forge route:list`;
- `forge route:inspect`;
- typed route konfiguráció;
- Playwright CI integráció.

### 26.4. Definition of Done

```text
[ ] pnpm typegen sikeres
[ ] pnpm typecheck sikeres
[ ] pnpm lint sikeres
[ ] pnpm test sikeres
[ ] pnpm forge check sikeres
[ ] pnpm build sikeres
[ ] /lucky/number 200-as HTML-választ ad
[ ] /api/lucky/number 200-as no-store JSON-választ ad
[ ] az érték a dokumentált tartományban van
[ ] a page nem importál Prisma Clientet
[ ] az application nem importál Next.js- vagy React-kódot
[ ] a Node adapter server-only
[ ] a route dinamikusként jelenik meg a build outputban
[ ] az E2E smoke teszt sikeres
```

### 26.5. Nem része ennek az implementációnak

- általános resource CRUD;
- authentication rendszer;
- adatbázis entity;
- admin UI;
- form mutation;
- domain event;
- queue;
- outbox;
- teljes profiler toolbar.

---

## 27. Hibaelhárítás

### 27.1. A route 404-et ad

Ellenőrizd:

```text
src/app/(public)/lucky/number/page.tsx
```

Gyakori hibák:

- `page.ts` helyett JSX-et tartalmazó fájl rossz kiterjesztéssel;
- nincs default export;
- a fájl nem `src/app` alatt van;
- elgépelés a mappanévben;
- másik route ugyanarra a pathra oldódik;
- dev server nem érzékelte a fájlt, újraindítás szükséges.

### 27.2. A szám nem változik frissítéskor

Lehetséges ok:

- a page statikusan prerenderelődik;
- a randomhívás `connection()` előtt van;
- a válasz köztes cache-be került;
- kliensoldali navigáció nem indított új requestet.

Ellenőrzés:

```bash
pnpm next build --debug
```

A route-nak dinamikusnak kell lennie.

### 27.3. `Math.random()` prerender hiba

Helyezd a randomérték előállítását request-adat hozzáférés után, vagy használd:

```ts
await connection();
```

A Winzard kanonikus megoldásában a page hívja a `connection()` függvényt, majd az application queryt.

### 27.4. `server-only` import hiba

A hiba azt jelzi, hogy szerveroldali modul kliensoldali importláncba került.

Ellenőrizd:

- van-e `"use client"` a page vagy szülő komponens tetején;
- a Client Component importál-e compositiont;
- a view importál-e infrastructure modult;
- DTO helyett teljes szervermodul lett-e újraexportálva.

Ne távolítsd el reflexből a `server-only` importot. Javítsd a határt.

### 27.5. `PageProps` nem található

Futtasd:

```bash
pnpm typegen
```

Majd ellenőrizd, hogy a `tsconfig.json` include tartalmazza a generált Next.js type könyvtárakat.

### 27.6. `params` típusa Promise hibát okoz

Next.js 16-ban:

```ts
const params = await props.params;
```

A korábbi szinkron mintát ne használd.

### 27.7. `page.tsx` és `route.ts` konfliktus

Ne legyen ugyanabban a route szegmensben mindkettő.

Mozgasd az API-t például:

```text
src/app/api/lucky/number/route.ts
```

alá.

### 27.8. A Node crypto adapter Edge runtime-ban hibázik

A route rögzítse:

```ts
export const runtime = 'nodejs';
```

Vagy készüljön külön Web Crypto adapter, amelyet külön composition választ ki. Az application port ne változzon.

### 27.9. A Route Handler cache-eltnek tűnik

Ellenőrizd:

```http
Cache-Control: no-store
```

és a hosting/CDN konfigurációt. A framework alapértelmezése mellett a külső infrastruktúra is befolyásolhatja a cache-t.

### 27.10. A build közvetlen adatbázis-kapcsolatot kér

A page vagy composition importlánca buildidőben példányosíthat olyan modult, amely azonnal csatlakozik az adatbázishoz.

Az adapter inicializáció legyen lusta vagy connection-pool létrehozásra korlátozott. Ne futtass queryt module top levelen.

### 27.11. A page tesztje Vitestben nem fut

Az async Server Componentek teljes támogatása korlátozott. Teszteld külön:

- az application queryt unit teszttel;
- a szinkron view-t component teszttel;
- az async page-et Playwright E2E teszttel.

### 27.12. A route group megjelenik az URL-ben

A helyes route group szintaxis:

```text
(public)
```

A zárójel nélküli `public` normál URL-szegmens lenne. Ne keverd a root `public/` statikus asset könyvtárral.

### 27.13. A `notFound()` után TypeScript returnt kér

A `notFound()` `never` típusú, ezért nincs szükség:

```ts
return notFound();
```

Használd:

```ts
notFound();
```

### 27.14. A JSON response túl sok mezőt tartalmaz

Ne a teljes application vagy ORM objektumot add át `Response.json()`-nak. Készíts explicit response DTO-t vagy mappert.

---

## 28. Symfony–Winzard megfeleltetés

### 28.1. Fő fogalmak

| Symfony | Winzard / Next.js | Megjegyzés |
| --- | --- | --- |
| Route attribute | `src/app` mappaszerkezet | A pathot a fájl helye adja. |
| Controller method | `page.tsx`, `route.ts`, Server Action | Vékony delivery adapter. |
| `Response` | React render output vagy Web `Response` | Page esetén a framework képezi a HTTP-választ. |
| `JsonResponse` | `Response.json()` | Route Handlerben. |
| Twig template | React Server/Client presentation komponens | Explicit props/DTO szerződés. |
| `base.html.twig` | root vagy nested `layout.tsx` | Hierarchikusan öröklődő UI. |
| route parameter | `[id]` dinamikus szegmens + `params` | Promise és felhasználói input. |
| query parameter | `searchParams` | Promise, dynamic API. |
| `bin/console debug:router` | `next build`, `next typegen`, cél `forge route:list` | Nincs egyetlen teljes upstream megfelelő. |
| Web Debug Toolbar | Next dev indicator, overlay, DevTools, log, későbbi observability | Több eszközből áll. |
| Controller service injection | explicit composition root | Konstruktoros DI, runtime magic nélkül. |
| service container | composition modules + generated wiring | A `forge check` ellenőrzi a gráfot. |
| `templates/` | feature `presentation/` + `app` layoutok | Nem globális template dump. |
| `config/routes.*` | App Router file convention | Külön route config általában nem szükséges. |

### 28.2. A Symfony kétlépéses modellje

Symfony:

```text
1. controller létrehozása
2. route hozzárendelése
```

Next.js-minimum:

```text
1. route mappa létrehozása
2. page.tsx vagy route.ts létrehozása
```

Winzard kanonikus modell:

```text
1. application művelet és szerződés létrehozása
2. port és adapter létrehozása, ha külső képesség kell
3. composition wiring
4. page.tsx vagy route.ts delivery adapter
5. explicit presentation/response DTO
6. type, architecture és E2E ellenőrzés
```

### 28.3. Parancsmegfeleltetés

| Symfony parancs | Winzard jelenlegi megfelelő | Winzard célparancs |
| --- | --- | --- |
| `php bin/console` | `pnpm run`, `pnpm next --help`, `pnpm forge --help` | `pnpm forge list` |
| `debug:router` | `pnpm build`, fájllista | `pnpm forge route:list` |
| route részletei | source inspection | `pnpm forge route:inspect <path>` |
| cache clear | `.next` build artifact újragenerálás, cache-specifikus workflow | későbbi `forge cache:*` |
| profiler | Next overlay + DevTools + telemetry | Winzard dev inspector későbbi szelet |

### 28.4. Lényegi különbség

Symfonyban a route és controller explicit runtime framework metadata alapján kapcsolódik.

Next.js-ben a route a build compiler számára fájlrendszer-konvenció.

A Winzard ezért nem írhat saját, párhuzamos routert a Next.js fölé. A saját platform feladata:

- architekturális korlátok;
- route metadata diagnosztika;
- generálás;
- drift detection;
- application wiring;
- biztonságos DTO- és policy-konvenció.

---

## 29. Források és attribúció

### 29.1. Szerkezeti kiindulópont

- [Symfony Docs — Create your First Page in Symfony](https://symfony.com/doc/current/page_creation.html)

A referenciaoldal 2026. július 17-i ellenőrzéskor az alábbi fő témákat tartalmazta:

- route és controller létrehozása;
- response előállítása;
- `bin/console` és route diagnosztika;
- Web Debug Toolbar;
- Twig template renderelése;
- projektkönyvtárak áttekintése;
- további routing, controller, template és konfigurációs fejezetek.

A Winzard dokumentum ugyanezeket a funkcionális kérdéseket kezeli a Next.js App Router, React Server Components, explicit application layer és composition root környezetében.

A Symfony oldal Creative Commons BY-SA 3.0 licencjelölést tartalmaz. A dokumentáció terjesztésekor az attribúciót és a repository dokumentációs licencének kompatibilitását fenn kell tartani vagy jogilag ellenőrizni kell.

### 29.2. Next.js upstream források

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [`page.js` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/page)
- [`route.js` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [`connection()`](https://nextjs.org/docs/app/api-reference/functions/connection)
- [`notFound()`](https://nextjs.org/docs/app/api-reference/functions/not-found)
- [Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
- [`error.js` file convention](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- [Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Debugging](https://nextjs.org/docs/app/guides/debugging)
- [`devIndicators`](https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators)
- [`next` CLI](https://nextjs.org/docs/app/api-reference/cli/next)
- [Vitest](https://nextjs.org/docs/app/guides/testing/vitest)
- [Playwright](https://nextjs.org/docs/app/guides/testing/playwright)

### 29.3. Repository baseline

A dokumentum a Winzard repository tervezett setup baseline-jára épül:

```text
Next.js 16.2.10
React 19.2.4
TypeScript 5.9.3
Node.js 24
pnpm 11
src/app App Router
server-only boundary
Vitest baseline
```

A repositoryban rögzített verziók és a sikeres CI eredménye elsőbbséget élveznek az általános upstream példákkal szemben.

### 29.4. Ellenőrzési dátum

```text
2026-07-17
```

Az upstream API-k, különösen a Next.js caching, error boundary és route typing felületei változhatnak. Dokumentációfrissítéskor KÖTELEZŐ újra ellenőrizni:

- a `params` és `searchParams` async szerződését;
- a `PageProps` és `RouteContext` helper típusokat;
- a `connection()` státuszát;
- az `error.tsx` retry API-ját;
- a Route Handler cache alapértelmezését;
- a CLI route output és `typegen` működését.
