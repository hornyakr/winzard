---
title: "Winzard alkalmazásplatform Next.js fölött"
description: "Symfony és Next.js összevetéséből levezetett moduláris alkalmazásarchitektúra, Forge- és generálási stratégia."
status: "architecture-reference"
document_version: "0.1.0"
last_verified: "2026-07-17"
source_basis: "Symfony, Next.js, Prisma és Drizzle hivatalos dokumentáció"
applies_to: "Winzard alaprendszer, template-ek és generált projektek"
---

# Átfogó következtetés

Mivel csak a Symfony dokumentáció linkje szerepelt, a második dokumentáció alatt a **Next.js hivatalos App Router dokumentációját** vettem alapul. Az összehasonlítás a 2026. július 16-i állapotot tükrözi: a Symfony aktuális stabil verziója 8.1.1, az LTS ág 7.4.14, a Next.js dokumentáció pedig a 16.2.10-es verziót jelöli aktuálisként. ([Symfony][1])

Az alapvető megérzésed helyes:

> **A Symfony egy általános backend-alkalmazásplatform, míg a Next.js elsősorban egy React-alapú webes delivery és rendering framework, amely backendfunkciókat is biztosít.**

A Next.js saját dokumentációja full-stack React frameworkként határozza meg magát, de ugyanakkor kifejezetten kimondja, hogy a backendképességei nem teljes backend-helyettesítők, hanem elsősorban Backend for Frontend réteget alkotnak. A belső projektstruktúrát pedig szándékosan nem írja elő. ([Next.js][2])

Ezért Symfony-szerű stabilitás nem egyetlen ORM vagy admincsomag telepítéséből fog létrejönni. A helyes megoldás:

> **egy saját, vékony alkalmazásplatformot kell építeni a Next.js fölé**, amely rögzíti a modulstruktúrát, a dependency injectiont, az adatbiztonsági határokat, a domain- és alkalmazásréteget, valamint a kódgenerálás szabályait.

A Next.js ebben a rendszerben a HTTP-, rendering- és UI-adapter lesz, nem maga az alkalmazásarchitektúra.

---

# 1. Miért érződik a Symfony stabilabbnak?

Nem pusztán a `make:entity` vagy a `make:crud` miatt.

A Symfony stabilitását az egymással összehangolt infrastruktúra adja:

1. központi kernel és request pipeline;
2. service container, autowiring és autoconfiguration;
3. egységes környezet- és csomagkonfiguráció;
4. Doctrine-integráció;
5. Validator és Form komponens;
6. SecurityBundle, authenticatorok és voterek;
7. Console, Messenger, EventDispatcher és Scheduler;
8. cache-, lock-, serializer- és workflow-komponensek;
9. MakerBundle;
10. diagnosztikai és ellenőrző parancsok.

A Symfony alapértelmezett service-konfigurációja automatikusan regisztrálja és injektálja a `src/` osztályait, az autoconfiguration pedig például message handlereket, event listenereket és console commandokat is felismer. A `lint:container` már CI-ben is ellenőrizhetővé teszi a dependency graphot. ([Symfony][3])

Ez jelentős különbség a Next.js-hez képest: a Symfony nemcsak futtatja a kódot, hanem **alkalmazási keretet és ellenőrizhető kompozíciós modellt ad hozzá**.

A Symfony saját best practice dokumentációja emellett vékony controllereket javasol: a controller néhány soros glue code legyen, míg az érdemi üzleti logika service-ekben maradjon. ([Symfony][4])

## Fontos korrekció a Symfony Makerrel kapcsolatban

A MakerBundle dokumentált feladata boilerplate generálása:

* command;
* controller;
* Doctrine entity;
* validator;
* voter;
* form;
* test;
* CRUD controller és Twig nézetek.

A `make:crud` tipikus eredménye egy controller, egy FormType és a hozzájuk tartozó index/show/new/edit Twig fájlok. Nem generál valódi bounded contexteket, aggregátumokat, application service-eket vagy CQRS-réteget. Ez a dokumentált generált fájlokból következik. ([Symfony][5])

Vagyis a Symfonyban sem a Maker hozza létre a skálázható domainarchitektúrát. A Maker csak azért hat stabilabbnak, mert egy már eleve stabil backendplatform konvencióiba generál.

---

# 2. Symfony és Next.js architekturális megfeleltetése

| Terület               | Symfony                                                     | Next.js                                               | Amit hozzá kell építeni                          |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Alkalmazásmag         | Kernel, request lifecycle, container, events                | App Router, React rendering, request adapterek        | Saját alkalmazási kernel és composition root     |
| Dependency injection  | Fordított service container, autowiring, autoconfiguration  | Nincs alkalmazásszintű DI-rendszer                    | Explicit factoryk és konstruktoros injektálás    |
| Projektstruktúra      | Kiforrott könyvtár- és komponenskonvenciók                  | Szándékosan nem opinionated                           | Kötelező belső modulstruktúra                    |
| Adatbázis             | Doctrine ORM/DBAL és migrációs ökoszisztéma                 | Nincs beépített ORM                                   | Prisma, Drizzle vagy más adapter                 |
| Domainmodell          | Doctrine entity használható egyszerű vagy gazdag modellként | Nincs domainmodell-koncepció                          | Frameworkfüggetlen domainréteg                   |
| Validáció             | Validator constraint-ek és csoportok                        | Bejövő adatok validálását előírja, de a megoldást nem | Műveletspecifikus Zod vagy más schema            |
| Formok                | FormType, mapping, validation, CSRF                         | React formok és Server Actions                        | Saját form/resource metadata                     |
| Authentikáció         | Firewall, authenticator, user provider                      | Auth library használata ajánlott                      | Auth adapter                                     |
| Authorizáció          | Access rules és voterek                                     | Minden adatkezelésnél külön ellenőrzés szükséges      | Policy/ability rendszer                          |
| Controller            | Vékony HTTP-adapter                                         | Page, Server Action, Route Handler                    | Vékony presentation adapterek                    |
| CRUD-generálás        | MakerBundle                                                 | Nincs entity-/CRUD-generátor                          | Saját `forge` CLI                                |
| Aszinkron feldolgozás | Messenger                                                   | Nincs integrált message bus                           | Queue- és workeradapter                          |
| Ütemezés              | Scheduler                                                   | Nincs általános alkalmazási scheduler                 | Külső scheduler és worker                        |
| Cache                 | Cache component, poolok és adapterek                        | Erős rendering- és adatcache                          | Query-szintű cache policy                        |
| Tesztelés             | Kernel-, container- és application test támogatás           | Integrációk külön eszközökhöz                         | Saját tesztpiramis és fixture-konvenció          |
| Diagnosztika          | `debug:*`, `lint:container`, profiler                       | `next build`, `next info`, `next typegen`             | `forge check`, `forge graph`, architecture tests |

A Next.js CLI jelenleg fejlesztési, buildelési, futtatási, diagnosztikai, route type-generálási és upgrade parancsokat kínál. Nem biztosít Symfony Makerhez hasonló entity-, repository-, use-case-, policy- vagy CRUD-generálást. ([Next.js][6])

---

# 3. Mit ad a Next.js, és mit nem?

A Next.js nagyon erős az alábbi területeken:

* file-system routing;
* layouts és nested UI;
* Server és Client Components;
* streaming és Suspense;
* Server Actions;
* Route Handlers;
* rendering- és cachemodell;
* statikus és dinamikus renderelés;
* build- és deploymentintegráció;
* React-alapú teljes UI-réteg.

Ugyanakkor nem ad:

* alkalmazási service containert;
* repository-konvenciót;
* domain event rendszert;
* tranzakciós application service mintát;
* form metadata rendszert;
* általános validator komponenst;
* voterhez hasonló authorizációs absztrakciót;
* message bust;
* worker runtime-ot;
* entity- vagy CRUD-generátort;
* belső modulhatárokat.

A dokumentáció ezt részben tudatosan kompenzálja. Új projektekhez külön **Data Access Layert** ajánl, amely:

* kizárólag szerveren fut;
* elvégzi az authorizációs ellenőrzéseket;
* csak biztonságos, minimális DTO-kat ad vissza.

A dokumentáció azt is ajánlja, hogy egy alkalmazás válasszon következetes adatkezelési megközelítést, és ne keverje véletlenszerűen a közvetlen adatbázis-hozzáférést, belső HTTP API-kat és component-level lekérdezéseket. ([Next.js][7])

Ez gyakorlatilag már elindul a Symfony service/application layer irányába, csak a Next.js nem valósítja meg helyetted a szerkezetet.

---

# 4. Ajánlott célarchitektúra

A megfelelő cél nem egy minden táblára teljes DDD-ceremóniát alkalmazó rendszer.

A javasolt modell:

> **moduláris monolit + ports and adapters + CQRS-lite + resource metadata**

Ez négy fontos tulajdonságot egyesít:

1. **Moduláris monolit:** egy alkalmazás és egy deployolható rendszer, de belső bounded contextekkel.
2. **Ports and adapters:** a domain és application layer nem függ a Next.js-től vagy az ORM-től.
3. **CQRS-lite:** az írási use case-ek és az olvasási projectionök elkülönülnek, de nincs szükség külön adatbázisokra vagy infrastruktúrára.
4. **Resource metadata:** a CRUD- és UI-generátor explicit konfigurációból dolgozik, nem próbálja az adatbázisból kitalálni az egész alkalmazást.

## Ajánlott könyvtárszerkezet

```text
src/
  app/
    (admin)/
      admin/
        products/
          page.tsx
          new/
            page.tsx
          [id]/
            page.tsx
            edit/
              page.tsx
    api/
      products/
        route.ts

  modules/
    catalog/
      product/
        domain/
          product.ts
          product-id.ts
          product-status.ts
          product.errors.ts
          product.events.ts
          product.repository.ts

        application/
          commands/
            create-product.ts
            update-product.ts
            delete-product.ts
          queries/
            get-product.ts
            list-products.ts
          dto/
            product-detail.dto.ts
            product-list-item.dto.ts
          ports/
            product-read-repository.ts
            transaction-manager.ts
            event-publisher.ts

        infrastructure/
          persistence/
            prisma-product.repository.ts
            prisma-product-read-repository.ts
            product.mapper.ts
          cache/
            cached-product-read-repository.ts

        presentation/
          product.resource.ts
          product.schemas.ts
          product.actions.ts
          components/
            product-form.tsx
            product-table.tsx

        index.server.ts

  platform/
    auth/
      actor.ts
      auth-provider.ts
      policy.ts
    database/
      client.ts
      transaction-manager.ts
    cache/
      cache-tags.ts
    events/
      event-bus.ts
      outbox.ts
    config/
      config.ts
    result/
      result.ts
      application-error.ts

  composition/
    catalog.ts
    application.ts

tools/
  forge/
    commands/
    generators/
    schema/
    templates/
    checks/

prisma/
  schema.prisma
  migrations/
```

## Függőségi irány

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

A szabályok:

* a `domain` nem importálhat Next.js-, React-, Prisma- vagy Drizzle-kódot;
* az `application` csak a domaint és portokat ismeri;
* az `infrastructure` implementálja a portokat;
* a `composition` hozza létre és köti össze a konkrét implementációkat;
* az `app` és a `presentation` csak use case-eket és DTO-kat ér el;
* Client Component nem importálhat application vagy infrastructure modult;
* ORM által generált típus nem kerülhet közvetlenül a kliensre;
* `app/**` alatt nem lehet közvetlen `prisma.*` vagy adatbázis-hozzáférés.

Az `app` könyvtár így nem az alkalmazás lesz, hanem a Next.js delivery adaptere.

---

# 5. Nem egyetlen modellre, hanem öt külön modellre van szükség

A legtöbb generált CRUD-rendszer ott romlik el, hogy egyetlen adatbázismodellt próbál minden célra használni.

| Modell             | Feladata                              | Példa                        |
| ------------------ | ------------------------------------- | ---------------------------- |
| Persistence model  | Adatbázisstruktúra, relációk, indexek | Prisma `Product` model       |
| Domain model       | Üzleti invariánsok és viselkedés      | `Product.activate()`         |
| Operation contract | Egy konkrét művelet bemenete          | `CreateProductInput`         |
| DTO/read model     | Biztonságos, célzott kimenet          | `ProductListItemDto`         |
| Resource manifest  | UI-, CRUD- és generálási metadata     | mezők, címkék, jogosultságok |

## Miért nem elég az adatbázisséma?

Egy adatbázisséma meg tudja mondani, hogy:

* egy mező `string`, `decimal` vagy `date`;
* kötelező-e;
* egyedi-e;
* milyen reláció tartozik hozzá;
* van-e index;
* mi a default értéke.

Nem tudja megbízhatóan megmondani:

* milyen mező jelenjen meg listában;
* melyik mező szerkeszthető;
* melyik szerepkör láthatja;
* milyen UI-widget kell;
* mi a pénznem;
* melyik mező kereshető;
* mi számít archiválásnak;
* hard vagy soft delete szükséges-e;
* milyen workflow engedélyezett;
* milyen domainművelet váltsa fel a generikus update-et;
* milyen adat kerülhet kliensre;
* milyen tenant- vagy ownership-szabály vonatkozik rá;
* milyen audit eseményt kell kibocsátani.

Ezért a megfelelő megközelítés:

> **schema-first, de nem schema-only.**

Az ORM schema adja a tárolási alapot, a resource manifest pedig az alkalmazási és presentation szemantikát.

---

# 6. Resource manifest

Egy ilyen fájl lehet a saját Maker-rendszered központi bemenete:

```ts
import { defineResource, field } from '@/platform/resource';

export const productResource = defineResource({
  module: 'catalog',
  name: 'Product',
  model: 'Product',
  route: 'products',
  profile: 'crud',

  titleField: 'name',

  fields: {
    id: field.uuid({
      generated: true,
      create: false,
      update: false,
      list: false,
    }),

    name: field.text({
      label: 'Név',
      required: true,
      list: true,
      search: true,
    }),

    sku: field.text({
      label: 'SKU',
      required: true,
      unique: true,
      list: true,
      search: true,
    }),

    price: field.money({
      label: 'Ár',
      currency: 'HUF',
      list: true,
      sort: true,
    }),

    status: field.enum({
      label: 'Állapot',
      values: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      list: true,
      filter: true,
    }),

    costPrice: field.money({
      label: 'Beszerzési ár',
      currency: 'HUF',
      visibility: {
        list: ['ADMIN'],
        detail: ['ADMIN'],
      },
    }),
  },

  abilities: {
    list: 'product.list',
    read: 'product.read',
    create: 'product.create',
    update: 'product.update',
    delete: 'product.delete',
  },

  cache: {
    collection: ({ tenantId }) => [`products:${tenantId}`],
    entity: ({ tenantId, id }) => [
      `product:${tenantId}:${id}`,
    ],
  },

  generate: {
    admin: ['list', 'detail', 'create', 'edit'],
    api: false,
  },
});
```

Ez nem domainmodell. Ez egy deklaratív alkalmazási és UI-leíró réteg.

A domain továbbra is saját kód:

```ts
export class Product {
  private constructor(
    readonly id: ProductId,
    private name: string,
    private status: ProductStatus,
  ) {}

  activate(): void {
    if (this.status !== ProductStatus.Draft) {
      throw new ProductCannotBeActivatedError(this.id);
    }

    this.status = ProductStatus.Active;
  }
}
```

A generator meg tudja írni a fájlstruktúrát és az alapvető adaptereket, de nem próbálhatja adatbázis-constraintből kitalálni az `activate()` üzleti szabályát.

---

# 7. A saját Maker megfelelője: `forge`

Egy célszerű parancsfelület:

```bash
pnpm forge make:module catalog

pnpm forge make:resource catalog/Product \
  --from=prisma \
  --profile=crud \
  --ui=admin

pnpm forge sync catalog/Product --dry-run

pnpm forge check

pnpm forge graph
```

A legfontosabb parancs lehet:

```bash
pnpm forge make:resource catalog/Product \
  --from=prisma \
  --profile=crud \
  --ui=admin
```

## A parancs működése

1. Beolvassa az ORM-modellt.
2. Normalizálja egy ORM-független belső reprezentációba.
3. Létrehozza vagy beolvassa a resource manifestet.
4. Alkalmazza a kiválasztott generálási profilt.
5. Elkészíti a változási tervet.
6. Konfliktus esetén nem ír felül kézzel szerkesztett fájlt.
7. Generálja a biztonságosan újragenerálható fájlokat.
8. Létrehozza az egyszer generálandó, utána fejlesztői tulajdonba kerülő fájlokat.
9. Kiírja a nem eldönthető kérdéseket és hiányzó konfigurációkat.
10. Lefuttatja a strukturális ellenőrzéseket.

## Generálandó elemek

Egy `crud` profil esetén:

* create/update műveleti sémák;
* list query schema;
* explicit DTO-k;
* explicit ORM `select` projectionök;
* repository port;
* ORM repository adapter;
* create/update/delete use-case skeletonök;
* list/get query handlerek;
* policy skeleton;
* Server Action adapterek;
* lista-, részlet-, create- és edit oldalak;
* form- és table-konfiguráció;
* breadcrumb- és navigációs regisztráció;
* cache tag helper;
* fixture/factory;
* repository contract teszt;
* action adapter teszt;
* Playwright CRUD smoke test.

## Generálási profilok

Nem minden adatmodell ugyanolyan komplexitású.

| Profil      | Felhasználás                       | Generált szerkezet                        |
| ----------- | ---------------------------------- | ----------------------------------------- |
| `reference` | országok, kategóriák, státuszkódok | lista, select, egyszerű repository        |
| `crud`      | adminisztratív entitás             | commands, queries, policy, audit, CRUD UI |
| `workflow`  | rendelés, előfizetés, jóváhagyás   | aggregate, transitionök, events, outbox   |
| `report`    | dashboard, read-only projection    | query service, filterek, export           |
| `external`  | külső API-val kezelt erőforrás     | port, API adapter, retry/error mapping    |

Ez megakadályozza, hogy egy egyszerű lookup táblára teljes DDD-réteget generálj, vagy egy komplex rendelési folyamatot generikus `update({ ...data })` műveletté egyszerűsíts.

---

# 8. A generált és kézzel írt kód határa

A generátor legfontosabb tulajdonsága nem az, hogy sok fájlt írjon, hanem az, hogy **ne rongálja meg a kézzel írt üzleti kódot**.

## Újragenerálható fájlok

Ezek legyenek determinisztikusak:

* ORM-ből származtatott scalar metadata;
* DTO alaptípusok;
* explicit ORM projectionök;
* route registry;
* navigációs registry;
* alap form- és table-field konfiguráció;
* generált route wrapper;
* cache tag helper;
* resource index;
* generált tesztfixture-alapok.

Ezekben lehet fejléc:

```ts
// Generated by forge.
// Resource schema hash: 95c81b...
// Do not edit directly.
```

## Egyszer létrehozott, utána kézzel kezelt fájlok

* use case-ek;
* policyk;
* repository adapterek;
* domainmodellek;
* custom queryk;
* egyedi UI-komponensek;
* kézzel bővített tesztek.

A generator később ezeket nem írja felül.

## Soha nem automatikusan generálandó elemek

* valódi domaininvariánsok;
* összetett tranzakciós folyamatok;
* cross-aggregate workflow-k;
* pénzügyi vagy jogosultsági döntések;
* adatkonverziós migrációk;
* visszafordíthatatlan destructive műveletek.

## Kötelező generátortulajdonságok

* idempotens futás;
* `--dry-run`;
* diff megjelenítése;
* fájlütközés érzékelése;
* schema hash;
* drift detection;
* stabil rendezés;
* snapshot/golden tesztek;
* explicit generatorverzió;
* AST-alapú vagy teljesen generált registryk;
* kézzel írt fájlok stringes toldásának kerülése.

A generator maga is termék. Verziózni, tesztelni és migrálni kell.

---

# 9. Olvasási folyamat

A Next.js dokumentációja Server Components esetén közvetlen adatforrás-elérést javasol, nem pedig a saját Route Handlerek HTTP-n keresztüli hívását. A belső HTTP-hívás build közben akár hibát is okozhat, runtime alatt pedig szükségtelen extra round trip. ([Next.js][8])

Ezért:

```text
page.tsx
  -> query use case
    -> read repository port
      -> Prisma/Drizzle adapter
        -> database
```

Nem ez:

```text
page.tsx
  -> fetch('/api/products')
    -> route.ts
      -> Prisma
```

## Javasolt olvasási folyamat

1. A page vagy Server Component feldolgozza a route- és queryparamétereket.
2. Egy műveletspecifikus schema validálja a listázási paramétereket.
3. Az auth adapter előállítja az aktuális `Actor` objektumot.
4. A query service ellenőrzi a listázási jogosultságot.
5. A repository automatikusan alkalmazza a tenant- és ownership-szűrést.
6. Az adapter explicit mezőket kér le.
7. Az application layer minimális DTO-t ad vissza.
8. A Server Component ezt rendereli.
9. Client Component csak a számára szükséges DTO-részletet kapja meg.

Példa:

```ts
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = ListProductsQuery.parse(await searchParams);
  const actor = await requireActor();

  const result = await productModule.queries.list.execute({
    actor,
    query,
  });

  return <ProductTable rows={result.items} />;
}
```

A `ProductTable` nem Prisma `Product` rekordokat kap, hanem `ProductListItemDto[]` értéket.

---

# 10. Írási folyamat

A Server Actiont controllerként kell kezelni, nem privát szerveroldali függvényként.

A Next.js dokumentációja szerint egy használt és exportált Server Action közvetlen POST kéréssel elérhető. A fordítás során előállított biztonságos action ID és a dead-code elimination csak kiegészítő védelem; minden actionben továbbra is ellenőrizni kell az authentikációt és authorizációt. ([Next.js][7])

## Minimális write pipeline

```text
Server Action / Route Handler
  -> input parsing
  -> authentication
  -> authorization
  -> tenant/ownership scope
  -> application use case
  -> transaction
  -> aggregate/repository
  -> outbox/domain events
  -> commit
  -> cache invalidation
  -> safe result
```

Példa:

```ts
'use server';

import 'server-only';

import { productModule } from '@/composition/catalog';
import { requireActor } from '@/platform/auth/require-actor';
import { CreateProductInput } from './product.schemas';

export async function createProductAction(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = CreateProductInput.safeParse(
    Object.fromEntries(formData),
  );

  if (!parsed.success) {
    return {
      status: 'invalid',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await requireActor();

  const result = await productModule.commands.create.execute({
    actor,
    input: parsed.data,
  });

  return result.match({
    ok: ({ id }) => ({
      status: 'success',
      id,
    }),

    err: (error) => mapProductErrorToFormState(error),
  });
}
```

A tényleges jogosultság és tranzakció a use case-ben legyen:

```ts
export class CreateProduct {
  constructor(
    private readonly repository: ProductRepository,
    private readonly policy: ProductPolicy,
    private readonly transactions: TransactionManager,
    private readonly events: EventPublisher,
  ) {}

  async execute(command: CreateProductCommand) {
    this.policy.assertCanCreate(command.actor, command.input);

    return this.transactions.run(async (transaction) => {
      const product = Product.create({
        name: command.input.name,
        sku: command.input.sku,
        price: command.input.price,
      });

      await this.repository.save(product, transaction);
      await this.events.publish(product.releaseEvents(), transaction);

      return { id: product.id.value };
    });
  }
}
```

Így ugyanaz a use case meghívható:

* Server Actionből;
* Route Handlerből;
* console parancsból;
* queue handlerből;
* tesztből;
* később más frontendből.

---

# 11. Biztonsági modell

A Symfonyban a firewall, authenticator, access control és voter természetesen tereli a fejlesztőt egy biztonságosabb irányba. A Security komponens támogatja többek között az authentikációt, authorizációt és CSRF-védelmet; összetett erőforrásszintű döntésekhez a Symfony votereket ajánl. ([Symfony][9])

Next.js-ben ezt explicit platformréteggel kell reprodukálni.

## Javasolt absztrakciók

```ts
export type Actor = {
  userId: string;
  tenantId: string;
  roles: readonly string[];
  permissions: ReadonlySet<string>;
};

export interface ProductPolicy {
  assertCanList(actor: Actor): void;
  assertCanRead(actor: Actor, product: Product): void;
  assertCanCreate(actor: Actor, input: CreateProductInput): void;
  assertCanUpdate(actor: Actor, product: Product): void;
  assertCanDelete(actor: Actor, product: Product): void;
}
```

Ez a Symfony Voter megfelelője.

## Authorizációs szintek

### 1. Route- vagy UI-szintű előzetes ellenőrzés

Feladata:

* nem releváns navigáció elrejtése;
* gyors redirect;
* nyilvánvalóan tiltott oldal blokkolása.

Ez csak UX- és teljesítményoptimalizálás.

### 2. Use-case szintű kötelező ellenőrzés

Ez a mérvadó döntési pont.

Itt kell vizsgálni:

* role;
* permission;
* ownership;
* tenant;
* aktuális entitásállapot;
* műveleti paraméter;
* üzleti limit;
* mezőszintű jogosultság.

### 3. Repository-szintű adatscope

A repository garantálja, hogy egy tenant felhasználója ne tudjon más tenant rekordjához hozzáférni még hibás application kód esetén sem.

Például:

```ts
interface ProductReadRepository {
  findById(
    tenantId: TenantId,
    productId: ProductId,
  ): Promise<ProductDetailDto | null>;
}
```

A `tenantId` nem opcionális.

## Proxy vagy layout nem elegendő

A Next.js dokumentációja külön DAL-t és az adatforrás közelében végzett jogosultság-ellenőrzést ajánl. A Proxy csak optimista, korai ellenőrzésre használható; az érdemi ellenőrzést nem szabad kizárólag oda vagy egy layoutba helyezni. ([Next.js][10])

## Route Handlerek

A Route Handler nyilvános HTTP endpoint. Bármely kliens elérheti, ezért:

* input validation;
* content-type és méretellenőrzés;
* auth;
* authorizáció;
* rate limiting;
* biztonságos hibaválasz;
* minimális response DTO

minden esetben szükséges. ([Next.js][8])

Route Handler csak akkor készüljön, amikor valódi HTTP API kell:

* külső kliens;
* mobile app;
* webhook;
* partnerintegráció;
* publikus API;
* böngészőből periodikusan lekérdezett kliensadat.

Belső Server Component lekérdezéshez nincs rá szükség.

---

# 12. Dependency injection Next.js-ben

A Symfony service containerét nem érdemes egy az egyben lemásolni TypeScriptben.

A TypeScript interface-ek runtime alatt nem léteznek, ezért egy automatikus containerhez tokenek, decorator metadata vagy névkonvenciók szükségesek. Ez könnyen kevésbé átlátható rendszert eredményez, mint a Symfony fordított containere.

A jobb alapmegoldás:

> **explicit composition root + konstruktoros injektálás + generált wiring**

## Példa

```ts
import 'server-only';

import { db } from '@/platform/database/client';
import { transactionManager } from '@/platform/database/transaction-manager';
import { eventBus } from '@/platform/events/event-bus';

const productRepository =
  new PrismaProductRepository(db);

const productReadRepository =
  new PrismaProductReadRepository(db);

const productPolicy =
  new DefaultProductPolicy();

export const productModule = {
  commands: {
    create: new CreateProduct(
      productRepository,
      productPolicy,
      transactionManager,
      eventBus,
    ),

    update: new UpdateProduct(
      productRepository,
      productPolicy,
      transactionManager,
      eventBus,
    ),
  },

  queries: {
    list: new ListProducts(
      productReadRepository,
      productPolicy,
    ),

    get: new GetProduct(
      productReadRepository,
      productPolicy,
    ),
  },
};
```

Előnyei:

* teljesen típusos;
* IDE által követhető;
* nincs service locator;
* tesztben könnyen cserélhető;
* nincs implicit runtime magic;
* a dependency graph statikusan ellenőrizhető;
* a generator elkészítheti a wiringot.

A request-specifikus adatokat – felhasználó, tenant, locale, correlation ID – ne globális service-be rejtsd. Ezek explicit contextként kerüljenek a use case-be.

## Symfony diagnosztika megfelelői

| Symfony            | Saját platform   |
| ------------------ | ---------------- |
| `debug:container`  | `forge graph`    |
| `debug:autowiring` | `forge bindings` |
| `lint:container`   | `forge check`    |
| `list make`        | `forge list`     |
| `make:*`           | `forge make:*`   |

A `forge check` ellenőrizheti:

* minden portnak van-e adaptere;
* van-e körkörös module dependency;
* importál-e domain Next.js-kódot;
* importál-e Client Component szerveroldali modult;
* van-e közvetlen ORM-hozzáférés az `app` alatt;
* minden write use case rendelkezik-e policyval;
* minden publikus response explicit DTO-e;
* van-e resource/schema drift;
* minden tenant-erőforrás megfelelően scope-olt-e.

---

# 13. ORM-választás

## Prisma

A Prisma előnye a te célod szempontjából:

* központi, jól strukturált schema;
* kliensgenerálás;
* migrációs workflow;
* adatbázis-introspection;
* custom generator támogatás;
* egységes modellmetadata.

Ez alkalmassá teszi arra, hogy a saját generatorod egyik bemenete legyen. A Prisma dokumentációja támogatja a schema generator blokkokat, saját generált artifactokat, migrációkat és meglévő adatbázis introspectionjét is. ([Prisma][11])

A Prisma típusa azonban csak persistence model legyen:

```text
Prisma Product
  != Domain Product
  != CreateProductInput
  != ProductDetailDto
```

Ne használd közvetlenül:

* Client Component propként;
* API response típusként;
* domain aggregate-ként;
* action inputként.

## Drizzle

A Drizzle előnyei:

* TypeScript- és SQL-központú schema;
* közvetlenebb SQL-kontroll;
* code-first migrációk;
* select/insert/update schema generálás a Drizzle Zod integrációval.

Ez akkor jobb választás, ha az SQL-séma és az adatbázis-specifikus optimalizáció fontosabb, mint a teljesen általános modell-introspection. ([Drizzle ORM][12])

## Konkrét ajánlás

A leírt **generator-first fejlesztői élményhez** a célszerű alap:

> **Prisma + saját resource manifest + ORM-független `forge` generator**

Nem azért, mert a Prisma jobb domainmodell, hanem mert jó strukturált bemenet a generáláshoz.

A `forge` belső modellje azonban ne legyen Prisma-specifikus:

```ts
interface SchemaIntrospector {
  readResources(): Promise<readonly StorageResource[]>;
}
```

Később készülhet:

* `PrismaSchemaIntrospector`;
* `DrizzleSchemaIntrospector`;
* `DatabaseSchemaIntrospector`.

Így a generátor nem válik az ORM foglyává.

---

# 14. Validáció és formok

A Symfony Form és Validator szorosan együtt tud működni az objektum- és Doctrine-metadatával. A form képes objektumba mapelni az adatot, a Validator pedig constraint-eket, csoportokat és custom validátorokat kezel. ([Symfony][13])

Next.js-ben három külön validációs szintet érdemes kialakítani.

## 1. Transport validation

Példák:

* string hossz;
* enumérték;
* emailformátum;
* dátumformátum;
* számkonverzió;
* kötelező mező.

Ezt a Server Action vagy Route Handler határán kell elvégezni.

```ts
const CreateProductInput = z.object({
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().min(1).max(50),
  price: z.coerce.number().nonnegative(),
});
```

## 2. Application validation

Példák:

* egy SKU már foglalt;
* elérte-e a tenant a terméklimitet;
* módosíthatja-e a felhasználó az árat;
* használható-e az adott kategória;
* engedélyezett-e a művelet ebben az állapotban.

Ez use-case szintű ellenőrzés.

## 3. Domain- és adatbázis-invariáns

Példák:

* aktív termék nem kerülhet vissza draftba;
* elfogadott rendelés nem törölhető;
* unique constraint;
* foreign key;
* check constraint.

A három szint nem helyettesíti egymást.

Különösen kerülendő az ORM által generált `ProductCreateInput` közvetlen elfogadása. Abban gyakran több mező szerepel, mint amit az adott felhasználó vagy művelet módosíthatna.

---

# 15. Cache-architektúra

A Next.js 16 Cache Components modellje és a cache tagek erős eszközök, de ezeket nem célszerű véletlenszerűen a page-ekbe és komponensekbe szórni.

A cache policy a query layerhez tartozzon:

```text
Page
  -> Cached Query Service
    -> Query Service
      -> Read Repository
```

## Javasolt tagstruktúra

```text
products:{tenantId}
product:{tenantId}:{productId}
product-search:{tenantId}:{queryHash}
```

A mutation után:

* az entity tag invalidálódik;
* a collection tag invalidálódik;
* az érintett dashboard/report tagek invalidálódnak;
* mindez csak sikeres commit után történik.

A jelenlegi Next.js cache API-ban az `updateTag` azonnali, read-your-own-writes jellegű frissítésre használható Server Actionből, míg a `revalidateTag(..., 'max')` stale-while-revalidate viselkedést ad. ([Next.js][14])

## Biztonsági szabály

Felhasználó- vagy jogosultságfüggő adatot csak akkor szabad közösen cache-elni, ha:

* a cache key tartalmazza a szükséges tenant/user/policy kontextust; vagy
* a visszaadott adat minden érintett felhasználó számára azonos és biztonságos.

A cache soha nem kerülheti meg az authorizációt.

---

# 16. Messenger, események és háttérfolyamatok

A Symfony Messenger szinkron és aszinkron message busként is működik, transportokkal és handlerekkel. A Scheduler ismétlődő feladatokat tud definiálni, és a Messengerrel integrálható. ([Symfony][15])

A Next.js nem ad ennek megfelelő általános worker-runtime-ot.

A dokumentáció külön figyelmeztet arra, hogy egyes hostok Route Handlereket lambda jelleggel futtatnak:

* nincs megosztott állapot a kérések között;
* a fájlrendszer nem feltétlenül írható;
* a hosszú futás timeoutot kaphat;
* WebSocket-kapcsolat nem feltétlenül tartható fenn. ([Next.js][8])

Ezért az absztrakció legyen:

```ts
interface EventPublisher {
  publish(
    events: readonly DomainEvent[],
    transaction?: TransactionContext,
  ): Promise<void>;
}

interface JobQueue {
  enqueue<T>(
    job: JobDefinition<T>,
    payload: T,
  ): Promise<void>;
}
```

## Megbízható aszinkron write flow

```text
Application transaction
  -> aggregate mentése
  -> outbox rekord mentése
  -> commit

Worker
  -> outbox rekord olvasása
  -> queue/event publikálása
  -> handler futtatása
  -> idempotency check
  -> processed állapot
```

A worker lehet:

* külön Node process;
* külön alkalmazás ugyanabban a monorepóban;
* külső queue platform;
* konténeres worker;
* serverless queue consumer.

A domain és application kód közös lehet, de a Next.js Route Handler ne váljon hosszú életű workerfolyamattá.

---

# 17. Tesztelési stratégia

A Symfony dokumentáció explicit unit-, integration- és application teszteket különböztet meg, és kernel/container indítási támogatást biztosít. A Next.js dokumentáció több külön teszteszközt integrál, de az async Server Components esetén jelenleg kifejezetten E2E teszteket ajánl, mert a komponensszintű teszttámogatás nem minden esetben teljes. ([Symfony][16])

## Javasolt tesztpiramis

### Domain unit test

* nincs Next.js;
* nincs adatbázis;
* nincs hálózat;
* aggregátumok és value objectek.

### Application use-case test

* fake repository;
* fake clock;
* fake event publisher;
* fake transaction manager;
* policy tesztelése.

### Repository contract test

Ugyanazt a tesztcsomagot minden repository implementációnak teljesítenie kell:

```ts
productRepositoryContract(() => ({
  repository: createPrismaProductRepository(),
  reset: resetTestDatabase,
}));
```

### Adaptertest

* Server Action input mapping;
* Route Handler státuszkódok;
* auth hibák;
* expected error mapping;
* DTO serialization.

### E2E

* lista megnyitása;
* create;
* edit;
* delete/archive;
* permission denied;
* tenant isolation.

### Architecture test

* tiltott importok;
* ciklikus module dependency;
* ORM leakage;
* client/server boundary;
* nem exportált internal modulok.

### Generator golden test

Egy rögzített inputmodellhez a generált fájlstruktúra és tartalom snapshotként ellenőrizhető.

---

# 18. CI-ellenőrzések

Egy Symfony `lint:container` jellegű biztonsági háló:

```bash
pnpm forge check
pnpm forge sync --check

pnpm prisma validate
pnpm prisma migrate status

pnpm next typegen
pnpm tsc --noEmit

pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e

pnpm next build
```

A Next CLI külön `typegen` paranccsal tud route-, page-, layout- és Route Handler típusokat generálni. Ezt célszerű a TypeScript-ellenőrzés előtt futtatni. ([Next.js][17])

A `forge check` ezen felül vizsgálja:

* a manifestek schema-validitását;
* a Prisma/resource driftet;
* a hiányzó operation schemákat;
* a hiányzó policykat;
* a nem explicit DTO-kat;
* a tenant nélküli repository metódusokat;
* a generált fájlok hashét;
* a tiltott dependencyket;
* az ismeretlen enum- és relation mappingeket.

---

# 19. Kerülendő minták

## 1. Közvetlen ORM-hívás minden Server Actionben

```ts
'use server';

export async function updateProduct(data: unknown) {
  return prisma.product.update({
    where: { id: data.id },
    data,
  });
}
```

Problémák:

* nincs műveletspecifikus input;
* mass assignment;
* nincs policy;
* nincs tenant scope;
* nincs domaininvariáns;
* nincs tranzakciós orchestration;
* nyers ORM-rekord szivároghat ki.

## 2. ORM-típus Client Component propként

```ts
function ProductEditor(props: { product: Product }) {
  // ...
}
```

Ez összeköti:

* az adatbázissémát;
* a kliens bundle-t;
* a biztonsági exposure-t;
* a UI-t.

Helyette `EditableProductDto`.

## 3. Auth csak layoutban vagy Proxyban

Az oldal láthatósága és a művelet engedélyezése két külön kérdés. A write use case-nek mindig újra kell ellenőriznie a jogosultságot.

## 4. Saját API hívása Server Componentből

Ez felesleges HTTP-réteget és build/deployment problémákat okoz. A Server Component közvetlenül a query/application service-t hívja. ([Next.js][8])

## 5. Univerzális generikus CRUD service

```ts
crud.update(modelName, id, data);
```

Egy ilyen service eltünteti a műveletek jelentését:

* `approveOrder`;
* `activateSubscription`;
* `archiveProduct`;
* `cancelInvoice`

helyett minden `update` lesz. Ez egyszerű adminadatoknál elfogadható lehet, domainfolyamatoknál nem.

## 6. Üzleti logika automatikus újragenerálása

A generator létrehozhat skeletonokat, de nem írhatja újra a kézzel implementált use case-eket és domainmodelleket.

## 7. Minden táblára teljes DDD

A lookup táblákhoz nem kell aggregate root, event bus és tíz interfész. Ezért szükségesek a különböző resource profilok.

---

# 20. Bevezetési sorrend

## Első lépés: architekturális szabályok

Rögzíteni kell:

* modulhatárok;
* dependency direction;
* DTO-szabály;
* auth/policy helye;
* tranzakciók helye;
* cache policy;
* server/client határ;
* generált és kézi kód határa.

Ezek lehetnek rövid Architecture Decision Recordok.

## Második lépés: egy teljes kézi referenciamodul

Egyetlen `Product` vagy más reprezentatív modul készüljön el először kézzel.

Érdemes, hogy tartalmazzon:

* enumot;
* relációt;
* money mezőt;
* tenant scope-ot;
* role-limited mezőt;
* list filtert;
* create/update műveletet;
* soft delete-et;
* cache-t;
* domain eventet;
* egyedi validációt.

Ez lesz a generator golden reference implementációja.

## Harmadik lépés: platformprimitívek

Kiemelendő közös elemek:

* `Actor`;
* `Policy`;
* `Result`;
* `ApplicationError`;
* `TransactionManager`;
* `EventPublisher`;
* `ResourceDefinition`;
* field registry;
* form adapter;
* table adapter;
* cache tag helper;
* auth adapter.

## Negyedik lépés: `forge make:resource`

Az első verzió csak `reference` és `crud` profilokat kezeljen.

Nem célszerű rögtön workflow-kat és cross-aggregate use case-eket generálni.

## Ötödik lépés: drift és architecture check

A generálás önmagában kevés. A rendszernek később is észlelnie kell, ha:

* új adatbázismezőhöz nincs UI-döntés;
* új enumérték nincs lekezelve;
* egy relation nincs konfigurálva;
* egy mező véletlenül DTO-ba került;
* hiányzik a jogosultság;
* a generated output elavult.

## Hatodik lépés: workflow és háttérfolyamat

Ezután kerülhet be:

* workflow profil;
* domain events;
* outbox;
* queue;
* worker;
* scheduler;
* retry és idempotency.

---

# Végső ajánlás

A leírt célhoz a következő alap adja a legjobb egyensúlyt:

```text
Next.js App Router
  mint delivery és rendering layer

+ Prisma
  mint persistence schema és migrációs alap

+ műveletspecifikus Zod vagy más sémák
  mint transport contract

+ frameworkfüggetlen domain/application modulok

+ explicit composition root
  mint DI-rendszer

+ policy/ability layer
  mint Symfony Voter megfelelő

+ resource manifest
  mint CRUD- és UI-generálási metadata

+ saját forge CLI
  mint MakerBundle megfelelő

+ query-szintű cache policy

+ külső worker/queue
  az aszinkron feldolgozáshoz

+ architecture és drift checkek
  mint lint:container megfelelő
```

A legfontosabb szerkezeti döntés:

> **A Next.js `app` könyvtára ne tartalmazza az alkalmazás üzleti architektúráját. Az `app` kizárólag adapter legyen a moduláris application platform fölött.**

Így a Next.js lecserélhető vagy bővíthető marad, a domain nem függ a Reacttől, az ORM nem szivárog ki a UI-ba, a Server Actions nem válnak ellenőrizetlen adatbázisfüggvényekké, és a generátor valóban stabil konvenciókat tud érvényesíteni.

Ezzel Symfony-szintű, sőt a saját alkalmazástípusodra szabva annál szigorúbb fejlesztői élmény is kialakítható. Ennek ára, hogy a `forge`, a resource schema és az architekturális szabályrendszer belső platformtermékké válik, amelyet ugyanúgy karban kell tartani, mint bármely más fontos könyvtárat.

A következő célszerű lépés egyetlen reprezentatív `Product` modul kézi, teljes vertikális implementációja; ebből lehet pontosan meghatározni a resource manifest szerződését és a `forge make:resource` első stabil kimenetét.

[1]: https://symfony.com/releases "https://symfony.com/releases"
[2]: https://nextjs.org/docs "https://nextjs.org/docs"
[3]: https://symfony.com/doc/current/service_container.html "https://symfony.com/doc/current/service_container.html"
[4]: https://symfony.com/doc/current/best_practices.html "https://symfony.com/doc/current/best_practices.html"
[5]: https://symfony.com/bundles/SymfonyMakerBundle "https://symfony.com/bundles/SymfonyMakerBundle"
[6]: https://nextjs.org/docs/app/api-reference/cli/create-next-app "https://nextjs.org/docs/app/api-reference/cli/create-next-app"
[7]: https://nextjs.org/docs/app/guides/data-security "https://nextjs.org/docs/app/guides/data-security"
[8]: https://nextjs.org/docs/app/guides/backend-for-frontend "https://nextjs.org/docs/app/guides/backend-for-frontend"
[9]: https://symfony.com/doc/current/security.html "https://symfony.com/doc/current/security.html"
[10]: https://nextjs.org/docs/app/guides/authentication "https://nextjs.org/docs/app/guides/authentication"
[11]: https://www.prisma.io/docs/orm/prisma-schema/overview/generators "https://www.prisma.io/docs/orm/prisma-schema/overview/generators"
[12]: https://orm.drizzle.team/docs/zod "https://orm.drizzle.team/docs/zod"
[13]: https://symfony.com/doc/current/forms.html "https://symfony.com/doc/current/forms.html"
[14]: https://nextjs.org/docs/app/getting-started/caching "https://nextjs.org/docs/app/getting-started/caching"
[15]: https://symfony.com/doc/current/messenger.html "https://symfony.com/doc/current/messenger.html"
[16]: https://symfony.com/doc/current/testing.html "https://symfony.com/doc/current/testing.html"
[17]: https://nextjs.org/docs/app/api-reference/cli/next "https://nextjs.org/docs/app/api-reference/cli/next"
