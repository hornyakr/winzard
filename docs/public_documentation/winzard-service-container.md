---
title: "Szolgáltatások, dependency injection és composition root Winzard alkalmazásokban"
description: "A Symfony Service Container teljes témakészletének Winzard-specifikus átültetése explicit TypeScript composition rootokkal, portokkal, adapterekkel, factorykkel, service lifetime-okkal, registries-zel, graph-ellenőrzéssel és tesztelhető dependency injectionnel."
status: "implemented-unverified"
document_version: "0.1.0"
last_verified: "2026-07-22"
source_basis: "Symfony Docs — Service Container"
nextjs_baseline: "16.2.10"
typescript_baseline: "5.9.3"
nodejs_baseline: "24.x"
applies_to: "kitelepített Winzard projektek, a Winzard Reference App és a composition ellenőrzések"
related_documents:
  - "winzard-application-platform.md"
  - "winzard-configuration.md"
  - "winzard-controller.md"
  - "winzard-http-kernel.md"
  - "winzard-routing.md"
---


# Szolgáltatások, dependency injection és composition root Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Service Container”** fejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony témakészletét követi — service-ek létrehozása és használata, autowiring, autoconfiguration, kézi argumentum-wiring, paraméterek, aliasok, több implementáció, service removal, closure-injection, binding, absztrakt argumentumok, private/public service-ek, resource-alapú regisztráció, explicit service-definíció, functional interface adapter és container lint —, de minden fogalmat a Winzard **Next.js App Router + TypeScript + moduláris monolit + ports and adapters + explicit composition root** architektúrájára képez le.

A dokumentum központi döntése:

> **A Winzard alaprendszere nem vezet be rejtett, reflektív vagy globálisan lekérdezhető runtime service containert. A dependency graph kanonikus forrása explicit TypeScript composition code: konstruktoros dependency injection, típusos factoryk, statikus registryk és szerveroldali composition rootok.**

A cél nem a Symfony container API másolása. A cél a Symfony container által biztosított architekturális fegyelem megtartása:

- az objektumkonstrukció központosítása;
- a függőségi irány ellenőrizhetősége;
- az implementáció és az interfész szétválasztása;
- a környezeti és capability-specifikus wiring;
- a service graph CI-ben történő validálása;
- a service locator használatának visszaszorítása;
- a tesztelhető helyettesítés;
- a service lifetime és állapotkezelés explicit dokumentálása.

A Winzardban a Next.js továbbra is HTTP-, routing-, rendering- és UI-runtime. A composition layer nem új framework-runtime, hanem az alkalmazás objektumgráfjának típusos összeállítási helye.

> [!IMPORTANT]
> A dokumentumban szereplő `forge composition:*` és `forge service:*` parancsok ebben a repository-verzióban implementált CLI-felületek. A későbbi `forge graph:*` bővítések továbbra is cél-CLI szerződések. Az implementált composition parancsokat a Forge ténylegesen listázza, teszteli, és a `verify:composition` kapuban ellenőrzi.

A fejezet végére egy fejlesztő:

1. megérti a service, port, adapter, factory, provider, registry és composition root különbségét;
2. explicit dependency injectionnel tud application service-t készíteni;
3. képes production-, test- és capability-specifikus object graphot összeállítani;
4. el tudja kerülni a globális service locator és a request-state singleton hibáit;
5. helyesen tud több implementációt, decoratort és többes bindingot kezelni;
6. képes service lifetime-ot és cleanup-szerződést megadni;
7. tud statikus, determinisztikus registryt használni runtime filesystem-scan helyett;
8. képes typecheckkel, unit teszttel és graph-checkkel ellenőrizni a wiringot;
9. külön tudja választani a server-only compositiont a Client Component gráftól;
10. meg tudja határozni egy későbbi Forge composition-diagnosztika és generátor biztonságos határait.


## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#section-1)
2. [Hatókör, baseline és előfeltételek](#section-2)
3. [Mi számít service-nek Winzardban?](#section-3)
4. [Mi nem service?](#section-4)
5. [A Symfony service container modellje](#section-5)
6. [A Winzard alapdöntése: explicit composition](#section-6)
7. [A három composition-szint](#section-7)
8. [A dependency graph alapfolyamata](#section-8)
9. [Az első újrahasznosítható service](#section-9)
10. [Port és adapter szétválasztása](#section-10)
11. [Az első composition root](#section-11)
12. [Konstruktoros dependency injection](#section-12)
13. [Több dependency kezelése](#section-13)
14. [Scalar és konfigurációs értékek injektálása](#section-14)
15. [Parameter bag helyett típusos config](#section-15)
16. [Service reference helyett közvetlen import és factory-argumentum](#section-16)
17. [Egy konkrét implementáció kiválasztása](#section-17)
18. [Aliasok és szemantikus bindingok](#section-18)
19. [Ugyanazon osztály több példánya](#section-19)
20. [Environment- és stage-specifikus wiring](#section-20)
21. [Capability-specifikus wiring](#section-21)
22. [Service eltávolítása és letiltása](#section-22)
23. [Opcionális dependency](#section-23)
24. [Closure és függvény injektálása](#section-24)
25. [Functional interface adapterek](#section-25)
26. [Factory service-ek](#section-26)
27. [Async factoryk és inicializálás](#section-27)
28. [Provider és lazy dependency](#section-28)
29. [Lazy import és code splitting](#section-29)
30. [Service lifetime modell](#section-30)
31. [Process- és module-scope](#section-31)
32. [Request-scope](#section-32)
33. [Operation- és transient scope](#section-33)
34. [Külső, durable erőforrások](#section-34)
35. [Cleanup, disposal és shutdown](#section-35)
36. [Private és public service-ek](#section-36)
37. [Package exportok mint encapsulation](#section-37)
38. [Service locator anti-pattern](#section-38)
39. [Szűk registry és kontrollált lookup](#section-39)
40. [Többes binding és service collection](#section-40)
41. [Tagelt service-ek Winzard-megfelelője](#section-41)
42. [Prioritás és determinisztikus sorrend](#section-42)
43. [Decorator és interceptor composition](#section-43)
44. [Autowiring Winzardban](#section-44)
45. [Autoconfiguration Winzardban](#section-45)
46. [Resource-alapú tömeges regisztráció](#section-46)
47. [Statikus registry és generált index](#section-47)
48. [Explicit wiring és named service-ek](#section-48)
49. [Argumentumbinding név vagy típus alapján](#section-49)
50. [Absztrakt és később biztosított argumentumok](#section-50)
51. [Synthetic és bootstrap-provided dependency](#section-51)
52. [Ciklikus függőségek](#section-52)
53. [Constructor side effectek](#section-53)
54. [Node.js és Edge adapterválasztás](#section-54)
55. [Server és Client Component határ](#section-55)
56. [RequestContext és AsyncLocalStorage](#section-56)
57. [Hot reload, module cache és fejlesztői singletonok](#section-57)
58. [Serverless és többpéldányos működés](#section-58)
59. [Startup-validáció és instrumentation](#section-59)
60. [Composition graph lint és diagnosztika](#section-60)
61. [Graph invariánsok és hibakódok](#section-61)
62. [Tesztelési stratégia](#section-62)
63. [Test double-ok és override-ok](#section-63)
64. [Security követelmények](#section-64)
65. [Teljesítmény és cold start](#section-65)
66. [Observability és graph fingerprint](#section-66)
67. [Template-, recipe- és package-contract](#section-67)
68. [Migráció ad hoc kódból](#section-68)
69. [Teljes vertikális példa](#section-69)
70. [Ajánlott könyvtárstruktúra](#section-70)
71. [Forge composition- és service-parancsok](#section-71)
72. [Implementációs elfogadási kritériumok](#section-72)
73. [Hibaelhárítás](#section-73)
74. [Symfony–Winzard megfeleltetés](#section-74)
75. [Források és attribúció](#section-75)


---

<a id="section-1"></a>

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy architekturális, biztonsági, lifecycle- vagy reprodukálhatósági hibát okozhat;
- **TILOS / MUST NOT**: Winzard-kompatibilis production kódban nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést ADR-ben vagy specificationben dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak kifejezett trade-off és ellenőrzés mellett használható;
- **OPCIONÁLIS / MAY**: a capability és deployment modell szerint alkalmazható.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Service** | Típusos objektum vagy függvény, amely jól körülhatárolt alkalmazási vagy infrastruktúra-képességet biztosít. |
| **Dependency** | Egy service működéséhez szükséges másik contract vagy érték. |
| **Dependency injection** | A dependency kívülről történő átadása, nem pedig belső, rejtett létrehozása vagy globális lekérése. |
| **Port** | Az application vagy domain oldal által definiált interfész egy külső képességhez. |
| **Adapter** | Egy port konkrét infrastruktúra- vagy platformimplementációja. |
| **Composition root** | Az a szerveroldali modul, amely konkrét adaptereket hoz létre és application objektumokba injektál. |
| **Factory** | Olyan függvény vagy objektum, amely dependency-kből service-példányt épít. |
| **Provider** | Olyan késleltetett factory, amely híváskor ad dependency-t vagy service-t. |
| **Registry** | Kulcs vagy típus szerint rendezett, explicit service-gyűjtemény. |
| **Decorator** | Ugyanazt a portot implementáló wrapper, amely további viselkedést ad egy service köré. |
| **Service locator** | Olyan általános lekérdező, amelyből tetszőleges service azonosító alapján kérhető le. |
| **Object graph** | A service-ek és függőségeik irányított gráfja. |
| **Lifetime** | Annak szerződése, hogy egy service-példány meddig él és milyen scope-ban osztható meg. |
| **Application root** | Az alkalmazás egészére érvényes, process/module-szintű graph. |
| **Request root** | Egyetlen requesthez tartozó context- és request-scoped graph. |
| **Operation root** | Egyetlen query, command, job vagy webhook-feldolgozás transient graphja. |

### 1.3. A „container” szó használata

Ebben a dokumentumban a „Symfony container” a Symfony konkrét DependencyInjection komponensét jelenti.

A „Winzard composition” nem jelent globális, runtime lekérdezhető containert. Ha egy későbbi opcionális package belső registryt vagy container-szerű mechanizmust használ, az:

- nem válhat az application kód általános service locatorává;
- nem helyettesítheti a konstruktoros injektálást;
- nem rejtheti el a dependency graphot;
- nem importálható Client Componentből;
- nem alakíthatja a runtime stringkulcsokat az alkalmazás elsődleges API-jává.


---

<a id="section-2"></a>

## 2. Hatókör, baseline és előfeltételek

### 2.1. Technikai baseline

A példák az alábbi környezethez készültek:

```text
Node.js:    24.x
pnpm:       11.x
Next.js:    16.2.10
React:      19.2.x
TypeScript: 5.9.x
App Router: igen
strict TS:  igen
```

A repository aktuális root csomagja ESM-modult használ, `server-only` határt telepít, és a Reference App composition rootot tart fenn.

### 2.2. Feltételezett Winzard-architektúra

```text
src/app
  → delivery adapter

src/modules/**/application
  → queryk, commandok, portok, DTO-k, policyk

src/modules/**/domain
  → üzleti modellek és invariánsok

src/modules/**/infrastructure
  → portimplementációk

src/modules/**/presentation
  → view modellek és React nézetek

src/composition
  → konkrét dependency wiring

src/platform
  → megosztott runtime adapterek
```

### 2.3. A fejezet lefedi

- application és infrastructure service-ek létrehozását;
- konstruktoros dependency injectiont;
- explicit factorykat;
- config- és scalar injectiont;
- több implementációt és named bindingot;
- environment-, stage- és capability-specifikus wiringot;
- service lifetime-okat;
- lazy service-eket;
- registries-t és decoratorokat;
- startup validationt;
- graph lintet és tesztelést;
- package- és recipe-határokat.

### 2.4. Nem része

Nem készül ebben a dokumentumban:

- Symfony-kompatibilis YAML service container;
- runtime reflection scanner;
- decorator metadata framework;
- általános `container.get()` API;
- requestenként új teljes application container;
- automatikus dependency letöltés;
- process manager vagy distributed service mesh;
- alkalmazás-runtime plugin piactér.


---

<a id="section-3"></a>

## 3. Mi számít service-nek Winzardban?

Egy service valamilyen viselkedést vagy külső képességet biztosít, és contractja van.

Példák:

```text
GetProduct
CreateOrder
ProductReadRepository
TransactionManager
Clock
IdGenerator
Mailer
ObjectStorage
EventPublisher
PasswordHasher
FeatureFlagEvaluator
AuditLogger
```

Service lehet osztály:

```ts
export class GetProduct {
  constructor(
    private readonly products: ProductReadRepository,
  ) {}

  async execute(productId: ProductId): Promise<GetProductResult> {
    return this.products.findById(productId);
  }
}
```

Service lehet függvény is:

```ts
export type Now = () => Date;

export const systemNow: Now = () => new Date();
```

A service-minőség nem attól függ, hogy az érték osztály-e. A fontos tulajdonságok:

1. névvel azonosítható képesség;
2. explicit input és output;
3. explicit dependency-k;
4. dokumentált lifetime;
5. tesztelhető helyettesíthetőség;
6. meghatározott ownership;
7. biztonsági és hibaszerződés.

Egy application service KÖTELEZŐEN frameworkfüggetlen contractot használjon. Next.js `Request`, `Response`, React node, cookie store vagy Prisma rekord nem lehet az application service publikus API-ja.


---

<a id="section-4"></a>

## 4. Mi nem service?

Nem minden exportált érték service.

Általában nem service:

- domain entity vagy aggregate;
- value object;
- DTO;
- Zod schema;
- TypeScript type vagy interface önmagában;
- enum vagy konstans;
- React presentation component;
- statikus route builder;
- tiszta formatter;
- migration;
- Prisma schema;
- dokumentációs manifest;
- requestből kiolvasott nyers adat.

Például:

```ts
export type ProductId = string & {
  readonly __brand: 'ProductId';
};
```

Ez contract vagy value type, nem service.

```ts
export const createProductInputSchema = z.object({
  name: z.string().trim().min(1),
});
```

Ez boundary schema, nem feltétlenül service. Nem kell minden tiszta értéket composition rootból injektálni.

### Mikor válik egy helper service-szé?

Egy helper akkor indokol explicit dependency-t, ha:

- külső állapotot vagy időt használ;
- runtime implementációtól függ;
- biztonsági policyt hajt végre;
- I/O-t végez;
- determinisztikus tesztben helyettesítendő;
- konfigurációt birtokol;
- több implementation közül választható;
- lifecycle-je vagy erőforrás-kezelése van.

Túlzott DI is kerülendő. Egy tiszta, stabil `formatCurrency(value, locale)` függvényt nem kell generikus containerbe regisztrálni.


---

<a id="section-5"></a>

## 5. A Symfony service container modellje

A Symfonyban a service container:

- központilag tárolja a service-definíciókat;
- service ID-ket és aliasokat kezel;
- constructor argumentumokat old fel;
- autowiringot és autoconfigurationt biztosít;
- service-eket private vagy public státuszba helyez;
- factorykat, closure-öket és tagged collectionöket tud injektálni;
- compiler passokkal módosítható;
- buildelt/kompilált containerből gyorsan példányosít;
- `lint:container` ellenőrzést ad.

A Symfony default konfigurációja nagy számú osztályt resource alapján regisztrál, autowire-ol és autoconfigure-ol. Ez kényelmes, mert az osztály constructor type-hintjeiből a container dependency-ket keres.

A JavaScript/TypeScript/Next.js környezetben nincs ezzel azonos, framework által kompilált alkalmazási container:

- a TypeScript typeok runtime eltűnnek;
- az interfészeket runtime reflection nem látja;
- a bundler külön Server és Client module graphot épít;
- a deployment lehet hosszú életű Node process, serverless instance vagy Edge runtime;
- egy globális container könnyen request-state és secret leak forrásává válik;
- a runtime filesystem scan bundlinggal és serverless környezettel nem megbízható.

Ezért a Winzard a container eredményét — egy ellenőrizhető object graphot — explicit kóddal állítja elő.


---

<a id="section-6"></a>

## 6. A Winzard alapdöntése: explicit composition

A production object graph forrásigazsága TypeScript.

```ts
import 'server-only';

import { GetProduct } from '@/modules/catalog/product/application/queries/get-product';
import { PrismaProductReadRepository } from '@/modules/catalog/product/infrastructure/persistence/prisma-product-read-repository';
import { db } from '@/platform/database/client';

const productReadRepository =
  new PrismaProductReadRepository(db);

const getProduct =
  new GetProduct(productReadRepository);

export const catalogModule = Object.freeze({
  queries: Object.freeze({
    getProduct,
  }),
});
```

### 6.1. Miért explicit?

Az explicit wiring:

- IDE-ben követhető;
- refaktoráláskor TypeScript hibát ad;
- nem használ runtime string service ID-t;
- nem igényel decorator metadata-t;
- nem igényel filesystem scant;
- tree-shaking és bundling szempontból értelmezhető;
- kódreview-ban látható;
- könnyen helyettesíthető factoryval;
- nem rejti el a service lifetime-ot.

### 6.2. Mit centralizál a composition root?

A composition root birtokolja:

- konkrét adapter kiválasztását;
- config → typed value átalakítást;
- shared client és pool létrehozását;
- decorator sorrendet;
- registry összeállítását;
- environment/capability branch-et;
- startup invariánsokat;
- module export felületet.

Nem birtokol üzleti döntést.

### 6.3. Tilos minta

```ts
export class GetProduct {
  async execute(id: string) {
    const repository =
      globalContainer.get('productRepository');

    return repository.findById(id);
  }
}
```

A dependency itt rejtett, stringkulcsos és runtime hibára hajlamos.


---

<a id="section-7"></a>

## 7. A három composition-szint

A Winzard három külön graph-szintet használ.

### 7.1. Application/process composition

Hosszabb életű, concurrency-safe service-ek:

```text
adatbáziskliens vagy pool
HTTP client
object storage client
telemetry exporter
repository adapter
stateless application query
stateless application command
policy
event publisher
```

Példa:

```text
src/composition/application.server.ts
```

### 7.2. Request composition

Requestenként új, request-state-et hordozó objektumok:

```text
RequestContext
Actor
TenantContext
request logger child
request-scoped authorization facade
request metrics scope
request cancellation signal
```

Példa:

```ts
export function createRequestServices(
  context: RequestContext,
  application: ApplicationServices,
): RequestServices {
  return Object.freeze({
    context,
    logger: application.logger.child({
      requestId: context.requestId,
    }),
  });
}
```

### 7.3. Operation composition

Egy query, command, job vagy webhook egyszeri dependency-je:

```text
idempotency scope
transaction scope
operation timer
unit of work
temporary file lease
batch accumulator
```

### 7.4. Függőségi szabály

```text
process-scope
  nem függhet
request-scope-tól

request-scope
  függhet
process-scope-tól

operation-scope
  függhet
request- és process-scope-tól
```

Ha egy process-scope service request contextet tárol mezőben, cross-request adatszivárgás keletkezhet.


---

<a id="section-8"></a>

## 8. A dependency graph alapfolyamata

A kanonikus flow:

```text
configuration source
  → capability-specifikus parser
  → immutable config value

external SDK/client
  → infrastructure adapter

application port
  ← infrastructure adapter

application query/command
  ← portok + policyk + value service-ek

module composition
  → queries + commands + policies

delivery adapter
  → module export
```

Példa:

```text
DATABASE_URL
  → DatabaseEnvironment
  → PrismaPg
  → PrismaClient
  → PrismaProductRepository
  → CreateProduct
  → catalogModule.commands.createProduct
  → Server Action
```

A graph iránya nem jelent runtime lookupot. Minden nyíl explicit konstruktor- vagy factory-argumentum.

### 8.1. Service graph és import graph

A kettő kapcsolódik, de nem azonos.

```text
import graph
  → mely modul ismer mely modult

service graph
  → mely példány kap mely dependency-példányt
```

Egy factory importálhat két implementációt, de runtime config alapján csak az egyiket példányosíthatja. Az import graph mindkettőt láthatja; a service graph csak a kiválasztott bindingot.

### 8.2. Graph létrehozási hiba

A graph létrehozása fail-fast legyen, ha:

- kötelező config hiányzik;
- binding nem egyértelmű;
- registry kulcs duplikált;
- capability dependency hiányzik;
- runtime inkompatibilis adaptert választottunk;
- absztrakt dependency nincs biztosítva;
- lifecycle szabály sérül.


---

<a id="section-9"></a>

## 9. Az első újrahasznosítható service

Egy egyszerű application service:

```ts
export interface MessageSource {
  randomMessage(): string;
}

export class GenerateHappyMessage {
  constructor(
    private readonly source: MessageSource,
  ) {}

  execute(): string {
    return this.source.randomMessage();
  }
}
```

Infrastructure adapter:

```ts
import 'server-only';

import { randomInt } from 'node:crypto';

import type { MessageSource } from '../../application/ports/message-source';

const MESSAGES = [
  'Sikeres frissítés.',
  'A művelet elkészült.',
  'A rendszer elmentette a változást.',
] as const;

export class NodeRandomMessageSource
implements MessageSource {
  randomMessage(): string {
    return MESSAGES[randomInt(MESSAGES.length)]!;
  }
}
```

Wiring:

```ts
const messageSource =
  new NodeRandomMessageSource();

export const generateHappyMessage =
  new GenerateHappyMessage(messageSource);
```

A service újrahasznosítható Page-ből, Route Handlerből, Server Actionből, CLI-parancsból vagy workerből, mert nem importál Next.js entrypointot.


---

<a id="section-10"></a>

## 10. Port és adapter szétválasztása

A portot az a réteg definiálja, amelynek szüksége van a képességre.

```ts
// application/ports/product-read-repository.ts
export interface ProductReadRepository {
  findById(
    productId: ProductId,
  ): Promise<ProductDetailDto | null>;
}
```

Az adapter kívülről implementálja:

```ts
// infrastructure/persistence/prisma-product-read-repository.ts
import 'server-only';

export class PrismaProductReadRepository
implements ProductReadRepository {
  constructor(
    private readonly database: PrismaClient,
  ) {}

  async findById(
    productId: ProductId,
  ): Promise<ProductDetailDto | null> {
    const row = await this.database.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    return row
      ? {
          id: row.id,
          name: row.name,
          status: row.status,
        }
      : null;
  }
}
```

### 10.1. Port ownership

KÖTELEZŐ:

```text
application
  birtokolja
a számára szükséges portot
```

Nem ajánlott:

```text
platform/database
  definiál egy általános repository interface-t
  amelyhez minden domain alkalmazkodik
```

A túl általános infrastruktúra-interface az alkalmazást az adapter szemantikájához köti.

### 10.2. Interface vagy type?

Mindkettő használható.

```ts
export type SendEmail = (
  message: EmailMessage,
) => Promise<void>;
```

```ts
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}
```

Az interface előnyös, ha:

- több metódus tartozik össze;
- decorator készül;
- lifecycle vagy identity jelentős;
- implementációs classok vannak.

A function type előnyös, ha egyetlen, tiszta képességet ír le.


---

<a id="section-11"></a>

## 11. Az első composition root

A composition root KÖTELEZŐEN szerveroldali legyen.

```ts
// src/composition/catalog.server.ts
import 'server-only';

import { GetProduct } from '@/modules/catalog/product/application/queries/get-product';
import { PrismaProductReadRepository } from '@/modules/catalog/product/infrastructure/persistence/prisma-product-read-repository';
import { db } from '@/platform/database/client';

const productReadRepository =
  new PrismaProductReadRepository(db);

const getProduct =
  new GetProduct(productReadRepository);

export const catalogModule = Object.freeze({
  queries: Object.freeze({
    getProduct,
  }),
});
```

### 11.1. Miért `server-only`?

A composition root gyakran importál:

- adatbázisklienst;
- secretet;
- Node.js API-t;
- infrastruktúra-adaptert;
- privileged service-t.

A `server-only` import buildhibát okoz, ha Client Component importálja a modult.

### 11.2. Exportfelület

A composition root minimális, szemantikus API-t exportáljon:

```ts
export type CatalogModule = Readonly<{
  queries: Readonly<{
    getProduct: GetProduct;
  }>;
}>;

export declare const catalogModule:
  CatalogModule;
```

Nem ajánlott minden belső adaptert újraexportálni:

```ts
export {
  db,
  prismaRepository,
  logger,
  rawConfig,
  secretManager,
};
```

### 11.3. Fájlnév

Ajánlott:

```text
catalog.server.ts
application.server.ts
worker.server.ts
test-composition.ts
```

A `.server.ts` és a `server-only` együtt erősebb szándékjelzés.


---

<a id="section-12"></a>

## 12. Konstruktoros dependency injection

A konstruktoros injektálás az alapértelmezett.

```ts
export class CreateProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly transactions: TransactionManager,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}
}
```

### 12.1. Előnyök

- a dependency-lista az osztály API-jában látható;
- hiányzó argumentum compile-time hibát okoz;
- az objektum konstrukció után használható állapotban van;
- a teszt egyszerű fake-eket adhat;
- a lifecycle a composition rootban látható;
- nincs késői property injection;
- nincs részlegesen inicializált service.

### 12.2. Property injection

Nem támogatott alapminta:

```ts
const service = new CreateProduct();
service.products = repository;
service.clock = clock;
```

Ez:

- részlegesen inicializált állapotot enged;
- mutable wiringot hoz létre;
- versenyhelyzetet okozhat;
- tesztben és productionben eltérhet.

### 12.3. Method injection

Method argumentumként az operation input vagy request context adható:

```ts
await command.execute({
  actor,
  input,
});
```

A stabil infrastruktúra-dependency-ket nem kell minden híváskor átadni.

### 12.4. Constructor méret

A sok constructor argumentum nem automatikusan DI-hiba, de jelezheti:

- túl sok felelősséget;
- hiányzó cohesive facade-ot;
- túl széles application service-t;
- rossz bounded-context határt.

Nem szabad a problémát egy általános `Dependencies` baggel elrejteni csak azért, hogy rövidebb legyen a constructor.


---

<a id="section-13"></a>

## 13. Több dependency kezelése

Példa:

```ts
export class NotifySiteUpdate {
  constructor(
    private readonly messages:
      GenerateHappyMessage,
    private readonly mailer:
      Mailer,
    private readonly audit:
      AuditWriter,
    private readonly clock:
      Clock,
  ) {}

  async execute(
    input: NotifySiteUpdateInput,
  ): Promise<void> {
    const message = this.messages.execute();

    await this.mailer.send({
      to: input.recipient,
      subject: 'Site update',
      text: message,
    });

    await this.audit.write({
      occurredAt: this.clock.now(),
      type: 'site.update.notified',
    });
  }
}
```

Wiring:

```ts
const notifySiteUpdate =
  new NotifySiteUpdate(
    generateHappyMessage,
    smtpMailer,
    auditWriter,
    systemClock,
  );
```

### 13.1. Argumentumsorrend

Ha sok az azonos primitív vagy hasonló típus, named object factory használható:

```ts
export type NotifySiteUpdateDependencies =
  Readonly<{
    messages: GenerateHappyMessage;
    mailer: Mailer;
    audit: AuditWriter;
    clock: Clock;
  }>;

export class NotifySiteUpdate {
  constructor(
    private readonly dependencies:
      NotifySiteUpdateDependencies,
  ) {}
}
```

Ez nem service locator, ha:

- a dependency type konkrét és zárt;
- nincs stringkulcsos `get`;
- az object csak az adott service dependency-it tartalmazza;
- a factory compile-time ellenőrzi a mezőket.

### 13.2. Dependencies bag veszélye

Tilos általános bag:

```ts
type Dependencies = Record<string, unknown>;
```

vagy:

```ts
class HiddenLocatorExample {
  constructor(
    private readonly services:
      AppServices,
  ) {}
}
```

ha az application service az egész alkalmazásgráfot megkapja. Ez rejtett service locator.


---

<a id="section-14"></a>

## 14. Scalar és konfigurációs értékek injektálása

A string, szám és boolean értékeknek szemantikus típust kell kapniuk.

Nem ajánlott:

```ts
new SmtpMailer(
  'smtp.example.com',
  587,
  true,
  5_000,
);
```

Ajánlott:

```ts
export type SmtpMailerConfig =
  Readonly<{
    host: string;
    port: number;
    secure: boolean;
    timeoutMs: number;
    senderAddress: string;
  }>;

new SmtpMailer({
  host: mailEnvironment.host,
  port: mailEnvironment.port,
  secure: mailEnvironment.secure,
  timeoutMs:
    mailEnvironment.timeoutMs,
  senderAddress:
    mailEnvironment.senderAddress,
});
```

### 14.1. Value object

Üzleti jelentésű scalarhoz value object használható:

```ts
export class ReservationTtl {
  private constructor(
    readonly milliseconds: number,
  ) {}

  static fromMilliseconds(
    value: number,
  ): ReservationTtl {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(
        'Reservation TTL must be positive.',
      );
    }

    return new ReservationTtl(value);
  }
}
```

### 14.2. Secret injection

Secretet csak az azt használó adapter kapjon:

```text
Auth secret
  → token signer adapter

Database URL
  → database adapter

SMTP password
  → SMTP transport
```

Application service nem kaphat teljes environment objektumot.

### 14.3. Immutable config

A composition root az input configot fagyaszthatja:

```ts
const config = Object.freeze({
  timeoutMs: environment.timeoutMs,
  senderAddress:
    environment.senderAddress,
});
```

Ez nem helyettesíti a mély immutabilitást, de jelzi, hogy runtime mutation nem támogatott.


---

<a id="section-15"></a>

## 15. Parameter bag helyett típusos config

A Symfony container paramétereket is tárolhat. A Winzard nem vezet be általános:

```ts
config.get('mailer.sender');
```

API-t az application réteg számára.

### 15.1. Miért kerülendő a parameter bag?

```ts
const timeout =
  Number(config.get('timeout'));
```

Problémák:

- stringkulcsos runtime hiba;
- ownership nem látható;
- type coercion szétszóródik;
- secret és public config keveredhet;
- dead config nehezen észlelhető;
- service rejtett dependency-t vesz fel.

### 15.2. Capability-specifikus parser

```ts
export const mailEnvironmentSchema =
  z.object({
    MAIL_HOST:
      z.string().trim().min(1),
    MAIL_PORT:
      z.coerce.number().int().min(1).max(65535),
    MAIL_TIMEOUT_MS:
      z.coerce.number().int().positive(),
    MAIL_SENDER:
      z.email(),
  });

export type MailEnvironment =
  z.infer<typeof mailEnvironmentSchema>;

export function getMailEnvironment(
  input:
    | NodeJS.ProcessEnv
    | Record<string, string | undefined>
      = process.env,
): MailEnvironment {
  return mailEnvironmentSchema.parse(input);
}
```

### 15.3. Adapterconfig

```ts
function createMailer(
  environment: MailEnvironment,
): Mailer {
  return new SmtpMailer({
    host: environment.MAIL_HOST,
    port: environment.MAIL_PORT,
    timeoutMs:
      environment.MAIL_TIMEOUT_MS,
    senderAddress:
      environment.MAIL_SENDER,
  });
}
```

A nyers env csak a boundaryn jelenik meg.


---

<a id="section-16"></a>

## 16. Service reference helyett közvetlen import és factory-argumentum

Symfony YAML-ban egy `@service_id` más service-re hivatkozik.

Winzardban a referencia normál TypeScript érték:

```ts
const repository =
  new PrismaProductRepository(db);

const command =
  new CreateProduct(repository);
```

Factory esetén:

```ts
export function createCreateProduct(
  dependencies: Readonly<{
    repository: ProductRepository;
    clock: Clock;
  }>,
): CreateProduct {
  return new CreateProduct(
    dependencies.repository,
    dependencies.clock,
  );
}
```

### 16.1. Import nem egyenlő injectionnel

Ez:

```ts
import { db } from '@/platform/database/client';
```

moduldependency.

Ez:

```ts
new PrismaProductRepository(db);
```

instance wiring.

Az application service nem importálhatja közvetlenül az adaptert:

```ts
// TILOS application rétegben
import { db } from '@/platform/database/client';
```

A composition root importálja mindkét oldalt és összeköti őket.

### 16.2. Stringkulcs csak registry boundaryn

Egy kontrollált registry használhat string vagy symbol kulcsot, de a kulcs:

- zárt union legyen;
- runtime input előtt validálódjon;
- ne legyen tetszőleges module path;
- ne tegye elérhetővé a teljes graphot.


---

<a id="section-17"></a>

## 17. Egy konkrét implementáció kiválasztása

Ha egy portnak több implementációja van, a composition root explicit választ.

```ts
export interface AuditWriter {
  write(event: AuditEvent): Promise<void>;
}
```

Implementációk:

```ts
export class DatabaseAuditWriter
implements AuditWriter {
  // ...
}

export class ConsoleAuditWriter
implements AuditWriter {
  // ...
}
```

Factory:

```ts
type AuditBackend =
  | 'database'
  | 'console';

export function createAuditWriter(
  backend: AuditBackend,
  dependencies: Readonly<{
    database: PrismaClient;
    logger: Logger;
  }>,
): AuditWriter {
  switch (backend) {
    case 'database':
      return new DatabaseAuditWriter(
        dependencies.database,
      );

    case 'console':
      return new ConsoleAuditWriter(
        dependencies.logger,
      );
  }
}
```

### 17.1. Exhaustive selection

A zárt union miatt új backend hozzáadásakor a TypeScript jelezheti a hiányzó ágat.

```ts
function assertNever(
  value: never,
): never {
  throw new Error(
    `Unsupported audit backend: ${String(value)}`,
  );
}
```

### 17.2. Default binding

Egy portnak lehet kanonikus production bindingja:

```ts
const auditWriter: AuditWriter =
  createAuditWriter(
    environment.AUDIT_BACKEND,
    dependencies,
  );
```

A default nem implicit globális alias. A composition rootban látható döntés.


---

<a id="section-18"></a>

## 18. Aliasok és szemantikus bindingok

Alias akkor hasznos, ha ugyanaz a technikai port több szemantikus szerepben jelenik meg.

```ts
export type RequestLogger = Logger;
export type SecurityLogger = Logger;
```

A puszta type alias TypeScriptben nem hoz nominális különbséget. Ezért a bindingot névvel kell kifejezni:

```ts
export type LoggingServices =
  Readonly<{
    requestLogger: Logger;
    securityLogger: Logger;
  }>;
```

Wiring:

```ts
const logging = Object.freeze({
  requestLogger:
    baseLogger.child({
      channel: 'request',
    }),
  securityLogger:
    baseLogger.child({
      channel: 'security',
    }),
});
```

Injection:

```ts
new AuthenticateUser({
  securityLogger:
    logging.securityLogger,
  passwords,
  users,
});
```

### 18.1. Branded token

Nominális token csak registry/generator használatánál indokolt:

```ts
declare const tokenBrand:
  unique symbol;

export type ServiceToken<T> =
  symbol & {
    readonly [tokenBrand]?: T;
  };
```

Ezt nem szabad az application kód általános lookup API-jává tenni.

### 18.2. Re-export alias

Package boundaryn:

```ts
export {
  createConsoleLogger
    as createDevelopmentLogger,
};
```

Ez compile-time név, nem runtime service alias.


---

<a id="section-19"></a>

## 19. Ugyanazon osztály több példánya

Ugyanaz a class eltérő konfigurációval több service-szerepet tölthet be.

```ts
const customerMailer =
  new SmtpMailer({
    senderAddress:
      'support@example.com',
    timeoutMs: 5_000,
    // ...
  });

const securityMailer =
  new SmtpMailer({
    senderAddress:
      'security@example.com',
    timeoutMs: 2_000,
    // ...
  });
```

Szemantikus export:

```ts
export const mailers = Object.freeze({
  customer: customerMailer,
  security: securityMailer,
});
```

### 19.1. Factory metódus

```ts
function createMailer(
  config: SmtpMailerConfig,
): Mailer {
  return new SmtpMailer(config);
}
```

### 19.2. Named service ID helyett property

Symfonyban külön service ID lehet:

```text
site_update_manager.superadmin
site_update_manager.normal_users
```

Winzardban:

```ts
const siteUpdateManagers =
  Object.freeze({
    superAdmin:
      new SiteUpdateManager({
        adminEmail:
          'superadmin@example.com',
        mailer,
        messages,
      }),

    normalUsers:
      new SiteUpdateManager({
        adminEmail:
          'manager@example.com',
        mailer,
        messages,
      }),
  });
```

### 19.3. Ne váljon config explosionné

Ha sok példány csak adatban különbözik, lehet, hogy nem több service, hanem egy service és explicit operation input szükséges.

```ts
await notifier.notify({
  recipientRole: 'security',
});
```

A választás üzleti jelentését az application layernek kell birtokolnia.


---

<a id="section-20"></a>

## 20. Environment- és stage-specifikus wiring

A Symfony `when@dev` vagy `#[When]` mintájának megfelelője explicit composition selection.

```ts
type AppStage =
  | 'local'
  | 'development'
  | 'preview'
  | 'staging'
  | 'production';
```

```ts
export function createTelemetry(
  stage: AppStage,
  dependencies: TelemetryDependencies,
): Telemetry {
  switch (stage) {
    case 'local':
    case 'development':
      return new ConsoleTelemetry(
        dependencies.console,
      );

    case 'preview':
    case 'staging':
    case 'production':
      return new OpenTelemetryAdapter(
        dependencies.exporter,
      );
  }
}
```

### 20.1. `NODE_ENV` nem deployment stage

```text
NODE_ENV
  → development | production | test

APP_STAGE
  → local | development | preview |
    staging | production
```

Staging build is production módú:

```dotenv
NODE_ENV=production
APP_STAGE=staging
```

### 20.2. Ne legyen szétszórt branching

Nem ajánlott:

```ts
if (process.env.NODE_ENV === 'test') {
  // application service belsejében
}
```

A branch a composition/config boundaryn legyen.

### 20.3. Production graph invariáns

A production graph nem tartalmazhat véletlenül:

- console-only mockot;
- in-memory repositoryt;
- bypass authorizációt;
- permissive CORS adaptert;
- fake clockot;
- test credential providert.

Ezt graph check és environment matrix teszt ellenőrizze.


---

<a id="section-21"></a>

## 21. Capability-specifikus wiring

A Winzard capability deklarálja, hogy egy alkalmazás milyen strukturális képességet telepített.

Példa:

```json
{
  "schemaVersion": 1,
  "profile": "webapp",
  "capabilities": [
    "next-app",
    "forge",
    "modular-application",
    "prisma-postgresql",
    "database-readiness"
  ]
}
```

### 21.1. Capability és service graph

```text
prisma-postgresql
  → database config
  → Prisma adapter
  → database client
  → repository bindingok
```

```text
authentication
  → auth config
  → password/token adapter
  → actor resolver
  → auth policy
```

### 21.2. A capability nem runtime feature flag

Ha egy capability nincs telepítve:

- dependency nincs a package-ben;
- file nincs a projektben;
- config nem kötelező;
- graph binding nem létezik;
- Forge nem várja el.

Feature flag ezzel szemben meglévő kód runtime viselkedését választja.

### 21.3. Recipe contribution

Egy recipe deklarálhat:

```json
{
  "provides": [
    "prisma-postgresql"
  ],
  "requires": [
    "next-app",
    "forge"
  ],
  "files": [
    "src/platform/database/client.ts"
  ]
}
```

A jövőbeli composition generator a recipe contributiont statikus outputtá alakíthatja, de a generated wiring review-zható és drift-checkelt legyen.


---

<a id="section-22"></a>

## 22. Service eltávolítása és letiltása

Symfonyban service-definíció eltávolítható a containerből. Winzardban a service eltávolítása több explicit lépés.

### 22.1. Eltávolítási checklist

1. töröld vagy cseréld a composition bindingot;
2. távolítsd el a registryből;
3. távolítsd el a package exportból;
4. távolítsd el a recipe `provides` vagy `files` bejegyzését;
5. távolítsd el a config kulcsot;
6. frissítsd a capability manifestet;
7. töröld a dead adaptert;
8. futtasd a typechecket és graph checket;
9. frissítsd a dokumentációt és migration guide-ot.

### 22.2. Test environment

Testben nem „containerből kivesszük” a production service-t, hanem test compositiont építünk:

```ts
const application =
  createApplication({
    mailer: new RecordingMailer(),
    clock: new FixedClock(
      new Date('2026-07-19T10:00:00Z'),
    ),
  });
```

### 22.3. Disabled adapter

Ha egy dependency opcionális capability miatt nincs:

```ts
type SearchModule =
  | Readonly<{
      enabled: true;
      indexer: SearchIndexer;
    }>
  | Readonly<{
      enabled: false;
    }>;
```

Ez jobb, mint egy runtime `container.has('search')` hívás.

### 22.4. Deprecation

Egy service eltávolítása előtt:

- jelöld deprecatednek a publikus factoryt;
- adj replacementet;
- mérd a használatot;
- távolítsd el a deep importot;
- major változásnál migration guide szükséges.


---

<a id="section-23"></a>

## 23. Opcionális dependency

Az opcionális dependency nem jelent automatikusan `undefined` argumentumot.

### 23.1. Null Object

```ts
export class NoopAuditWriter
implements AuditWriter {
  async write(
    _event: AuditEvent,
  ): Promise<void> {}
}
```

Hasznos, ha a „nincs művelet” legitim és biztonságos.

### 23.2. Discriminated module

```ts
export type AuditModule =
  | Readonly<{
      enabled: true;
      writer: AuditWriter;
    }>
  | Readonly<{
      enabled: false;
    }>;
```

### 23.3. Optional provider

```ts
export type OptionalFeatureProvider<T> =
  () => T | null;
```

Csak akkor, ha a feature valóban későn oldódik fel.

### 23.4. Biztonsági dependency nem opcionális

Nem lehet opcionális:

- authorizáció;
- CSRF-védelem, ahol szükséges;
- tenant scope;
- audit, ha jogi követelmény;
- signature verification;
- encryption;
- transaction boundary.

### 23.5. Fail-open veszély

Tilos:

```ts
if (policy) {
  await policy.assertAllowed(actor);
}
```

ha a policy hiánya engedélyezést jelent. Biztonsági contractnál fail-closed kell.


---

<a id="section-24"></a>

## 24. Closure és függvény injektálása

A Symfony callable/closure injectionjének természetes TypeScript megfelelője a function type.

```ts
export type GenerateMessageHash =
  (message: string) => Promise<string>;
```

```ts
export class MessageGenerator {
  constructor(
    private readonly hash:
      GenerateMessageHash,
  ) {}

  async create(
    message: string,
  ): Promise<Readonly<{
    message: string;
    hash: string;
  }>> {
    return {
      message,
      hash: await this.hash(message),
    };
  }
}
```

Wiring:

```ts
const hash:
  GenerateMessageHash =
    (message) =>
      messageHashGenerator.generate(message);
```

### 24.1. Mikor jó a function injection?

- egyetlen művelet;
- egyszerű fake szükséges;
- nincs külön lifecycle;
- nincs több kapcsolódó metódus;
- nincs szükség identity-re vagy introspekcióra.

### 24.2. Captured state

Veszélyes:

```ts
let currentActor: Actor | null = null;

const authorize = () =>
  policy.check(currentActor);
```

A closure process-scope mutable state-et capture-öl.

Ajánlott:

```ts
const authorize = (
  actor: Actor,
  action: Action,
) => policy.check(actor, action);
```

### 24.3. Provider closure

```ts
export type GetClock =
  () => Clock;
```

A provider lifetime-jét dokumentálni kell:

- minden hívás új példány;
- memoized process instance;
- request-scoped instance;
- external lookup.

A function type önmagában ezt nem mondja meg.


---

<a id="section-25"></a>

## 25. Functional interface adapterek

A Symfony functional interface egyetlen named metódusú interface. TypeScriptben két fő forma van.

### 25.1. Function type

```ts
export type FormatMessage = (
  message: string,
  parameters:
    Readonly<Record<string, string>>,
) => string;
```

### 25.2. Objektuminterface

```ts
export interface MessageFormatter {
  format(
    message: string,
    parameters:
      Readonly<Record<string, string>>,
  ): string;
}
```

### 25.3. Adapter egy nagyobb service metódusára

```ts
export class MessageUtilities {
  format(
    message: string,
    parameters:
      Readonly<Record<string, string>>,
  ): string {
    // ...
    return message;
  }

  normalize(message: string): string {
    // ...
    return message;
  }
}
```

Function adapter:

```ts
const formatMessage:
  FormatMessage =
    utilities.format.bind(utilities);
```

Objektumadapter:

```ts
class MessageFormatterAdapter
implements MessageFormatter {
  constructor(
    private readonly utilities:
      MessageUtilities,
  ) {}

  format(
    message: string,
    parameters:
      Readonly<Record<string, string>>,
  ): string {
    return this.utilities.format(
      message,
      parameters,
    );
  }
}
```

### 25.4. `this` binding

Tilos egyszerűen átadni:

```ts
const formatter = utilities.format;
```

ha a metódus `this`-t használ. Használj `.bind()`-ot vagy explicit adaptert.

### 25.5. Structural typing

TypeScript strukturális típusossága miatt egy objektum explicit `implements` nélkül is megfelelhet egy portnak. A composition rootban a `satisfies` operátorral ellenőrizhető a registry vagy adapter shape:

```ts
const formatter = {
  format: (
    message: string,
    parameters:
      Readonly<Record<string, string>>,
  ) => interpolate(message, parameters),
} satisfies MessageFormatter;
```


---

<a id="section-26"></a>

## 26. Factory service-ek

A factory olyan function vagy object, amely konkrét dependency-kből service-példányt épít.

### 26.1. Tiszta factory

```ts
export type CreateMailerDependencies =
  Readonly<{
    config: SmtpMailerConfig;
    transport: SmtpTransport;
    logger: Logger;
  }>;

export function createMailer(
  dependencies:
    CreateMailerDependencies,
): Mailer {
  return new LoggingMailer(
    new SmtpMailer(
      dependencies.config,
      dependencies.transport,
    ),
    dependencies.logger,
  );
}
```

A factory előnye:

- a decorator sorrend egy helyen látható;
- testben külön dependency-k adhatók;
- a config parsing nincs az adapterben;
- a class constructor nem válik általános bootstrap-kóddá.

### 26.2. Factory object

```ts
export interface TenantRepositoryFactory {
  forTenant(
    tenantId: TenantId,
  ): ProductRepository;
}
```

Ez akkor indokolt, ha a runtime operationhöz tenant-specifikus adapter kell.

### 26.3. Factory és domain factory

A composition factory nem azonos a domain factoryval.

```text
Composition factory
  → service graphot épít

Domain factory
  → domain entityt vagy aggregate-et hoz létre
```

A domain factory nem importál infrastruktúra-adaptert.

### 26.4. Factory side effect

A factory lehetőleg konstrukciót végezzen. Nem indítson:

- adatbázis-migrációt;
- emailt;
- queue jobot;
- üzleti mutationt;
- távoli admin API-hívást.

Startup health probe vagy explicit initialize külön lépés legyen.


---

<a id="section-27"></a>

## 27. Async factoryk és inicializálás

Egyes adapterek aszinkron inicializálást igényelhetnek.

```ts
export async function createSearchClient(
  config: SearchConfig,
): Promise<SearchClient> {
  const client =
    new RemoteSearchClient(config);

  await client.initialize();

  return client;
}
```

### 27.1. Kétfázisú bootstrap

```ts
export async function initializeApplication(
  config: ServerConfig,
): Promise<ApplicationServices> {
  const search =
    await createSearchClient(config.search);

  return createApplication({
    search,
    // ...
  });
}
```

### 27.2. Top-level await

Top-level await használható ESM-ben, de NEM AJÁNLOTT alapértelmezett composition mintaként, mert:

- blokkolja a module evaluationt;
- bundler/runtime viselkedést bonyolít;
- tesztben importkor I/O-t indít;
- több runtime targetnél nehezebb;
- nehezen különíthető el a graph létrehozása és az alkalmazás indítása.

### 27.3. Lazy-connect client

Sok SDK constructor után csak első használatkor kapcsolódik. Ilyenkor elég lehet szinkron construction:

```ts
const client =
  new ExternalClient(config);
```

A dokumentáció rögzítse, hogy a connection:

```text
eager
lazy
pooled
per-operation
```

### 27.4. Initialization failure

Ha a kötelező adapter inicializálása hibázik:

- process-startkor fail-fast;
- readiness maradjon false;
- ne szolgáljon ki részlegesen hibás graph;
- a log redaktált config-contextet adjon;
- retry csak dokumentált, véges policyval történjen.


---

<a id="section-28"></a>

## 28. Provider és lazy dependency

Provider akkor indokolt, ha a dependency példányosítását késleltetni kell.

```ts
export type GetPdfRenderer =
  () => Promise<PdfRenderer>;
```

```ts
export class GenerateInvoicePdf {
  constructor(
    private readonly getRenderer:
      GetPdfRenderer,
  ) {}

  async execute(
    invoice: InvoiceDto,
  ): Promise<Uint8Array> {
    const renderer =
      await this.getRenderer();

    return renderer.render(invoice);
  }
}
```

### 28.1. Memoized provider

```ts
export function memoizeAsync<T>(
  create: () => Promise<T>,
): () => Promise<T> {
  let value: Promise<T> | undefined;

  return () => {
    value ??= create();
    return value;
  };
}
```

Használat:

```ts
const getPdfRenderer =
  memoizeAsync(
    () => createPdfRenderer(config),
  );
```

### 28.2. Hibás memoization

Ha az első Promise rejectel, a memoized provider minden későbbi híváskor ugyanazt a rejected Promise-t adja. Dönteni kell:

```text
failure memoized
vagy
retryval újraépíthető
```

### 28.3. Request-state

Process-scope provider nem cache-elhet request-specifikus:

- actort;
- tenantot;
- locale-t;
- abort signalt;
- cookie-t;
- request ID-t.

### 28.4. Provider mint rejtett locator

Ha egy service sok `getX()` providert kap, az rejtett service locator jele lehet. A provider csak valódi lazy/lifetime indokkal használható.


---

<a id="section-29"></a>

## 29. Lazy import és code splitting

A `import()` késleltetheti egy adapter module betöltését.

```ts
async function createPdfRenderer():
Promise<PdfRenderer> {
  const { ChromiumPdfRenderer } =
    await import(
      '@/platform/pdf/chromium-pdf-renderer'
    );

  return new ChromiumPdfRenderer(config);
}
```

### 29.1. Megengedett indok

- ritkán használt, nagy dependency;
- runtime-specifikus adapter;
- optional capability;
- cold-path admin funkció;
- native binding csak bizonyos környezetben.

### 29.2. Tilos dynamic path

```ts
await import(
  `./adapters/${userInput}`
);
```

Ez:

- bundler-függő;
- allowlist nélküli module selection;
- path traversal vagy unexpected code loading;
- nehezen auditálható.

Használj statikus mapet:

```ts
const factories = {
  chromium:
    () => import('./chromium-renderer'),
  remote:
    () => import('./remote-renderer'),
} as const;
```

### 29.3. Server Component lazy loading

A Next.js Server Component graph eleve code-split lehet, de a service lazy loading nem azonos a React UI lazy loadinggal. A composition service-t azért ne tedd `next/dynamic` alá, mert az UI API.

### 29.4. Lazy és reliability

A lazy dependency hibája runtime első használatkor jelentkezik. Kötelező capability-nél gyakran jobb startup validation vagy smoke test.


---

<a id="section-30"></a>

## 30. Service lifetime modell

A Symfony shared service alapértelmezetten ugyanazt a példányt adja vissza a containerből. Winzardban nincs egyetlen univerzális container-scope.

A támogatott lifetime-k:

| Lifetime | Példa | Konstrukció |
| --- | --- | --- |
| **value/static** | formatter config, route registry | module load vagy build |
| **process/module** | DB pool, HTTP client, stateless query | szerverinstance / module graph |
| **request** | RequestContext, child logger | request entrypoint |
| **operation/transient** | transaction scope, batch writer | query/command/job hívás |
| **external/durable** | queue, DB, object store | alkalmazáson kívüli erőforrás |

### 30.1. Kötelező lifetime-dokumentáció

Infrastructure service-nél legalább ezt rögzíteni kell:

```text
lifetime
thread/concurrency safety
request-state policy
connect behavior
cleanup behavior
retry behavior
serverless behavior
Edge compatibility
```

### 30.2. Lifetime mismatch

Tilos:

```text
process-scope service
  → request-scope mutable actor
```

Tilos:

```text
singleton repository
  mezőben tárolja
currentTenantId
```

Megengedett:

```ts
repository.findById({
  tenantId,
  productId,
});
```

A request state method inputként halad.


---

<a id="section-31"></a>

## 31. Process- és module-scope

ESM/Node module importok általában cache-eltek egy adott module loader és server instance keretében, ezért module-szinten létrehozott objektum sok request között megosztott lehet.

```ts
const httpClient =
  new ExternalHttpClient(config);

export const paymentGateway =
  new PaymentGateway(httpClient);
```

### 31.1. Biztonságos process-scope tulajdonságok

- immutable config;
- concurrency-safe client;
- stateless application service;
- connection pool;
- logger base instance;
- read-only registry;
- circuit breaker, ha concurrency-safe;
- cache, ha scope és invalidation helyes.

### 31.2. Tilos mutable request state

```ts
class UnsafeService {
  currentUser?: User;
  currentTenant?: string;
}
```

Ha az instance több request között megosztott, cross-request leak lehet.

### 31.3. A singleton nem globális deployment singleton

Module-scope instance lehet:

- processenként egy;
- worker threadenként egy;
- serverless instance-onként egy;
- Edge isolate-onként egy;
- dev hot reload alatt több vagy újraépített.

Nem szabad distributed uniquenessre használni.

### 31.4. Distributed coordination

Ezekhez külső, durable rendszer kell:

```text
globális lock
globális rate limit
leader election
idempotency
sequence
job ownership
session
distributed cache
```


---

<a id="section-32"></a>

## 32. Request-scope

A request-scope service egyetlen bejövő requesthez tartozik.

```ts
export type RequestServices =
  Readonly<{
    context: RequestContext;
    logger: Logger;
    authorization: AuthorizationFacade;
  }>;
```

Factory:

```ts
export function createRequestServices(
  context: RequestContext,
  application:
    ApplicationServices,
): RequestServices {
  return Object.freeze({
    context,
    logger:
      application.logger.child({
        requestId: context.requestId,
        tenantId: context.tenantId,
      }),
    authorization:
      new AuthorizationFacade(
        context.actor,
        application.policies,
      ),
  });
}
```

### 32.1. Page-ben

```ts
const context =
  await createRequestContext();

const requestServices =
  createRequestServices(
    context,
    application,
  );
```

### 32.2. Route Handlerben

A `Request`, route params, cookies és headers feldolgozása után készül.

### 32.3. Request factory nem építi újra az egész appot

Nem ajánlott requestenként:

- új PrismaClient;
- új DB pool;
- új telemetry exporter;
- új SDK base client;
- teljes registry újraszkennelése.

Request-scope csak a request-state wrapper réteget építi.

### 32.4. Isolation test

Párhuzamos requesteknél ellenőrizni kell, hogy:

```text
actor A ≠ actor B
tenant A ≠ tenant B
logger context nem keveredik
cache key tartalmazza a scope-ot
```


---

<a id="section-33"></a>

## 33. Operation- és transient scope

Transient service minden factory-híváskor új példány.

```ts
export function createImportSession(
  dependencies:
    ImportSessionDependencies,
): ImportSession {
  return new ImportSession(dependencies);
}
```

### 33.1. Használati esetek

- transaction-bound unit of work;
- batch import accumulator;
- stream parser;
- temporary file lease;
- one-shot encryption context;
- operation timer;
- idempotency reservation;
- request body decoder.

### 33.2. Non-shared service megfelelője

Symfonyban egy service lehet non-shared. Winzardban ez factory:

```ts
const createReportBuilder =
  (): ReportBuilder =>
    new ReportBuilder();
```

Ne exportálj kész instance-t, ha minden operationnek új state kell.

### 33.3. Mutable transient

Mutable state megengedhető, ha:

- nem kerül process registrybe;
- nem osztják meg requestek között;
- lifecycle-je egyértelmű;
- cleanup van;
- nem szivárog a Client Componentbe.

### 33.4. Transaction scope

```ts
await transactionManager.run(
  async (transaction) => {
    const repository =
      repositoryFactory.forTransaction(
        transaction,
      );

    await command.executeWith(
      repository,
      input,
    );
  },
);
```

A transaction object nem process-scope service.


---

<a id="section-34"></a>

## 34. Külső, durable erőforrások

A service instance és a külső erőforrás nem azonos.

```text
QueueClient object
  → process-local wrapper

Queue broker
  → durable external service
```

```text
PrismaClient object
  → process-local adapter/client

PostgreSQL
  → durable database
```

### 34.1. Következmény

Egy process-local singleton elveszhet új deploymentnél. Nem tárolhat olyan állapotot, amelynek túl kell élnie:

- restartot;
- scale-outot;
- cold startot;
- crash-t;
- régióváltást.

### 34.2. Durable state

Durable state helye:

- adatbázis;
- queue;
- object storage;
- external cache;
- workflow engine;
- audit store.

### 34.3. Client lifecycle

A client:

- connection poolt tarthat;
- retry policyt tartalmazhat;
- circuit state-et tarthat;
- credential rotationt támogathat.

Ezek process-lifetime tulajdonságok, de az external truth nem benne él.

### 34.4. Readiness

A graph sikeres létrehozása nem garantálja, hogy az external dependency elérhető. A readiness külön ellenőrzés.


---

<a id="section-35"></a>

## 35. Cleanup, disposal és shutdown

Egy service birtokolhat felszabadítandó erőforrást.

```ts
export interface DisposableService {
  close(): Promise<void>;
}
```

Példák:

- DB client;
- queue consumer;
- file watcher;
- browser process;
- telemetry exporter;
- worker pool.

### 35.1. Ownership

Csak az zárja be az erőforrást, aki létrehozta.

```text
composition root
  létrehozza
browser pool

composition root / worker host
  zárja be
browser poolt
```

Egy repository nem zárhatja be a megosztott DB poolt operation után.

### 35.2. Serverless korlát

A process shutdown callback nem garantált minden platformon. Durable üzleti correctness nem épülhet:

- `beforeExit`;
- `exit`;
- SIGTERM handler;
- finalizer;
- garbage collection

biztos lefutására.

### 35.3. Best-effort cleanup

Shutdown hook használható:

- telemetry flush;
- consumer stop;
- lokális process cleanup;
- tesztteardown.

De nem helyettesít:

- tranzakciót;
- durable outboxot;
- lease timeoutot;
- idempotenciát.

### 35.4. Teszt

Integration test KÖTELEZŐEN hívja a fixture `close()` metódusát, hogy ne maradjon nyitott handle.


---

<a id="section-36"></a>

## 36. Private és public service-ek

Symfonyban a private service nem kérhető le közvetlenül a containerből. Winzardban a public/private határ modul- és package-export.

### 36.1. Private implementation

```text
src/modules/catalog/product/
  infrastructure/
    prisma-product-repository.ts
  index.server.ts
```

`index.server.ts`:

```ts
export type {
  ProductDetailDto,
} from './application/dto/product-detail.dto';

export type {
  GetProductResult,
} from './application/queries/get-product';
```

Az adapter nincs exportálva a modul publikus entrypointján.

### 36.2. Composition import

A composition root importálhat belső adaptert, ha ugyanazon alkalmazás belső module boundaryje ezt engedi.

### 36.3. Delivery public API

A delivery csak ezt látja:

```ts
import {
  catalogModule,
} from '@/composition/catalog.server';
```

Nem látja:

- Prisma adaptert;
- raw DB clientet;
- config secretet;
- transaction internalt;
- registry mutatort.

### 36.4. TypeScript `private`

A class `private` mező nem helyettesíti a package/module encapsulationt. A public service fogalma export surface-ről szól.


---

<a id="section-37"></a>

## 37. Package exportok mint encapsulation

Külön package esetén a `package.json#exports` definiálja a publikus entrypointokat.

```json
{
  "name": "@acme/catalog",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/index.server.js",
    "./contracts": "./dist/contracts.js"
  }
}
```

Nem exportált subpath nem része a támogatott API-nak.

### 37.1. Server/client export

Lehetséges:

```text
@acme/catalog/contracts
  → server- és client-safe typeok

@acme/catalog/server
  → server-only composition és adapter API
```

### 37.2. Deep import tiltása

Nem támogatott:

```ts
import {
  PrismaProductRepository,
} from '@acme/catalog/dist/internal/...';
```

### 37.3. Semver

Public export változása:

- removal → breaking;
- signature change → breaking;
- új optional export → általában minor;
- internal adapter változása → nem publikus, ha nincs exportálva.

### 37.4. Encapsulation korlát

A package exports erős importfelületi contractot ad, de nem security sandbox. Az abszolút filesystem hozzáférés más kérdés.


---

<a id="section-38"></a>

## 38. Service locator anti-pattern

Általános locator:

```ts
interface Container {
  get<T>(id: string): T;
  has(id: string): boolean;
}
```

Application service-ben:

```ts
export class Checkout {
  constructor(
    private readonly container:
      Container,
  ) {}

  async execute() {
    const repository =
      this.container.get<ProductRepository>(
        'productRepository',
      );
  }
}
```

TILOS alapminta.

### 38.1. Miért problémás?

- dependency rejtett;
- runtime stringhiba;
- service bármit lekérhet;
- teszt mock containerre szorul;
- lifecycle nem látható;
- graph statikus elemzése nehéz;
- application és infrastructure összemosódik;
- privilege escalation lehet, ha privileged service elérhető.

### 38.2. Globális import mint locator

Ez is rejtett locator-szerű:

```ts
import {
  services,
} from '@/composition/application.server';

services.get('anything');
```

### 38.3. Container access deliveryben

Még Page-ben sem ajánlott:

```ts
container.get(GetProduct);
```

Helyette szemantikus composition export:

```ts
catalogModule.queries.getProduct;
```

### 38.4. Framework internals

Egy third-party library használhat saját containert. Az application kód csak adapteren keresztül érje el.


---

<a id="section-39"></a>

## 39. Szűk registry és kontrollált lookup

Registry akkor elfogadható, ha a lookup az üzleti vagy technikai contract része, és a halmaz zárt.

Példa serializer registry:

```ts
type Format =
  | 'json'
  | 'csv'
  | 'xml';

export interface Serializer {
  serialize(value: unknown): string;
}
```

```ts
const serializers = {
  json: jsonSerializer,
  csv: csvSerializer,
  xml: xmlSerializer,
} satisfies Record<Format, Serializer>;
```

```ts
export function serializerFor(
  format: Format,
): Serializer {
  return serializers[format];
}
```

### 39.1. Registry feltételek

- zárt key union;
- explicit type;
- immutable map;
- duplikáció compile-time vagy startup error;
- nincs tetszőleges service access;
- nincs privileged graph leakage;
- input validation a lookup előtt.

### 39.2. `Map` vagy object

Untrusted string key esetén:

```ts
const registry =
  new Map<Format, Serializer>();
```

elkerülheti az object prototype kulcsok problémáját.

### 39.3. Service subscriber megfelelője

Egy narrow subscriber contract:

```ts
export interface ExportServices {
  serializerFor(format: Format): Serializer;
}
```

jobb, mint a globális container.

### 39.4. Lazy registry

A registry értéke lehet factory:

```ts
type SerializerProvider =
  () => Promise<Serializer>;
```

A lifecycle és budget akkor is explicit.


---

<a id="section-40"></a>

## 40. Többes binding és service collection

Egy porthoz több service egyidejűleg tartozhat.

Példa validation rule:

```ts
export interface ProductRule {
  readonly id: string;
  check(
    product: ProductCandidate,
  ): readonly RuleViolation[];
}
```

Registry:

```ts
const productRules = [
  requiredNameRule,
  priceRangeRule,
  uniqueSkuRule,
] as const satisfies readonly ProductRule[];
```

Injection:

```ts
export class ValidateProduct {
  constructor(
    private readonly rules:
      readonly ProductRule[],
  ) {}
}
```

### 40.1. Immutable collection

A collection `readonly`.

### 40.2. Duplicate ID

Startup vagy test:

```ts
function assertUniqueRuleIds(
  rules: readonly ProductRule[],
): void {
  const seen = new Set<string>();

  for (const rule of rules) {
    if (seen.has(rule.id)) {
      throw new Error(
        `Duplicate product rule: ${rule.id}`,
      );
    }

    seen.add(rule.id);
  }
}
```

### 40.3. Collection ownership

A registryt az a module composition birtokolja, amely a rules halmazát definiálja.

### 40.4. Runtime plugin

Tetszőleges runtime plugin discovery nem része az alapnak. Külső pluginhoz:

- signed package;
- allowlist;
- compatibility manifest;
- sandbox;
- explicit installation;
- restart/build

szükséges lehet.


---

<a id="section-41"></a>

## 41. Tagelt service-ek Winzard-megfelelője

A Symfony tag-ekkel service-eket kategorizál és gyűjt. Winzardban a megfelelője explicit vagy generált typed registry.

### 41.1. Explicit tag registry

```ts
export const commandHandlers = [
  createProductHandler,
  updateProductHandler,
  archiveProductHandler,
] as const satisfies
  readonly ProductCommandHandler[];
```

### 41.2. Metadata

```ts
export type HandlerDefinition =
  Readonly<{
    command: ProductCommandType;
    priority: number;
    handler: ProductCommandHandler;
  }>;
```

```ts
export const handlers = [
  {
    command: 'product.create',
    priority: 100,
    handler: createProductHandler,
  },
] satisfies readonly HandlerDefinition[];
```

### 41.3. Marker interface runtime korlát

TypeScript interface runtime nincs jelen. Ezért nem lehet megbízhatóan:

```text
keresd meg az összes class-t,
amely implementálja az X interface-t
```

runtime reflection nélkül.

### 41.4. Generált registry

Forge később statikusan generálhat:

```text
src/generated/composition/
  product-command-handlers.ts
```

A generated file:

- determinisztikus;
- review-zható;
- hash-elt;
- drift-checkelt;
- nem runtime filesystem scan;
- forrásmanifesztből készül.


---

<a id="section-42"></a>

## 42. Prioritás és determinisztikus sorrend

Többes bindingnál a sorrend contract.

```ts
type Prioritized<T> =
  Readonly<{
    id: string;
    priority: number;
    service: T;
  }>;
```

```ts
export function orderServices<T>(
  definitions:
    readonly Prioritized<T>[],
): readonly T[] {
  return [...definitions]
    .sort((left, right) =>
      right.priority - left.priority ||
      left.id.localeCompare(right.id))
    .map(({ service }) => service);
}
```

### 42.1. Tie-breaker

Azonos priority esetén stabil secondary order kell. A filesystem enumeration sorrendje nem contract.

### 42.2. Priority tartomány

Ajánlott dokumentálni:

```text
1000+ framework/security
500 application default
100 extension
0 fallback
negative post-processing
```

Ne használj véletlenszerű, dokumentálatlan számokat.

### 42.3. Pipeline order

Példa:

```text
authentication
→ authorization
→ rate limit
→ validation
→ transaction
→ application operation
→ audit
```

A decorator vagy interceptor sorrend biztonsági jelentőségű.

### 42.4. Cycle és duplicate

A registry check jelezze:

- duplicate ID;
- duplicate exclusive command;
- hiányzó fallback;
- két default implementation;
- nem determinisztikus order.


---

<a id="section-43"></a>

## 43. Decorator és interceptor composition

Decorator ugyanazt a portot implementálja, mint a wrapelt service.

```ts
export class LoggingProductRepository
implements ProductRepository {
  constructor(
    private readonly next:
      ProductRepository,
    private readonly logger:
      Logger,
  ) {}

  async save(
    product: Product,
  ): Promise<void> {
    const startedAt =
      performance.now();

    try {
      await this.next.save(product);
    } finally {
      this.logger.info(
        'product.repository.save',
        {
          durationMs:
            performance.now() - startedAt,
        },
      );
    }
  }
}
```

Wiring:

```ts
const repository: ProductRepository =
  new LoggingProductRepository(
    new CachedProductRepository(
      new PrismaProductRepository(db),
      cache,
    ),
    logger,
  );
```

### 43.1. Sorrend

```text
Logging(Caching(Database))
```

nem ugyanaz, mint:

```text
Caching(Logging(Database))
```

Az első a cache hitet is logolhatja; a második csak a DB-hívást.

### 43.2. Decorator contract

- ugyanaz a port;
- input/output szemantika megmarad;
- error mapping dokumentált;
- cancellation továbbadódik;
- transaction context továbbadódik;
- security nem kerülhető meg;
- retry csak idempotens operation köré kerül.

### 43.3. Interceptor

Delivery vagy operation interceptor külön contract lehet:

```ts
export type OperationInterceptor =
  <T>(
    next: () => Promise<T>,
    context: OperationContext,
  ) => Promise<T>;
```

A pipeline explicit listából készül.


---

<a id="section-44"></a>

## 44. Autowiring Winzardban

Symfony autowiring runtime/compile-time container metaadatából constructor type-hinthez service-t választ.

Winzard alapértelmezése:

> **TypeScript ellenőrzi, hogy a factory a constructorhoz kompatibilis argumentumokat ad, de nem választ automatikusan runtime implementációt egy interface alapján.**

### 44.1. Mi működik automatikusan?

```ts
new GetProduct(repository);
```

A compiler ellenőrzi, hogy `repository` strukturálisan megfelel-e a `ProductReadRepository` portnak.

### 44.2. Mi nem működik automatikusan?

TypeScript nem tudja runtime:

- megtalálni az összes interface-implementációt;
- eldönteni, melyik az alapértelmezett;
- példányosítani egy interface-t;
- scalart név alapján feloldani;
- lifetime-ot választani;
- environment bindingot meghatározni.

### 44.3. Winzard „autowire” célmodell

Egy későbbi generator:

1. explicit manifestet olvas;
2. csak concrete class/factory exportokat használ;
3. port-bindingokat deklarációból old fel;
4. ambiguity esetén hibázik;
5. TypeScript composition source-ot generál;
6. nem runtime containert generál;
7. outputját typecheck és graph check validálja.

### 44.4. Convention határ

Konvenció lehet:

```text
src/modules/*/*/composition.ts
```

de a konvenció nem találhat ki business bindingot pusztán classnévből.


---

<a id="section-45"></a>

## 45. Autoconfiguration Winzardban

Symfony autoconfiguration interface vagy attribute alapján tag-eket ad service-ekhez.

TypeScriptben az interface runtime eltűnik. Winzardban három biztonságosabb megoldás van.

### 45.1. Explicit registry

```ts
export const eventHandlers = [
  sendWelcomeEmail,
  indexNewProduct,
] satisfies readonly DomainEventHandler[];
```

### 45.2. Deklaratív manifest

```ts
export const handlerDefinition = {
  id: 'catalog.product.created.search-index',
  event: 'catalog.product.created',
  priority: 100,
  factory: createIndexProductHandler,
} satisfies EventHandlerDefinition;
```

### 45.3. Build-time generation

Forge összegyűjtheti a deklarált definition exportokat, majd generált registryt készíthet.

### 45.4. Nem támogatott alap

- runtime decorator reflection;
- `emitDecoratorMetadata`-ra épített container;
- teljes source tree runtime scan;
- naming conventionből automatikus privileged handler;
- implicit security policy registration.

### 45.5. Explicit security

Auth handler, policy vagy webhook verifier autoconfigurationja csak explicit manifest és human-review mellett történhet.


---

<a id="section-46"></a>

## 46. Resource-alapú tömeges regisztráció

Symfony `resource` globbal sok osztályt service-ként regisztrál.

Winzardban a teljes `src/**` automatikus service-regisztráció NEM AJÁNLOTT.

### 46.1. Miért?

A `src/` tartalmazhat:

- domain entityt;
- DTO-t;
- React komponenst;
- Zod schemát;
- migration helper-t;
- test fixture-t;
- Client Componentet;
- generated code-ot;
- server-only adaptert.

Nem mind service.

### 46.2. Build-time glob

Tooling build-time használhat globot explicit célra:

```text
src/modules/**/composition.definition.ts
```

Nem:

```text
src/**/*.ts
```

### 46.3. Exclude

Ha generator van, kötelező exclude:

```text
**/*.test.ts
**/*.spec.ts
**/*.client.tsx
**/generated/**
**/domain/**
**/dto/**
```

De az exclude-lista sem helyettesíti az explicit manifestet.

### 46.4. Runtime scan tiltása

Serverless/Edge/bundled környezetben runtime filesystem scan:

- hiányzó file-okkal találkozhat;
- bundle-on kívüli pathra mutathat;
- cold startot növel;
- sorrendje nem stabil;
- security review-t nehezít.


---

<a id="section-47"></a>

## 47. Statikus registry és generált index

Ajánlott generated registry:

```ts
// generated file
import {
  createProductHandler,
} from '@/modules/catalog/product/composition/create-product-handler.definition';

import {
  updateProductHandler,
} from '@/modules/catalog/product/composition/update-product-handler.definition';

export const productHandlers = [
  createProductHandler,
  updateProductHandler,
] as const;
```

### 47.1. Generated header

```ts
// Generated by Winzard Forge.
// Source contract version: 1.
// Do not edit directly.
```

### 47.2. Drift

A `--check` mód:

1. memóriában újragenerál;
2. összehasonlítja a repository outputtal;
3. diff esetén hibázik;
4. nem módosít CI-ben.

### 47.3. Source manifest

A generated registry source hash-eket tartalmazhat:

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "path": "src/modules/catalog/...",
      "sha256": "..."
    }
  ]
}
```

### 47.4. Generated output nem autoritás

A javítás a definitionben vagy generatorban történik, nem a generated registryben.


---

<a id="section-48"></a>

## 48. Explicit wiring és named service-ek

Az explicit wiring a legpontosabb megoldás, amikor:

- ugyanaz a class több konfigurációval kell;
- több implementáció közül választunk;
- decorator stack van;
- security-sensitive binding van;
- lifecycle eltér;
- async initialization van.

Példa:

```ts
export function createCatalogModule(
  dependencies:
    CatalogCompositionDependencies,
): CatalogModule {
  const primaryProducts =
    new PrismaProductRepository(
      dependencies.database,
    );

  const cachedProducts =
    new CachedProductRepository(
      primaryProducts,
      dependencies.cache,
    );

  const auditedProducts =
    new AuditedProductRepository(
      cachedProducts,
      dependencies.audit,
    );

  return Object.freeze({
    queries: Object.freeze({
      getProduct:
        new GetProduct(auditedProducts),
    }),
    commands: Object.freeze({
      createProduct:
        new CreateProduct(
          auditedProducts,
          dependencies.transactions,
          dependencies.events,
        ),
    }),
  });
}
```

### 48.1. Named factory export

```ts
export declare function
createProductionCatalogModule():
CatalogModule;

export declare function
createTestCatalogModule():
CatalogModule;
```

### 48.2. Ne duplikáld a graphot

A test factory közös core factoryt hívjon explicit override-okkal, ne másolja át a teljes production wiringot.


---

<a id="section-49"></a>

## 49. Argumentumbinding név vagy típus alapján

Symfony `bind` név vagy típus alapján globálisabb argumentumértéket adhat.

Winzard nem támogat implicit parameter-name injectiont.

### 49.1. Miért nem?

```ts
class SiteUpdateManager {
  constructor(
    private readonly adminEmail:
      string,
  ) {}
}
```

A runtime factory nem kap TypeScript paraméternevet stabil contractként:

- minification/bundling módosíthat;
- refaktorálás rejtett bindingot törhet;
- több azonos string dependency van;
- semantic ownership gyenge.

### 49.2. Explicit named config

```ts
type SiteUpdateManagerConfig =
  Readonly<{
    adminEmail: string;
  }>;
```

### 49.3. Type-based binding

A port type compile-time contract:

```ts
const mailer: Mailer =
  new SmtpMailer(config);
```

De a TypeScript nem választja ki automatikusan az implementációt.

### 49.4. Shared default

Közös config factory:

```ts
export function createDefaultMailerConfig(
  environment: MailEnvironment,
): SmtpMailerConfig {
  return {
    host: environment.MAIL_HOST,
    port: environment.MAIL_PORT,
    // ...
  };
}
```

### 49.5. Binding override

Egy konkrét service factory explicit felülírhat:

```ts
createMailer({
  ...defaultConfig,
  timeoutMs: 2_000,
});
```

A spread használatakor secret és immutable contract továbbra is auditálandó.


---

<a id="section-50"></a>

## 50. Absztrakt és később biztosított argumentumok

Symfony abstract argument placeholdert használhat compiler pass által később kitöltött értékhez.

Winzardban a placeholder helyett a factory signature legyen hiánytalan.

```ts
export type ModuleMetadata =
  Readonly<{
    rootNamespace: string;
  }>;

export function createModuleService(
  metadata: ModuleMetadata,
): ModuleService {
  return new ModuleService(
    metadata.rootNamespace,
  );
}
```

Ha nincs metadata, a service nem hozható létre.

### 50.1. `undefined as unknown as T` tilos

```ts
new ModuleService(
  undefined as unknown as string,
);
```

Ez elrejti a graph hibát.

### 50.2. Generator-provided value

Ha Forge generál értéket:

```ts
import {
  generatedModuleMetadata,
} from '@/generated/composition/module-metadata';
```

A generated file:

- schema-validált;
- deterministic;
- drift-checkelt;
- build előtt előállított.

### 50.3. Startup-provided value

Runtime platform biztosíthat dependency-t:

```ts
export function bootstrap(
  platform: PlatformDependencies,
): ApplicationServices {
  return createApplication(platform);
}
```

A `PlatformDependencies` kötelező mezői compile-time láthatók.

### 50.4. Fail-fast

Ha egy required binding nincs:

```text
composition build
→ error
→ process nem lesz ready
```

Nem szabad első business requestig halasztani.


---

<a id="section-51"></a>

## 51. Synthetic és bootstrap-provided dependency

A Symfony synthetic service olyan service lehet, amelyet a container később kívülről kap meg. Winzard megfelelője az explicit bootstrap argumentum.

```ts
export type PlatformDependencies =
  Readonly<{
    database: PrismaClient;
    logger: Logger;
    metrics: Metrics;
    secrets: SecretReader;
  }>;
```

```ts
export function createApplication(
  platform: PlatformDependencies,
): ApplicationServices {
  const catalog =
    createCatalogModule({
      database: platform.database,
      logger: platform.logger,
      metrics: platform.metrics,
    });

  return Object.freeze({
    catalog,
  });
}
```

### 51.1. Használati esetek

- hosting platform ad SDK-klienst;
- tesztharness ad in-memory dependency-t;
- worker host ad queue message contextet;
- custom runtime ad lifecycle managert;
- embedded alkalmazás ad transportot.

### 51.2. Kötelező invariáns

A bootstrap dependency:

- explicit type-ban szerepel;
- construction előtt validált;
- nem változik csendben runtime;
- ownership és cleanup dokumentált;
- tesztben helyettesíthető.

### 51.3. Nem globális setter

Tilos:

```ts
setDatabaseClient(client);
```

majd később implicit `getDatabaseClient()`.

Ez order-dependent, mutable globális állapot.

### 51.4. Late binding

Ha valódi late binding kell, explicit state machine szükséges:

```text
uninitialized
→ initializing
→ ready
→ failed
→ closing
→ closed
```

Normál webalkalmazásnál egyszerűbb a fail-fast bootstrap.


---

<a id="section-52"></a>

## 52. Ciklikus függőségek

Példa ciklus:

```text
OrderService
  → PaymentService
  → OrderService
```

Ez rendszerint felelősséghatár-hiba.

### 52.1. Feloldási stratégiák

#### Orchestrator

```text
CheckoutOrchestrator
  → OrderService
  → PaymentService
```

A két service nem függ egymástól.

#### Domain event

```text
OrderPlaced
  → payment handler
```

#### Kisebb port

A PaymentService nem teljes OrderService-t kap, hanem:

```ts
export interface OrderPaymentState {
  markPaymentAuthorized(
    orderId: OrderId,
  ): Promise<void>;
}
```

#### Query/command szétválasztás

Egyik oldal csak read portot kap.

### 52.2. Providerrel elrejtett ciklus

```ts
() => orderService
```

technikailag megtörheti a construction ciklust, de az architekturális ciklus megmarad. Csak valódi lazy runtime relationship esetén elfogadható.

### 52.3. Module cycle

Import cycle és service cycle külön. Mindkettőt ellenőrizni kell.

### 52.4. Graph check

Célhiba:

```text
COMPOSITION_CYCLE
```

A hiba mutassa a teljes láncot:

```text
A → B → C → A
```


---

<a id="section-53"></a>

## 53. Constructor side effectek

Constructor lehetőleg csak validáljon és mezőket állítson be.

Nem ajánlott constructorban:

- hálózati kapcsolat;
- adatbázis query;
- file write;
- email;
- metrics export;
- queue subscription;
- timer;
- process event listener;
- business mutation.

### 53.1. Miért?

Az import vagy graph construction:

- build során is lefuthat;
- teszt collectionkor lefuthat;
- hot reloadkor ismétlődhet;
- több server instance-on lefuthat;
- partial failure-t okozhat.

### 53.2. Explicit `start`

```ts
export interface StartableService {
  start(): Promise<void>;
}
```

```ts
const consumer =
  new QueueConsumer(config);

await consumer.start();
```

A host birtokolja a start/stop lifecycle-t.

### 53.3. Library lazy connect

Ha egy SDK constructor side effectmentes és első operationkor kapcsolódik, ezt dokumentálni kell.

### 53.4. Validation constructorban

Megengedett:

```ts
if (timeoutMs <= 0) {
  throw new RangeError(
    'timeoutMs must be positive.',
  );
}
```

Nem megengedett:

```ts
async function unsafeConstructorWork():
Promise<void> {
  await fetch(
    'https://example.invalid',
  );
}
```

constructorban, ami JavaScriptben amúgy sem lehet közvetlenül async.


---

<a id="section-54"></a>

## 54. Node.js és Edge adapterválasztás

Egy portnak lehet Node és Edge kompatibilis adaptere.

```ts
export interface RandomBytes {
  generate(length: number):
    Promise<Uint8Array>;
}
```

Node:

```ts
import 'server-only';

import { randomBytes } from 'node:crypto';

export class NodeRandomBytes
implements RandomBytes {
  async generate(
    length: number,
  ): Promise<Uint8Array> {
    return randomBytes(length);
  }
}
```

Web Crypto:

```ts
export class WebCryptoRandomBytes
implements RandomBytes {
  async generate(
    length: number,
  ): Promise<Uint8Array> {
    const bytes =
      new Uint8Array(length);

    crypto.getRandomValues(bytes);

    return bytes;
  }
}
```

### 54.1. Runtime factory

```ts
export function createRandomBytes(
  runtime: 'nodejs' | 'edge',
): RandomBytes {
  return runtime === 'nodejs'
    ? new NodeRandomBytes()
    : new WebCryptoRandomBytes();
}
```

### 54.2. Static import veszély

Ha Edge bundle importál `node:` modult, build vagy runtime hiba lehet. Conditional dynamic import és package conditional export használható.

### 54.3. Capability matrix

Minden adapter dokumentálja:

```text
nodejs
edge
browser
worker
test
```

kompatibilitását.

### 54.4. Delivery deklaráció

Route runtime és composition binding legyen összhangban:

```ts
export const runtime = 'nodejs';
```

Node-only dependency mellett.


---

<a id="section-55"></a>

## 55. Server és Client Component határ

A composition root szerveroldali.

Client Component nem importálhat:

- composition rootot;
- application service instance-t;
- infrastruktúra-adaptert;
- database clientet;
- secret configot;
- Node.js API-t;
- `server-only` modult.

### 55.1. Helyes adatút

```text
Server Component / Route Handler / Server Action
  → application service
  → DTO
  → Client Component props
```

### 55.2. Tilos

```tsx
'use client';

import {
  catalogModule,
} from '@/composition/catalog.server';
```

A `server-only` buildhatárnak ezt meg kell fognia.

### 55.3. Client service-ek

A böngészőnek lehet saját service graphja:

```text
analytics client
browser storage adapter
UI state machine
client API adapter
feature telemetry
```

Ezek külön `client-only` entrypointból származnak.

### 55.4. Shared contract

Kliens és szerver oszthat:

- DTO typeot;
- schema biztonságos részét;
- route buildert;
- pure formattert;
- enumot.

Nem oszthat secretet vagy privileged adaptert.

### 55.5. Provider component

React Context Provider UI-state-hez használható, de nem szerveroldali DI container.


---

<a id="section-56"></a>

## 56. RequestContext és AsyncLocalStorage

A business dependency-k explicit inputként haladjanak.

```ts
await command.execute({
  context,
  input,
});
```

### 56.1. AsyncLocalStorage megengedett szerepe

Node.js `AsyncLocalStorage` használható technikai korrelációhoz:

- request ID;
- trace ID;
- log context;
- metric correlation.

```ts
type CorrelationContext =
  Readonly<{
    requestId: string;
    traceId?: string;
  }>;
```

### 56.2. Nem elsődleges business context

Nem ajánlott kizárólag AsyncLocalStorage-ból olvasni:

- actort;
- tenantot;
- permissiont;
- locale-t;
- transactiont;
- idempotency keyt.

Ez rejtett dependency és context loss esetén biztonsági hibát okozhat.

### 56.3. Explicit + ambient

Megengedett kompromisszum:

```text
business input
  → explicit RequestContext

logger correlation
  → AsyncLocalStorage
```

### 56.4. Test

A service unit tesztje ne igényeljen ambient context bootstrapot, ha business logikát tesztel.

### 56.5. Edge

AsyncLocalStorage Node-specific lehet. Runtime adapter szükséges.


---

<a id="section-57"></a>

## 57. Hot reload, module cache és fejlesztői singletonok

Fejlesztésben a Next.js hot reload module-okat újraértékelhet. Ez több client/pool példányt hozhat létre.

Adatbáziskliensnél gyakori development cache:

```ts
const globalDatabase =
  globalThis as unknown as {
    database?: PrismaClient;
  };

export const database =
  globalDatabase.database ??
  new PrismaClient(/* ... */);

if (
  process.env.NODE_ENV !== 'production'
) {
  globalDatabase.database =
    database;
}
```

### 57.1. Korlátozott használat

A `globalThis` cache csak:

- development connection leak megelőzésre;
- concurrency-safe, process-scoped clienthez;
- explicit, jól dokumentált keyvel

használható.

### 57.2. Nem általános container

Tilos:

```ts
globalThis.services = {
  actor,
  tenant,
  commands,
  // ...
};
```

### 57.3. Version drift

Hot reload után régi és új class instance keveredhet. A development cache-ben csak stabil SDK clientet tarts, application service graphot inkább építs újra.

### 57.4. Teszt izoláció

Vitest module cache reset és process-global cache tisztítás külön fixture helperrel történjen.


---

<a id="section-58"></a>

## 58. Serverless és többpéldányos működés

Egy deployment több izolált service graphot tartalmazhat:

```text
instance A
  → graph A

instance B
  → graph B

instance C
  → graph C
```

### 58.1. Nincs cluster-wide singleton

Module-scope instance nem:

- globális lock;
- globális cache truth;
- unique scheduler;
- distributed counter;
- singleton consumer;
- shared session store.

### 58.2. Cold start

Graph construction cold start része lehet. Kerülendő:

- runtime filesystem scan;
- szükségtelen SDK initialization;
- nagy registry reflection;
- blocking remote config minden importkor;
- migration;
- nagy JSON graph parse.

### 58.3. Warm reuse

Egy instance több requestet szolgálhat ki. Ezért request state nem maradhat service mezőben.

### 58.4. Scale-to-zero

A process-local cache és in-memory event bus elveszhet.

### 58.5. Multi-version deployment

Rolling deploymentnél régi és új graph egyszerre élhet. Külső contractok backward compatible-ek legyenek.


---

<a id="section-59"></a>

## 59. Startup-validáció és instrumentation

A Next.js `instrumentation.ts` `register()` hookja server instance induláskor, requestek előtt futhat.

```ts
export async function register():
Promise<void> {
  if (
    process.env.NEXT_RUNTIME !==
    'nodejs'
  ) {
    return;
  }

  const {
    validateApplicationComposition,
  } = await import(
    './src/composition/validate.server'
  );

  await validateApplicationComposition();
}
```

### 59.1. Mit validáljon?

- kötelező config;
- capability manifest;
- registry duplicate;
- adapter runtime compatibility;
- graph fingerprint;
- required external SDK construction;
- health contract konfiguráció.

A Node `instrumentation.ts` startup smoke csak `nodejs` és `universal` rootokat importálhat. Az Edge-only rootok a statikus graph-, runtime- és production build-ellenőrzésben validálódnak, de nem kerülhetnek be a Node startup module graphba.

### 59.2. Mit ne végezzen?

- migration;
- seed;
- business mutation;
- durable job;
- minden adat teljes beolvasása;
- hosszú, korlátlan remote retry;
- secret logolása.

### 59.3. Instance scope

A `register()` server instance-onként fut. Nem cluster-wide once.

### 59.4. Readiness

Startup validation és readiness külön:

```text
graph valid
≠
minden external dependency él
```

### 59.5. Build-time

Ne feltételezd, hogy minden runtime secret build során elérhető.


---

<a id="section-60"></a>

## 60. Composition graph lint és diagnosztika

A Symfony `lint:container` megfelelője több ellenőrzésből áll.

### 60.1. Alap repository-ellenőrzések

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm forge check --project .
pnpm verify:composition
pnpm build
```

### 60.2. Implementált composition-diagnosztika

```bash
pnpm forge composition:list
pnpm forge composition:inspect catalog
pnpm forge composition:graph
pnpm forge composition:check
pnpm forge composition:why ProductRepository
pnpm forge composition:docs
```

### 60.3. `composition:list`

Megjelenítheti:

```text
service ID
port
implementation
lifetime
module
runtime
public/private
decorators
source
```

### 60.4. `composition:inspect`

Egy service:

```text
constructor dependencies
factory
selected binding
decorator chain
registries
config keys
lifetime
consumers
```

### 60.5. `composition:why`

Megmutatja, miért van a graphban:

```text
Page
→ catalogModule
→ GetProduct
→ ProductReadRepository
→ Prisma adapter
```

### 60.6. Redakció

Diagnosztika nem írhat:

- secret value-t;
- database URL credentialt;
- token payloadot;
- private keyt;
- customer data-t.


---

<a id="section-61"></a>

## 61. Graph invariánsok és hibakódok

A későbbi Forge check legalább az alábbi invariánsokat ellenőrizze.

### 61.1. Binding

```text
COMPOSITION_BINDING_MISSING
COMPOSITION_BINDING_AMBIGUOUS
COMPOSITION_DUPLICATE_SERVICE_ID
COMPOSITION_UNKNOWN_SERVICE_REFERENCE
```

### 61.2. Dependency irány

```text
COMPOSITION_APPLICATION_IMPORTS_ADAPTER
COMPOSITION_DOMAIN_IMPORTS_PLATFORM
COMPOSITION_DELIVERY_IMPORTS_DATABASE
COMPOSITION_CLIENT_IMPORTS_SERVER
COMPOSITION_SERVICE_LOCATOR_USAGE
```

### 61.3. Lifetime

```text
COMPOSITION_LIFETIME_MISMATCH
COMPOSITION_REQUEST_STATE_IN_SINGLETON
COMPOSITION_TRANSIENT_EXPORTED_AS_SHARED
COMPOSITION_UNDECLARED_DISPOSAL
```

### 61.4. Graph

```text
COMPOSITION_CYCLE
COMPOSITION_REGISTRY_DUPLICATE
COMPOSITION_ORDER_NONDETERMINISTIC
COMPOSITION_DECORATOR_CONTRACT_INVALID
```

### 61.5. Runtime

```text
COMPOSITION_NODE_ADAPTER_IN_EDGE
COMPOSITION_BROWSER_ADAPTER_ON_SERVER
COMPOSITION_MISSING_SERVER_ONLY
```

### 61.6. Config

```text
COMPOSITION_CONFIG_MISSING
COMPOSITION_SECRET_EXPOSED
COMPOSITION_PARAMETER_BAG_USAGE
COMPOSITION_PROCESS_ENV_OUTSIDE_BOUNDARY
```

### 61.7. Severity

- security leak → error;
- missing binding → error;
- lifecycle mismatch → error;
- overly broad public export → warning vagy policy szerint error;
- unused service → warning;
- expensive eager service → performance warning.


---

<a id="section-62"></a>

## 62. Tesztelési stratégia

### 62.1. Application unit teszt

Handcrafted fake:

```ts
class InMemoryProductRepository
implements ProductRepository {
  readonly saved: Product[] = [];

  async save(
    product: Product,
  ): Promise<void> {
    this.saved.push(product);
  }
}
```

### 62.2. Adapter contract teszt

Ugyanaz a contract suite:

```ts
productRepositoryContract(
  'PrismaProductRepository',
  () => createPrismaFixture(),
);
```

### 62.3. Composition smoke teszt

```ts
it(
  'production graph létrejön',
  () => {
    expect(
      () =>
        createApplication(
          validPlatformDependencies,
        ),
    ).not.toThrow();
  },
);
```

### 62.4. Environment matrix

```text
local
test
preview
staging
production
```

minden támogatott capability-kombinációval.

### 62.5. Graph snapshot

Graph manifest snapshot használható, ha:

- determinisztikus;
- secretmentes;
- stable ID-ket használ;
- review-ban értelmezhető.

### 62.6. Concurrency

Párhuzamos actor/tenant operationök ne keveredjenek.

### 62.7. Negative compile fixture

Tesztek ellenőrizhetik, hogy Client Component nem importálhat composition rootot.


---

<a id="section-63"></a>

## 63. Test double-ok és override-ok

### 63.1. Fake

Működő, egyszerű implementáció:

```ts
class FixedClock
implements Clock {
  constructor(
    private readonly value: Date,
  ) {}

  now(): Date {
    return new Date(this.value);
  }
}
```

### 63.2. Stub

Előre beállított válasz.

### 63.3. Spy/recording fake

Hívásokat rögzít:

```ts
class RecordingMailer
implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(
    message: EmailMessage,
  ): Promise<void> {
    this.sent.push(message);
  }
}
```

### 63.4. Mock

Interaction expectation. Csak szükség esetén.

### 63.5. Test factory

```ts
export function createTestApplication(
  overrides:
    Partial<TestDependencies> = {},
): ApplicationServices {
  return createApplication({
    clock:
      overrides.clock ??
      new FixedClock(TEST_NOW),
    mailer:
      overrides.mailer ??
      new RecordingMailer(),
    products:
      overrides.products ??
      new InMemoryProductRepository(),
  });
}
```

### 63.6. `Partial` veszély

Production factoryban ne használj általános `Partial`. Test helperben kontrollált defaultokkal elfogadható.

### 63.7. Module mock

`vi.mock()` helyett preferáld a dependency injectiont application unit tesztnél. Module mock framework boundaryn vagy third-party code esetén lehet indokolt.


---

<a id="section-64"></a>

## 64. Security követelmények

### 64.1. Least privilege

Minden service csak a szükséges dependency-t kapja.

Nem:

```ts
class OverPrivilegedService {
  constructor(
    private readonly app:
      ApplicationServices,
  ) {}
}
```

Hanem:

```ts
class AuthenticateUser {
  constructor(
    private readonly users:
      UserRepository,
    private readonly passwords:
      PasswordHasher,
  ) {}
}
```

### 64.2. Secret scope

Secret csak adapterhez jut.

### 64.3. Graph introspection

Production diagnosztikai endpoint nem teheti publikussá:

- adapter classneveket, ha érzékeny;
- internal hostot;
- credential source-t;
- secret keynevet, ha kockázatos;
- tenant adatot;
- plugin pathot.

### 64.4. Dynamic selection

Untrusted input nem választhat tetszőleges service-t vagy module pathot.

### 64.5. Security decorator sorrend

Authorizáció nem kerülhet cache mögé úgy, hogy más actor eredményét adja vissza.

```text
authorize
→ scoped cache
→ repository
```

vagy cache key tartalmazza a security scope-ot.

### 64.6. Optional security

Security dependency nem lehet silent null.

### 64.7. Client boundary

`server-only` és architecture check kötelező privileged graphnál.

### 64.8. Supply chain

Plugin/adapter package:

- verziózva;
- lockfile-ban;
- auditálva;
- explicit exportból;
- capability recipe alapján

kerüljön a graphba.


---

<a id="section-65"></a>

## 65. Teljesítmény és cold start

Az explicit factoryk költsége általában kicsi. A problémát a dependency-k side effectjei okozzák.

### 65.1. Eager service-ek

Eager legyen, ha:

- olcsó;
- kötelező;
- startupkor akarunk hibát;
- request latencyt csökkent;
- process-scope.

### 65.2. Lazy service-ek

Lazy legyen, ha:

- ritkán használt;
- drága import;
- optional capability;
- nagy native dependency;
- használat nélkül nem kell validálni.

### 65.3. Per-request construction

Requestenként csak könnyű wrapper és context.

### 65.4. Registry

Statikus array gyorsabb és determinisztikusabb, mint runtime scan.

### 65.5. Cold start budget

Mérd:

```text
config parse
module import
graph construction
client initialization
startup validation
first request
```

### 65.6. Premature lazy

Minden dependency providerré alakítása:

- bonyolítja a graphot;
- runtime hibát késleltet;
- memoization hibát okoz;
- tesztet nehezít.

Előbb mérj.


---

<a id="section-66"></a>

## 66. Observability és graph fingerprint

A service graph saját telemetryt kaphat, de nem secretet.

### 66.1. Stable service ID

```text
catalog.product.get
catalog.product.repository.primary
platform.mailer.customer
```

Ne a minified constructor name legyen telemetry key.

### 66.2. Decorator

Logging és tracing decorator:

```text
Trace(GetProduct)
  → GetProduct
```

### 66.3. Graph fingerprint

Hash készülhet ezekből:

```text
service ID
implementation ID
lifetime
decorator chain
registry membership
contract version
```

Nem tartalmazhat config value-t vagy secretet.

### 66.4. Deployment metadata

Logolható:

```text
application version
git commit
graph fingerprint
manifest schema
capability list
```

### 66.5. Metrikák

- graph build duration;
- lazy service initialization count;
- initialization failure;
- registry size;
- adapter retry;
- open connections;
- shutdown duration.

### 66.6. Cardinality

Tenant ID, user ID vagy request ID ne kerüljön magas cardinality metric labelként.


---

<a id="section-67"></a>

## 67. Template-, recipe- és package-contract

Minden service-t telepítő recipe dokumentálja:

```text
provides capability
requires capability
runtime dependencies
development dependencies
files
config keys
secret keys
ports
bindings
registries
lifetime
runtime compatibility
remove behavior
upgrade behavior
tests
```

### 67.1. Példa recipe metadata

```json
{
  "schemaVersion": 1,
  "name": "smtp-mailer",
  "provides": [
    "mailer-smtp"
  ],
  "requires": [
    "forge"
  ],
  "environment": [
    "MAIL_HOST",
    "MAIL_PORT",
    "MAIL_PASSWORD"
  ],
  "composition": {
    "provides": [
      "platform.mailer"
    ],
    "runtime": [
      "nodejs"
    ]
  }
}
```

### 67.2. Template

A template saját composition skeletonnal rendelkezik, de nem telepít minden optional adaptert.

### 67.3. Ownership

A recipe birtokolja:

- adapter source;
- config schema;
- composition contribution;
- smoke test;
- docs.

Az application birtokolja a business portot, ha a port business szemantikájú.

### 67.4. Removal

Recipe uninstall csak akkor biztonságos, ha nincs consumer a graphban. Forge dependency graph ezt ellenőrizheti.


---

<a id="section-68"></a>

## 68. Migráció ad hoc kódból

### 68.1. `new` a Page-ben

Kiindulás:

```tsx
const repository =
  new PrismaProductRepository(db);

const query =
  new GetProduct(repository);
```

Page-ben.

Migráció:

1. port/application code marad modulban;
2. adapter marad infrastructure-ban;
3. construction átkerül composition rootba;
4. Page csak `catalogModule.queries.getProduct` értéket használ.

### 68.2. Közvetlen ORM

```ts
// app route-ban
await prisma.product.findMany();
```

Migráció:

```text
Route Handler
→ ListProducts
→ ProductReadRepository
→ Prisma adapter
```

### 68.3. `process.env` service-ben

Migráció:

```text
process.env
→ Zod parser
→ typed adapter config
→ constructor
```

### 68.4. Globális singleton business state

Migráció:

```text
global currentTenant
→ explicit RequestContext
```

### 68.5. Belső HTTP

```text
Server Component
→ saját /api
```

Migráció:

```text
Server Component
→ közvetlen application query
```

### 68.6. Locator

A `container.get()` hívásokat constructor dependency-re bontjuk.


---

<a id="section-69"></a>

## 69. Teljes vertikális példa

### 69.1. Application port

```ts
export interface ProductReadRepository {
  findById(
    productId: ProductId,
  ): Promise<ProductDetailDto | null>;
}
```

### 69.2. Clock

```ts
export interface Clock {
  now(): Date;
}

export class SystemClock
implements Clock {
  now(): Date {
    return new Date();
  }
}
```

### 69.3. Policy

```ts
export class ProductReadPolicy {
  assertAllowed(
    actor: Actor,
    product: ProductDetailDto,
  ): void {
    if (
      !actor.permissions.includes(
        'catalog.product.read',
      )
    ) {
      throw new ProductReadDeniedError();
    }

    if (
      actor.tenantId !==
      product.tenantId
    ) {
      throw new ProductReadDeniedError();
    }
  }
}
```

### 69.4. Query

```ts
export type GetProductInput =
  Readonly<{
    actor: Actor;
    productId: ProductId;
  }>;

export type GetProductResult =
  | Readonly<{
      type: 'found';
      product: ProductDetailDto;
    }>
  | Readonly<{
      type: 'not-found';
    }>;

export class GetProduct {
  constructor(
    private readonly products:
      ProductReadRepository,
    private readonly policy:
      ProductReadPolicy,
    private readonly clock:
      Clock,
  ) {}

  async execute(
    input: GetProductInput,
  ): Promise<GetProductResult> {
    const product =
      await this.products.findById(
        input.productId,
      );

    if (!product) {
      return {
        type: 'not-found',
      };
    }

    this.policy.assertAllowed(
      input.actor,
      product,
    );

    return {
      type: 'found',
      product: {
        ...product,
        viewedAt:
          this.clock.now().toISOString(),
      },
    };
  }
}
```

### 69.5. Adapter

```ts
import 'server-only';

export class PrismaProductReadRepository
implements ProductReadRepository {
  constructor(
    private readonly database:
      PrismaClient,
  ) {}

  async findById(
    productId: ProductId,
  ): Promise<ProductDetailDto | null> {
    const row =
      await this.database.product.findUnique({
        where: {
          id: productId,
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          status: true,
        },
      });

    return row;
  }
}
```

### 69.6. Logging decorator

```ts
export class LoggingProductReadRepository
implements ProductReadRepository {
  constructor(
    private readonly next:
      ProductReadRepository,
    private readonly logger:
      Logger,
  ) {}

  async findById(
    productId: ProductId,
  ): Promise<ProductDetailDto | null> {
    this.logger.debug(
      'catalog.product.find',
      { productId },
    );

    return this.next.findById(productId);
  }
}
```

### 69.7. Module factory

```ts
export type CatalogDependencies =
  Readonly<{
    database: PrismaClient;
    logger: Logger;
    clock: Clock;
  }>;

export function createCatalogModule(
  dependencies:
    CatalogDependencies,
): CatalogModule {
  const baseRepository =
    new PrismaProductReadRepository(
      dependencies.database,
    );

  const repository =
    new LoggingProductReadRepository(
      baseRepository,
      dependencies.logger,
    );

  const policy =
    new ProductReadPolicy();

  const getProduct =
    new GetProduct(
      repository,
      policy,
      dependencies.clock,
    );

  return Object.freeze({
    queries: Object.freeze({
      getProduct,
    }),
  });
}
```

### 69.8. Production root

```ts
import 'server-only';

const catalogModule =
  createCatalogModule({
    database,
    logger,
    clock: new SystemClock(),
  });

export const application =
  Object.freeze({
    catalog: catalogModule,
  });
```

### 69.9. Page

```tsx
import { notFound } from 'next/navigation';

import {
  application,
} from '@/composition/application.server';

export default async function ProductPage(
  props:
    PageProps<'/products/[productId]'>,
) {
  const { productId: rawProductId } =
    await props.params;

  const productId =
    productIdSchema.parse(rawProductId);

  const actor =
    await resolveActor();

  const result =
    await application.catalog.queries
      .getProduct.execute({
        actor,
        productId,
      });

  if (result.type === 'not-found') {
    notFound();
  }

  return (
    <ProductDetailView
      product={result.product}
    />
  );
}
```

### 69.10. Unit teszt

```ts
const query =
  new GetProduct(
    new InMemoryProductReadRepository([
      PRODUCT,
    ]),
    new ProductReadPolicy(),
    new FixedClock(NOW),
  );

const result =
  await query.execute({
    actor: AUTHORIZED_ACTOR,
    productId: PRODUCT.id,
  });

expect(result).toEqual({
  type: 'found',
  product: {
    ...PRODUCT,
    viewedAt: NOW.toISOString(),
  },
});
```


---

<a id="section-70"></a>

## 70. Ajánlott könyvtárstruktúra

```text
src/
  app/
    products/
      [productId]/
        page.tsx
    api/
      products/
        [productId]/
          route.ts

  modules/
    catalog/
      product/
        domain/
          product.ts
          product-id.ts

        application/
          dto/
          errors/
          policies/
          ports/
          queries/
          commands/

        infrastructure/
          persistence/
          cache/
          external/

        presentation/
          views/
          presenters/
          schemas/

        composition/
          definitions/

        index.server.ts

  platform/
    config/
    database/
    logging/
    telemetry/
    transactions/
    events/

  composition/
    application.server.ts
    catalog.server.ts
    worker.server.ts
    validate.server.ts

  generated/
    composition/
      registries/
      graph-manifest.json

packages/
  forge/
    src/
      composition/
        checks/
        graph/
        generators/
        renderers/

recipes/
  */
    recipe.json
    files/
    tests/
```

### 70.1. `composition/` ownership

Az application root app-specifikus. Ne kerüljön automatikusan egy reusable domain package-be.

### 70.2. Module-local composition

Egy modul exportálhat factoryt, de a concrete platform adapter végső kiválasztása az app composition rootban történik.

### 70.3. Generated

Generated composition output külön könyvtárban, kézi módosítás nélkül.


---

<a id="section-71"></a>

## 71. Forge composition- és service-parancsok

### 71.1. Lista

```bash
pnpm forge composition:list   --project .
```

### 71.2. Inspect

```bash
pnpm forge composition:inspect   catalog.product.get   --project .
```

### 71.3. Graph

```bash
pnpm forge composition:graph   --format=mermaid   --project .
```

### 71.4. Check

```bash
pnpm forge composition:check   --resolve-config   --project .
```

### 71.5. Why

```bash
pnpm forge composition:why   platform.mailer   --project .
```

### 71.6. Documentation

```bash
pnpm forge composition:docs   --check   --project .
```

### 71.7. Generate

```bash
pnpm forge composition:generate   --check   --project .
```

### 71.8. Service aliases

```bash
pnpm forge service:aliases   --project .
```

### 71.9. Lifetime report

```bash
pnpm forge service:lifetimes   --project .
```

### 71.10. Státusz

A 71.1–71.9 alatt felsorolt composition- és service-parancsok implementáltak. A repository és a template-ek stabil composition kapuja:

```bash
pnpm verify:composition
pnpm forge composition:generate --check --project apps/reference
pnpm forge composition:check --resolve-config --project apps/reference
pnpm forge composition:docs --check --project apps/reference
```

A teljes release-ellenőrzés ezek mellett továbbra is futtatja a typecheck, lint, unit, build, E2E és template kapukat.


---

<a id="section-72"></a>

## 72. Implementációs elfogadási kritériumok

A Winzard composition modell első stabil implementációja akkor tekinthető teljesnek, ha:

1. minden production modulnak explicit server-only composition rootja van;
2. az application service-ek constructor dependency-i portok vagy typed value-k;
3. nincs generikus service locator az application és domain rétegben;
4. a composition graph build typecheck alatt hibázik hiányzó bindingnál;
5. több implementáció explicit, egyértelmű factoryból választható;
6. service collectionök typed, immutable és duplicate-checkeltek;
7. decorator sorrend explicit és tesztelt;
8. process/request/operation lifetime dokumentált;
9. process service nem tárol request-state-et;
10. Client Component nem importálhat composition/infrastructure modult;
11. config parsing capability boundaryn történik;
12. secret csak szükséges adapterhez jut;
13. environment/capability graph matrix tesztelt;
14. graph cycle és missing binding Forge checket kap;
15. generated registry determinisztikus és drift-checkelt;
16. production graph startup smoke tesztet kap;
17. adapterek contract tesztet kapnak;
18. request isolation párhuzamos tesztet kap;
19. graph diagnosztika redaktált;
20. template/recipe metadata tartalmazza a composition contributiont.

### Definition of Done

```text
typecheck zöld
lint zöld
unit teszt zöld
adapter contract teszt zöld
composition check zöld
production build zöld
reference E2E zöld
dokumentáció friss
```


---

<a id="section-73"></a>

## 73. Hibaelhárítás

### 73.1. „Hiányzó constructor argumentum”

Ok:

- factory nem frissült;
- új port került az application service-be;
- rossz overload;
- generated composition stale.

Lépések:

```bash
pnpm typecheck
pnpm forge composition:generate --check
pnpm forge composition:inspect <service>
```

### 73.2. „Két implementáció illeszkedik”

A TypeScript strukturális típusossága önmagában nem választ. Adj explicit bindingot vagy factory branch-et.

### 73.3. Client build `server-only` hibával megáll

Client Component vagy client import chain composition/infrastructure modult importál. Mozgasd a privileged hívást Server Componentbe, Route Handlerbe vagy Server Actionbe, és csak DTO-t adj át.

### 73.4. Devben sok DB connection

Hot reload új clientet hoz létre. Használj development-only `globalThis` cache-t a DB clienthez, ne a teljes graphhoz.

### 73.5. Requestek között keveredik a tenant

Process-scope service mutable tenantot tárol. Tedd a tenantot explicit method inputba vagy request-scoped contextbe.

### 73.6. Első request lassú

Lazy dependency első használatkor inicializál. Mérd és döntsd el, kell-e eager startup.

### 73.7. Productionban hiányzik egy optional service

A capability vagy config branch nincs összhangban. Discriminated module és manifest check szükséges.

### 73.8. Registry order eltér

Filesystem orderre vagy object insertionre támaszkodtál. Adj explicit priorityt és stable ID tie-breakert.

### 73.9. Ciklikus import

Bontsd külön contract modulba a portot, vagy vezess be orchestrator/event határt.

### 73.10. Tesztben production adapter indul

A teszt közvetlenül importálta a production composition rootot. Használj factoryt és explicit test compositiont.

### 73.11. Secret látszik graph outputban

A graph renderer config value-t serializál. Csak config key/owner/classification metaadatot engedj.

### 73.12. Edge route Node adaptert importál

Válassz runtime-kompatibilis adaptert, conditional exportot vagy állítsd a route runtime-ot Node-ra.

### 73.13. Shutdownkor nem flusholódik telemetry

A platform nem garantálta a hookot. Telemetry export best-effort; kritikus audit durable store-ba menjen.

### 73.14. `Partial` override miatt undefined dependency

A test factory defaultoljon minden mezőt és constructionkor validáljon.

### 73.15. Service locator eltávolítása nehéz

Készíts consumer listát:

```text
locator.get(X)
→ constructor argument X
```

haladj service-enként, majd szűkítsd a locator API-t, végül töröld.


---

<a id="section-74"></a>

## 74. Symfony–Winzard megfeleltetés

| Symfony fogalom | Winzard megfelelő | Megjegyzés |
| --- | --- | --- |
| Service | Típusos object vagy function service | Explicit contracttal és lifetime-mal |
| Service container | TypeScript composition root és factoryk | Nincs általános runtime `get()` |
| Service ID | Exportnév, stable graph ID vagy registry key | Runtime string csak zárt registrynél |
| Service reference `@id` | Közvetlen instance/factory argumentum | Compile-time typecheck |
| Parameter | Capability-specifikus typed config/value object | Nincs globális parameter bag |
| Autowiring | Explicit constructor wiring, opcionális codegen | TS nem választ interface-implementációt |
| Autoconfiguration | Explicit vagy generált typed registry | Nincs runtime interface reflection |
| Alias | Szemantikus property/factory export | Egyértelmű binding |
| Multiple implementation | Factory switch vagy named registry | Ambiguity fail-fast |
| `bind` név alapján | Explicit config object mező | Paraméternév-mágia tiltott |
| `bind` típus alapján | Porthoz explicit binding | Type ellenőriz, de nem választ |
| Abstract argument | Kötelező factory/boot argumentum | Placeholder casting tiltott |
| Closure service | Function type vagy provider | Captured state auditálandó |
| Functional interface adapter | Bound function vagy adapter class | `this` bindingra figyelni kell |
| Tagged service | Typed readonly registry | Explicit ID és priority |
| Tagged iterator | Rendezett service collection | Duplicate és order check |
| Service decoration | Explicit decorator stack | Sorrend látható |
| Private service | Nem exportált module/package internal | Delivery nem importálja |
| Public service | Támogatott export/composition API | Nem globális locator |
| Resource import | Szűk build-time manifest/codegen | Runtime glob scan tiltott |
| Exclude | Generator source filter | Nem helyettesíti az explicit contractot |
| Remove service | Binding/export/recipe eltávolítás | Consumer graph check |
| Environment service | Stage/capability factory branch | `NODE_ENV` nem business stage |
| Shared service | Process/module-scope instance | Nem deployment-wide singleton |
| Non-shared service | Transient factory | Operation-scope |
| Lazy service | Provider/memoized async factory | Failure semantics explicit |
| Synthetic service | Bootstrap-provided typed dependency | Nincs global setter |
| Factory service | TypeScript factory | Sync vagy async |
| Service locator | Szűk typed registry kivételesen | Generic locator tiltott |
| Compiler pass | Forge build-time generator/check | Determinisztikus output |
| `debug:container` | `composition:list/inspect/why` implementált parancs | Redaktált |
| `lint:container` | typecheck + composition check + tests | CI gate |
| `When` / `WhenNot` | capability/stage composition | Explicit graph |
| Container compile | TypeScript build és generated graph validation | Nincs runtime PHP container cache |


---

<a id="section-75"></a>

## 75. Források és attribúció

### 75.1. Symfony referencia

- [Symfony Service Container](https://symfony.com/doc/current/service_container.html)
- [Symfony Autowiring](https://symfony.com/doc/current/service_container/autowiring.html)
- [Symfony Service Decoration](https://symfony.com/doc/current/service_container/service_decoration.html)
- [Symfony Service Subscribers and Locators](https://symfony.com/doc/current/service_container/service_subscribers_locators.html)
- [Symfony Lazy Services](https://symfony.com/doc/current/service_container/lazy_services.html)
- [Symfony Dependency Injection Component](https://symfony.com/doc/current/components/dependency_injection.html)

A Winzard dokumentum a Symfony service graph fegyelmét és témakészletét alkalmazza, de nem másolja a PHP container API-t vagy YAML service-definíciókat.

### 75.2. Next.js

- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Instrumentation](https://nextjs.org/docs/app/guides/instrumentation)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)

A `server-only` package buildhibával védi a szerveroldali module graphot attól, hogy Client Componentbe kerüljön.

### 75.3. TypeScript

- [Interfaces and Function Types](https://www.typescriptlang.org/docs/handbook/interfaces.html)
- [Type Compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility)
- [The `satisfies` Operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html)
- [TSConfig `strict`](https://www.typescriptlang.org/tsconfig/strict.html)

A TypeScript strukturális típusossága ellenőrzi az adapterek portkompatibilitását, de runtime dependency selectiont nem végez.

### 75.4. Node.js

- [ECMAScript Modules](https://nodejs.org/api/esm.html)
- [CommonJS Module Caching](https://nodejs.org/api/modules.html#caching)
- [Package Exports](https://nodejs.org/api/packages.html)
- [AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [Process lifecycle](https://nodejs.org/api/process.html)

A module cache process/loader-local viselkedés; nem cluster-wide service lifetime.

### 75.5. Winzard repository

A dokumentum a következő jelenlegi contractokra épül:

```text
apps/reference/src/composition/demo.ts
packages/forge/src/checks/project.ts
docs/public_documentation/winzard-application-platform.md
docs/public_documentation/winzard-configuration.md
docs/public_documentation/winzard-controller.md
docs/public_documentation/winzard-http-kernel.md
```

### 75.6. Ellenőrzési dátum

```text
2026-07-22
```

A következő elemek változhatnak, ezért dokumentációfrissítéskor újra ellenőrizendők:

- Next.js Server/Client Component importhatár;
- `server-only` működés;
- instrumentation lifecycle;
- supported runtimes;
- Node.js module cache és package export semantics;
- TypeScript strict és structural typing szabályok;
- Winzard Forge composition diagnosztikai parancsok implementációs státusza.
