---
title: "A Winzard HTTP-kernelje és request–response életciklusa"
description: "A Symfony HttpKernel teljes Winzard-specifikus átültetése: a Next.js App Router request pipeline-ja, delivery entrypointok, request context, policyk, válaszképzés, streaming, hibakezelés, after-fázis, observability, állapotreset, subrequest-helyettesítés és bővítési pontok."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-18"
source_basis: "Symfony Docs — The HttpKernel Component"
nextjs_baseline: "16.2.10"
nodejs_baseline: "24.x"
applies_to: "Winzard Reference App, Winzard template-ek és kitelepített Winzard projektek"
related_documents:
  - "winzard-application-platform.md"
  - "winzard-routing.md"
  - "winzard-controller.md"
  - "winzard-templates.md"
  - "winzard-configuration.md"
---

# A Winzard HTTP-kernelje és request–response életciklusa

## A dokumentum célja

Ez a dokumentum a Symfony **„The HttpKernel Component”** fejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony dokumentáció funkcionális ívét követi — requestből response, kernel-események, controller- és argumentumfeloldás, view-fázis, response-módosítás, terminate, exception, állapotreset, controller-attribútumok, subrequestek és erőforrás-feloldás —, de minden fogalmat a Winzard **Next.js App Router + React Server Components + moduláris application layer + ports and adapters + explicit composition root** architektúrájához igazít.

A dokumentum központi állítása:

> **A Winzard nem épít második HTTP-kernelt a Next.js mellé. A hálózati request feldolgozásának, route-feloldásának, React-renderelésének és HTTP-válaszának runtime forrásigazsága a Next.js. A Winzard ehhez explicit application kernelt, request-context szerződést, policy- és presenter-határokat, ellenőrizhető bővítési pontokat és Forge-diagnosztikát ad.**

A „kernel” szó ebben a dokumentumban ezért három, egymástól elválasztott fogalmat jelöl:

```text
Next.js delivery kernel
  = URL, Proxy, route resolution, Page, Route Handler, Server Function,
    React rendering, streaming és HTTP response

Winzard application kernel
  = frameworkfüggetlen queryk, commandok, policyk, portok,
    tranzakciós határok és application resultok

Winzard composition kernel
  = szerveroldali composition root, adapterek, konfiguráció,
    request-context factory és explicit delivery pipeline
```

A három réteg közül csak az első kezeli közvetlenül a webes request/response mechanikát. Az application réteg nem importálhat `next/*`, React-, Web `Request`/`Response`-, cookie-, header-, Proxy- vagy route-specifikus típust.

> [!IMPORTANT]
> A Symfony HttpKernel eseményeinek Winzard-megfelelői nem egy globális EventEmitterben vagy rejtett interceptorhálóban valósulnak meg. Ahol bővítési pont szükséges, az explicit függőség, wrapper, policy, presenter, instrumentation hook vagy route contract legyen.

> [!WARNING]
> A dokumentumban szereplő egyes `forge kernel:*`, `forge delivery:*` és `forge instrumentation:*` parancsok célfelületet jelölnek. A már működő routing parancsokat külön jelöljük; egy célparancs nem tekinthető implementáltnak pusztán attól, hogy a dokumentáció leírja.

A fejezet végére egy fejlesztő:

1. érti a Next.js és a Winzard request–response életciklusát;
2. meg tudja különböztetni a delivery kernelt az application kerneltől;
3. tudja, hol történhet short-circuit, redirect, rewrite vagy közvetlen response;
4. explicit módon képes request-contextet, aktort, tenantot, locale-t és trace-adatot képezni;
5. biztonságosan oldja fel a Page, Route Handler és Server Action bemeneteit;
6. frameworkfüggetlen application műveletet hív;
7. explicit view modelt vagy HTTP DTO-t képez;
8. helyesen kezeli a streaminget, headereket, cookie-kat és cache policyt;
9. megkülönbözteti az expected hibákat, a not-found állapotot és a váratlan exceptiont;
10. tudja, mikor használható az `after()`, és mikor szükséges queue/outbox;
11. megakadályozza a cross-request állapotszivárgást hosszú életű Node.js processben;
12. subrequest helyett közvetlen szerveroldali kompozíciót használ;
13. explicit, tesztelhető és statikusan ellenőrizhető lifecycle extensiont készít;
14. instrumentálja a teljes pipeline-t request ID-val, trace-szel és redaktált hibajelentéssel;
15. CI-ben képes ellenőrizni a kernel-, delivery- és request-context contractokat.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Hatókör és kizárások](#2-hatókör-és-kizárások)
3. [A Symfony HttpKernel lényege](#3-a-symfony-httpkernel-lényege)
4. [A Winzard kernelmodellje](#4-a-winzard-kernelmodellje)
5. [A teljes request–response életciklus](#5-a-teljes-requestresponse-életciklus)
6. [Hálózati és platform-előszakasz](#6-hálózati-és-platform-előszakasz)
7. [`next.config` headerek és redirectek](#7-nextconfig-headerek-és-redirectek)
8. [Proxy mint pre-routing adapter](#8-proxy-mint-pre-routing-adapter)
9. [Route-feloldás és entrypoint-kiválasztás](#9-route-feloldás-és-entrypoint-kiválasztás)
10. [Page, Route Handler és Server Action](#10-page-route-handler-és-server-action)
11. [Request input és argumentumfeloldás](#11-request-input-és-argumentumfeloldás)
12. [RequestContext és korreláció](#12-requestcontext-és-korreláció)
13. [Actor-, tenant- és locale-feloldás](#13-actor-tenant-és-locale-feloldás)
14. [Pre-controller policyk és short-circuit](#14-pre-controller-policyk-és-short-circuit)
15. [Application művelet meghívása](#15-application-művelet-meghívása)
16. [Application result és presenter](#16-application-result-és-presenter)
17. [React view- és HTML-válaszképzés](#17-react-view-és-html-válaszképzés)
18. [Route Handler response-képzés](#18-route-handler-response-képzés)
19. [Server Action eredmény és redirect](#19-server-action-eredmény-és-redirect)
20. [Response-fázis: headerek, cookie-k, cache](#20-response-fázis-headerek-cookie-k-cache)
21. [Streaming, Suspense és response commit](#21-streaming-suspense-és-response-commit)
22. [`after()` mint terminate-megfelelő](#22-after-mint-terminate-megfelelő)
23. [Tartós side effect, queue és outbox](#23-tartós-side-effect-queue-és-outbox)
24. [Hibák teljes lifecycle-ja](#24-hibák-teljes-lifecycle-ja)
25. [Expected hibák és application resultok](#25-expected-hibák-és-application-resultok)
26. [Not found, redirect és control-flow interrupt](#26-not-found-redirect-és-control-flow-interrupt)
27. [Váratlan exception és error boundary](#27-váratlan-exception-és-error-boundary)
28. [Route Handler problem response](#28-route-handler-problem-response)
29. [`instrumentation.ts` és `onRequestError`](#29-instrumentationts-és-onrequesterror)
30. [Állapotreset és hosszú életű process](#30-állapotreset-és-hosszú-életű-process)
31. [AsyncLocalStorage és request-scope](#31-asynclocalstorage-és-request-scope)
32. [Erőforrás-cleanup és cancellation](#32-erőforrás-cleanup-és-cancellation)
33. [Event listenerek helyett explicit pipeline](#33-event-listenerek-helyett-explicit-pipeline)
34. [Controller-attribútumok helyett delivery contract](#34-controller-attribútumok-helyett-delivery-contract)
35. [Extensionök sorrendje és short-circuit szemantika](#35-extensionök-sorrendje-és-short-circuit-szemantika)
36. [Teljes működő példa](#36-teljes-működő-példa)
37. [HTML Page példa](#37-html-page-példa)
38. [JSON Route Handler példa](#38-json-route-handler-példa)
39. [Server Action példa](#39-server-action-példa)
40. [Subrequestek Winzard-megfelelője](#40-subrequestek-winzard-megfelelője)
41. [RSC requestek, prefetch és belső navigáció](#41-rsc-requestek-prefetch-és-belső-navigáció)
42. [Erőforrások és package-owned fájlok feloldása](#42-erőforrások-és-package-owned-fájlok-feloldása)
43. [Custom server és adapterhatár](#43-custom-server-és-adapterhatár)
44. [Node, serverless és platformkülönbségek](#44-node-serverless-és-platformkülönbségek)
45. [Cache, request memoization és request isolation](#45-cache-request-memoization-és-request-isolation)
46. [Biztonsági kernelkövetelmények](#46-biztonsági-kernelkövetelmények)
47. [Idempotencia, concurrency és tranzakció](#47-idempotencia-concurrency-és-tranzakció)
48. [Observability, trace és metric](#48-observability-trace-és-metric)
49. [Tesztelési stratégia](#49-tesztelési-stratégia)
50. [Architecture checkek és hibakódok](#50-architecture-checkek-és-hibakódok)
51. [Forge diagnosztikai parancsok](#51-forge-diagnosztikai-parancsok)
52. [Implementációs elfogadási kritériumok](#52-implementációs-elfogadási-kritériumok)
53. [Hibaelhárítás](#53-hibaelhárítás)
54. [Symfony–Winzard megfeleltetés](#54-symfonywinzard-megfeleltetés)
55. [Források és attribúció](#55-források-és-attribúció)


---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy biztonsági, adatvédelmi, állapotizolációs, cache-, megfigyelhetőségi vagy architekturális hibát okozhat;
- **TILOS / MUST NOT**: a megoldás Winzard-kompatibilis kódban nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni és tesztelni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak explicit trade-off és owner mellett használható;
- **OPCIONÁLIS / MAY**: a projekt követelményei szerint bevezethető.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Delivery kernel** | A Next.js és a hosting platform által biztosított request-, routing-, rendering-, streaming- és response-pipeline. |
| **Application kernel** | Frameworkfüggetlen application queryk, commandok, policyk, portok és resultok összessége. |
| **Composition root** | Az a szerveroldali hely, ahol az application műveletek konkrét adaptereket kapnak. |
| **Entrypoint** | Page, Route Handler, Server Action/Server Function, metadata handler vagy más framework által meghívott belépési pont. |
| **RequestContext** | Egy requesthez tartozó minimális, immutable technikai és biztonsági kontextus. |
| **Actor** | Az authentikált vagy anonim kezdeményező normalizált application-szintű reprezentációja. |
| **Policy** | Explicit, tesztelhető döntés arról, hogy egy művelet engedélyezett-e, illetve milyen preconditionök szükségesek. |
| **Presenter** | Application resultból React view modelt vagy HTTP DTO-t képező tiszta adapter. |
| **Short-circuit** | A pipeline korai lezárása response, redirect, rewrite, not-found vagy elutasítás miatt. |
| **Response commit** | Az a pont, amely után a státusz, header és cookie már nem módosítható megbízhatóan. |
| **After-response work** | A response vagy prerender befejezése után futó, nem blokkoló, nem feltétlenül tartós feladat. |
| **Request isolation** | Annak biztosítása, hogy egy request állapota ne szivárogjon másik requestbe. |
| **Subrequest** | Symfonyban a kernelen belül indított második request–response ciklus; Winzardban alapértelmezetten kerülendő. |
| **Kernel extension** | A lifecycle egy explicit és dokumentált pontjára illesztett policy, wrapper, presenter, hook vagy instrumentation adapter. |

### 1.3. A „request” több jelentése

A dokumentum megkülönbözteti:

```text
hálózati HTTP request
Next.js Web Request / NextRequest
React Server Component navigációs request
Server Action POST
alkalmazási command/query input
külső szolgáltatás felé indított HTTP request
```

Ezek nem cserélhetők fel egymással. Az application input nem lehet nyers Web `Request`, és egy szerveroldali komponens által indított saját `/api` hívás nem azonos az application művelet közvetlen meghívásával.

### 1.4. A „response” több jelentése

```text
Web Response
NextResponse
React tree
RSC payload
HTML stream
Server Action state
application result
redirect/notFound control flow
```

A delivery adapter feladata, hogy az application resultot a belépési ponthoz illeszkedő válaszformára képezze.


---

## 2. Hatókör és kizárások

### 2.1. Mire vonatkozik?

A fejezet vonatkozik:

- Next.js App Router Page-ekre és Layoutokra;
- Route Handlerekre;
- Server Actionökre és más Server Functionökre;
- Proxyra;
- `instrumentation.ts` hookokra;
- React Server Component renderelésre;
- streamingre és Suspense boundarykre;
- request-context képzésre;
- authentikációs, authorizációs, tenant-, locale-, rate-limit- és idempotencia-policykra;
- application query/command meghívására;
- HTTP DTO-, view model- és problem response-képzésre;
- response headerekre, cookie-kra és cache policyra;
- `after()` használatára;
- exception mappingre és observabilityre;
- hosszú életű Node.js process állapotizolációjára;
- package-, template- és recipe-owned lifecycle extensionökre.

### 2.2. Mire nem vonatkozik?

Nem cél:

- a Next.js saját routerének vagy renderelőjének újraimplementálása;
- egy Symfony-klón EventDispatcher bevezetése minden request-fázisra;
- univerzális service locator;
- minden Page és Route Handler kötelező wrapperláncba kényszerítése;
- application service-ek Web `Request` vagy `NextRequest` típushoz kötése;
- üzleti domain eventek és HTTP-kernel eventek összemosása;
- automatikus ORM entity injection route paraméterből;
- Proxyra bízott kizárólagos authorizáció;
- `after()` használata queue vagy outbox helyett;
- custom Next.js server létrehozása pusztán lifecycle-hookok kedvéért;
- második, runtime reflectionre épülő controller-attribútum rendszer;
- belső HTTP subrequest használata moduláris monoliton belüli függőségként.

### 2.3. AI- és dokumentációs kernel nem része ennek a fejezetnek

A Project Vault, AI context package és dokumentációs lifecycle más szerződés. A jelen fejezet kizárólag az alkalmazás futásidejű HTTP- és rendering-lifecycle-ját dokumentálja.

### 2.4. Támogatott baseline

```text
Node.js:        24.x
pnpm:           11.x
Next.js:        16.2.10
React:          19.2.x
TypeScript:     5.9.x
App Router:     igen
src/ layout:    igen
```

A példák Node.js runtime-ra készültek, hacsak a fejezet külön nem jelöli a Proxy-, serverless- vagy platformfüggő viselkedést.


---

## 3. A Symfony HttpKernel lényege

A Symfony HttpKernel formális szerződése egy `Request` objektumból `Response` objektumot állít elő. A konkrét implementáció eseményekkel szervezi a folyamatot:

```text
Request
  → kernel.request
  → controller resolution
  → kernel.controller
  → controller argument resolution
  → controller call
  → kernel.view, ha nincs Response
  → kernel.response
  → Response
  → kernel.terminate
```

Bármely szakaszban keletkező exception a `kernel.exception` ágba kerül. Hosszú életű process esetén a request végén reset szükséges.

A modell értéke nem az eseménynevekben van, hanem az alábbi tulajdonságokban:

1. a request–response transzformáció explicit életciklus;
2. a route és a controller feloldása külön lépés;
3. a controller argumentumai kontrolláltan képződnek;
4. a controller eredménye response-szá alakítható;
5. a válasz a küldés előtt módosítható;
6. a küldés utáni munka külön fázis;
7. a hibák központilag leképezhetők;
8. a bővítési pontok sorrendje és short-circuit viselkedése ismert;
9. a subrequest megkülönböztethető a fő requesttől;
10. hosszú életű runtime-ban az állapot resetelhető.

A Winzard ezeket a tulajdonságokat tartja meg, de nem másolja át a Symfony PHP-specifikus mechanizmusait.


---

## 4. A Winzard kernelmodellje

### 4.1. Nincs egyetlen `WinzardKernel` osztály

A Next.js már biztosítja:

- a HTTP szervert vagy platformadaptert;
- a route matchinget;
- a Page, Layout és Route Handler feloldását;
- a Server Function protokollt;
- a React Server Component renderelést;
- a streaminget;
- a redirect- és not-found control flow-t;
- a route-segment error boundaryket;
- a response küldését.

Ezek köré egy második runtime kernel építése duplikált routingot, eltérő cache-szemantikát, hibás RSC-kezelést és deployment-kompatibilitási kockázatot hozna létre.

### 4.2. Winzard application kernel

Az application kernel frameworkfüggetlen:

```text
application/
  commands/
  queries/
  dto/
  errors/
  ports/
  policies/
```

Példa:

```ts
export class GetProduct {
  constructor(
    private readonly products: ProductReadRepository,
    private readonly policy: ProductReadPolicy,
  ) {}

  async execute(
    input: GetProductInput,
    context: ApplicationContext,
  ): Promise<GetProductResult> {
    // frameworkfüggetlen use case
  }
}
```

### 4.3. Winzard composition kernel

A composition root felel:

- adapterpéldányok létrehozásáért;
- config injektálásáért;
- port–adapter összerendelésért;
- application műveletek összeállításáért;
- opcionális dekorátorokért, például tracing vagy cache;
- requestfüggetlen, immutable modulgráf publikálásáért.

```ts
import 'server-only';

export function createCatalogModule(dependencies: CatalogDependencies) {
  return Object.freeze({
    queries: Object.freeze({
      getProduct: new GetProduct(
        dependencies.productReadRepository,
        dependencies.productReadPolicy,
      ),
    }),
  });
}
```

### 4.4. Delivery pipeline

A delivery pipeline belépési pontonként explicit:

```text
raw request input
→ request context
→ operation schema
→ policy/precondition
→ application query/command
→ presenter
→ React tree / Response / action state
```

Nem minden fázis igényel külön osztályt. A követelmény az, hogy a felelősségek és a függési irányok egyértelműek legyenek.


---

## 5. A teljes request–response életciklus

A Winzard logikai lifecycle-ja:

```text
0. Hosting platform / reverse proxy / CDN
1. next.config headers
2. next.config redirects
3. Proxy
4. rewrites és Next.js filesystem routing
5. entrypoint feloldás
6. raw input beolvasás
7. RequestContext létrehozás
8. authentication és tenant resolution
9. operation-specifikus validáció
10. authorizáció, rate limit, CSRF, idempotencia
11. application query/command
12. application result
13. presenter / response mapper
14. React render vagy Web Response
15. cache, security header és cookie policy
16. streaming / response commit
17. after-response munka
18. error reporting, metric és cleanup
```

### 5.1. Kétféle sorrend

A fenti lista logikai sorrend. A tényleges Next.js/React végrehajtás:

- párhuzamosíthat route-szegmenseket;
- előre renderelhet statikus részeket;
- streamelhet Suspense boundaryket;
- buildidőben vagy revalidation során futtathat kódot;
- külön RSC payload requestet kezelhet;
- platformfüggően futtathat `after()` callbacket.

Ezért az application kód nem támaszkodhat arra, hogy két komponens vagy két független fetch pontosan milyen időbeli sorrendben fut.

### 5.2. Invariánsok

Minden támogatott lifecycle-ban KÖTELEZŐ:

- a request- és user-specifikus állapot izolálása;
- a security döntés megismétlése az érdemi művelet határán;
- a nyers input validálása;
- a response és a presenter explicit kezelése;
- a side effect ownership meghatározása;
- a hibák és logok redakciója;
- az abort és timeout lehetőség szerinti továbbadása;
- a cache scope dokumentálása.


---

## 6. Hálózati és platform-előszakasz

A request a Next.js előtt is több rendszeren haladhat át:

```text
browser vagy API client
→ DNS
→ CDN / WAF
→ load balancer
→ reverse proxy
→ hosting adapter
→ Next.js
```

### 6.1. Platformtulajdonú feladatok

Jellemzően platformszinten kezelendő:

- TLS termination;
- HTTP/2 vagy HTTP/3;
- maximális header- és bodyméret;
- request timeout;
- DDoS-védelem;
- hálózati rate limiting;
- bot- és WAF-policy;
- gzip/brotli;
- edge cache;
- connection draining;
- health check routing;
- platform request ID.

A Winzard application nem feltételezheti, hogy ezek automatikusan helyesek. A deployment contractnak dokumentálnia kell őket.

### 6.2. Trusted proxy boundary

A következő headerek csak konfigurált, megbízható proxytól fogadhatók el:

```text
Forwarded
X-Forwarded-For
X-Forwarded-Host
X-Forwarded-Proto
X-Real-IP
```

Közvetlen internetről érkező, kliens által megadott forwarded header nem lehet:

- canonical origin forrása;
- tenantfeloldás alapja;
- audit IP hiteles forrása;
- secure-cookie döntés egyetlen alapja;
- redirect target.

### 6.3. Normalizálás

A Next.js-be jutás előtt vagy Proxyban egyértelmű policy szükséges:

- host kisbetűsítése;
- port normalizálása;
- IDN/punycode kezelése;
- trailing slash;
- percent-encoding;
- dupla slash;
- path hossz;
- query hossz;
- tiltott method;
- nem támogatott content encoding.

A normalizálás nem változtathat aláírt URL vagy webhook signature alapjául szolgáló raw byte-okon anélkül, hogy a signature contract ezt figyelembe venné.

### 6.4. Request ID

Ha a megbízható platform ad request ID-t, az normalizálható. Ellenkező esetben az application generáljon új, logbiztos azonosítót.

```ts
export function resolveRequestId(headers: Headers): string {
  const platformId = headers.get('x-platform-request-id');

  return platformId && /^[A-Za-z0-9._:-]{1,128}$/u.test(platformId)
    ? platformId
    : crypto.randomUUID();
}
```

A kliens által küldött tetszőleges `x-request-id` nem írhatja felül automatikusan a belső korrelációs azonosítót.


---

## 7. `next.config` headerek és redirectek

A Next.js request-feldolgozásának korai lépései között szerepelnek a `next.config` statikus header- és redirect-szabályai.

### 7.1. Headerek

Alkalmasak például:

- statikus security headerekre;
- legacy route cache policyjára;
- állandó CORS policy egy szűk route-csoportra;
- kompatibilitási headerekre;
- deprecation headerekre.

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/public/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 7.2. Redirectek

A statikus, requestfüggetlen URL-migráció a `redirects()` megfelelő helye:

```ts
async redirects() {
  return [
    {
      source: '/old-products/:path*',
      destination: '/products/:path*',
      permanent: true,
    },
  ];
}
```

Nem ide való:

- user role alapján eltérő redirect;
- adatbázisból feloldott tenant;
- auth sessiontől függő login flow;
- runtime feature flag;
- per-request experiment.

### 7.3. Build-time contract

A `next.config` build-time vagy szerverindítási konfiguráció. A benne használt környezeti érték:

- befolyásolhatja a build artifactot;
- nem feltétlenül változtatható új build nélkül;
- nem lehet request-specifikus;
- nem lehet secretet válaszba vagy kliensbundle-be szivárogtató érték.

### 7.4. Prioritás

A Next.js dokumentált végrehajtási sorrendjében a `headers` és `redirects` a Proxy előtt fut. Emiatt egy statikus redirect short-circuitolhatja a requestet, mielőtt application-level auth vagy logging futna.

Következmény:

> Biztonsági auditnál a route-fát, a `next.config` redirecteket és a Proxy matchert együtt kell vizsgálni.


---

## 8. Proxy mint pre-routing adapter

### 8.1. Szerep

A `proxy.ts` a route renderelése előtt futó, Next.js-specifikus adapter. Képes:

- redirectre;
- rewrite-ra;
- request header továbbadására;
- response header vagy cookie beállítására;
- közvetlen response-ra;
- matcher alapú szűrésre.

### 8.2. Tipikus Winzard-feladatok

Megengedett:

- locale vagy tenant host normalizálása;
- legacy URL rewrite;
- egyszerű session-jelenlét ellenőrzés;
- coarse rate-limit;
- request ID továbbadása;
- maintenance redirect;
- bot- vagy régióalapú routing;
- static assetek kizárása a pipeline-ból.

### 8.3. Amit Proxy nem birtokolhat

TILOS kizárólag Proxyra bízni:

- erőforrásszintű authorizációt;
- üzleti jogosultságot;
- destructive mutation engedélyezését;
- domain policyt;
- adatbázis-tranzakciót;
- komplex repository queryt;
- application commandot;
- durable side effectet.

A Proxy matcher megváltozhat, és a Server Function ugyanazon route POST-jaként működik. Ezért minden Page, Route Handler és Server Action az érdemi művelet előtt ismételten ellenőrzi a security contextet.

### 8.4. Nincs megosztott request state

A Proxy külön végrehajtási környezetben futhat. Nem szabad arra támaszkodni, hogy:

```text
proxy.ts globális változója
  → ugyanabban a memóriában elérhető lesz a Page-ben
```

Információátadás támogatott formái:

- request header;
- cookie;
- rewrite URL;
- redirect;
- közvetlen response.

A továbbított header:

- legyen név szerint allowlistelt;
- ne legyen kliens által felülírható;
- kapjon belső prefixet;
- legyen méretkorlátozott;
- ne tartalmazzon secretet vagy teljes user objektumot.

### 8.5. Példa: belső request ID

```ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = crypto.randomUUID();

  requestHeaders.set('x-winzard-request-id', requestId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Az entrypoint továbbra is validálja a header formátumát, mert a deployment topológiának biztosítania kell, hogy a külső kliens ne tudja megbízhatóként injektálni.

### 8.6. RSC-konzisztencia

A Proxy nem kezelheti eltérően ugyanazon route HTML- és RSC-requestjét biztonsági vagy tenant szempontból. Rewrite esetén a Next.js saját mechanizmusát kell használni; egy kézzel írt proxy `fetch()` könnyen elveszítheti a framework belső RSC-headereit.


---

## 9. Route-feloldás és entrypoint-kiválasztás

### 9.1. A controller resolver megfelelője

Symfonyban a controller resolver request attribútumokból callable-t képez. Winzardban ezt a feladatot a Next.js compiler és App Router végzi a fájlrendszer alapján.

```text
src/app/products/[productId]/page.tsx
  → /products/:productId HTML/RSC Page

src/app/api/products/[productId]/route.ts
  → /api/products/:productId Route Handler
```

A Winzard nem ír runtime `getController()` függvényt.

### 9.2. Entrypoint-típusok

A route-feloldás eredménye lehet:

- Page;
- Layout vagy Template a renderfában;
- Route Handler;
- Server Function/Server Action hívás;
- metadata handler;
- image/sitemap/robots handler;
- not-found vagy error boundary;
- redirect/rewrite cél;
- static asset.

### 9.3. Route és application operation különválasztása

Egy entrypoint nem azonos a use case-szel.

```text
GET /products/:id page
GET /api/products/:id
admin preview panel
email preview
CLI export
```

mind ugyanazt a `GetProduct` application queryt használhatja, külön presenterrel.

### 9.4. Route collision

A filesystem route-fának egyértelműnek kell lennie. Különösen vizsgálandó:

- statikus szegmens és `[slug]`;
- catch-all;
- route group;
- Page és Route Handler azonos szegmensben;
- intercepting route;
- parallel route slot;
- `next.config` rewrite cél;
- Proxy rewrite;
- legacy alias.

A már elérhető Forge routing diagnosztika használható:

```bash
pnpm forge route:list --project .
pnpm forge route:inspect "/products/[productId]" --project .
pnpm forge route:match "/products/123" --project .
pnpm forge route:check --project .
pnpm forge route:aliases --project .
pnpm forge route:docs --project .
```

A pontos CLI-opciókat az aktuális Forge-referencia határozza meg.


---

## 10. Page, Route Handler és Server Action

### 10.1. Page

A Page:

- React tree-t ad vissza;
- alapértelmezetten Server Component;
- része a layout- és Suspense-fának;
- HTML-t és RSC payloadot eredményezhet;
- használhat `params`, `searchParams`, `cookies()` és `headers()` inputot;
- nem ad vissza Web `Response`-ot;
- nem állíthat cookie-t renderelés közben.

### 10.2. Route Handler

A Route Handler:

- Web `Request`/`Response` API-ra épül;
- explicit HTTP-metódust exportál;
- teljes kontrollt ad status, header és body felett;
- nem része a React component tree request memoizationjének;
- alkalmas API-ra, webhookra, fájlra, SSE-re és más HTTP-contractra.

### 10.3. Server Action / Server Function

A Server Action:

- szerveren futó mutation entrypoint;
- gyakran form `action` vagy klienshívás indítja;
- ugyanúgy bizalmatlan inputot kap;
- újra ellenőrzi az authot és authorizációt;
- application commandot hív;
- action state-et, redirectet vagy revalidationt eredményezhet.

### 10.4. Döntési táblázat

| Igény | Entrypoint |
| --- | --- |
| HTML/RSC oldal | Page |
| Publikus JSON API | Route Handler |
| Webhook | Route Handler |
| Fájlstream/SSE | Route Handler |
| React form mutation | Server Action |
| Böngészőtől független API mutation | Route Handler |
| Statikus redirect | `next.config` |
| Requestfüggő rewrite | Proxy |
| Komponensfragment | Server Component, nem belső HTTP subrequest |

### 10.5. Vékony adapter elv

Mindhárom entrypoint KÖTELEZŐEN:

1. beolvassa a saját inputját;
2. validálja;
3. request contextet képez;
4. meghívja az application műveletet;
5. explicit választ képez.

Nem birtokolhat domain workflow-t vagy közvetlen ORM-hozzáférést.


---

## 11. Request input és argumentumfeloldás

Symfonyban az argument resolver reflection és value resolverek alapján képezi a controller paramétereit. Winzardban a feloldás explicit, entrypoint-specifikus kód.

### 11.1. Inputforrások

```text
route params
search params
HTTP method
headers
cookies
body
FormData
host/origin
AbortSignal
platform metadata
session
Proxy által továbbított belső headerek
```

### 11.2. Page input

```ts
type ProductPageProps = PageProps<'/products/[productId]'>;

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const rawParams = await params;
  const rawSearch = await searchParams;
  // explicit mapping
}
```

A generated TypeScript típus csak a route alakját igazolja. Nem igazolja, hogy a `productId` UUID, slug, ULID vagy engedélyezett üzleti azonosító.

### 11.3. Route Handler input

```ts
export async function POST(
  request: Request,
  context: RouteContext<'/api/products/[productId]'>,
): Promise<Response> {
  const params = await context.params;
  const contentType = request.headers.get('content-type');
  const rawBody = await request.json();
}
```

A request body jellemzően egyszer olvasható. Signature verification esetén előre meg kell határozni, hogy raw bytes vagy parsed JSON a hitelesítési contract.

### 11.4. Server Action input

```ts
'use server';

export async function updateProductAction(
  previousState: UpdateProductState,
  formData: FormData,
): Promise<UpdateProductState> {
  const raw = {
    productId: formData.get('productId'),
    name: formData.get('name'),
  };
}
```

A hidden field nem megbízhatóbb, mint bármely más kliensinput.

### 11.5. Operation schema

```ts
import { z } from 'zod';

export const productIdSchema = z
  .string()
  .uuid()
  .transform((value) => value as ProductId);

export const updateProductBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
}).strict();
```

A schema:

- operation-specifikus;
- unknown mezőknél explicit policyt használ;
- méret- és darabszámkorlátot ad;
- nem változtat ORM-inputtá automatikusan;
- stabil publikus hibakódokra képezhető.


---

## 12. RequestContext és korreláció

### 12.1. Cél

A `RequestContext` minimális, immutable technikai kontextus:

```ts
export type RequestContext = Readonly<{
  requestId: string;
  traceId?: string;
  actor: Actor;
  tenantId?: TenantId;
  locale: Locale;
  receivedAt: Date;
  clientIp?: string;
  userAgent?: string;
}>;
```

### 12.2. Nem tartalmazhat

TILOS beletenni:

- teljes `Request` objektumot;
- mutable `Headers` vagy cookie store-t;
- Prisma Clientet;
- logger service locatort;
- teljes session payloadot;
- nyers authorization tokent;
- secretet;
- nagy request body-t;
- Response buildert.

### 12.3. Factory

```ts
import 'server-only';

export async function createRequestContext(
  input: RequestContextInput,
): Promise<RequestContext> {
  const actor = await input.authenticator.authenticate(input);
  const tenantId = await input.tenantResolver.resolve(input);
  const locale = input.localeResolver.resolve(input);

  return Object.freeze({
    requestId: input.requestId,
    traceId: input.traceId,
    actor,
    tenantId,
    locale,
    receivedAt: new Date(),
    clientIp: input.clientIp,
    userAgent: input.userAgent,
  });
}
```

### 12.4. ApplicationContext

Az application rétegnek gyakran még ennél is szűkebb context kell:

```ts
export type ApplicationContext = Readonly<{
  actor: Actor;
  tenantId?: TenantId;
  requestId: string;
  locale: Locale;
}>;
```

A delivery `RequestContext` presenter- és telemetry-adatot is tartalmazhat; az application operation csak a szükséges mezőket kapja.

### 12.5. Korreláció

A `requestId`:

- minden logban strukturált mező;
- bekerülhet problem response `instance` vagy támogatási azonosító mezőjébe;
- nem tartalmazhat személyes adatot;
- nem lehet authorizációs token;
- nem lehet kliens által korlátlanul választott log-injection string.


---

## 13. Actor-, tenant- és locale-feloldás

### 13.1. Actor

Az actor feloldása történhet:

- signed session cookie-ból;
- bearer tokenből;
- API keyből;
- mTLS identitásból;
- webhook signature-ből;
- anonim actorból.

Normalizált contract:

```ts
export type Actor =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{
      kind: 'user';
      userId: UserId;
      roles: readonly Role[];
      sessionId: SessionId;
    }>
  | Readonly<{
      kind: 'service';
      serviceId: ServiceId;
      scopes: readonly Scope[];
    }>;
```

A nyers token nem jut az application rétegbe.

### 13.2. Tenant

Tenant nem származhat kizárólag request bodyból. Lehetséges megbízható forrás:

- validált host → tenant registry;
- sessionhez kötött tenant;
- token claim;
- explicit admin választás, authorizációval;
- route paraméter, majd membership policy.

Az application repository query minden tenant-owned adathoz tenant scope-ot kap.

### 13.3. Locale

A locale prioritása például:

```text
explicit route locale
→ user preference
→ tenant default
→ Accept-Language
→ application default
```

A locale allowlistelt enum, nem tetszőleges string.

### 13.4. Feloldási sorrend

A sorrend biztonsági döntés:

```text
request normalization
→ session/token parse
→ actor
→ host/route tenant candidate
→ tenant membership
→ locale
```

Ha a tenantfeloldás actorhoz kötött, azt nem szabad az authentication előtt véglegesíteni.

### 13.5. Failure mapping

| Hiba | Tipikus eredmény |
| --- | --- |
| Hiányzó session nyilvános oldalon | anonymous actor |
| Hiányzó session védett Page-en | login redirect |
| Hiányzó token API-n | 401 |
| Hibás token | 401, redaktált log |
| Authenticated, de tiltott művelet | 403 vagy concealment 404 |
| Ismeretlen tenant host | 404 vagy domain-not-configured |
| Nem támogatott locale | canonical redirect vagy 404 |


---

## 14. Pre-controller policyk és short-circuit

A Symfony `kernel.request` esemény képes requestet dúsítani vagy korai response-t adni. Winzardban ezt több explicit réteg valósítja meg.

### 14.1. Korai policyk

Lehetséges:

- maintenance mode;
- host allowlist;
- locale redirect;
- coarse authentication;
- rate limit;
- CSRF;
- CORS preflight;
- idempotency reservation;
- media type check;
- request body limit;
- conditional request;
- feature availability;
- tenant state.

### 14.2. Short-circuit típusok

```text
Response
redirect()
permanentRedirect()
notFound()
rewrite
action error state
application denial result
throw unexpected error
```

### 14.3. Explicit wrapper

Route Handlerhez használható explicit wrapper:

```ts
export type HttpHandler<C> = (
  request: Request,
  context: C,
) => Promise<Response>;

export type HttpInterceptor<C> = (
  next: HttpHandler<C>,
) => HttpHandler<C>;

export function composeHttpInterceptors<C>(
  handler: HttpHandler<C>,
  interceptors: readonly HttpInterceptor<C>[],
): HttpHandler<C> {
  return interceptors.reduceRight(
    (next, interceptor) => interceptor(next),
    handler,
  );
}
```

A wrapperlista egy helyen, determinisztikusan látható:

```ts
export const POST = composeHttpInterceptors(postProduct, [
  withErrorMapping(),
  withRequestTelemetry(),
  withBodyLimit({ bytes: 32_768 }),
  withAuthentication(),
  withIdempotency(),
]);
```

### 14.4. Wrapper korlát

A wrapper nem rejtheti el:

- melyik policy fut;
- milyen sorrendben;
- milyen response-t adhat;
- milyen request-adatot módosít;
- milyen side effectet végez;
- hogyan logol;
- hogyan propagálja az abortot.

### 14.5. Page policy

Page-nél gyakran jobb az explicit kód:

```ts
const context = await createPageContext();
const access = await catalogPolicy.canViewProduct(context.actor, productId);

if (access === 'login_required') {
  redirect(loginRoutes.signIn({ returnTo: productRoutes.detail(productId) }));
}

if (access === 'hidden') {
  notFound();
}
```

A policy az application vagy security rétegben marad; a Page csak az eredményt képezi UI control flow-ra.


---

## 15. Application művelet meghívása

### 15.1. Entrypoint nem workflow owner

A delivery adapter az application művelet egyetlen publikus metódusát hívja:

```ts
const result = await catalogModule.queries.getProduct.execute(
  { productId },
  applicationContext,
);
```

TILOS a Page-ben vagy Route Handlerben:

```text
repository A betöltés
→ repository B betöltés
→ domain objektum módosítás
→ Prisma transaction
→ email küldés
→ cache invalidálás
```

Ez application command felelősség.

### 15.2. Query és command

```text
Query
  → adatot olvas
  → explicit DTO/result
  → nincs üzleti mutation

Command
  → authorizál
  → state transition
  → transaction
  → outbox
  → explicit result
```

CQRS-lite esetén nem szükséges külön adatbázis vagy busz; a különbség a felelősségben és a result contractban van.

### 15.3. Application result

```ts
export type GetProductResult =
  | Readonly<{ kind: 'found'; product: ProductDetailDto }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'forbidden' }>;
```

A várható állapotok resultként térnek vissza. Váratlan infrastruktúrahiba vagy programhiba exception.

### 15.4. Timeout és cancellation

Az operation input opcionálisan kaphat deadline/abort portot:

```ts
export type OperationControl = Readonly<{
  signal?: AbortSignal;
  deadline?: Date;
}>;
```

Route Handlerben a `request.signal` továbbadható olyan adapternek, amely támogatja. Az adapternek dokumentálnia kell, hogy valóban megszakítja-e a külső I/O-t.

### 15.5. Idempotencia

Mutation commandhoz az idempotency kulcs application-szintű contract:

```ts
await catalogModule.commands.createProduct.execute(
  {
    input,
    idempotencyKey,
  },
  applicationContext,
);
```

A Route Handler csak beolvassa és validálja a kulcsot; a deduplikáció, lock és result replay application/infrastructure felelősség.


---

## 16. Application result és presenter

### 16.1. A `kernel.view` megfelelője

Symfonyban a `kernel.view` egy nem-Response controller return value-t alakíthat Response-szá. Winzardban ezt explicit presenter végzi.

```text
application result
→ Page presenter
→ view model
→ React tree
```

vagy:

```text
application result
→ HTTP presenter
→ status + headers + DTO
→ Response
```

### 16.2. Page presenter

```ts
export type ProductPageViewModel = Readonly<{
  title: string;
  formattedPrice: string;
  editHref?: string;
  availabilityLabel: string;
}>;

export function presentProductPage(
  dto: ProductDetailDto,
  context: PresentationContext,
): ProductPageViewModel {
  return Object.freeze({
    title: dto.name,
    formattedPrice: context.money.format(dto.price),
    editHref: dto.permissions.canEdit
      ? productRoutes.edit(dto.id)
      : undefined,
    availabilityLabel: context.messages.translate(
      `product.availability.${dto.availability}`,
    ),
  });
}
```

### 16.3. HTTP presenter

```ts
export type ProductHttpDto = Readonly<{
  id: string;
  name: string;
  price: Readonly<{
    amount: string;
    currency: string;
  }>;
}>;

export function presentProductHttp(
  dto: ProductDetailDto,
): ProductHttpDto {
  return {
    id: dto.id,
    name: dto.name,
    price: {
      amount: dto.price.amount.toFixed(2),
      currency: dto.price.currency,
    },
  };
}
```

### 16.4. Presenter invariánsok

A presenter:

- nem olvas adatbázist;
- nem authorizál újra infrastruktúrából;
- nem küld emailt;
- nem mutál sessiont;
- nem hív belső API-t;
- nem kap Prisma rekordot;
- nem tesz secretet a kimenetbe;
- determinisztikusan tesztelhető;
- explicit null/optional szemantikát használ.

### 16.5. Content negotiation

Ha egy endpoint több media type-ot támogat, a negotiation explicit:

```text
Accept header
→ allowlist
→ presenter selection
→ Content-Type
```

Nem ajánlott ugyanazt a Page-et vagy Route Handlert rejtett globális serializerrel automatikusan HTML-, JSON- és XML-válaszra alakítani.


---

## 17. React view- és HTML-válaszképzés

### 17.1. Page eredménye

A Page React elemet ad:

```tsx
export default async function ProductPage(
  props: PageProps<'/products/[productId]'>,
) {
  const { productId: rawProductId } = await props.params;
  const productId = productIdSchema.parse(rawProductId);
  const requestContext = await createPageRequestContext();

  const result = await catalogModule.queries.getProduct.execute(
    { productId },
    toApplicationContext(requestContext),
  );

  switch (result.kind) {
    case 'not_found':
      notFound();

    case 'forbidden':
      notFound();

    case 'found':
      return (
        <ProductDetailView
          model={presentProductPage(result.product, {
            locale: requestContext.locale,
            money: moneyFormatter,
            messages,
          })}
        />
      );
  }
}
```

### 17.2. React render nem Web Response

Page-ben nincs közvetlen:

```ts
return new Response(...)
```

A státuszt és transportot a framework kezeli. Ha teljes HTTP-kontroll kell, Route Handler szükséges.

### 17.3. Layout és nested render

A renderfa több entrypoint együttműködése:

```text
root layout
→ nested layout
→ template
→ loading/error boundary
→ page
→ nested Server Components
→ Client islands
```

A Layout nem kérheti le automatikusan minden gyermek Page üzleti adatait. A megosztott adat vagy:

- külön application query;
- request-local memoized loader;
- explicit provider;
- route-specifikus composition.

### 17.4. Static és request-time render

A lifecycle nem feltétlenül bejövő requestkor fut. A Page:

- buildidőben prerenderelődhet;
- revalidation során futhat;
- request-time dinamikus lehet;
- cache-ből szolgálható ki.

Request-specifikus vagy időfüggő műveletnél explicit dinamikus API vagy `connection()` szükséges.

### 17.5. Mutáció render közben

TILOS Page vagy Server Component render közben:

- adatbázist módosítani;
- audit recordot kötelezően létrehozni;
- emailt küldeni;
- paymentet kezdeményezni;
- cookie-t írni;
- queue jobot garantáltan létrehozni.

A render újrapróbálható, párhuzamosítható, buildidőben futhat vagy megszakadhat.


---

## 18. Route Handler response-képzés

### 18.1. Kanonikus mapper

```ts
export function mapGetProductResult(
  result: GetProductResult,
  requestId: string,
): Response {
  switch (result.kind) {
    case 'found':
      return Response.json(presentProductHttp(result.product), {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Request-Id': requestId,
        },
      });

    case 'not_found':
      return problemResponse({
        status: 404,
        code: 'PRODUCT_NOT_FOUND',
        title: 'A termék nem található.',
        requestId,
      });

    case 'forbidden':
      return problemResponse({
        status: 403,
        code: 'PRODUCT_FORBIDDEN',
        title: 'A művelet nem engedélyezett.',
        requestId,
      });
  }
}
```

### 18.2. Response ownership

Egy Route Handler válaszának explicit contractja:

```text
status
Content-Type
Cache-Control
Vary
ETag vagy Last-Modified
Set-Cookie, ha szükséges
Location, ha redirect
security headerek
body schema
```

### 18.3. Header módosítás

A response elkészítése után, stream megkezdése előtt a headerek még módosíthatók:

```ts
const headers = new Headers({
  'Content-Type': 'application/problem+json',
  'Cache-Control': 'no-store',
  'X-Request-Id': requestId,
});

return new Response(JSON.stringify(problem), {
  status: problem.status,
  headers,
});
```

### 18.4. JSON serialization

Explicit DTO szükséges. Külön kezelendő:

- `Date`;
- `BigInt`;
- decimal;
- enum;
- binary;
- undefined;
- cyclic object;
- error;
- domain value object.

TILOS nyers ORM- vagy domainobjektumot `Response.json()`-nak átadni.

### 18.5. HEAD és OPTIONS

Ha a contract igényli, explicit tesztelendő:

- HEAD body nélkül;
- megfelelő `Content-Length` vagy streaming policy;
- OPTIONS és `Allow`;
- CORS preflight;
- cache;
- auth szükségessége.

Az automatikus OPTIONS nem helyettesíti a projekt CORS-policyját.


---

## 19. Server Action eredmény és redirect

### 19.1. Expected result

A Server Action expected hibát action state-ként ad:

```ts
export type UpdateProductState = Readonly<{
  status: 'idle' | 'invalid' | 'success' | 'forbidden';
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  formError?: string;
}>;

'use server';

export async function updateProductAction(
  previousState: UpdateProductState,
  formData: FormData,
): Promise<UpdateProductState> {
  const parsed = updateProductFormSchema.safeParse({
    productId: formData.get('productId'),
    name: formData.get('name'),
  });

  if (!parsed.success) {
    return {
      status: 'invalid',
      fieldErrors: flattenValidationErrors(parsed.error),
    };
  }

  const requestContext = await createActionRequestContext();
  const result = await catalogModule.commands.updateProduct.execute(
    parsed.data,
    toApplicationContext(requestContext),
  );

  if (result.kind === 'forbidden') {
    return {
      status: 'forbidden',
      formError: 'A módosítás nem engedélyezett.',
    };
  }

  revalidatePath(productRoutes.detail(parsed.data.productId));
  redirect(productRoutes.detail(parsed.data.productId));
}
```

### 19.2. Redirect mint control flow

A `redirect()` nem normál return value. A redirectet:

- ne hívd olyan `try` blokkból, amely általánosan elnyeli;
- ne logold váratlan exceptionként;
- ne alakítsd 500-as hibává;
- sikeres transaction után hívd;
- ne hívd side effect közepén.

### 19.3. Cookie

Cookie írás Server Actionből engedélyezett, de:

- a response stream előtt történik;
- session rotationt atomikusan kell kezelni;
- auth cookie attribútumai centralizált policyból jönnek;
- a cookie értéke nem application result;
- a domain/application réteg nem importál cookie API-t.

### 19.4. Revalidation

Mutation után csak az érintett cache scope invalidálandó:

```text
revalidatePath
revalidateTag
updateTag
```

A revalidation nem helyettesíti a database transactiont vagy az idempotenciát.


---

## 20. Response-fázis: headerek, cookie-k, cache

A Symfony `kernel.response` eseménye a kész Response elküldés előtti módosítási pont. Winzardban nincs egyetlen univerzális response event; a felelősség több explicit helyre oszlik.

### 20.1. Lehetséges helyek

```text
next.config headers
Proxy response
Route Handler response builder
Server Action cookie/redirect
Page metadata
hosting/CDN policy
HTTP adapter wrapper
```

### 20.2. Centralizálható policyk

- security headers;
- CSP;
- CORS;
- request ID;
- deprecation headers;
- cache defaults;
- content type;
- cookie attributes;
- problem response shape;
- server timing;
- observability tags.

### 20.3. Response policy helper

```ts
export function withApiResponsePolicy(
  response: Response,
  input: Readonly<{
    requestId: string;
    cacheControl?: string;
  }>,
): Response {
  const headers = new Headers(response.headers);

  headers.set('X-Request-Id', input.requestId);
  headers.set('X-Content-Type-Options', 'nosniff');

  if (input.cacheControl) {
    headers.set('Cache-Control', input.cacheControl);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
```

Stream újracsomagolásánál ellenőrizni kell, hogy a body tulajdonjoga, cancellation és platformkompatibilitás nem sérül-e.

### 20.4. Cookie-policy

Központi factory:

```ts
export const sessionCookieOptions = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
});
```

A `Domain`, `Max-Age`, partitioning és environmentfüggő `secure` szabály explicit deployment contract.

### 20.5. Cache

A response cache policy legalább ezt rögzíti:

```text
public vagy private
max-age
s-maxage
stale-while-revalidate
no-store
Vary
ETag
tenant/user scope
negative caching
```

User- vagy tenant-specifikus response nem kerülhet közös cache-be olyan kulccsal, amelyből hiányzik az izolációs dimenzió.


---

## 21. Streaming, Suspense és response commit

### 21.1. Mi változik streamingnél?

A React/Next.js részletekben küldheti:

- a statikus shellt;
- loading fallbacket;
- RSC payload chunkokat;
- később elkészülő Server Component fragmenteket.

Amint a response headerei vagy első byte-jai elküldésre kerülnek, nem lehet megbízhatóan:

- státuszt módosítani;
- cookie-t hozzáadni;
- redirect headert létrehozni;
- cache policyt átírni;
- teljes problem response-ra váltani.

### 21.2. Korai döntések

Streaming előtt KÖTELEZŐ elvégezni minden olyan döntést, amely:

- 401/403/404 státuszt igényel;
- redirectet igényel;
- session cookie-t ír;
- content type-ot választ;
- download headert ad;
- cache scope-ot változtat;
- tenantot vagy locale-t véglegesít.

### 21.3. Suspense

A Suspense boundary:

- UX fallback;
- streaming határ;
- nem security boundary;
- nem transaction boundary;
- nem exception-to-HTTP mapper;
- nem durable retry.

### 21.4. Stream közbeni hiba

Ha a response már elkezdődött:

- az error boundary UI fallbacket adhat;
- a státusz gyakran nem módosítható 500-ra;
- a kliens megszakadt payloadot kaphat;
- a hibát `onRequestError`/telemetry jelenti;
- a retry új render/request lehet;
- side effect nem indulhatott pusztán attól, hogy egy fragment renderelni kezdett.

### 21.5. Route Handler stream

```ts
export async function GET(request: Request): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // auth és validáció már megtörtént
    },
    cancel(reason) {
      // subscription és erőforrás cleanup
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}
```

A stream létrehozása előtt történik auth, authorizáció, content negotiation és limitellenőrzés.


---

## 22. `after()` mint terminate-megfelelő

### 22.1. Szerep

A Next.js `after()` callbacket ütemez a response vagy prerender befejezése után. Használható:

- strukturált access log;
- analytics;
- metric;
- best-effort audit kiegészítés;
- cache-warmup, ha elvesztése elfogadható;
- nem kritikus cleanup;
- tracing span lezárás.

### 22.2. Nem azonos a Symfony terminate-tal

A platform viselkedése eltérhet:

- Node server;
- Docker;
- serverless;
- custom adapter;
- statikus prerender;
- revalidation.

Az `after()` statikus Page-ben buildidőben vagy revalidationkor is futhat. Nem feltétlenül jelent valós user request utáni callbacket.

### 22.3. Akkor is fut, ha a response hibás

A callback futtatható akkor is, ha:

- exception történt;
- `redirect()` futott;
- `notFound()` futott;
- a response nem fejeződött be sikeresen.

Ezért a callback nem következtethet automatikusan sikeres üzleti műveletre.

### 22.4. Példa

```ts
import { after } from 'next/server';

export async function POST(request: Request): Promise<Response> {
  const requestContext = await createRouteRequestContext(request);
  const result = await command.execute(
    await mapRequest(request),
    toApplicationContext(requestContext),
  );

  after(() => {
    accessLogger.info('request.completed', {
      requestId: requestContext.requestId,
      resultKind: result.kind,
    });
  });

  return mapResult(result, requestContext.requestId);
}
```

### 22.5. Request API-k

Route Handlerben és Server Functionben a callbackből hozzáférhető lehet request API. Server Componentben a request-adatot render közben kell kiolvasni és értékként closure-be zárni.

Az application kódnak egyik esetben sem szabad `after()`-t importálnia.

### 22.6. Időtartam

Az `after()` a route/platform maximális időtartama alatt fut. Hosszú vagy bizonytalan külső I/O nem való ide.


---

## 23. Tartós side effect, queue és outbox

### 23.1. Durable és best-effort különbsége

| Feladat | `after()` | Queue/outbox |
| --- | --- | --- |
| Access log | igen | opcionális |
| Metric | igen | nem feltétlen |
| Analytics | igen, ha veszteség elfogadható | igen, ha garantált |
| Email | nem garantált | igen |
| Payment | tilos | command + durable workflow |
| Webhook | nem garantált | igen |
| Search index | nem garantált | igen |
| Inventory reservation | tilos | transaction/workflow |
| Audit legal record | csak kiegészítő | durable store |
| Cleanup ideiglenes fájlon | csak idempotensen | gyakran queue |

### 23.2. Transactional outbox

```text
application command transaction
  ├─ domain state update
  └─ outbox event insert

commit
→ worker
→ email/webhook/index
→ retry + dead letter + idempotencia
```

A response csak a command eredményét jelzi; nem állíthatja, hogy a worker már végrehajtotta a külső side effectet.

### 23.3. Failure semantics

Minden side effecthez dokumentálni kell:

- at-most-once;
- at-least-once;
- exactly-once illúzió és deduplikáció;
- retry;
- timeout;
- idempotency key;
- ordering;
- poison message;
- dead-letter;
- observability;
- compensation.

### 23.4. `after()` és outbox együtt

Megengedett:

```text
transactional outbox
+ after() wake-up hint
```

A wake-up elveszhet; a worker polling vagy más durable trigger továbbra is biztosítja a feldolgozást.


---

## 24. Hibák teljes lifecycle-ja

### 24.1. Hibatípusok

```text
expected application outcome
validation failure
authentication failure
authorization denial
not found
conflict / stale version
rate limit
unsupported media
external dependency unavailable
programhiba
infrastructure exception
render exception
stream exception
after callback exception
```

### 24.2. Felelősségi sorrend

```text
schema
→ input/validation hiba

application result
→ expected üzleti állapot

delivery mapper
→ HTTP status / action state / notFound / redirect

error boundary
→ váratlan renderhiba UI fallbackje

Route Handler catch
→ stabil problem response

instrumentation.onRequestError
→ szerveroldali hibajelentés

after telemetry
→ completion metric
```

### 24.3. Exception nem publikus DTO

TILOS közvetlenül visszaadni:

- exception message-et;
- stack trace-t;
- SQL-t;
- filesystem pathot;
- provider payloadot;
- access tokent;
- teljes request body-t;
- environment változókat.

### 24.4. Error identity

A kliens stabil támogatási azonosítót kaphat:

```json
{
  "type": "https://example.test/problems/internal-error",
  "title": "A kérés feldolgozása sikertelen.",
  "status": 500,
  "code": "INTERNAL_ERROR",
  "requestId": "2b37..."
}
```

A szerverlog ugyanazzal a `requestId`/trace ID-val tartalmazza a redaktált technikai részleteket.

### 24.5. Exception scope

Egy exception mapper csak azokat a típusokat alakítsa ismert response-szá, amelyek contractja stabil. Az ismeretlen exceptiont ne címkézze tévesen validation vagy not-found hibának.


---

## 25. Expected hibák és application resultok

A Next.js error handling modellje különválasztja a normál működés során várható hibákat és a váratlan exceptionöket. A Winzard ugyanezt teszi application resultokkal.

### 25.1. Példa result

```ts
export type UpdateProductResult =
  | Readonly<{ kind: 'updated'; product: ProductDetailDto }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{ kind: 'conflict'; currentVersion: number }>
  | Readonly<{ kind: 'validation_failed'; errors: readonly DomainError[] }>;
```

### 25.2. Page mapping

```text
not_found
  → notFound()

forbidden
  → 403 UI vagy concealment notFound()

conflict
  → konfliktus UI

validation_failed
  → form state

updated
  → view model vagy redirect
```

### 25.3. API mapping

```text
not_found          → 404
forbidden          → 403
conflict           → 409 vagy 412
validation_failed  → 422
updated            → 200/204
```

### 25.4. Ne dobj várható formhibát

Server Actionben a várható validation hiba return value. Az error boundary nem formmező-validációs UI.

### 25.5. Domain exception

Domain invariant sérülése lehet exception a domain belsejében, de az application layer:

- elkapja, ha várható inputeredmény;
- stabil resulttá képezi;
- nem szivárogtatja a delivery rétegbe nyers formában;
- vagy programhibának hagyja, ha invariant szerint elérhetetlen állapot.


---

## 26. Not found, redirect és control-flow interrupt

### 26.1. `notFound()`

A `notFound()` route-segment not-found UI-t aktivál. Használandó:

- hiányzó publikus erőforrásnál;
- existence concealment policy esetén;
- ismeretlen, de szintaktikailag érvényes slugnál;
- nem létező tenant/locale route-nál, ha ez a contract.

Nem minden invalid input 404. Hibás JSON, túl nagy body vagy érvénytelen query gyakran 400/413/422.

### 26.2. `redirect()` és `permanentRedirect()`

A redirect:

- megszakítja a normál control flow-t;
- streaming környezetben más transportmechanizmust használhat;
- Server Actionben eltérő status/history szemantikát kaphat;
- csak validált belső vagy allowlistelt külső URL-re mutathat.

### 26.3. Catch blokk

Hibás:

```ts
try {
  const result = await execute();
  redirect('/success');
} catch (error) {
  return {
    status: 'error',
    message: 'Sikertelen.',
  };
}
```

A catch a redirect control-flow exceptiont is elnyelheti.

Helyes:

```ts
let result: CreateProductResult;

try {
  result = await execute();
} catch (error) {
  return mapUnexpectedActionError(error);
}

if (result.kind === 'created') {
  redirect(productRoutes.detail(result.productId));
}
```

### 26.4. Open redirect

A `returnTo` vagy `next` paraméter:

- csak root-relative belső path;
- nem kezdődhet `//` alakban;
- nem tartalmazhat backslash-normalizálási trükköt;
- nem választhat tetszőleges protocolt;
- opcionálisan route builder/allowlist alapján validálandó.

### 26.5. Redirect és side effect

Redirect csak azután:

```text
transaction commit
→ cache invalidation ütemezés
→ durable outbox rögzítés
→ redirect
```

A redirect nem transaction rollback mechanizmus.


---

## 27. Váratlan exception és error boundary

### 27.1. Route-segment error boundary

Az `error.tsx` a legközelebbi route-segment váratlan renderhibájához ad fallback UI-t. Client Componentként működik.

A fallback:

- nem mutat stack trace-t;
- megjeleníthet általános üzenetet;
- használhat error digestet/support ID-t;
- logolhat kliensoldali hibajelentést;
- kínálhat retryt;
- nem hajt végre üzleti kompenzációt.

### 27.2. Bubbling

A hiba a legközelebbi boundary felé halad. A boundary elhelyezése architekturális döntés:

```text
root global-error
→ alkalmazásshell
→ bounded context route group
→ feature route segment
→ opcionális komponens-level boundary
```

### 27.3. `global-error.tsx`

A root layout hibáját kezeli, ezért saját `<html>` és `<body>` elemeket ad. Minimális, dependency-szegény fallback szükséges; ne támaszkodjon arra a service-re vagy providerre, amely a hibát okozhatta.

### 27.4. Hibák event handlerben

A render error boundary nem fog el minden kliens event handler vagy későbbi async callback hibát. Ezekhez explicit kliensoldali state, telemetry és recovery kell.

### 27.5. Server Component log

A szerver exception részleteit `instrumentation.ts` `onRequestError` hookja vagy szerveroldali logger rögzíti. A Client boundary csak redaktált információt kap.

### 27.6. Retry

A retry:

- újrarenderelheti a segmentet;
- új adatlekérést indíthat;
- nem ismételhet nem idempotens mutationt észrevétlenül;
- nem javít tartós dependency outage-ot;
- kapjon retry limitet és felhasználói visszajelzést.


---

## 28. Route Handler problem response

### 28.1. Problem Details

Ajánlott HTTP hibaformátum:

```ts
export type HttpProblem = Readonly<{
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  requestId: string;
  errors?: readonly Readonly<{
    path: string;
    code: string;
    message: string;
  }>[];
}>;
```

### 28.2. Factory

```ts
export function problemResponse(
  problem: HttpProblem,
  headers?: HeadersInit,
): Response {
  return Response.json(problem, {
    status: problem.status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}
```

### 28.3. Error mapper

```ts
export function mapHttpException(
  error: unknown,
  requestId: string,
): Response {
  if (error instanceof RequestBodyTooLargeError) {
    return problemResponse({
      type: '/problems/request-too-large',
      title: 'A request túl nagy.',
      status: 413,
      code: 'REQUEST_TOO_LARGE',
      requestId,
    });
  }

  logger.error('http.unexpected_error', {
    requestId,
    error: serializeErrorForLog(error),
  });

  return problemResponse({
    type: '/problems/internal-error',
    title: 'A kérés feldolgozása sikertelen.',
    status: 500,
    code: 'INTERNAL_ERROR',
    requestId,
  });
}
```

### 28.4. Headerek

Specifikus hiba adhat:

- `WWW-Authenticate`;
- `Retry-After`;
- `Allow`;
- `ETag`;
- `Location`;
- rate-limit headerek;
- deprecation headerek.

A headerértékeket is validálni kell, különösen user inputot vagy provider adatot tartalmazó mezőknél.

### 28.5. Cache

Problem response alapértelmezetten `no-store`, kivéve ha a publikus contract explicit, biztonságos negative cachinget ír elő.


---

## 29. `instrumentation.ts` és `onRequestError`

### 29.1. `register()`

Az `instrumentation.ts` `register()` hookja egyszer fut egy új Next.js szerverpéldány inicializálásakor, még a requestek fogadása előtt.

Megfelelő feladat:

- OpenTelemetry regisztráció;
- logger transport inicializálás;
- process-start konfigurációvalidáció;
- metric exporter;
- process-szintű error handler;
- platformadapter inicializálás.

Nem megfelelő:

- tenant cache feltöltése minden requesthez;
- user session létrehozása;
- request ID generálás;
- application command;
- requestfüggő locale;
- per-request mutable singleton.

### 29.2. Runtime-specifikus regisztráció

```ts
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } =
      await import('./src/platform/observability/register-node');

    await registerNodeInstrumentation();
  }
}
```

Az importált modul is legyen szerveroldali és ne kerüljön kliensbundle-be.

### 29.3. `onRequestError`

A hook a Next.js által elkapott szerverhibáról kap:

- Error objektumot és digestet;
- read-only requestinformációt;
- router kindot;
- route pathot;
- route type-ot, például render, route, action vagy proxy;
- rendering/revalidation kontextust.

### 29.4. Redakció

TILOS teljesen logolni:

- Authorization header;
- Cookie header;
- request body;
- queryben lévő token;
- webhook secret;
- személyes adat;
- payment payload;
- stack környezetben lévő secret.

### 29.5. Példa

```ts
export async function onRequestError(
  error: Error & { digest?: string },
  request: Readonly<{
    path: string;
    method: string;
    headers: Record<string, string | string[]>;
  }>,
  context: Readonly<{
    routePath: string;
    routeType: string;
    routerKind: string;
  }>,
): Promise<void> {
  await errorReporter.capture({
    digest: error.digest,
    name: error.name,
    message: sanitizeErrorMessage(error.message),
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
}
```

### 29.6. Nem üzleti event busz

Az instrumentation nem küld domain eventet, nem módosít application state-et és nem képez response-t.


---

## 30. Állapotreset és hosszú életű process

### 30.1. Miért szükséges?

Node.js server, container, serverless warm instance vagy adapter ugyanabban a processben több requestet kezelhet. Modul-szintű állapot requestek között megmaradhat.

Kockázat:

```ts
let currentUser: User | null = null;

export function setCurrentUser(user: User) {
  currentUser = user;
}
```

Ez cross-request adat- és jogosultságszivárgás.

### 30.2. Megengedett singleton

Megengedett, ha requestfüggetlen és concurrency-safe:

- DB connection pool;
- immutable config;
- stateless repository adapter;
- logger;
- telemetry exporter;
- compiled schema;
- route registry;
- pure formatter;
- cache client.

### 30.3. Tiltott mutable global

- current actor;
- current tenant;
- current request ID;
- request headers;
- transaction;
- mutable response builder;
- request-specifikus locale;
- form errors;
- per-user memoization;
- nyitott request subscription.

### 30.4. Reset nem általános megoldás

A legjobb stratégia:

```text
ne legyen request state globálisban
```

Ha third-party vagy legacy adapter belső request-state-et tart:

- explicit request-scope wrapper;
- `try/finally`;
- cleanup/reset interface;
- concurrency teszt;
- lifecycle owner;
- dokumentált limitation.

### 30.5. Dev/prod eltérés

Fejlesztésben hot reload, extra render és eltérő process-élettartam elfedheti vagy felerősítheti az állapothibát. A multi-request teszt production build ellen is fusson.

### 30.6. Memory leak

Vizsgálandó:

- növekvő Map/Set;
- be nem fejezett timer;
- event listener;
- open stream;
- retained request body;
- AbortController;
- DB client checkout;
- trace span;
- cache key robbanás.


---

## 31. AsyncLocalStorage és request-scope

### 31.1. Szerep

A Node.js `AsyncLocalStorage` képes aszinkron hívásláncon belül request-local kontextust propagálni.

Megfelelő:

- request ID;
- trace/span ID;
- log correlation;
- telemetry baggage;
- technikai deadline.

Korlátozottan használható:

- actor és tenant observabilityhez;
- audit metadata továbbadásához.

Nem ajánlott az application művelet elsődleges függőségi forrásaként.

### 31.2. Explicit input elsőbbsége

Helyes:

```ts
await command.execute(input, {
  actor,
  tenantId,
  requestId,
});
```

Nem ajánlott:

```ts
await command.execute(input);
// belül getCurrentRequestContext()
```

Az explicit input:

- tesztelhetőbb;
- workerből/CLI-ből is használható;
- nem köt Node runtime-hoz;
- láthatóvá teszi a security dependency-t.

### 31.3. Logger adapter

```ts
export function withRequestScope<T>(
  context: RequestLogContext,
  operation: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(context, operation);
}
```

A logger kiolvashatja a request ID-t, de az application policy továbbra is explicit actor inputot kap.

### 31.4. Scope lezárása

Az `AsyncLocalStorage.run()` callback befejezése után a context ne maradjon elérhető. Ne tárolj belőle referenciát globális queue-ban vagy későbbi, nem kapcsolódó callbackben.

### 31.5. `after()` és context

Platformfüggően az after callback request contextje fennmaradhat, de erre üzleti helyességet nem szabad alapozni. Az after callback számára szükséges minimális értékeket explicit closure-ben add át.


---

## 32. Erőforrás-cleanup és cancellation

### 32.1. `try/finally`

Requesthez kötött erőforrást explicit kell felszabadítani:

```ts
const lease = await semaphore.acquire({ signal: request.signal });

try {
  return await handleRequest(request);
} finally {
  lease.release();
}
```

### 32.2. AbortSignal

Route Handlerben a `request.signal` jelezheti, hogy a kliens megszakította a kapcsolatot.

Továbbadható:

- külső `fetch`;
- streaming subscription;
- queue wait;
- semaphore;
- adapter, amely dokumentáltan támogatja.

Nem minden DB driver vagy ORM szakítja meg ténylegesen a queryt. A támogatást contract teszt igazolja.

### 32.3. Deadline

```ts
export type Deadline = Readonly<{
  expiresAt: number;
}>;

export function remainingMs(deadline: Deadline): number {
  return Math.max(0, deadline.expiresAt - Date.now());
}
```

A külső timeout legyen kisebb a platform teljes route timeoutjánál, hogy maradjon idő:

- hibamappingre;
- cleanupra;
- logra;
- response-ra.

### 32.4. Stream cleanup

Stream/SSE esetén:

- unsubscribe cancelkor;
- heartbeat timer törlése;
- upstream socket lezárása;
- buffer limit;
- abort listener eltávolítása;
- trace lezárása.

### 32.5. After callback cleanup

Kritikus erőforrás felszabadítása ne csak `after()`-ben történjen. Ha a callback nem fut vagy timeoutol, leak maradhat. A request-scope erőforrás `finally`-ban szabadul fel; az `after()` csak nem kritikus utómunkára való.

### 32.6. Process shutdown

Hosszú életű servernél külön process shutdown contract szükséges:

- új requestek leállítása;
- connection draining;
- worker stop;
- telemetry flush;
- DB pool close;
- timeout utáni force exit.

Ez nem request-level terminate esemény.


---

## 33. Event listenerek helyett explicit pipeline

### 33.1. Miért nem globális EventEmitter?

Egy globális kernel event busz:

- elrejti a control flow-t;
- nehézzé teszi a sorrendet;
- nem típusos a különböző entrypointokra;
- könnyen duplán fut RSC/HTML/prefetch esetén;
- request state-et szivárogtathat;
- runtime reflectiont és dinamikus regisztrációt igényelhet;
- nehezen tree-shake-elhető és platformkompatibilis.

### 33.2. Választható explicit eszközök

| Igény | Winzard eszköz |
| --- | --- |
| Pre-routing | `next.config`, Proxy |
| Request mapping | entrypoint-local mapper |
| Authentication | authenticator port |
| Authorization | application/security policy |
| Rate limit | explicit interceptor/adapter |
| Error mapping | handler wrapper vagy mapper |
| Response policy | response factory/wrapper |
| Observability | instrumentation + explicit decorator |
| Durable event | domain event + outbox |
| UI fallback | error/loading/not-found boundary |
| After response | `after()` |
| Process startup | `instrumentation.register()` |

### 33.3. Route Handler pipeline

Az interceptorlista legyen:

- statikus;
- deklarált;
- tesztelhető;
- sorrendhelyes;
- mellékhatás-dokumentált.

### 33.4. Application decorator

Tracing és cache az application port köré is tehető:

```ts
class TracedGetProduct implements GetProductPort {
  constructor(
    private readonly inner: GetProductPort,
    private readonly tracer: Tracer,
  ) {}

  execute(input: GetProductInput, context: ApplicationContext) {
    return this.tracer.trace('catalog.get_product', () =>
      this.inner.execute(input, context),
    );
  }
}
```

A decorator nem tud Web `Request`-ről.

### 33.5. Domain event nem kernel event

```text
ProductCreated
  = üzleti tény

request.started
  = telemetry lifecycle adat
```

A kettő más retentiont, retryt, securityt és consumer contractot igényel.


---

## 34. Controller-attribútumok helyett delivery contract

Symfony 8.1 controller-attribútumokra célzott eseményeket tud dispatchálni. Winzardban nem vezetünk be runtime TypeScript decorator/reflection rendszert.

### 34.1. Adjacent contract fájl

```text
src/app/api/products/[productId]/
  route.ts
  route.contract.ts
```

```ts
export const getProductRouteContract = Object.freeze({
  id: 'catalog.product.get',
  method: 'GET',
  authentication: 'optional',
  authorization: 'catalog.product.read',
  cache: 'private-no-store',
  rateLimit: 'read-standard',
  responseSchema: 'ProductHttpDto@1',
});
```

### 34.2. Explicit használat

```ts
export const GET = withRouteContract(
  getProductRouteContract,
  handleGetProduct,
);
```

A contract nem csak dokumentáció; a wrapper és a Forge statikus ellenőrzés használhatja.

### 34.3. Page contract

```text
page.tsx
page.contract.ts
```

```ts
export const productPageContract = Object.freeze({
  id: 'catalog.product.page',
  actor: 'optional',
  tenant: 'required',
  rendering: 'request-time',
  cache: 'private-no-store',
});
```

### 34.4. Mit ne tartalmazzon?

- closure, amely DB-t hív;
- dinamikus user input;
- secret;
- request body;
- service instance;
- mutable state;
- runtime reflectionre épülő logika.

### 34.5. Compile-time/Forge use

A Forge később:

- listázhatja a delivery contractokat;
- összevetheti route-fával;
- ellenőrizheti a cache/auth deklarációt;
- generálhat HTTP reference-et;
- észlelheti az orphan contractot;
- diffelheti a breaking change-et.

### 34.6. Security

A metadata önmagában nem enforcement. A handlerben/wrapperben és application policyban tényleges ellenőrzés szükséges.


---

## 35. Extensionök sorrendje és short-circuit szemantika

### 35.1. Ajánlott Route Handler sorrend

```text
unexpected-error boundary
→ request telemetry
→ request normalization
→ body/header size
→ content type
→ authentication
→ tenant resolution
→ rate limit
→ CSRF/CORS/webhook signature
→ idempotency
→ schema mapping
→ application operation
→ presenter
→ response policy
→ after telemetry
```

Nem minden endpoint használ minden fázist.

### 35.2. Before/after dekorátor

Egy wrapper tipikusan:

```ts
return async (request, context) => {
  const startedAt = performance.now();

  try {
    return await next(request, context);
  } finally {
    metric.observe(performance.now() - startedAt);
  }
};
```

A `finally` a handler befejezését jelenti, nem feltétlenül a teljes response stream klienshez érkezését.

### 35.3. Short-circuit

Ha egy interceptor response-t ad:

- az inner handler nem fut;
- outer „after” wrapper még futhat;
- telemetry jelölje a short-circuit okát;
- response policyt szükség szerint alkalmazni kell;
- durable mutation nem történhetett.

### 35.4. Sorrendteszt

```ts
expect(recordedPhases).toEqual([
  'telemetry.before',
  'authentication.before',
  'handler',
  'authentication.after',
  'telemetry.after',
]);
```

### 35.5. Duplikált policy

Ha Proxy és Route Handler is rate limitet végez:

- legyen külön céljuk, például edge coarse és application precise;
- kulcsuk és quota-szemantikájuk dokumentált;
- ne számlálják kétszer ugyanazt a requestet véletlenül;
- RSC/prefetch hatás tesztelt.

### 35.6. Prioritási számok kerülése

Globális `priority: 128` számok helyett explicit lista vagy named phase ajánlott. A sorrend kódreview-ban olvasható.


---

## 36. Teljes működő példa

A példa egy termék részleteit adja HTML Page-en és JSON Route Handleren keresztül, ugyanazzal az application queryvel.

### 36.1. Könyvtárszerkezet

```text
src/
  app/
    products/
      [productId]/
        page.tsx
        page.contract.ts

    api/
      products/
        [productId]/
          route.ts
          route.contract.ts

  modules/
    catalog/
      product/
        application/
          dto/
            product-detail.dto.ts
          ports/
            product-read-repository.ts
          queries/
            get-product.ts
          results/
            get-product.result.ts

        infrastructure/
          persistence/
            prisma-product-read-repository.ts

        presentation/
          http/
            product-http.presenter.ts
          page/
            product-page.presenter.ts
            product-detail-view.tsx

        index.server.ts

  platform/
    auth/
      actor.ts
      authenticator.server.ts
    http/
      problem-response.ts
      request-context.server.ts
      response-policy.ts
    locale/
      locale.ts
    tenant/
      tenant-resolver.server.ts

  composition/
    catalog.server.ts

instrumentation.ts
```

### 36.2. Application DTO

```ts
export type ProductDetailDto = Readonly<{
  id: string;
  name: string;
  description: string | null;
  price: Readonly<{
    amount: number;
    currency: string;
  }>;
  availability: 'in_stock' | 'out_of_stock';
  permissions: Readonly<{
    canEdit: boolean;
  }>;
}>;
```

### 36.3. Repository port

```ts
export interface ProductReadRepository {
  findDetailById(
    productId: ProductId,
    tenantId: TenantId,
    control?: OperationControl,
  ): Promise<ProductDetailRecord | null>;
}
```

### 36.4. Result

```ts
export type GetProductResult =
  | Readonly<{
      kind: 'found';
      product: ProductDetailDto;
    }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'forbidden' }>;
```

### 36.5. Query

```ts
export class GetProduct {
  constructor(
    private readonly products: ProductReadRepository,
    private readonly policy: ProductReadPolicy,
  ) {}

  async execute(
    input: Readonly<{ productId: ProductId }>,
    context: ApplicationContext,
    control?: OperationControl,
  ): Promise<GetProductResult> {
    if (!context.tenantId) {
      return { kind: 'not_found' };
    }

    const permission = await this.policy.canRead(
      context.actor,
      input.productId,
      context.tenantId,
    );

    if (permission === 'hidden') {
      return { kind: 'not_found' };
    }

    if (permission === 'forbidden') {
      return { kind: 'forbidden' };
    }

    const product = await this.products.findDetailById(
      input.productId,
      context.tenantId,
      control,
    );

    return product
      ? {
          kind: 'found',
          product: mapProductDetailDto(product, permission),
        }
      : { kind: 'not_found' };
  }
}
```

### 36.6. Composition root

```ts
import 'server-only';

const productReadRepository =
  new PrismaProductReadRepository(database);

const productReadPolicy =
  new DefaultProductReadPolicy(membershipRepository);

export const catalogModule = Object.freeze({
  product: Object.freeze({
    queries: Object.freeze({
      getProduct: new GetProduct(
        productReadRepository,
        productReadPolicy,
      ),
    }),
  }),
});
```

### 36.7. Életciklus

```text
request
→ Next route match
→ Page vagy Route Handler
→ productId schema
→ RequestContext
→ GetProduct
→ ProductReadPolicy
→ ProductReadRepository
→ GetProductResult
→ Page/HTTP presenter
→ React tree vagy Response
→ instrumentation/after
```


---

## 37. HTML Page példa

### 37.1. Route contract

```ts
// page.contract.ts
export const productPageContract = Object.freeze({
  id: 'catalog.product.detail.page',
  route: '/products/[productId]',
  authentication: 'optional',
  tenant: 'required',
  authorization: 'catalog.product.read',
  rendering: 'request-time',
  cache: 'private-no-store',
});
```

### 37.2. Page

```tsx
import { notFound } from 'next/navigation';

import { catalogModule } from '@/composition/catalog.server';
import { ProductDetailView } from '@/modules/catalog/product/presentation/page/product-detail-view';
import { presentProductPage } from '@/modules/catalog/product/presentation/page/product-page.presenter';
import { productIdSchema } from '@/modules/catalog/product/presentation/product.schemas';
import {
  createPageRequestContext,
  toApplicationContext,
} from '@/platform/http/request-context.server';

export const runtime = 'nodejs';

export default async function ProductPage(
  props: PageProps<'/products/[productId]'>,
) {
  const { productId: rawProductId } = await props.params;

  const parsedProductId = productIdSchema.safeParse(rawProductId);

  if (!parsedProductId.success) {
    notFound();
  }

  const requestContext = await createPageRequestContext();

  const result =
    await catalogModule.product.queries.getProduct.execute(
      { productId: parsedProductId.data },
      toApplicationContext(requestContext),
    );

  switch (result.kind) {
    case 'not_found':
      notFound();

    case 'forbidden':
      notFound();

    case 'found':
      return (
        <ProductDetailView
          model={presentProductPage(result.product, {
            locale: requestContext.locale,
          })}
        />
      );
  }
}
```

### 37.3. Mi történik?

1. A Next.js feloldja a Page entrypointot.
2. A route paraméter TypeScript-szinten string.
3. A schema üzleti azonosítóvá normalizálja.
4. A request context sessiont, tenantot és locale-t old fel.
5. A Page frameworkfüggetlen queryt hív.
6. A query policyt és repository portot használ.
7. A result explicit control flow-ra képeződik.
8. A presenter view modelt ad.
9. A Server Component React tree-t renderel.
10. A Next.js HTML/RSC response-t készít és streamelhet.

### 37.4. Mi nincs a Page-ben?

- Prisma import;
- `process.env`;
- teljes session;
- SQL;
- transaction;
- direct external email;
- saját `/api` fetch;
- nyers exception mapping;
- globális service locator;
- mutable request singleton.

### 37.5. Cache

A `private-no-store` contract önmagában metadata. A Page tényleges dinamikus inputja, cache API-ja és a deployment cache policy együtt érvényesíti. Személyes adatnál production E2E-vel ellenőrizni kell, hogy más user vagy tenant nem kapja meg a korábbi response-t.


---

## 38. JSON Route Handler példa

### 38.1. Route contract

```ts
// route.contract.ts
export const getProductApiContract = Object.freeze({
  id: 'catalog.product.detail.api',
  route: '/api/products/[productId]',
  method: 'GET',
  authentication: 'required',
  tenant: 'required',
  authorization: 'catalog.product.read',
  cache: 'private-no-store',
  response: 'ProductHttpDto@1',
  errors: [
    'AUTHENTICATION_REQUIRED',
    'PRODUCT_NOT_FOUND',
    'PRODUCT_FORBIDDEN',
    'INTERNAL_ERROR',
  ],
});
```

### 38.2. Handler

```ts
import { after } from 'next/server';

import { catalogModule } from '@/composition/catalog.server';
import { presentProductHttp } from '@/modules/catalog/product/presentation/http/product-http.presenter';
import { productIdSchema } from '@/modules/catalog/product/presentation/product.schemas';
import {
  createRouteRequestContext,
  toApplicationContext,
} from '@/platform/http/request-context.server';
import { problemResponse } from '@/platform/http/problem-response';
import { withApiResponsePolicy } from '@/platform/http/response-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: RouteContext<'/api/products/[productId]'>,
): Promise<Response> {
  const startedAt = performance.now();
  let requestId = crypto.randomUUID();

  try {
    const requestContext =
      await createRouteRequestContext(request);

    requestId = requestContext.requestId;

    const { productId: rawProductId } =
      await context.params;

    const parsedProductId =
      productIdSchema.safeParse(rawProductId);

    if (!parsedProductId.success) {
      return problemResponse({
        type: '/problems/product-id-invalid',
        title: 'A termékazonosító érvénytelen.',
        status: 400,
        code: 'PRODUCT_ID_INVALID',
        requestId,
      });
    }

    const result =
      await catalogModule.product.queries.getProduct.execute(
        { productId: parsedProductId.data },
        toApplicationContext(requestContext),
        { signal: request.signal },
      );

    const response = mapResult(result, requestId);

    return withApiResponsePolicy(response, {
      requestId,
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    return mapUnexpectedHttpError(error, requestId);
  } finally {
    after(() => {
      httpMetrics.observe('catalog.product.get', {
        requestId,
        durationMs: performance.now() - startedAt,
      });
    });
  }
}
```

### 38.3. Fontos korrekció

A `finally`-ból hívott `after()` csak akkor biztonságos, ha:

- maga az `after()` hívás elérhető az adott lifecycle-ban;
- a closure nem feltételez sikert;
- a metric/log best-effort;
- nem használ már felszabadított request erőforrást;
- a változókat minimális immutable értékként zárjuk be.

### 38.4. Error mapping

```ts
function mapResult(
  result: GetProductResult,
  requestId: string,
): Response {
  switch (result.kind) {
    case 'found':
      return Response.json(
        presentProductHttp(result.product),
        { status: 200 },
      );

    case 'not_found':
      return problemResponse({
        type: '/problems/product-not-found',
        title: 'A termék nem található.',
        status: 404,
        code: 'PRODUCT_NOT_FOUND',
        requestId,
      });

    case 'forbidden':
      return problemResponse({
        type: '/problems/product-forbidden',
        title: 'A hozzáférés nem engedélyezett.',
        status: 403,
        code: 'PRODUCT_FORBIDDEN',
        requestId,
      });
  }
}
```

### 38.5. Tesztelendő response contract

- status;
- content type;
- no-store;
- request ID;
- DTO mezők;
- forbidden/not-found policy;
- malformed ID;
- abort;
- unexpected exception redakció;
- cross-tenant isolation.


---

## 39. Server Action példa

### 39.1. Action contract

```ts
export const updateProductActionContract = Object.freeze({
  id: 'catalog.product.update.action',
  authentication: 'required',
  tenant: 'required',
  authorization: 'catalog.product.update',
  csrf: 'framework-origin-plus-session',
  idempotency: 'recommended',
  revalidation: [
    '/products',
    '/products/[productId]',
  ],
});
```

### 39.2. Action

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { catalogModule } from '@/composition/catalog.server';
import {
  createActionRequestContext,
  toApplicationContext,
} from '@/platform/http/request-context.server';

export async function updateProductAction(
  previousState: UpdateProductState,
  formData: FormData,
): Promise<UpdateProductState> {
  const parsed = updateProductFormSchema.safeParse({
    productId: formData.get('productId'),
    name: formData.get('name'),
    version: formData.get('version'),
  });

  if (!parsed.success) {
    return {
      status: 'invalid',
      fieldErrors: presentFormErrors(parsed.error),
    };
  }

  const requestContext =
    await createActionRequestContext();

  let result: UpdateProductResult;

  try {
    result =
      await catalogModule.product.commands.updateProduct.execute(
        parsed.data,
        toApplicationContext(requestContext),
      );
  } catch (error) {
    actionLogger.error('product.update.failed', {
      requestId: requestContext.requestId,
      error: serializeErrorForLog(error),
    });

    return {
      status: 'failed',
      formError: 'A módosítás átmenetileg nem sikerült.',
    };
  }

  switch (result.kind) {
    case 'validation_failed':
      return {
        status: 'invalid',
        fieldErrors: presentDomainErrors(result.errors),
      };

    case 'forbidden':
      return {
        status: 'forbidden',
        formError: 'A módosítás nem engedélyezett.',
      };

    case 'not_found':
      return {
        status: 'not_found',
        formError: 'A termék nem található.',
      };

    case 'conflict':
      return {
        status: 'conflict',
        formError:
          'A terméket közben más módosította. Töltsd újra az oldalt.',
      };

    case 'updated':
      revalidatePath('/products');
      revalidatePath(
        productRoutes.detail(result.productId),
      );
      redirect(
        productRoutes.detail(result.productId),
      );
  }
}
```

### 39.3. Lifecycle

```text
browser form POST
→ Next Server Function protocol
→ action function
→ FormData mapping
→ request context
→ command
→ transaction/outbox
→ result
→ action state vagy redirect
→ RSC/UI update
```

### 39.4. Biztonság

- a hidden `productId` és `version` tamperelhető;
- authot minden hívásnál újra ellenőrizni kell;
- a UI-ban elrejtett gomb nem authorizáció;
- a Server Actiont nem szabad kizárólag Proxy matcherrel védeni;
- a command tenant scope-ot kap;
- a conflict optimistic concurrencyval észlelhető.


---

## 40. Subrequestek Winzard-megfelelője

Symfonyban a subrequest egy második teljes HttpKernel-ciklust futtat egy oldal kisebb részének előállításához. Winzardban ez alapértelmezetten nem szükséges.

### 40.1. Közvetlen szerveroldali kompozíció

Tilos:

```tsx
const response = await fetch(
  'http://localhost:3000/api/recent-products',
);
const products = await response.json();
```

Helyette:

```tsx
export async function RecentProducts() {
  const requestContext =
    await createPageRequestContext();

  const result =
    await catalogModule.product.queries.listRecentProducts.execute(
      { limit: 5 },
      toApplicationContext(requestContext),
    );

  return (
    <RecentProductList
      model={presentRecentProducts(result)}
    />
  );
}
```

### 40.2. Miért jobb?

- nincs HTTP serialization;
- nincs saját host/URL feloldás;
- nincs duplikált auth;
- nincs hálózati timeout;
- nincs cookie/header továbbítás;
- nincs extra rate limit;
- nincs belső API cache-eltérés;
- típusos application contract;
- kisebb latency;
- egyszerűbb teszt.

### 40.3. Mikor indokolt belső HTTP?

Csak valódi service boundary esetén:

- külön deployolt szolgáltatás;
- önálló ownership;
- hálózati contract;
- külön availability;
- explicit auth;
- timeout/retry/circuit breaker;
- observability;
- API versioning.

A moduláris monolit belső moduljai nem kommunikálnak HTTP-n.

### 40.4. Fragment párhuzamosítás

A React szerveroldali kompozíció támogatja:

- async Server Componentet;
- Suspense-t;
- parallel route-ot;
- request-local memoizationt;
- közös data loader használatát.

Ezek a Symfony subrequest UX- és kompozíciós céljait extra kernel-ciklus nélkül adják.

### 40.5. Fő request és fragment

Egy nested Server Component nem külön security request. Ugyanazon render része, de saját application queryje továbbra is kap explicit actor/tenant contextet.

### 40.6. Fragment failure

Az opcionális fragment:

- külön Suspense fallbacket;
- komponens- vagy route-level error boundaryt;
- explicit empty state-et;
- timeout policyt;
- telemetryt

kaphat, anélkül hogy teljes belső HTTP response-t generálna.


---

## 41. RSC requestek, prefetch és belső navigáció

### 41.1. Nem minden browser request teljes HTML

App Router navigáció során a kliens RSC payloadot kérhet. Prefetch is indulhat a tényleges kattintás előtt.

Következmény:

- GET route render legyen side-effectmentes;
- access log különítheti a navigation/prefetch jellegét, ha megbízhatóan elérhető;
- üzleti audit nem számolhat Page rendert biztos user actionnek;
- rate limit ne büntesse indokolatlanul a framework prefetch-et;
- Proxy ne változtassa eltérően a route identitását HTML és RSC esetén.

### 41.2. Prefetch

A prefetch:

- előre elindíthat route-adatot;
- cache-elhet RSC payloadot;
- nem bizonyítja, hogy a user megtekintette az oldalt;
- nem indíthat mutationt;
- auth/session váltásnál invalidációs kérdéseket vet fel.

### 41.3. Server Action

A Server Action nem külön file-system route. A használati route-hoz kötött POST lehet. Proxy matcher módosítása ezért észrevétlenül megváltoztathatja a lefedettséget.

### 41.4. Internal headerek

A framework belső RSC-headereit:

- ne logold teljesen;
- ne használd üzleti döntéshez;
- ne fogadd el kliensbiztonsági bizonyítékként;
- ne módosítsd kézi fetch-rewrite-tal;
- ne dokumentáld stabil publikus API-ként.

### 41.5. Navigation state

A kliensoldali router state nem szerveroldali authorizációs forrás. Minden szerver request saját session/token alapján dönt.


---

## 42. Erőforrások és package-owned fájlok feloldása

Symfony bundle logikai erőforrásnevet képes fizikai pathra oldani. Winzardban a package-, template- és recipe-határok más eszközöket használnak.

### 42.1. TypeScript package export

```json
{
  "name": "@winzard/platform-next",
  "exports": {
    "./http": "./dist/http/index.js",
    "./routing": "./dist/routing/index.js",
    "./testing": "./dist/testing/index.js"
  }
}
```

A consumer nem hivatkozik belső fizikai pathra.

### 42.2. Recipe manifest

A recipe deklarálja:

```json
{
  "name": "project-documentation",
  "provides": ["project-documentation"],
  "requires": ["forge"],
  "files": [
    "docs/_templates/...",
    "docs/_system/..."
  ]
}
```

A materializer és drift engine a manifestből dolgozik, nem runtime directory scanből.

### 42.3. Asset és template ownership

```text
package export
→ runtime kód

recipe files
→ telepített projektfájl

template snapshot
→ új projekt kiindulópont

public asset
→ URL-ről elérhető fájl

docs/80-winzard
→ verziózott consumer contract
```

### 42.4. Tilos runtime path scan

TILOS requestenként:

- node_modules könyvtárat bejárni;
- glob patternnel controllert keresni;
- fájlnév alapján policyt importálni;
- user inputból import pathot képezni;
- „első találat nyer” shadowingot használni.

### 42.5. Statikus registry

Ha plugin/adapter registry szükséges:

```ts
export const deliveryAdapters = Object.freeze({
  catalog: catalogDeliveryAdapter,
  billing: billingDeliveryAdapter,
});
```

A registry buildtime ellenőrizhető és determinisztikus.

### 42.6. Override

Override csak explicit:

```ts
createPlatform({
  problemPresenter: customProblemPresenter,
});
```

Nem implicit filesystem precedence.


---

## 43. Custom server és adapterhatár

### 43.1. Alapértelmezés

A Next.js saját szervere és hosting adaptere legyen a default. Custom server csak akkor indokolt, ha a beépített router és deployment modell nem képes egy valódi követelményt teljesíteni.

### 43.2. Költségek

Custom server:

- kizárhat optimalizációkat;
- külön build/runtime contractot igényel;
- nem megy együtt automatikusan standalone outputtal;
- saját graceful shutdownot igényel;
- saját request-context bridge-et igényelhet;
- növeli az upgrade-felületet;
- megkerülheti platformadaptert.

### 43.3. Nem megfelelő indok

Nem indok:

- Symfony-szerű eventeket szeretnénk;
- request ID-t akarunk;
- logging kell;
- startup hook kell;
- auth kell;
- response header kell;
- after-response log kell.

Ezekhez rendelkezésre áll Proxy, instrumentation, explicit wrapper és `after()`.

### 43.4. Megfelelőbb alternatíva

| Követelmény | Elsődleges megoldás |
| --- | --- |
| Startup telemetry | `instrumentation.ts` |
| Request error reporting | `onRequestError` |
| Pre-routing rewrite | Proxy |
| Header/redirect | `next.config` vagy Response |
| Per-handler pipeline | explicit wrapper |
| Durable background job | queue/worker |
| Request-local log context | AsyncLocalStorage adapter |
| Graceful process lifecycle | hosting/container contract |

### 43.5. Platform adapter

Ha a Winzard később Next.js adapter API-t támogat, annak célja deploymentintegráció, nem új application kernel. Az adapternek tiszteletben kell tartania a Next route-, rendering-, streaming- és `after()` contractját.


---

## 44. Node, serverless és platformkülönbségek

### 44.1. Node.js server

Jellemző:

- hosszú életű process;
- connection pool;
- több request ugyanabban a memóriában;
- graceful shutdown;
- saját reverse proxy;
- modulglobális állapot megmarad;
- `after()` támogatott.

### 44.2. Serverless

Jellemző:

- warm instance reuse;
- időlimit;
- concurrency platformfüggő;
- cold start;
- ephemeral filesystem;
- `after()` `waitUntil`-szerű platform primitive-től függ;
- process shutdown nem garantált;
- background promise response után nem feltétlen fut le.

### 44.3. Edge/Proxy

A Proxy jelenlegi baseline-ban Node runtime-ot használ, de deploymentje és izolációja eltérhet a renderkódtól. Nem támaszkodhat közös globális modulállapotra.

### 44.4. Static export

Nincs request-time application kernel:

- nincs session serveren;
- nincs Route Handler runtime;
- nincs `after()`;
- nincs request-context;
- csak buildtime output és kliensoldali kód.

A statikus export capability-mátrixa külön dokumentálandó.

### 44.5. Multi-instance

Közösnek vagy kompatibilisnek kell lennie:

- session signing/encryption key;
- Server Function encryption key, ha releváns;
- deployment ID;
- cache namespace;
- schema version;
- route alias registry;
- feature flag contract;
- auth issuer/audience;
- consumer contract version.

### 44.6. Version skew

Rolling deployment alatt két verzió egyszerre szolgálhat ki requestet. A request/response és Server Action contractnak kezelnie kell:

- régi kliens → új szerver;
- új kliens → régi szerver;
- cache-ben maradt RSC payload;
- változó action identifier;
- DB schema expand/contract;
- backward-compatible cookie/session.


---

## 45. Cache, request memoization és request isolation

### 45.1. Request memoization

React request memoization:

- a React component tree-ben működik;
- tipikusan GET fetchhez;
- egy render/request időtartamáig él;
- Layout, Page, metadata és Server Component hívások között deduplikálhat;
- Route Handlerre nem vonatkozik automatikusan.

### 45.2. `React.cache`

Nem-fetch data loaderhez használható request/render scope deduplikációra:

```ts
import { cache } from 'react';

export const getViewer = cache(async () => {
  return authAdapter.resolveViewer();
});
```

A függvény ne keverje a user/tenant scope-ot olyan argumentum nélküli globális cache-sel, amely requestek között megosztott.

### 45.3. Shared cache

A shared cache más:

```text
request memoization
  = rövid életű, renderen belüli deduplikáció

data cache / use cache
  = requestek között megosztott

CDN/full route cache
  = response vagy render artifact

client router cache
  = böngészőoldali navigáció
```

### 45.4. Cache key

Személyes/tenant adatnál key dimenzió lehet:

```text
tenantId
actorId vagy authorization scope
locale
resource ID
query/filter
schema version
permission version
feature flag cohort
```

Az actor ID kihagyása csak akkor biztonságos, ha a DTO minden érintett actor számára azonos.

### 45.5. Permission cache

Authorizációs döntés cache-elésekor:

- rövid TTL;
- role/membership version;
- revocation;
- tenant;
- operation;
- resource;
- negative cache;
- audit.

### 45.6. Cross-request leak teszt

Ugyanazon processben:

1. user A request;
2. user B request;
3. eltérő tenant;
4. azonos resource ID;
5. ellenőrizni, hogy B nem kap A DTO-t, permissiont, locale-t vagy request ID-t.

### 45.7. Cache és error

500-as response ne kerüljön közös cache-be. 404 negative caching csak publikus, nem existence-sensitive erőforrásnál explicit TTL-lel.


---

## 46. Biztonsági kernelkövetelmények

### 46.1. Kötelező kontrollok

- inputvalidáció;
- authentication;
- object-level authorizáció;
- tenant isolation;
- CSRF cookie-auth mutationnél;
- CORS explicit origin policy;
- body- és headerlimit;
- rate limit;
- idempotencia kritikus mutationnél;
- trusted proxy konfiguráció;
- open redirect védelem;
- SSRF-védelem;
- response header injection elleni védelem;
- secret- és PII-redakció;
- cache isolation;
- stream auth a commit előtt;
- webhook signature és replay védelem.

### 46.2. Proxy nem security boundary önmagában

A Proxy adhat korai elutasítást, de:

```text
Proxy check
+ entrypoint check
+ application/resource policy
```

együtt szükséges.

### 46.3. Body limit

Limit több rétegen:

```text
CDN/WAF
reverse proxy
Next/server adapter
Route Handler parser
operation schema
domain limit
```

A kliens által jelzett `Content-Length` nem feltétlenül megbízható vagy jelenlévő.

### 46.4. SSRF

Külső URL:

- ne user input legyen közvetlenül;
- protocol allowlist;
- host allowlist;
- DNS rebinding védelem;
- private/link-local/metadata IP tiltás;
- redirect limit;
- response size limit;
- timeout;
- credential továbbítás tiltása.

### 46.5. Header injection

User input nem kerülhet newline-lal headerbe. `Location`, `Content-Disposition`, custom trace és deprecation header külön sanitizer.

### 46.6. Request smuggling

Elsősorban platform/reverse proxy probléma, de deployment tesztelje:

- `Content-Length`/`Transfer-Encoding`;
- proxy chain konzisztencia;
- header normalizálás;
- maximumok;
- HTTP version handling.

### 46.7. Timing és enumeration

Not-found/forbidden concealmentnél figyelni kell:

- státusz;
- bodyméret;
- cache;
- response timing;
- log;
- rate limit;
- ETag.

Teljes időazonosság nem mindig elérhető, de az egyértelmű side channel kerülendő.


---

## 47. Idempotencia, concurrency és tranzakció

### 47.1. Retry valóság

Request ismétlődhet:

- kliens retry;
- proxy retry;
- hálózati timeout után;
- user dupla kattintás;
- Server Action újraküldés;
- webhook provider retry;
- queue redelivery.

### 47.2. Idempotency contract

```ts
export type IdempotencyContext = Readonly<{
  key: string;
  actorScope: string;
  operation: string;
  fingerprint: string;
}>;
```

Tárolandó:

- státusz: processing/completed/failed;
- request fingerprint;
- result vagy result reference;
- létrehozási idő;
- expiry;
- owner scope;
- lock/version.

### 47.3. Fingerprint mismatch

Azonos kulcs, eltérő body:

```text
→ 409 Conflict
```

Nem szabad a korábbi resultot más payloadra visszaadni.

### 47.4. Optimistic concurrency

```text
resource version
→ If-Match vagy form hidden version
→ command precondition
→ update WHERE version = expected
→ 409/412 conflict
```

### 47.5. Transaction ownership

A transaction az application commandban vagy transaction port/decoratorban van.

```ts
return transactionManager.run(async (transaction) => {
  const aggregate = await repository.getForUpdate(id, transaction);
  aggregate.changeName(name);
  await repository.save(aggregate, transaction);
  await outbox.append(aggregate.pullEvents(), transaction);
});
```

### 47.6. External side effect

Külső API nem tartható nyitott DB transactionben indokolatlanul. Használj saga/outbox/compensation modellt.

### 47.7. Response

A response csak commit után ad sikert. Ha a commit után a kliens kapcsolat megszakad, az idempotency record alapján a retry ugyanazt az eredményt adhatja.


---

## 48. Observability, trace és metric

### 48.1. Minimum logmezők

```text
timestamp
level
service
deployment/version
requestId
traceId/spanId
route contract ID
route pattern
method
status/result kind
duration
tenant pseudonymous ID, ha engedélyezett
actor kind, nem token
error code/digest
```

### 48.2. Route pattern vs raw path

Metric labelhez route pattern:

```text
/api/products/[productId]
```

nem raw ID-t tartalmazó:

```text
/api/products/4a9c...
```

Ez csökkenti a cardinalityt és az adatvédelmi kockázatot.

### 48.3. Spanok

Ajánlott:

```text
http.request
  → request_context.resolve
  → auth.authenticate
  → tenant.resolve
  → policy.authorize
  → application.catalog.get_product
  → repository.product.find_detail
  → presenter.product.http
  → response.serialize
```

### 48.4. Metric

- request count;
- duration;
- short-circuit count;
- error count code szerint;
- active stream;
- aborted request;
- rate-limit denial;
- auth failure;
- queue/outbox lag;
- after callback failure;
- request-context leak test failure.

### 48.5. Log és metric side effect

Observability nem dobhat olyan exceptiont, amely sikeres üzleti műveletet 500-ra változtat, kivéve ha compliance contract explicit fail-closed auditot ír elő.

### 48.6. PII

Actor, tenant és resource ID:

- hash/pseudonymizálható;
- log policy szerint;
- retentionnel;
- access controllal;
- debug környezetben sem automatikusan teljes payload.

### 48.7. Sampling

Error és security event gyakran 100%; sikeres high-volume request samplingelt lehet. A sampling döntés ne hagyjon ki kötelező auditot.


---

## 49. Tesztelési stratégia

### 49.1. Unit teszt

Tesztelendő:

- schema;
- request mapper;
- RequestContext factory;
- actor/tenant/locale resolver;
- policy;
- application query/command;
- presenter;
- problem mapper;
- route contract;
- interceptor sorrend;
- open redirect validator;
- cache key.

### 49.2. Route Handler adapterteszt

```ts
const request = new Request(
  'https://example.test/api/products/...',
  {
    headers: {
      authorization: 'Bearer test-token',
    },
  },
);

const response = await GET(request, fakeRouteContext);

expect(response.status).toBe(200);
expect(response.headers.get('cache-control'))
  .toBe('private, no-store');
```

### 49.3. Page teszt

Async Server Componentnél:

- presenter/application unit teszt;
- szükség szerint render teszt;
- production E2E a framework control flow-ra;
- not-found/redirect scenario;
- RSC és full navigation.

### 49.4. Server Action teszt

- FormData mapping;
- expected state;
- forbidden;
- conflict;
- redirect nem elnyelt;
- cookie/revalidation;
- tampered hidden field;
- auth minden hívásnál.

### 49.5. Proxy teszt

- matcher;
- asset exclusion;
- host/locale rewrite;
- header sanitization;
- external spoofed internal header;
- RSC/HTML konzisztencia;
- Server Action path coverage.

### 49.6. Streaming teszt

- első chunk;
- fallback;
- késői fragment;
- abort;
- cleanup;
- stream közbeni exception;
- header commit;
- proxy buffering productionhoz hasonló topológiában.

### 49.7. Multi-request isolation

Egyetlen processben párhuzamosan:

```text
request A: tenant A, user A
request B: tenant B, user B
```

Ellenőrizni:

- context;
- logger;
- cache;
- repository scope;
- locale;
- response;
- after callback.

### 49.8. Failure injection

- DB timeout;
- external abort;
- telemetry failure;
- queue unavailable;
- after timeout;
- malformed body;
- oversized header;
- stale idempotency lock;
- partial stream;
- client disconnect.

### 49.9. Production E2E

`next build` + production server/adapter ellen:

- redirect/rewrite order;
- Proxy;
- Page HTML;
- RSC navigation;
- Route Handler;
- Server Action;
- cache;
- cookies;
- error boundary;
- `after()` evidence;
- deployment proxy headers;
- multi-instance compatibility.


---

## 50. Architecture checkek és hibakódok

A meglévő Forge architecture checkek továbbra is tiltják többek között a delivery réteg közvetlen ORM-importját, az application kifelé mutató függését és a szerveroldali saját API-hívást.

A kernel-szerződés későbbi célhibakódjai:

```text
KERNEL_SECOND_RUNTIME_ROUTER
KERNEL_GLOBAL_EVENT_DISPATCHER
KERNEL_MUTABLE_REQUEST_GLOBAL
KERNEL_REQUEST_CONTEXT_LEAK
KERNEL_PROXY_ONLY_AUTHORIZATION
KERNEL_UNTRUSTED_FORWARDED_HEADER
KERNEL_INTERNAL_HTTP_SUBREQUEST
KERNEL_DYNAMIC_RESOURCE_SCAN
KERNEL_APPLICATION_REQUEST_IMPORT
KERNEL_APPLICATION_NEXT_IMPORT
KERNEL_APPLICATION_COOKIE_IMPORT
KERNEL_RAW_DOMAIN_RESPONSE
KERNEL_UNMAPPED_EXCEPTION
KERNEL_RAW_EXCEPTION_RESPONSE
KERNEL_RESPONSE_MUTATION_AFTER_STREAM
KERNEL_STREAM_BEFORE_AUTH
KERNEL_AFTER_DURABLE_SIDE_EFFECT
KERNEL_AFTER_ASSUMES_SUCCESS
KERNEL_MISSING_ABORT_CLEANUP
KERNEL_CROSS_REQUEST_CACHE
KERNEL_ROUTE_CONTRACT_UNUSED
KERNEL_ROUTE_CONTRACT_UNENFORCED
KERNEL_CUSTOM_SERVER_UNJUSTIFIED
KERNEL_HIGH_CARDINALITY_ROUTE_METRIC
```

### 50.1. Példák

#### Mutable global

```ts
let currentTenant: string | undefined;
```

```text
→ KERNEL_MUTABLE_REQUEST_GLOBAL
```

#### Belső HTTP

```ts
await fetch('http://localhost:3000/api/products');
```

Server Componentben:

```text
→ KERNEL_INTERNAL_HTTP_SUBREQUEST
```

#### Application framework import

```ts
import { headers } from 'next/headers';
```

application könyvtárban:

```text
→ KERNEL_APPLICATION_NEXT_IMPORT
```

#### After email

```ts
after(() => mailer.send(orderConfirmation));
```

garantált emailnél:

```text
→ KERNEL_AFTER_DURABLE_SIDE_EFFECT
```

### 50.2. Statikus ellenőrzés korlátja

Nem minden lifecycle-hiba detektálható AST-ből. Szükséges:

- contract teszt;
- production E2E;
- deployment audit;
- threat model;
- observability;
- code review.


---

## 51. Forge diagnosztikai parancsok

### 51.1. Jelenleg használható routing diagnosztika

```bash
pnpm forge route:list --project .
pnpm forge route:inspect "/products/[productId]" --project .
pnpm forge route:match "/products/123" --project .
pnpm forge route:check --project .
pnpm forge route:aliases --project .
pnpm forge route:docs --project .
```

Ezek a route-fát és routing contractot vizsgálják; nem hoznak létre második runtime routert.

### 51.2. Upstream ellenőrzések

```bash
pnpm next typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 51.3. Winzard célparancsok

```bash
pnpm forge kernel:graph --project .
pnpm forge kernel:inspect   "/api/products/[productId]"   --method=GET   --project .

pnpm forge kernel:check --project .
pnpm forge delivery:check --project .
pnpm forge request-context:check --project .
pnpm forge response-policy:check --project .
pnpm forge instrumentation:check --project .
pnpm forge lifecycle:docs --project .
```

### 51.4. `kernel:inspect` célkimenet

```text
route pattern
entrypoint type
runtime
rendering mode
Proxy matcher
request contract
authentication
tenant/locale resolution
authorization policy
application operation
presenter
response/cache policy
after hooks
error mapper
instrumentation
tests
```

### 51.5. Graph

A graph statikus, deklarált kapcsolatokat mutat:

```text
route
→ contract
→ request-context factory
→ operation
→ ports
→ adapters
→ presenter
→ response policy
```

Nem futtat production requestet.

### 51.6. Changed-files mód

CI gyors mód:

```bash
pnpm forge kernel:check   --changed-from="$BASE_SHA"
```

Célcontract; a teljes default branch/release ellenőrzés továbbra is szükséges.


---

## 52. Implementációs elfogadási kritériumok

Egy Winzard HTTP-kernel/delivery lifecycle implementáció akkor elfogadható, ha:

1. nincs második runtime router;
2. a Next.js route-fa az URL source of truth;
3. minden entrypoint vékony delivery adapter;
4. az application réteg frameworkfüggetlen;
5. a nyers params/search/body/header/cookie validált;
6. RequestContext minimális és immutable;
7. actor, tenant és locale explicit feloldással készül;
8. object-level authorizáció az application/security boundaryn fut;
9. az application művelet explicit resultot ad;
10. Page presenter view modelt képez;
11. API presenter explicit DTO-t képez;
12. a várható hibák nem váratlan exceptionként jelennek meg;
13. a Route Handler stabil problem response-t ad;
14. error boundary nem szivárogtat technikai részletet;
15. `onRequestError` redaktált telemetryt küld;
16. streaming előtt minden status/header/cookie döntés megtörténik;
17. `after()` csak nem kritikus utómunkát végez;
18. durable side effect queue/outbox tulajdona;
19. request state nem mutable module global;
20. request-scope erőforrás `finally`-ban felszabadul;
21. abort/deadline továbbadása dokumentált;
22. belső modulkommunikáció nem saját HTTP API-n történik;
23. package/recipe erőforrás statikus manifest/export alapján oldódik;
24. custom server csak elfogadott ADR-rel használható;
25. cache key tartalmazza az izolációs dimenziókat;
26. Proxy nem kizárólagos security boundary;
27. idempotencia és concurrency policy mutationnél dokumentált;
28. route pattern alapú low-cardinality telemetry készül;
29. multi-request isolation teszt sikeres;
30. production build és E2E sikeres;
31. a routing Forge check sikeres;
32. a kapcsolódó dokumentáció és delivery contract frissült.

### 52.1. Kötelező evidence

```text
typecheck eredmény
lint eredmény
unit tesztek
architecture check
route check
production build
E2E
security negatív tesztek
multi-request isolation teszt
stream/abort teszt, ha releváns
deployment topology smoke, ha Proxy/header biztonság érintett
```

### 52.2. Dokumentációs hatás

Új lifecycle extensionnél frissítendő:

- route/delivery contract;
- security contract;
- configuration reference;
- observability/runbook;
- failure mapping;
- test matrix;
- upgrade guide, ha breaking.


---

## 53. Hibaelhárítás

### 53.1. Ugyanaz a user jelenik meg két requestben

Vizsgáld:

- module global;
- singleton current user/tenant;
- AsyncLocalStorage hibás scope;
- shared cache key;
- request context referenciájának tárolása;
- test double globális state;
- hot reload.

### 53.2. A Proxy autholt, mégis elérhető a Server Action

Ok:

- matcher nem fedi az action route-ját;
- route áthelyeződött;
- Proxy nem fut az elvárt requesttípusra;
- belépési pont nem ellenőriz újra.

Javítás:

- auth az actionben/application policyban;
- Proxy csak early optimization;
- coverage E2E.

### 53.3. Redirect 500-as hibává válik

Valószínűleg általános catch elnyeli a redirect control flow-t. A redirectet a catch után hívd, vagy a framework control-flow errorokat rethrow-old az aktuális Next.js API szerint.

### 53.4. Cookie nem áll be

Lehetséges:

- Server Component renderben próbálod írni;
- streaming már elkezdődött;
- domain/protocol eltérés;
- secure cookie HTTP-n;
- SameSite;
- response wrapper elveszti a `Set-Cookie` headert.

### 53.5. 200 státusz hibaoldallal

Streaming már commitolta a response-t, mielőtt a késői fragment hibázott. A statusdöntést igénylő auth/not-found ellenőrzést emeld korábbra.

### 53.6. `after()` nem küldte el az emailt

Az `after()` nem durable job runner. Rögzíts transactional outboxot, és worker küldje az emailt.

### 53.7. `after()` buildkor futott

Statikus Page-ben használtad. Az `after()` prerender/revalidation után is fut. Request-specifikus analyticshez dinamikus request határ és megfelelő input szükséges.

### 53.8. A saját API fetch lassú vagy authhibás

Server Componentből belső HTTP subrequest történik. Hívd közvetlenül az application queryt és használd ugyanazt a presenter contractot.

### 53.9. Route Handlerben duplán olvastad a body-t

A Web Request stream egyszer fogyasztható. Signature verificationhez olvasd raw formában egyszer, majd parse-old abból.

### 53.10. Request ID spoofolható

Külső kliens által küldött headert megbízhatóként kezelsz. A reverse proxy törölje/írja felül, vagy generálj belső ID-t.

### 53.11. Multi-instance deploymentben actionhiba van

Vizsgáld:

- encryption key;
- build/deployment ID;
- verzióeltérés;
- sticky session feltételezés;
- cache;
- action artifact kompatibilitás.

### 53.12. Memory nő minden request után

Vizsgáld:

- Map/Set;
- timer;
- event listener;
- stream subscription;
- retained closure;
- error payload;
- unbounded cache;
- trace exporter queue;
- DB pool misuse.

### 53.13. Error boundary nem fogja el az event handler hibát

A kliens event handler render után fut. Kezeld explicit state-tel/loggal, vagy `startTransition`-nel a dokumentált React/Next viselkedés szerint.

### 53.14. Request abort ellenére fut a query

A driver nem támogat cancellationt, vagy a signal nincs továbbadva. Adj adapter contractot, timeoutot és integration tesztet.

### 53.15. Proxy rewrite után törött az RSC navigáció

Kézi `fetch()`-alapú rewrite elveszítette a szükséges framework headereket. Használj `NextResponse.rewrite()`-ot és production E2E-t.


---

## 54. Symfony–Winzard megfeleltetés

| Symfony HttpKernel fogalom | Winzard / Next.js megfelelő |
| --- | --- |
| `HttpKernelInterface::handle()` | Next.js hosting adapter + App Router request pipeline |
| Main request | Bejövő HTML/RSC/API/Action request |
| `kernel.request` | `next.config`, Proxy, request-context és korai policyk |
| RouterListener | Next.js filesystem routing, redirect/rewrite/Proxy |
| Request attributes | explicit params/search/header mapping és immutable RequestContext |
| Controller resolver | Next.js compiler és route entrypoint feloldás |
| PHP callable controller | Page, Route Handler vagy Server Action |
| `kernel.controller` | explicit entrypoint contract és wrapper/policy composition |
| Controller attributes | adjacent typed delivery contract; nincs runtime reflection |
| Argument resolver | operation-specifikus schema és request mapper |
| Value resolver | explicit actor/tenant/locale/header/body resolver |
| Controller call | application query/command meghívása |
| Controller `Response` return | Route Handler Web Response |
| Controller non-Response return | Page React tree, action state vagy application result |
| `kernel.view` | presenter + React render vagy HTTP DTO mapper |
| `kernel.response` | response factory, header/cookie/cache policy, Proxy/next.config |
| `Response::send()` | Next.js/platform response és React streaming |
| `kernel.terminate` | `after()` best-effort utómunka; durable munkához queue/outbox |
| `kernel.exception` | application result mapping, Route Handler error mapper, error boundary, `onRequestError` |
| `kernel.finish_request` | explicit `finally`, request-scope lezárás és cleanup |
| `ResetInterface` | request state kerülése, explicit cleanup/reset, isolation tests |
| Event listener | explicit wrapper, policy, decorator, instrumentation hook |
| Event priority | deklarált wrapperlista/named phase |
| Short-circuit response | Response, redirect, rewrite, notFound vagy action state |
| Subrequest | közvetlen Server Component/application kompozíció; belső HTTP kerülendő |
| `isMainRequest()` | nincs általános megfelelő; külön kezeld HTML/RSC/prefetch/Action requestet |
| `_format` | entrypoint/media type és explicit content negotiation |
| Bundle resource locator | package exports, recipe manifest, static registry |
| Full working kernel | Next.js + Winzard composition root + explicit delivery lifecycle |

### 54.1. Mit tartunk meg Symfonyból?

- explicit request–response szemlélet;
- külön route/controller/argument/result/response fázis;
- short-circuit lehetőség;
- centralizált hibamapping;
- response előtti policy;
- response utáni fázis;
- extensionök sorrendje;
- subrequest tudatos kezelése;
- hosszú életű process resetigénye;
- resource ownership.

### 54.2. Mit nem veszünk át?

- második EventDispatcher-alapú runtime kernel;
- reflectiones controller resolver;
- automatikus request attribute injection;
- runtime PHP-attribútum eventek;
- globális listener prioritási háló;
- belső kernel subrequest fragmentekhez;
- bundle logikai path runtime feloldása;
- service locator controllerben.

### 54.3. Winzard többlet

- Server/Client Component határ;
- RSC payload és prefetch;
- static/prerender/request-time lifecycle;
- streaming és Suspense;
- Server Action security;
- capability-aware composition;
- explicit view/HTTP presenter;
- request isolation Node/serverless környezetben;
- Forge route és architecture diagnosztika;
- consumer project documentation contract.


---

## 55. Források és attribúció

### 55.1. Symfony referencia

- [Symfony — The HttpKernel Component](https://symfony.com/doc/current/components/http_kernel.html)
- [Symfony — Controllers](https://symfony.com/doc/current/controller.html)
- [Symfony — Events and Event Listeners](https://symfony.com/doc/current/event_dispatcher.html)
- [Symfony — Built-in Kernel Events](https://symfony.com/doc/current/reference/events.html)
- [Symfony — Routing](https://symfony.com/doc/current/routing.html)

A Winzard dokumentum a request–response lifecycle, controller/argument/result feloldás, response-, terminate-, exception-, reset-, attribute event-, subrequest- és resource-location témakészletét veszi át. A PHP-specifikus API-kat nem másolja.

### 55.2. Next.js hivatalos dokumentáció

- [Next.js — Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Next.js — Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js — Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)
- [Next.js — error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- [Next.js — loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [Next.js — not-found.js](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
- [Next.js — instrumentation.js](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [Next.js — after](https://nextjs.org/docs/app/api-reference/functions/after)
- [Next.js — cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Next.js — headers](https://nextjs.org/docs/app/api-reference/functions/headers)
- [Next.js — redirect](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [Next.js — connection](https://nextjs.org/docs/app/api-reference/functions/connection)
- [Next.js — Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Next.js — Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js — Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js — Custom Server](https://nextjs.org/docs/app/guides/custom-server)
- [Next.js — Caching](https://nextjs.org/docs/app/getting-started/caching)
- [Next.js — Streaming](https://nextjs.org/docs/app/guides/streaming)

### 55.3. Node.js

- [Node.js — AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage)
- [Node.js — HTTP](https://nodejs.org/api/http.html)
- [Node.js — AbortController](https://nodejs.org/api/globals.html#class-abortcontroller)

### 55.4. Web platform

- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/)
- [MDN — Request](https://developer.mozilla.org/docs/Web/API/Request)
- [MDN — Response](https://developer.mozilla.org/docs/Web/API/Response)
- [MDN — ReadableStream](https://developer.mozilla.org/docs/Web/API/ReadableStream)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)

### 55.5. Ellenőrzési dátum

```text
2026-07-18
```

A Next.js request-, error-, streaming-, Proxy-, adapter- és `after()` contractja változhat. Frissítéskor újra ellenőrizni kell legalább:

- a Proxy execution ordert és runtimet;
- a Server Action route/matcher viselkedését;
- az error boundary callback nevét és stability státuszát;
- az `after()` platformcontractját;
- a request API-k elérhetőségét after callbackben;
- az instrumentation `onRequestError` contextjét;
- a cache és request memoization modellt;
- a custom server és standalone kompatibilitást;
- a route type generationt;
- a Forge routing parancsok aktuális felületét.
