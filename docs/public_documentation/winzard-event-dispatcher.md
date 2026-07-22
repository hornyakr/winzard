---
title: "Események, handlerek és tartós üzenetkezelés Winzard alkalmazásokban"
description: "A Symfony EventDispatcher teljes témakészletének Winzard-specifikus átültetése domain eventekkel, explicit handler registrykkel, integration eventekkel, transactional outboxszal, idempotens consumerekkel, Next.js lifecycle hookokkal és diagnosztikával."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-19"
source_basis: "Symfony Docs — Events and Event Listeners; The EventDispatcher Component"
nextjs_baseline: "16.2.10"
react_baseline: "19.2.x"
typescript_baseline: "5.9.3"
nodejs_baseline: "24.x LTS"
applies_to: "kitelepített Winzard projektek, a Winzard Reference App és a későbbi messaging/event capability-k"
related_documents:
  - "winzard-application-platform.md"
  - "winzard-http-kernel.md"
  - "winzard-service-container.md"
  - "winzard-controller.md"
  - "winzard-configuration.md"
  - "winzard-routing.md"
---

# Események, handlerek és tartós üzenetkezelés Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Events and Event Listeners”** fejezetének és az önálló **EventDispatcher Component** dokumentációjának teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony témakészletét követi — event listener, subscriber, prioritás, event alias, debug, before/after filter, custom event, propagation stop, immutable és traceable dispatcher —, de minden fogalmat a Winzard **Next.js App Router + TypeScript + moduláris monolit + ports and adapters + CQRS-lite** célarchitektúrájára képez le.

A dokumentum központi döntése:

> **A Winzard nem vezet be egyetlen globális eseménydiszpécsert minden üzleti, HTTP-, UI-, telemetry- és integrációs problémára. Az esemény típusa határozza meg a megfelelő mechanizmust: domain event, explicit application handler, tartós integration event, process-lokális signal, Next.js lifecycle hook, React UI-event vagy telemetry signal.**

A cél a Symfony EventDispatcher architekturális értékének megtartása:

- lazább komponenskapcsolatok;
- egyértelmű extension pointok;
- több handler kontrollált regisztrációja;
- determinisztikus sorrend és diagnosztika;
- tesztelhető event contractok;
- listener graph ellenőrzése;
- before/after viselkedés szétválasztása;
- a handler-hibák láthatóvá tétele.

A Winzard azonban szigorúbb határokat alkalmaz:

- az immutable business factet listener nem módosíthatja;
- üzleti eseménynél nincs általános `stopPropagation()`;
- tartós side effect nem épül process-lokális `EventEmitter`-re;
- adatbázis-commit és broker-publish nem lehet megbízhatatlan dual write;
- integration event fogyasztója idempotens;
- auth, tranzakció és inputvalidáció nem rejtett listenerprioritáson múlik;
- Next.js request lifecycle-hoz a framework saját hookjai és explicit delivery pipeline tartozik.

> [!IMPORTANT]
> A dokumentumban szereplő `forge event:*`, `forge outbox:*`, `forge inbox:*` és `forge message:*` parancsok **cél-CLI szerződések**. Egy parancs csak akkor tekinthető implementáltnak, ha a Forge CLI ténylegesen listázza és teszteli. A jelenleg használható minimum a `pnpm typecheck`, `pnpm test`, `pnpm forge check --project ...` és `pnpm build`.

> [!WARNING]
> Az „event” szó több, egymástól eltérő fogalmat jelölhet. A React `onClick`, a Node.js `EventEmitter`, egy OpenTelemetry span event, egy aggregate domain event és egy brokerre publikált integration event nem cserélhető fel egymással.

A fejezet végére egy fejlesztő:

1. meg tudja különböztetni a commandot, queryt, domain eventet, integration eventet, message-et és signal-t;
2. immutable, típusos domain event contractot tud készíteni;
3. statikus, composition-rootban összeállított handler registryt használ;
4. nem támaszkodik rejtett integer-prioritásokra üzleti workflow esetén;
5. explicit failure policyt és tranzakciós határt ad a handlereknek;
6. transactional outboxszal elkerüli a database–broker dual write hibát;
7. idempotens consumerrel kezeli az ismételt kézbesítést;
8. correlation-, causation-, tenant- és trace metadata segítségével követhető eseményláncot épít;
9. külön kezeli a Next.js lifecycle hookokat, process-lokális signalokat és tartós business eventeket;
10. unit-, contract-, integration- és failure-injection tesztekkel ellenőrzi az eseményrendszert;
11. diagnosztizálni tudja a handler graphot, az outboxot, a retryt és a dead-letter állapotot;
12. biztonságosan tervezi az eseménypayloadot, a PII-t, a secretet, a retentiont és a replayt.

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#section-1)
2. [Hatókör, baseline és előfeltételek](#section-2)
3. [A Symfony EventDispatcher lényege](#section-3)
4. [A Winzard alapdöntése: nincs egyetlen globális eseménybusz](#section-4)
5. [Az események taxonómiája](#section-5)
6. [Command, query, event, message és signal](#section-6)
7. [Domain event](#section-7)
8. [Application event és application notification](#section-8)
9. [Integration event](#section-9)
10. [Process-lokális signal](#section-10)
11. [Böngésző- és React-esemény](#section-11)
12. [Telemetry event és span event](#section-12)
13. [Az event sourcing nem automatikus következmény](#section-13)
14. [Eseménynevek és stabil azonosítók](#section-14)
15. [A domain event envelope](#section-15)
16. [Az integration event envelope](#section-16)
17. [Payload-tervezés és adatminimalizálás](#section-17)
18. [Korreláció, okozati lánc és trace metadata](#section-18)
19. [Immutable eseményobjektumok](#section-19)
20. [Class, readonly record vagy discriminated union](#section-20)
21. [Clock, event ID és event factory](#section-21)
22. [Event handler contract](#section-22)
23. [Listener és subscriber Winzard-megfelelője](#section-23)
24. [Statikus handler registry](#section-24)
25. [Regisztráció a composition rootban](#section-25)
26. [Autoconfiguration célmodell](#section-26)
27. [Több handler ugyanarra az eseményre](#section-27)
28. [Prioritás helyett explicit fázis és dependency](#section-28)
29. [Szinkron dispatch](#section-29)
30. [Aszinkron dispatch](#section-30)
31. [Handler-hiba és failure policy](#section-31)
32. [Propagation megállítása](#section-32)
33. [Cancellation és AbortSignal](#section-33)
34. [Nested dispatch és reentrancy](#section-34)
35. [Ciklusok és eseményviharok megelőzése](#section-35)
36. [Tranzakciós határ](#section-36)
37. [Aggregate által rögzített domain eventek](#section-37)
38. [Eventek kiolvasása és törlése](#section-38)
39. [Unit of Work és application orchestration](#section-39)
40. [Tranzakciós domain handler](#section-40)
41. [Transactional outbox](#section-41)
42. [Domain eventből integration event](#section-42)
43. [Outbox relay és publisher worker](#section-43)
44. [Delivery semantics: at-most-once, at-least-once, effectively-once](#section-44)
45. [Idempotens consumer és inbox](#section-45)
46. [Sorrend, aggregate sequence és concurrency](#section-46)
47. [Retry, backoff és jitter](#section-47)
48. [Dead-letter, poison message és quarantine](#section-48)
49. [Saga és process manager](#section-49)
50. [Külső webhook és esemény-ingress](#section-50)
51. [Next.js lifecycle hookok és platformesemények](#section-51)
52. [Before filterek explicit pipeline-nal](#section-52)
53. [After filterek, response policy és after()](#section-53)
54. [Exception-, error- és failure-események](#section-54)
55. [Node.js EventEmitter](#section-55)
56. [EventTarget és CustomEvent](#section-56)
57. [node:diagnostics_channel](#section-57)
58. [AsyncLocalStorage és kontextuspropagáció](#section-58)
59. [Serverless és többpéldányos működés](#section-59)
60. [Node, Edge és runtime-kompatibilitás](#section-60)
61. [Biztonsági alapelvek](#section-61)
62. [PII, secret, retention és redakció](#section-62)
63. [Tenant-, actor- és jogosultsági határ](#section-63)
64. [Observability és trace-kapcsolat](#section-64)
65. [Traceable dispatcher Winzard-megfelelője](#section-65)
66. [Metric, log, audit record és business event](#section-66)
67. [Teljesítmény, backpressure és terhelésvédelem](#section-67)
68. [Unit tesztelés](#section-68)
69. [Handler contract tesztek](#section-69)
70. [Outbox-, inbox- és integration tesztek](#section-70)
71. [Determinisztikus fixture-ek és recording adapterek](#section-71)
72. [Teljes OrderPlaced vertikális példa](#section-72)
73. [Ajánlott könyvtárstruktúra](#section-73)
74. [Forge célparancsok](#section-74)
75. [Architecture checkek és hibakódok](#section-75)
76. [Implementációs elfogadási kritériumok](#section-76)
77. [Migráció közvetlen side effectekből](#section-77)
78. [Hibaelhárítás](#section-78)
79. [Symfony–Winzard megfeleltetés](#section-79)
80. [Források és attribúció](#section-80)

---

<a id="section-1"></a>

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy konzisztencia-, biztonsági, delivery-, replay-, állapotizolációs vagy diagnosztikai hibát okozhat;
- **TILOS / MUST NOT**: Winzard-kompatibilis production kódban nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni és tesztelni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak explicit trade-off, owner és monitoring mellett használható;
- **OPCIONÁLIS / MAY**: a capability és deployment modell szerint bevezethető.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Occurrence** | Valami megtörtént a domainben, alkalmazásban vagy platformban. |
| **Event** | Egy occurrence immutable leírása és kontextusa. |
| **Domain event** | Egy bounded contexten belüli, üzletileg jelentős, már megtörtént tény. |
| **Integration event** | Más process, service vagy rendszer számára publikált, tartós és verziózott eseménycontract. |
| **Application notification** | Egy use case-en belüli vagy közvetlenül utána futó, explicit helyi handlerpont. |
| **Signal** | Process-lokális, best-effort technikai értesítés, amely nem hordoz üzleti delivery-garanciát. |
| **Message** | Transzporton továbbított envelope; lehet event, command, query vagy reply. |
| **Handler** | Egy konkrét event type feldolgozója. |
| **Registry** | Statikus, típusos mapping event type és handlerdefiníciók között. |
| **Dispatcher** | A registry alapján a megfelelő handlereket meghívó komponens. |
| **Publisher** | Integration eventet tartós transzportra vagy outboxba küldő port. |
| **Consumer** | Brokerből, queue-ból vagy webhookból érkező message feldolgozó adapter. |
| **Outbox** | Az üzleti adatváltozással egy tranzakcióban tárolt, később publikálandó message-ek tárhelye. |
| **Inbox** | Fogyasztóoldali deduplikációs és feldolgozási nyilvántartás. |
| **Correlation ID** | Egy teljes üzleti vagy technikai folyamat eseményeit összekapcsoló azonosító. |
| **Causation ID** | Annak a commandnak vagy eventnek az azonosítója, amely közvetlenül kiváltotta az eseményt. |
| **Replay** | Korábban rögzített eventek kontrollált újrafeldolgozása. |
| **Dead-letter** | Ismételten sikertelen, normál retryból kivett message karanténja. |

### 1.3. Az „event” szó túlterhelése

```text
React click event
Node.js EventEmitter event
Next.js lifecycle callback
OpenTelemetry span event
domain event
integration event
broker message
webhook notification
```

A dokumentum minden esetben explicit jelzőt használ. Az általános `EventBus` név önmagában nem elég: a típusnak és a portnak jeleznie kell, hogy process-lokális, domain-, integration- vagy telemetry-mechanizmusról van szó.

---

<a id="section-2"></a>

## 2. Hatókör, baseline és előfeltételek

### 2.1. Technikai baseline

```text
Node.js:      24.x LTS
pnpm:         11.x
Next.js:      16.2.10
React:        19.2.x
TypeScript:   5.9.x
App Router:   igen
src/:         igen
```

### 2.2. Előfeltételek

A dokumentum feltételezi:

- a Winzard moduláris application struktúrát;
- explicit composition rootot;
- konstruktoros dependency injectiont;
- frameworkfüggetlen application és domain réteget;
- capability-specifikus infrastruktúra-adaptereket;
- TypeScript strict módot;
- tesztelhető Clock, ID generator és TransactionManager portokat.

### 2.3. Lefedett területek

A fejezet lefedi:

- domain eventek létrehozását és gyűjtését;
- in-process handler registryt;
- listener/subscriber megfeleltetést;
- handler-sorrendet és failure policyt;
- transactional outboxot;
- integration event envelope-et;
- retryt, inboxot és dead-lettert;
- Next.js lifecycle hookokat;
- Node.js event API-k használati határait;
- telemetry és tracing kapcsolatot;
- tesztelést és Forge-diagnosztikát.

### 2.4. Nem része automatikusan

Ez a dokumentum nem jelenti azt, hogy minden Winzard projekt kötelezően rendelkezik:

- message brokerrel;
- outbox táblával;
- event store-ral;
- sagával;
- worker deploymenttel;
- Kafka-, SQS-, NATS- vagy RabbitMQ-adapterrel.

Ezek külön capability-k. A minimal profil továbbra is működhet tartós üzenet-infrastruktúra nélkül.

---

<a id="section-3"></a>

## 3. A Symfony EventDispatcher lényege

A Symfony EventDispatcher központi dispatcherobjektumot, event objecteket, listener-regisztrációt, subscribereket, prioritást, event aliasokat, propagation stopot és diagnosztikát biztosít.

A tipikus Symfony-folyamat:

```text
producer
→ Event object
→ EventDispatcher::dispatch()
→ listener registry
→ prioritás szerint rendezett listenerlista
→ listener invocation
→ esetleges event mutation vagy stopPropagation()
```

A rendszer értéke:

- a producernek nem kell ismernie minden reakciót;
- több komponens reagálhat ugyanarra a notificationre;
- listener vagy subscriber önálló service lehet;
- a handlerlista debugolható;
- a kernel before/after pontjai extensionként használhatók;
- a traceable dispatcher képes megmutatni a meghívott és nem meghívott listenereket.

A Winzard ezeket a célokat megtartja, de nem másolja át automatikusan:

- a mutable event objectet;
- a globális dispatcher service-t;
- az integer priority alapú üzleti orchestrationt;
- a propagation stoppal végzett policy-döntést;
- a container-tag alapú runtime discoveryt;
- a HTTP-lifecycle és domain események egyetlen buszba keverését.

---

<a id="section-4"></a>

## 4. A Winzard alapdöntése: nincs egyetlen globális eseménybusz

### 4.1. A fő szabály

```text
nincs univerzális globalEventBus
```

A Winzardban külön port és külön garancia tartozik minden eventkategóriához:

```text
DomainEventDispatcher
  → bounded contexten belüli, tranzakcióhoz kötött local reaction

IntegrationEventOutbox
  → tartós, verziózott cross-process publication

ProcessSignalEmitter
  → best-effort, process-lokális technikai signal

Telemetry
  → log, metric, trace és span event

React event handler
  → böngészőinterakció

Next.js lifecycle hook
  → Proxy, instrumentation, error boundary, after()
```

### 4.2. Miért veszélyes az egyetlen busz?

Egy általános `eventBus.publish(anything)` elrejti:

- szinkron vagy aszinkron végrehajtást;
- tranzakciós határt;
- delivery-garanciát;
- retryt;
- handler-sorrendet;
- security scope-ot;
- payload-verziót;
- processhatárt;
- azt, hogy a hiba visszagörgeti-e az üzleti műveletet.

### 4.3. Engedélyezett absztrakció

A közös alaptípus legfeljebb compile-time segéd lehet:

```ts
export type EventRecord<
  TType extends string,
  TData,
> = Readonly<{
  id: string;
  type: TType;
  occurredAt: string;
  data: Readonly<TData>;
}>;
```

A runtime portok azonban továbbra is külön maradnak.

---

<a id="section-5"></a>

## 5. Az események taxonómiája

A Winzard az alábbi kategóriákat különíti el:

| Kategória | Scope | Tartósság | Tipikus fogyasztó | Hibahatás |
| --- | --- | --- | --- | --- |
| Domain event | bounded context | általában nem önállóan tartós | helyi domain/application handler | tranzakciót visszagörgethet |
| Application notification | egy use case vagy modul | nem tartós | explicit local handler | contract szerint fail-fast vagy collect |
| Integration event | process/service határon túl | tartós | queue/broker consumer | retry, inbox, dead-letter |
| Process signal | egy Node.js instance | nem tartós | infrastruktúra vagy diagnosztika | best-effort vagy fail-fast policy |
| UI event | browser/React tree | nem tartós | Client Component handler | kliensoldali state vagy Server Action |
| Telemetry event | observability pipeline | backendfüggő | collector/log backend | nem változtathat üzleti eredményt |
| External event | külső rendszerből érkező | külső contract szerint | ingress adapter | signature, schema, dedup szükséges |

KÖTELEZŐ a kategóriát a típus, könyvtár, port és dokumentáció alapján felismerhetővé tenni.

---

<a id="section-6"></a>

## 6. Command, query, event, message és signal

### 6.1. Command

```text
szándék
→ egy logikai handler
→ elfogadható vagy elutasítható
```

Példa:

```text
PlaceOrder
CancelOrder
ReserveInventory
```

### 6.2. Query

```text
információkérés
→ nincs üzleti side effect
→ egy logikai handler
```

### 6.3. Event

```text
már megtörtént tény
→ nulla vagy több handler
→ nem „utasítás”
```

Példa:

```text
OrderPlaced
PaymentCaptured
ProductPriceChanged
```

### 6.4. Message

A transzporton mozgó envelope. Tartalma lehet command vagy event. A message delivery tulajdonsága nem változtatja meg a szemantikáját.

### 6.5. Signal

Best-effort technikai jelzés:

```text
connection.opened
cache.hit
diagnostic.request.start
```

A signal elvesztése nem okozhat üzleti inkonzisztenciát.

---

<a id="section-7"></a>

## 7. Domain event

A domain event egy bounded contexten belül értelmezett, üzletileg jelentős tény.

Példa:

```ts
export type OrderPlaced = Readonly<{
  id: string;
  type: 'orders.order.placed';
  occurredAt: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId: string;
  tenantId?: string;
  data: Readonly<{
    customerId: string;
    totalMinor: number;
    currency: string;
  }>;
}>;
```

### 7.1. Követelmények

A domain event:

- múlt idejű tényt nevez meg;
- immutable;
- nem tartalmaz ORM rekordot;
- nem tartalmaz frameworktípust;
- nem tartalmaz service-t vagy callbacket;
- a szükséges tényeket snapshotként hordozza;
- nem utasít konkrét fogyasztót;
- nem garantál külső publikációt.

### 7.2. Nem megfelelő nevek

```text
SendOrderEmail
UpdateSearchIndex
CallPaymentService
```

Ezek command- vagy handlernevek, nem tények.

### 7.3. Jó nevek

```text
OrderPlaced
CustomerEmailChanged
InventoryReservationExpired
```

### 7.4. Határ

A domain event nem automatikusan public integration contract. Külső publikáció előtt explicit mapper készít integration eventet.

---

<a id="section-8"></a>

## 8. Application event és application notification

Application notification akkor használható, ha egy use case-en belül vagy közvetlenül utána több helyi reakciót kell explicit módon komponálni.

Példák:

```text
application command completed
projection invalidation requested
local audit fact recorded
same-transaction derived record requested
```

### 8.1. Elsődleges irány

Cross-cutting viselkedéshez előbb vizsgálandó:

```text
decorator
interceptor
policy
transaction wrapper
presenter
explicit orchestrator
```

Csak akkor szükséges application notification, ha valóban több, egymástól független local consumer reagál ugyanarra a tényre.

### 8.2. Tiltott használat

TILOS eventként elrejteni:

- authorizációt;
- inputvalidációt;
- tranzakciónyitást;
- kötelező üzleti lépést;
- command eredményének meghatározását;
- titkos sorrendfüggést.

Ha egy handler nélkül a use case helytelen, az a lépés valószínűleg az explicit application orchestration része.

---

<a id="section-9"></a>

## 9. Integration event

Az integration event egy külső fogyasztóknak szánt, tartós, verziózott ténycontract.

### 9.1. Tulajdonságok

- stabil event type;
- explicit schema version;
- serializálható payload;
- event ID;
- source;
- occurred-at timestamp;
- correlation és causation;
- tenant/subject metadata szükség szerint;
- idempotens fogyaszthatóság;
- dokumentált retention és compatibility.

### 9.2. Példa

```ts
export type OrderPlacedV1 = Readonly<{
  specversion: '1.0';
  id: string;
  source: 'urn:winzard:orders';
  type: 'com.example.orders.order.placed.v1';
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  dataschema: 'urn:schema:orders:order-placed:v1';
  correlationid: string;
  causationid: string;
  tenantid?: string;
  data: Readonly<{
    orderId: string;
    customerId: string;
    totalMinor: number;
    currency: string;
  }>;
}>;
```

A CloudEvents-kompatibilitás OPCIONÁLIS. Ha a projekt CloudEvents kompatibilitást deklarál, a kötelező attribútumokat és a választott protocol bindingot teljesen kell alkalmaznia; részleges, félrevezető kompatibilitás nem támogatott.

---

<a id="section-10"></a>

## 10. Process-lokális signal

Process-lokális signal egyetlen Node.js instance memóriájában terjed.

Lehetséges használatok:

- alacsony szintű adapterdiagnosztika;
- processen belüli cache invalidation, ha az elvesztés elfogadható;
- plugin lifecycle egy izolált tooling processben;
- teszt runner eseménye;
- local resource state notification.

Nem használható:

- fizetés indítására;
- garantált emailre;
- inventory reservationre;
- cross-instance cache coherencyre;
- audit egyetlen forrásaként;
- adatbázis-commit utáni kötelező publikációra.

```text
process restart
instance scaling
serverless cold start
worker crash
```

mind elveszítheti a signal állapotát és regisztrált listenereit.

---

<a id="section-11"></a>

## 11. Böngésző- és React-esemény

A React eseménykezelő a böngésző- vagy komponensinterakció része:

```tsx
<button onClick={handleCheckout}>
  Megrendelés
</button>
```

A React UI-event:

- a Client Componenthez tartozik;
- propagálhat a DOM/React fán;
- használhat `stopPropagation()` vagy `preventDefault()` hívást;
- nem domain event;
- nem garantált tartós message;
- üzleti mutationt Server Actionön vagy HTTP adapteren keresztül indít.

```text
onClick
→ Server Action / Route Handler
→ command
→ domain decision
→ domain event
→ outbox integration event
```

A UI propagation és a business event propagation két külön fogalom.

---

<a id="section-12"></a>

## 12. Telemetry event és span event

Telemetry event egy megfigyelhetőségi jel. Példák:

```text
span event
structured log record
metric increment
error report
```

A telemetry esemény célja:

- diagnosztika;
- teljesítménymérés;
- requestút követése;
- hibaanalízis;
- operációs riasztás.

Nem lehet:

- üzleti state source of truth;
- command transport;
- auditjogi bizonyíték automatikusan;
- retry queue;
- integration event helyettesítője.

OpenTelemetry esetén egy span event egy jelentős, időponthoz kötött annotáció a span életciklusában. Ha a timestamp nem lényeges, gyakran span attribute alkalmasabb.

---

<a id="section-13"></a>

## 13. Az event sourcing nem automatikus következmény

Domain event használata nem jelenti automatikusan az event sourcing bevezetését.

### 13.1. State-based persistence + domain events

```text
aktuális aggregate state
→ normál adatbázistábla

domain event
→ use case közbeni reaction vagy outbox mapping
```

### 13.2. Event sourcing

```text
aggregate state
→ event streamből visszajátszva

event store
→ elsődleges persistence model
```

Az event sourcing külön capability, amely további szerződéseket igényel:

- stream ID;
- stream version;
- optimistic append;
- snapshot;
- upcaster;
- replay isolation;
- projection rebuild;
- retention és legal hold;
- event immutability;
- schema migration.

TILOS egy egyszerű domain event buszt event store-ként dokumentálni.

---

<a id="section-14"></a>

## 14. Eseménynevek és stabil azonosítók

### 14.1. Domain event név

Ajánlott belső forma:

```text
<bounded-context>.<aggregate>.<past-tense-fact>
```

Példák:

```text
orders.order.placed
catalog.product.price-changed
identity.user.email-verified
```

### 14.2. Integration event név

Ajánlott külső forma:

```text
<reverse-domain>.<bounded-context>.<entity>.<fact>.v<major>
```

Példák:

```text
com.example.orders.order.placed.v1
com.example.catalog.product.price-changed.v2
```

### 14.3. Handler ID

```text
<module>.<event-type>.<handler-purpose>
```

Példa:

```text
search.order-placed.update-order-index
notifications.order-placed.enqueue-confirmation
```

### 14.4. Stabilitás

- címátnevezés nem változtatja automatikusan az integration type-ot;
- breaking payloadváltozás új major type vagy új schema URI;
- event alias csak migrációs compatibility adapter lehet;
- ugyanaz az event type nem kaphat új, inkompatibilis jelentést.

---

<a id="section-15"></a>

## 15. A domain event envelope

A domain envelope minimális, application-közeli metadata-t hordoz:

```ts
export type DomainEventEnvelope<
  TType extends string,
  TData,
> = Readonly<{
  id: string;
  type: TType;
  occurredAt: string;
  aggregate: Readonly<{
    type: string;
    id: string;
    version: number;
  }>;
  correlationId: string;
  causationId: string;
  tenantId?: string;
  data: Readonly<TData>;
}>;
```

### 15.1. Nem kerülhet bele

- `Request` vagy `Response`;
- Prisma client vagy transaction object;
- logger;
- callback;
- exception instance;
- mutable aggregate;
- teljes actor token;
- HTTP header map;
- secret.

### 15.2. Aggregate version

Az `aggregate.version` segíti:

- az eseménysorrend ellenőrzését;
- a duplicate/out-of-order consumer kezelését;
- a debuggingot;
- az optimistic concurrencyt.

---

<a id="section-16"></a>

## 16. Az integration event envelope

Az integration envelope transport- és consumerbarát.

```ts
export type IntegrationEventEnvelope<TData> = Readonly<{
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  subject?: string;
  time: string;
  datacontenttype: 'application/json';
  dataschema?: string;
  correlationid: string;
  causationid: string;
  tenantid?: string;
  traceparent?: string;
  data: Readonly<TData>;
}>;
```

### 16.1. CloudEvents kapcsolat

A CloudEvents 1.0 core contract kötelező `id`, `source`, `specversion` és `type` attribútumokat definiál. A `source + id` pár distinct eventenként egyedi, és ismételt kézbesítésnél ugyanaz az ID megmaradhat.

### 16.2. Transportfüggetlenség

Az envelope nem tartalmazhat broker-specifikus objektumot. A Kafka header, SQS message attribute, AMQP property vagy HTTP header az adapter feladata.

### 16.3. Extension metadata

A custom metadata:

- dokumentált;
- kis kardinalitású;
- egyszer szerepel;
- nem ütközik standard mezővel;
- nem tartalmaz secretet.

---

<a id="section-17"></a>

## 17. Payload-tervezés és adatminimalizálás

### 17.1. Csak szükséges tények

Az event payload a fogyasztó számára szükséges tényeket hordozza, nem a producer teljes belső modelljét.

Nem ajánlott:

```ts
const payload = {
  order: fullOrmOrderWithRelations,
  user: fullUserRecord,
  request: rawRequest,
};
```

Ajánlott:

```ts
const payload = {
  orderId: 'ord_123',
  customerId: 'cus_456',
  totalMinor: 12900,
  currency: 'HUF',
};
```

### 17.2. Snapshot kontra reference

A payload snapshot. A consumer nem feltételezheti, hogy a producer aktuális adatbázisállapota később ugyanaz lesz.

### 17.3. Méret

A contract KÖTELEZŐEN meghatározza:

- maximális payloadméretet;
- nagy blob kezelését;
- compression policyt;
- object-storage reference használatát;
- retentiont.

Nagy bináris tartalom helyett rövid életű, jogosultságellenőrzött objektumreferencia használható.

---

<a id="section-18"></a>

## 18. Korreláció, okozati lánc és trace metadata

### 18.1. Correlation ID

Egy teljes üzleti workflow közös azonosítója.

```text
HTTP request
→ PlaceOrder command
→ OrderPlaced event
→ PaymentRequested command
→ PaymentCaptured event
```

mind ugyanazt a `correlationId` értéket hordozhatja.

### 18.2. Causation ID

A közvetlen kiváltó message vagy command azonosítója.

```text
OrderPlaced.causationId = PlaceOrder.commandId
PaymentRequested.causationId = OrderPlaced.eventId
```

### 18.3. Trace context

A `traceparent` vagy más trace metadata observability célú. Nem helyettesíti a business correlation ID-t.

### 18.4. Request ID

Request ID rövid technikai scope. Egy későbbi async consumer már más requestben vagy request nélkül futhat; ezért a request ID nem használható a teljes workflow egyetlen azonosítójaként.

---

<a id="section-19"></a>

## 19. Immutable eseményobjektumok

Az esemény egy megtörtént tény. Listener nem írhatja át.

```ts
export const orderPlaced = Object.freeze({
  id: 'evt_123',
  type: 'orders.order.placed',
  occurredAt: '2026-07-19T10:00:00.000Z',
  data: Object.freeze({
    orderId: 'ord_123',
  }),
});
```

A TypeScript `Readonly` compile-time védelmet ad; mély immutabilityhez factory, `Object.freeze`, immutable value object vagy serializációs boundary szükséges.

### 19.1. Tiltott minta

```ts
async function handle(event: MutableBusinessEvent): Promise<void> {
  event.data.status = 'processed';
}
```

### 19.2. Helyette

A handler:

- saját state-et módosít porton keresztül;
- új commandot képez;
- új eventet rögzít;
- explicit resultot ad a dispatchernek csak technikai diagnosztikára.

Az eredeti event jelentése változatlan.

---

<a id="section-20"></a>

## 20. Class, readonly record vagy discriminated union

### 20.1. Readonly record

Ajánlott alapértelmezés:

```ts
export type ProductPriceChanged = Readonly<{
  type: 'catalog.product.price-changed';
  id: string;
  occurredAt: string;
  data: Readonly<{
    productId: string;
    previousMinor: number;
    currentMinor: number;
  }>;
}>;
```

Előny:

- egyszerű serializáció;
- jó discriminated union;
- nincs rejtett prototype-viselkedés;
- könnyű schema validation.

### 20.2. Class

Class használható, ha:

- constructor invariáns szükséges;
- domain helpermetódus indokolt;
- nem kerül közvetlen transportra;
- serializáció explicit mapperen keresztül történik.

### 20.3. Discriminated union

```ts
type CatalogDomainEvent =
  | ProductCreated
  | ProductPriceChanged
  | ProductArchived;
```

Exhaustive switch esetén fordítási időben látható az új event type.

### 20.4. Tiltott dinamikus dispatch

TILOS user inputból classnevet vagy import pathot képezni.

---

<a id="section-21"></a>

## 21. Clock, event ID és event factory

A domainkód ne hívjon közvetlenül `Date.now()`, `new Date()` vagy `crypto.randomUUID()` függvényt, ha a determinizmus és tesztelhetőség fontos.

```ts
export interface Clock {
  now(): Date;
}

export interface EventIdGenerator {
  next(): string;
}

export type EventFactoryContext = Readonly<{
  clock: Clock;
  ids: EventIdGenerator;
  correlationId: string;
  causationId: string;
  tenantId?: string;
}>;
```

Példa factory:

```ts
export function createOrderPlaced(
  order: OrderSnapshot,
  context: EventFactoryContext,
): OrderPlaced {
  return Object.freeze({
    id: context.ids.next(),
    type: 'orders.order.placed',
    occurredAt: context.clock.now().toISOString(),
    aggregate: {
      type: 'order',
      id: order.id,
      version: order.version,
    },
    correlationId: context.correlationId,
    causationId: context.causationId,
    tenantId: context.tenantId,
    data: {
      customerId: order.customerId,
      totalMinor: order.totalMinor,
      currency: order.currency,
    },
  });
}
```

A production adapter Node crypto és system clock lehet; a teszt fix értékeket használ.

---

<a id="section-22"></a>

## 22. Event handler contract

### 22.1. Domain handler

```ts
export interface DomainEventHandler<E extends DomainEventEnvelope<string, unknown>> {
  readonly id: string;
  readonly eventType: E['type'];
  handle(
    event: E,
    context: DomainEventHandlerContext,
  ): Promise<void>;
}
```

### 22.2. Integration consumer

```ts
export interface IntegrationEventConsumer<E> {
  readonly consumerId: string;
  readonly eventType: string;
  readonly acceptedMajorVersion: number;
  handle(event: E, context: ConsumerContext): Promise<void>;
}
```

### 22.3. Handler context

A context csak a szükséges portokat adja:

```ts
export type DomainEventHandlerContext = Readonly<{
  transaction: TransactionContext;
  events: DomainEventRecorder;
}>;
```

TILOS egy generikus service locatort átadni.

### 22.4. Return value

Business event handler return value nem módosítja az eseményt. Technikai dispatcher gyűjthet handlerreportot, de az nem üzleti output.

---

<a id="section-23"></a>

## 23. Listener és subscriber Winzard-megfelelője

Symfonyban a listener külön konfigurációból is regisztrálható, a subscriber pedig saját maga deklarálja az eseményeket.

Winzard-megfelelő:

### 23.1. Listener

Egy handler + külön definition:

```ts
export const updateSearchOnOrderPlaced = defineEventHandler({
  id: 'search.order-placed.update-index',
  eventType: 'com.example.orders.order.placed.v1',
  mode: 'integration',
  handle: updateSearchIndex,
});
```

### 23.2. Subscriber

Egy modul több handlert exportáló definition factoryja:

```ts
export function createSearchEventHandlers(
  dependencies: SearchHandlerDependencies,
): readonly EventHandlerDefinition[] {
  return [
    createOrderPlacedSearchHandler(dependencies),
    createProductRenamedSearchHandler(dependencies),
  ];
}
```

### 23.3. Döntési szabály

- egyszerű, egy eventre reagáló komponens: listener/handler;
- egy capability összetartozó handlercsomagja: subscriber factory;
- a registry továbbra is explicit composition output;
- a handler nem regisztrálja önmagát globális modulbetöltési side effecttel.

---

<a id="section-24"></a>

## 24. Statikus handler registry

A registry statikus és típusos.

```ts
export type EventHandlerRegistry = Readonly<
  Record<string, readonly EventHandlerDefinition[]>
>;

export const orderHandlers = Object.freeze({
  'orders.order.placed': Object.freeze([
    reserveAccountingEntryHandler,
    appendOrderAuditHandler,
  ]),
  'orders.order.cancelled': Object.freeze([
    releaseReservationHandler,
  ]),
}) satisfies EventHandlerRegistry;
```

### 24.1. Registry invariánsok

- handler ID egyedi;
- event type ismert;
- mode kompatibilis;
- phase ismert;
- dependency létezik;
- nincs ciklus;
- sorrend determinisztikus;
- runtime filesystem scan nincs.

### 24.2. Registry ownership

A registry bounded context vagy capability tulajdona. Nem kötelező egyetlen globális registrybe összevonni minden eventet.

---

<a id="section-25"></a>

## 25. Regisztráció a composition rootban

A composition root hozza létre a handlereket és a dispatchert.

```ts
import 'server-only';

export function createOrdersEventRuntime(
  dependencies: OrdersEventDependencies,
) {
  const handlers = createOrdersDomainHandlers(dependencies);
  const registry = buildDomainEventRegistry(handlers);

  return Object.freeze({
    dispatcher: new SequentialDomainEventDispatcher(registry),
    handlers,
  });
}
```

### 25.1. Miért itt?

A composition root ismeri:

- a konkrét adaptereket;
- a capability-ket;
- a stage-et;
- a handler enable/disable policyt;
- a decoratort;
- a telemetryt;
- a runtime korlátokat.

Az application és domain nem importálhat composition modult.

---

<a id="section-26"></a>

## 26. Autoconfiguration célmodell

Egy későbbi Forge autoconfiguration statikus generálás lehet, nem runtime reflection.

Lehetséges folyamat:

```text
*.event-handler.definition.ts
→ Forge scanner build/dev időben
→ schema validation
→ duplicate/cycle check
→ generated registry.ts
→ typecheck
→ graph snapshot
```

### 26.1. Nem támogatott

- runtime decorator metadata alapján globális discovery;
- minden `src/**` class automatikus listenerként kezelése;
- production startupkor filesystem glob;
- import side effectes `registerHandler()`;
- classnévkonvencióból kitalált security-releváns binding.

### 26.2. Generated file

A generated registry:

- fejlécben forráshash-eket tartalmaz;
- kézzel nem szerkeszthető;
- drift-checkelt;
- determinisztikus sorrendű;
- review-zható TypeScript.

---

<a id="section-27"></a>

## 27. Több handler ugyanarra az eseményre

Egy eventre nulla vagy több handler reagálhat.

### 27.1. Függetlenség

A handlerek KÖTELEZŐEN úgy legyenek tervezve, hogy:

- ne olvassák egymás memóriabeli outputját;
- ne feltételezzék más handler sikerét, hacsak explicit pipeline nincs;
- ne osszanak mutable state-et;
- ne ugyanazt a side effectet végezzék duplikáltan;
- saját idempotency contracttal rendelkezzenek, ha async fogyasztók.

### 27.2. Ha a sorrend üzletileg fontos

Ne két független event handler legyen. Használj:

```text
explicit application orchestrator
ordered pipeline
saga/process manager
single composite handler
```

### 27.3. Handlerlista változása

Új handler hozzáadása üzleti viselkedésváltozás lehet, ezért:

- dokumentációs hatást kell jelölni;
- failure és retry policyt kell adni;
- security review szükséges lehet;
- integration consumer esetén deployment compatibilityt kell vizsgálni.

---

<a id="section-28"></a>

## 28. Prioritás helyett explicit fázis és dependency

A Symfony integer priority rugalmas, de nagy rendszerben rejtett sorrendfüggést okozhat.

A Winzard alapértelmezése:

```text
független handlerek
→ nincs üzleti sorrendgarancia
→ stabil technikai sorrend csak reprodukálhatósághoz
```

Ha explicit sorrend szükséges:

```ts
export type EventHandlerDefinition = Readonly<{
  id: string;
  eventType: string;
  phase: 'transactional' | 'after-commit' | 'integration-map' | 'telemetry';
  before?: readonly string[];
  after?: readonly string[];
  handle(event: unknown): Promise<void>;
}>;
```

### 28.1. Fázissorrend

Példa:

```text
transactional
→ integration-map
→ after-commit
→ telemetry
```

A fázisok jelentése normatív; a `before` és `after` gráf buildidőben topologikusan rendezhető.

### 28.2. Tiltott

```ts
priority: 217
priority: -42
```

magyarázat és diagnosztika nélkül.

---

<a id="section-29"></a>

## 29. Szinkron dispatch

A szinkron dispatcher a producer call stackjében fut.

```ts
export class SequentialDomainEventDispatcher {
  constructor(private readonly registry: DomainEventRegistry) {}

  async dispatch(
    events: readonly DomainEvent[],
    context: DomainEventHandlerContext,
  ): Promise<void> {
    for (const event of events) {
      for (const handler of this.registry.handlersFor(event.type)) {
        await handler.handle(event, context);
      }
    }
  }
}
```

### 29.1. Garanciák

- determinisztikus iteráció;
- handlerhiba propagálható;
- tranzakció visszagörgethető;
- producer csak a dispatcher befejezése után folytatódik.

### 29.2. Korlátok

- latency hozzáadódik;
- lassú handler blokkolja a requestet;
- külső hálózati side effect veszélyes;
- handlerlánc ciklust okozhat;
- nagy fan-out performance-probléma.

Szinkron dispatch elsősorban local, tranzakciós, gyors és determinisztikus reakcióhoz használható.

---

<a id="section-30"></a>

## 30. Aszinkron dispatch

Az aszinkron dispatch nem egyszerűen `setImmediate()` vagy `Promise.all()`.

### 30.1. Valódi aszinkron business delivery

```text
business transaction
→ outbox row
→ commit
→ relay
→ broker/queue
→ consumer
→ inbox/idempotency
```

### 30.2. Process-lokális defer

```ts
queueMicrotask(() => runListener());
```

vagy:

```ts
setImmediate(() => runListener());
```

csak best-effort technikai munkára használható. Processcrash esetén elveszhet.

### 30.3. Párhuzamos handler

```ts
await Promise.all(handlers.map((handler) => handler.handle(event)));
```

csak akkor engedélyezett, ha:

- a handlerek order-independentek;
- nincs közös transaction context;
- failure aggregation explicit;
- cancellation explicit;
- resource limitek kontrolláltak.

Alapértelmezés: sequential.

---

<a id="section-31"></a>

## 31. Handler-hiba és failure policy

Minden handlerdefinícióhoz failure policy tartozik.

```ts
export type FailurePolicy =
  | 'fail-fast'
  | 'collect-and-fail'
  | 'log-and-continue'
  | 'retry-durable'
  | 'dead-letter';
```

### 31.1. Domain transactional handler

```text
handler error
→ application command error
→ transaction rollback
→ event/outbox nincs commitolva
```

### 31.2. Integration consumer

```text
handler error
→ message nincs ackolva
→ retry policy
→ végül dead-letter/quarantine
```

### 31.3. Telemetry handler

A telemetry failure nem írhatja felül a sikeres üzleti eredményt, de láthatóvá kell tenni fallback loggal vagy metric-kel.

### 31.4. Tilos

```ts
try {
  await handler.handle(event);
} catch {}
```

Néma hibanyelés nem támogatott.

---

<a id="section-32"></a>

## 32. Propagation megállítása

A Symfony event object megállíthatja a propagationt. Winzard business eventeknél ez alapértelmezetten TILOS.

### 32.1. Miért?

Egy immutable tény nem „érvénytelenedik” attól, hogy egy listener így dönt. A propagation stop:

- rejtett policyt hoz létre;
- sorrendfüggő;
- nehezen tesztelhető;
- új handler hozzáadásakor meglepetést okoz;
- integration deliverynél értelmetlen több fogyasztó között.

### 32.2. Helyette

Veto vagy short-circuit esetén:

```text
policy result
validation result
explicit interceptor
command rejection
ordered decision pipeline
```

Példa:

```ts
type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: string };
```

### 32.3. Kivétel

UI event propagation és DOM `stopPropagation()` külön mechanizmus, ott legitim lehet.

---

<a id="section-33"></a>

## 33. Cancellation és AbortSignal

A cancellation technikai életciklus, nem business event propagation.

```ts
export type HandlerContext = Readonly<{
  signal: AbortSignal;
  requestId: string;
}>;
```

A handler:

- ellenőrzi `signal.aborted` értékét;
- továbbadja a signal-t HTTP-, stream- és adatbázisadapternek, ha támogatott;
- cleanupot végez;
- nem commitol részleges állapotot.

### 33.1. Abort nem rollback

Az `AbortSignal` önmagában nem garantál adatbázis-rollbacket vagy külső side effect visszavonását.

### 33.2. Consumer shutdown

Worker leálláskor:

```text
stop polling
→ in-flight handler kap grace periodot
→ lejáratkor abort
→ message ne legyen ackolva
→ később retry
```

### 33.3. EventTarget kapcsolat

Az AbortSignal EventTarget-alapú, de ettől még nem business event bus.

---

<a id="section-34"></a>

## 34. Nested dispatch és reentrancy

Egy handler új eventet rögzíthet. Ez nested dispatchhez vezethet.

### 34.1. Queue-alapú feldolgozás

```ts
const queue = [...initialEvents];

while (queue.length > 0) {
  const event = queue.shift();
  if (!event) break;

  await dispatchOne(event);
  queue.push(...recorder.drain());
}
```

### 34.2. Invariánsok

- maximális eseményszám operationönként;
- maximális depth;
- duplicate/cycle detection;
- stabil order;
- handler nem hívhatja kontrollálatlanul ugyanazt a dispatchert rekurzívan;
- új eventek csak recorderen keresztül kerülnek a queue-ba.

### 34.3. Reentrant handler

Ha ugyanaz a handler ugyanarra az aggregate-re újra beléphet, explicit reentrancy policy kell. Alapértelmezés: nem reentrant.

---

<a id="section-35"></a>

## 35. Ciklusok és eseményviharok megelőzése

### 35.1. Tipikus ciklus

```text
OrderPlaced
→ UpdateCustomerStats
→ CustomerStatsUpdated
→ RecalculateOrder
→ OrderPlaced
```

### 35.2. Védelmek

- event chain depth limit;
- operation event count limit;
- handler ID + event ID visited set;
- correlation-level cycle metric;
- static graph cycle check;
- process manager state machine;
- command/event szemantika tisztázása.

### 35.3. Event storm

Egy tömeges művelet milliónyi fine-grained eventet generálhat. Ilyenkor mérlegelendő:

```text
batch event
range event
projection rebuild command
CDC
periodic reconciliation
```

A batch event ne rejtse el a részleges feldolgozási hibát; tartalmazzon cursor vagy item ID listát kontrollált méretben.

---

<a id="section-36"></a>

## 36. Tranzakciós határ

Az esemény kategóriája meghatározza a tranzakciós szemantikát.

| Esemény | Mikor fut? | Hiba hatása |
| --- | --- | --- |
| Domain transactional handler | üzleti tranzakción belül | rollback |
| Integration event mapping | tranzakción belül, outbox írás | rollback |
| Outbox relay | commit után külön workerben | retry |
| Integration consumer | saját local transactionben | retry/rollback |
| after() callback | response után best-effort | üzleti commitot nem fordít vissza |
| Telemetry | környezettől függ | nem írhatja felül az üzleti eredményt |

### 36.1. Alapelv

```text
ha a side effect nélkül az üzleti állapot inkonzisztens,
akkor nem lehet best-effort listener
```

### 36.2. Külső side effect

Külső API-hívás nem tehető biztonságosan ugyanabba az adatbázis-tranzakcióba. Outbox vagy saga szükséges.

---

<a id="section-37"></a>

## 37. Aggregate által rögzített domain eventek

Egy aggregate belső listában rögzítheti a domain eventeket.

```ts
export abstract class AggregateRoot {
  readonly #events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#events.push(event);
  }

  pullDomainEvents(): readonly DomainEvent[] {
    const events = [...this.#events];
    this.#events.length = 0;
    return Object.freeze(events);
  }
}
```

### 37.1. Fontos szabályok

- az event csak sikeres domain state transition után rögzül;
- invalid command nem rögzít eventet;
- event payload a transition előtti/utáni releváns tényeket tartalmazza;
- event nem tartalmaz aggregate referenciát;
- a `pull` ownership egyértelmű;
- repository save sikertelenségnél event nem veszhet el vagy duplikálódhat észrevétlenül.

### 37.2. Alternatíva

Application service explicit event recorderrel is dolgozhat. A projekt válasszon egy konvenciót.

---

<a id="section-38"></a>

## 38. Eventek kiolvasása és törlése

Az eventek kiolvasása lifecycle-szenzitív.

### 38.1. Hibás minta

```text
pull events
→ dispatch
→ save aggregate
```

Ha a save elbukik, már lefuthatott side effect nem létező state-ről.

### 38.2. Kanonikus state-based flow

```text
execute domain decision
→ save aggregate transactionben
→ collect eventek
→ transactional handlers
→ integration mapping
→ outbox append ugyanabban a transactionben
→ commit
```

### 38.3. Eventlista törlése

Csak akkor törölhető véglegesen, ha:

- a transaction sikeresen lezárult;
- vagy a retry újra rekonstruálja ugyanazt az aggregate/event state-et.

A konkrét UnitOfWork adapternek dokumentálnia kell a rollback utáni object-state kezelését.

---

<a id="section-39"></a>

## 39. Unit of Work és application orchestration

Az application command orchestrálja a state change-et és az event lifecycle-t.

```ts
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly transactions: TransactionManager,
    private readonly domainEvents: DomainEventDispatcher,
    private readonly integrationEvents: IntegrationEventMapper,
    private readonly outbox: OutboxWriter,
  ) {}

  async execute(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    return this.transactions.run(async (transaction) => {
      const order = Order.place(input);
      await this.orders.save(order, transaction);

      const events = order.pullDomainEvents();
      await this.domainEvents.dispatch(events, { transaction });

      const messages = this.integrationEvents.map(events);
      await this.outbox.append(messages, transaction);

      return { status: 'placed', orderId: order.id };
    });
  }
}
```

### 39.1. Látható orchestration

A kód review-ból megállapítható:

- mikor történik save;
- mely handler tranzakciós;
- mikor készül outbox;
- mi rollbackel;
- mi történik commit után.

---

<a id="section-40"></a>

## 40. Tranzakciós domain handler

Tranzakciós domain handler csak local, gyors és ugyanazon adatbázis-tranzakcióban értelmezhető side effectet végezhet.

Engedélyezett példa:

- ugyanazon adatbázis audit row;
- local projection frissítés;
- aggregate consistency record;
- outbox message képzése;
- domain constrainthez szükséges local write.

Nem engedélyezett:

- email;
- webhook;
- payment provider;
- search SaaS;
- object storage;
- külső queue publish;
- hosszú CPU-munka.

```ts
export class AppendOrderAuditOnPlaced
  implements DomainEventHandler<OrderPlaced> {
  readonly id = 'orders.order-placed.append-audit';
  readonly eventType = 'orders.order.placed' as const;

  constructor(private readonly audit: OrderAuditRepository) {}

  async handle(
    event: OrderPlaced,
    context: DomainEventHandlerContext,
  ): Promise<void> {
    await this.audit.append({
      orderId: event.aggregate.id,
      eventId: event.id,
      occurredAt: event.occurredAt,
    }, context.transaction);
  }
}
```

---

<a id="section-41"></a>

## 41. Transactional outbox

A transactional outbox az adatbázisváltozás és az event publication közötti dual write problémát kezeli.

### 41.1. Flow

```text
DB transaction begin
→ domain state write
→ outbox message write
→ commit

relay worker
→ unpublished outbox read
→ broker publish
→ published/attempt state update
```

### 41.2. Példa Prisma modell

```prisma
model OutboxMessage {
  id                String   @id
  source            String
  type              String
  subject           String?
  occurredAt        DateTime
  aggregateId       String?
  aggregateSequence BigInt?
  payload           Json
  metadata          Json
  status            String   @default("pending")
  attempts          Int      @default(0)
  availableAt       DateTime @default(now())
  lockedAt          DateTime?
  lockedBy          String?
  publishedAt       DateTime?
  createdAt         DateTime @default(now())

  @@unique([source, id])
  @@index([status, availableAt])
  @@index([aggregateId, aggregateSequence])
}
```

Ez csak `prisma-postgresql` és messaging/outbox capability mellett releváns.

---

<a id="section-42"></a>

## 42. Domain eventből integration event

A domain event és az integration event külön contract.

```ts
export interface IntegrationEventMapper {
  map(events: readonly DomainEvent[]): readonly IntegrationEvent[];
}
```

Példa:

```ts
export function mapOrderPlacedToIntegration(
  event: OrderPlaced,
): OrderPlacedV1 {
  return {
    specversion: '1.0',
    id: event.id,
    source: 'urn:winzard:orders',
    type: 'com.example.orders.order.placed.v1',
    subject: event.aggregate.id,
    time: event.occurredAt,
    datacontenttype: 'application/json',
    dataschema: 'urn:schema:orders:order-placed:v1',
    correlationid: event.correlationId,
    causationid: event.causationId,
    tenantid: event.tenantId,
    data: {
      orderId: event.aggregate.id,
      customerId: event.data.customerId,
      totalMinor: event.data.totalMinor,
      currency: event.data.currency,
    },
  };
}
```

### 42.1. Miért külön?

- külső payload minimalizálható;
- belső refaktor nem tör külső consumert;
- PII redakció elvégezhető;
- külső verzió külön kezelhető;
- egy domain eventből több integration event készülhet;
- nem minden domain event publikus.

---

<a id="section-43"></a>

## 43. Outbox relay és publisher worker

Az outbox relay külön worker vagy platform job.

### 43.1. Alapfolyamat

```text
claim batch
→ lease rows
→ serialize/validate
→ publish
→ mark published
→ metric/log
```

### 43.2. Pseudocode

```ts
for (const message of await outbox.claimBatch({
  workerId,
  limit: 100,
  leaseMs: 30_000,
})) {
  try {
    await publisher.publish(message, { signal });
    await outbox.markPublished(message.id, clock.now());
  } catch (error) {
    await outbox.markFailed(message.id, {
      nextAttemptAt: retry.next(message.attempts),
      error: redact(error),
    });
  }
}
```

### 43.3. Crash window

```text
broker publish sikeres
→ process crash
→ markPublished nem fut le
→ message újrapublikálható
```

Ezért a consumer idempotencia kötelező.

### 43.4. Lease

A lease:

- időkorlátos;
- worker ID-val jelölt;
- crash után újraigényelhető;
- clock skewre tesztelt;
- nem tart korlátlan lockot.

---

<a id="section-44"></a>

## 44. Delivery semantics: at-most-once, at-least-once, effectively-once

### 44.1. At-most-once

```text
message legfeljebb egyszer
→ elveszhet
→ duplicate nincs
```

Business-critical flowhoz ritkán elég.

### 44.2. At-least-once

```text
message nem vész el támogatott hibák mellett
→ duplicate lehetséges
→ idempotens consumer szükséges
```

Ez a gyakori alap.

### 44.3. Exactly-once állítás

End-to-end exactly-once csak a teljes producer–broker–consumer–side-effect lánc szigorú feltételeivel értelmezhető. Egy broker marketingcímkéje önmagában nem garantálja a külső HTTP side effect pontosan egyszeri végrehajtását.

### 44.4. Effectively-once

Winzard cél:

```text
at-least-once delivery
+ stable event ID
+ inbox/dedup
+ idempotens side effect
+ transaction
→ üzletileg egyszerinek látszó eredmény
```

---

<a id="section-45"></a>

## 45. Idempotens consumer és inbox

A consumer duplicate eventet kaphat.

### 45.1. Inbox modell

```prisma
model InboxMessage {
  consumerId  String
  source      String
  eventId     String
  processedAt DateTime @default(now())
  resultHash  String?

  @@id([consumerId, source, eventId])
}
```

### 45.2. Consumer transaction

```text
begin
→ inbox insert-if-absent
→ ha már létezik: no-op + ack
→ business state update
→ local outbox append szükség szerint
→ commit
→ ack
```

### 45.3. Idempotency key

Külső provider hívásánál az event ID vagy derivált side-effect key használható, ha a provider támogatja.

### 45.4. Nem elég

```ts
if (memorySet.has(event.id)) return;
```

Több instance és restart miatt ez nem tartós dedup.

---

<a id="section-46"></a>

## 46. Sorrend, aggregate sequence és concurrency

### 46.1. Global order

A legtöbb elosztott transportnál globális total order nem feltételezhető vagy túl drága.

### 46.2. Aggregate order

Az event hordozhat:

```text
aggregateId
aggregateSequence
```

A consumer:

- elutasíthat stale sequence-et;
- várakoztathat gap esetén;
- idempotensen újrafeldolgozhat;
- reconciliationt indíthat.

### 46.3. Concurrency

Két párhuzamos command optimistic aggregate versionnel ütközhet. Csak a commitált változat eventje kerül outboxba.

### 46.4. Partition key

Broker partition key tipikusan aggregate ID vagy tenant + aggregate ID lehet, ha per-aggregate order szükséges.

### 46.5. Handler order nem broker order

A producer local handler-sorrendje nem garantálja a több consumer közötti feldolgozási sorrendet.

---

<a id="section-47"></a>

## 47. Retry, backoff és jitter

A retry policy explicit és korlátos.

```ts
export type RetryPolicy = Readonly<{
  maximumAttempts: number;
  initialDelayMs: number;
  maximumDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}>;
```

### 47.1. Retryable hiba

- timeout;
- temporary network failure;
- 429;
- 5xx;
- transient database conflict;
- broker unavailable.

### 47.2. Nem retryable hiba

- invalid schema;
- unsupported event version;
- signature failure;
- permanent 4xx;
- invariant violation;
- missing required configuration.

### 47.3. Backoff

```text
exponential backoff
+ jitter
+ max delay
+ max attempts
```

### 47.4. Retry storm

Központi dependency outage esetén circuit breaker, concurrency limit és queue-level delay szükséges. Korlátlan azonnali retry TILOS.

---

<a id="section-48"></a>

## 48. Dead-letter, poison message és quarantine

A dead-letter vagy quarantine state olyan message-et tárol, amely normál retryval nem dolgozható fel.

Kötelező metadata:

```text
consumer ID
event ID és type
source
attempt count
first/last failure time
redaktált error code
payload hash
schema version
correlation ID
operator action
```

### 48.1. Payload

A DLQ payload hozzáférése security-releváns. PII és secret miatt encryption, retention és role-based access szükséges.

### 48.2. Replay

Replay előtt:

- a hiba okát javítani kell;
- a consumer verziót rögzíteni kell;
- dry-run vagy sample validáció szükséges;
- idempotencyt ellenőrizni kell;
- rate limitet alkalmazni kell;
- audit record készül.

### 48.3. Poison message

Egy poison message nem blokkolhatja végleg a teljes partitiont kontrollálatlanul. A stratégia transportfüggő és dokumentálandó.

---

<a id="section-49"></a>

## 49. Saga és process manager

A saga vagy process manager több local transactionből álló üzleti workflow-t koordinál.

Példa:

```text
OrderPlaced
→ PaymentRequested
→ PaymentCaptured
→ InventoryReservationRequested
→ InventoryReserved
→ OrderConfirmed
```

Hiba esetén:

```text
InventoryReservationFailed
→ RefundPayment command
→ PaymentRefunded
→ OrderCancelled
```

### 49.1. Process manager state

Tartósan tárolja:

- process ID;
- correlation ID;
- current state;
- processed event IDs;
- deadlines;
- pending commandok;
- compensation state;
- version.

### 49.2. Choreography kontra orchestration

- egyszerű, lazán kapcsolt workflow: choreography;
- sok lépés, timeout és compensation: explicit orchestrator/process manager.

### 49.3. Tiltott

Listenerláncban rejtett, nem dokumentált saga nem támogatott.

---

<a id="section-50"></a>

## 50. Külső webhook és esemény-ingress

Külső webhook vagy broker message bizalmatlan input.

```text
raw HTTP/message
→ transport signature/auth
→ size/content-type check
→ envelope schema
→ payload schema
→ replay/dedup check
→ external-to-internal mapper
→ application command
```

### 50.1. Signature

Kötelező lehet:

- raw body használata;
- timestamp window;
- constant-time compare;
- key rotation;
- replay ID;
- source allowlist.

### 50.2. External type

TILOS external `type` stringből dinamikus importot vagy tetszőleges handlerlookupot végezni.

```ts
const accepted = {
  'payment.succeeded': handlePaymentSucceeded,
  'payment.failed': handlePaymentFailed,
} as const;
```

### 50.3. Mapping

Külső event nem válik automatikusan belső domain eventté. Az ingress adapter commandot vagy explicit external notificationt képez, majd az application layer dönt.

---

<a id="section-51"></a>

## 51. Next.js lifecycle hookok és platformesemények

A Next.js lifecycle pontjai nem kerülnek business event buszba.

### 51.1. `next.config`

- statikus headerek;
- redirectek;
- rewrite-ok.

### 51.2. Proxy

- pre-routing logic;
- redirect/rewrite;
- request/response header;
- korai response;
- matcher.

### 51.3. Route entrypoint

- Page;
- Route Handler;
- Server Action/Function.

### 51.4. Instrumentation

```text
register()
→ server instance startup

onRequestError()
→ Next.js által elkapott szerverhiba
```

### 51.5. `after()`

Response vagy prerender után futó best-effort callback.

### 51.6. Error boundary

React/render UI failure boundary.

A lifecycle extension explicit hook vagy wrapper; nem egy globális `kernel.*` string-event bus.

---

<a id="section-52"></a>

## 52. Before filterek explicit pipeline-nal

A Symfony `kernel.controller` before filterének Winzard-megfelelője explicit delivery pipeline.

```ts
export function withRoutePolicies(
  handler: RouteHandler,
  policies: readonly RoutePolicy[],
): RouteHandler {
  return async (request, context) => {
    for (const policy of policies) {
      const result = await policy.check(request, context);
      if (!result.allowed) return result.response;
    }
    return handler(request, context);
  };
}
```

### 52.1. Tipikus before lépések

```text
request size
content type
authentication
tenant resolution
CSRF
rate limit
idempotency
input schema
authorization
```

### 52.2. Sorrend

A sorrend explicit array vagy generated route contract. Nem integer listenerprioritás.

### 52.3. Security

Proxy auth nem helyettesíti a Server Action/Route Handler saját authorizációját.

---

<a id="section-53"></a>

## 53. After filterek, response policy és after()

After filterhez három külön mechanizmus tartozik.

### 53.1. Response mapper/policy

```text
application result
→ HTTP presenter
→ cache/security/header policy
→ Response
```

Ez még response commit előtt fut.

### 53.2. Decorator

Logging, metric, tracing és timing explicit handler/service decorator lehet.

### 53.3. `after()`

Csak nem blokkoló, best-effort munkára:

```ts
import { after } from 'next/server';

after(() => {
  accessLog.write({ requestId, routeId, status: 200 });
});
```

A `after()` akkor is lefuthat, ha error, redirect vagy not-found történt, és statikus route esetén build/revalidation alatt is futhat. Ezért nem használható `OrderPlaced` integration event garantált publikálására.

---

<a id="section-54"></a>

## 54. Exception-, error- és failure-események

A hiba nem business event automatikusan.

### 54.1. Expected failure

```text
validation error
authorization denied
not found
conflict
rate limit
```

Explicit result vagy HTTP problem response.

### 54.2. Unexpected exception

- error boundary;
- Route Handler problem mapper;
- `onRequestError` telemetry;
- worker retry/dead-letter.

### 54.3. Exception notification

Külön telemetry signal készülhet redaktált adatokkal, de:

- nem változtatja meg az exceptiont;
- nem nyeli el automatikusan;
- nem küld raw payloadot;
- nem dönt business recoveryről.

### 54.4. Node `'error'` event

A Node EventEmitter speciális `'error'` eventje külön runtime-szemantika; nem használható általános application error modelként.

---

<a id="section-55"></a>

## 55. Node.js EventEmitter

A Node.js `EventEmitter` process-lokális API.

Fontos tulajdonságok:

- named eventek;
- több listener;
- a listenerek szinkron, regisztrációs sorrendben futnak;
- return value-juk figyelmen kívül marad;
- `once()` egyszeri listenert ad;
- az unhandled `'error'` event processleállást okozhat;
- async listener rejection külön kezelést igényel.

### 55.1. Engedélyezett használat

- Node adapter lifecycle;
- stream/socket event;
- tooling process;
- best-effort local notification;
- library integration.

### 55.2. Nem engedélyezett

```ts
const businessBus = new EventEmitter();
businessBus.emit('order.placed', order);
```

ha az email, payment vagy cross-instance reaction ettől függ.

### 55.3. Wrapper

Ha használjuk, saját port és explicit error policy kell. Listener cleanup és max-listener monitoring kötelező hosszú életű processben.

---

<a id="section-56"></a>

## 56. EventTarget és CustomEvent

Az `EventTarget` webkompatibilis event API.

Használható:

- AbortSignal környezetben;
- browser/worker kompatibilis adapterben;
- DOM-szerű local signalhoz;
- platformfüggetlen library boundaryn.

```ts
const target = new EventTarget();

target.addEventListener('ready', () => {
  // local technical reaction
});

target.dispatchEvent(new Event('ready'));
```

`CustomEvent.detail` adatot hordozhat, de:

- nincs tartósság;
- nincs cross-instance delivery;
- nincs outbox;
- nincs retry;
- nincs business transaction.

A DOM propagation API sem indokol business event propagation stopot.

---

<a id="section-57"></a>

## 57. node:diagnostics_channel

A `node:diagnostics_channel` named channeleken diagnosztikai message-eket publikál.

```ts
import diagnosticsChannel from 'node:diagnostics_channel';

const channel = diagnosticsChannel.channel(
  'winzard.orders.command.execute',
);

if (channel.hasSubscribers) {
  channel.publish({
    command: 'PlaceOrder',
    requestId,
  });
}
```

### 57.1. Használati határ

- observability;
- library instrumentation;
- performance-sensitive diagnostics;
- tracing integration.

### 57.2. Nem business bus

A subscriber szinkron fut; a thrown error uncaught exceptiont okozhat. Nincs durable delivery vagy retry.

### 57.3. Channel contract

Dokumentálandó:

- channel name;
- message shape;
- PII/secret policy;
- runtime availability;
- overhead;
- subscriber failure semantics.

---

<a id="section-58"></a>

## 58. AsyncLocalStorage és kontextuspropagáció

Az `AsyncLocalStorage` aszinkron callback- és Promise-láncokon keresztül képes technikai kontextust propagálni.

Ajánlott tartalom:

```text
request ID
trace ID
span context
logger correlation
```

Nem ajánlott rejtett business input:

```text
actor
tenant ID
permission set
transaction manager
domain aggregate
business clock
```

### 58.1. `run()`

```ts
requestContextStorage.run(
  { requestId, traceId },
  () => handler(),
);
```

A `run()` előnyösebb az `enterWith()`-nál általános request scope-ban, mert a scope egyértelműbb.

### 58.2. EventEmitter kapcsolat

Egyes callback-alapú librarykben kontextusvesztés lehet; AsyncResource vagy bind/snapshot szükséges lehet.

### 58.3. Event metadata

A correlation metadata explicit eventmező marad. Nem támaszkodhat kizárólag az aktuális AsyncLocalStorage state-re, mert az event később, más processben fogyhat.

---

<a id="section-59"></a>

## 59. Serverless és többpéldányos működés

Process-lokális registry és emitter instance-onként külön él.

```text
instance A listener registry
≠ instance B listener registry
≠ következő serverless invocation
```

### 59.1. Következmények

- local publish nem jut el másik instance-hoz;
- cold start új registryt hoz létre;
- process crash elveszíti a memóriában várakozó signalokat;
- deployment közben több code version fogyaszthat egyszerre;
- hot reload duplikált listenert regisztrálhat hibás side effectes modulnál.

### 59.2. Tartós reaction

Cross-instance vagy garantált reactionhez:

```text
outbox + broker/queue + consumer
```

### 59.3. Code version

Integration consumer compatibility rolling deployment alatt is szükséges. Az új producer eventjét a régi consumernek vagy el kell fogadnia, vagy a rollout sorrendjét kontrollálni kell.

---

<a id="section-60"></a>

## 60. Node, Edge és runtime-kompatibilitás

A runtime meghatározza az elérhető event és messaging adaptereket.

### 60.1. Node runtime

Elérhető lehet:

- `node:events`;
- `node:diagnostics_channel`;
- `AsyncLocalStorage`;
- hosszabb életű connection pool;
- broker SDK;
- filesystem-backed tooling.

### 60.2. Edge/Proxy runtime

Korlátozottabb Node API-k. Web-standard `EventTarget`, `AbortSignal`, `fetch` használható, de a konkrét platform capability ellenőrzendő.

### 60.3. Composition

```ts
export function createIntegrationPublisher(
  runtime: 'nodejs' | 'edge',
): IntegrationPublisher {
  if (runtime === 'nodejs') {
    return createNodeBrokerPublisher();
  }

  return createHttpEventGatewayPublisher();
}
```

### 60.4. Tiltás

Application handler nem branch-elhet közvetlenül `NEXT_RUNTIME` alapján. Az adapterválasztás compositionfeladat.

---

<a id="section-61"></a>

## 61. Biztonsági alapelvek

### 61.1. Event type allowlist

Incoming event type csak statikus registryből oldható fel.

### 61.2. Schema validation

Minden külső event:

- envelope schema;
- payload schema;
- version check;
- size limit;
- content type;
- unknown field policy;
- timestamp window szükség szerint.

### 61.3. Dynamic code execution tiltása

TILOS:

- event typeból import path;
- payloadból class instantiation;
- `eval`;
- user-provided handler ID;
- prototype pollutionra érzékeny merge.

### 61.4. Replay attack

Webhook és külső event esetén:

- signature;
- nonce/event ID;
- timestamp tolerance;
- inbox;
- retention;
- source binding.

### 61.5. Handler least privilege

A handler csak a szükséges portokat kapja, nem teljes service locatort.

---

<a id="section-62"></a>

## 62. PII, secret, retention és redakció

Az event gyakran hosszabb ideig él, mint egy HTTP request, és több rendszerben tárolódhat.

### 62.1. Adatbesorolás

Minden integration event contract jelölje:

```text
public
internal
confidential
restricted
```

### 62.2. PII minimalizálás

Azonosító előnyösebb teljes profilnál. Email, cím, telefonszám csak dokumentált fogyasztói szükség esetén.

### 62.3. Secret

TILOS event payloadba:

- access token;
- API key;
- password;
- private key;
- session cookie;
- raw authorization header.

### 62.4. Retention

Dokumentálandó:

- broker retention;
- outbox retention;
- inbox retention;
- dead-letter retention;
- audit retention;
- deletion/erasure folyamat;
- backup és replay hatás.

### 62.5. Redakció

Log és trace csak payload hash, event type, ID és biztonságos metadata mezőket tartalmazzon alapértelmezetten.

---

<a id="section-63"></a>

## 63. Tenant-, actor- és jogosultsági határ

### 63.1. Tenant ID

A producer tenant ID-t trusted application contextből képez, nem kizárólag user payloadból.

### 63.2. Actor

Integration eventbe teljes actor objektum helyett szükség szerint:

```text
actorId
actorType
authenticationContextId
```

kerülhet. Permission set és token nem.

### 63.3. Consumer authorization

Egy integration event autentikált transzportból érkezése nem jelenti, hogy minden side effect automatikusan engedélyezett. A consumer:

- ellenőrzi source/tenant mappinget;
- alkalmazza saját policyját;
- nem bízik producer által küldött role-listában;
- erőforrásszintű scope-ot használ.

### 63.4. Cross-tenant cache és projection

Minden projection key és query tenant-scoped, ha a domain multi-tenant.

### 63.5. Event routing

Topic vagy partition tenant alapján történő felosztása security feature önmagában nem; az application authorization továbbra is kötelező.

---

<a id="section-64"></a>

## 64. Observability és trace-kapcsolat

Minden event chain megfigyelhető legyen anélkül, hogy payloadot szivárogtatna.

Kötelező vagy ajánlott attribútumok:

```text
event.type
event.id
event.source
handler.id
messaging.destination
messaging.operation
correlation.id
causation.id
aggregate.type
attempt
result
latency
```

### 64.1. Trace span

```text
producer span
→ outbox append span
→ relay publish span
→ broker context
→ consumer span
→ handler child span
```

### 64.2. Span event

Egy jelentős időpont:

```text
outbox.claimed
message.acknowledged
retry.scheduled
dead-lettered
```

span event lehet.

### 64.3. Cardinality

Metric labelként nem használható korlátlan:

- event ID;
- aggregate ID;
- customer ID;
- raw error message.

Event type és handler ID általában alacsonyabb kardinalitású.

---

<a id="section-65"></a>

## 65. Traceable dispatcher Winzard-megfelelője

A Symfony TraceableEventDispatcher megfelelője egy explicit decorator és handler report.

```ts
export type HandlerExecution = Readonly<{
  eventId: string;
  eventType: string;
  handlerId: string;
  startedAt: string;
  durationMs: number;
  outcome: 'success' | 'failure' | 'skipped';
  errorCode?: string;
}>;
```

```ts
export class TraceableDomainEventDispatcher
  implements DomainEventDispatcher {
  constructor(
    private readonly inner: DomainEventDispatcher,
    private readonly trace: EventDispatchTrace,
  ) {}

  async dispatch(events, context): Promise<void> {
    await this.inner.dispatch(events, {
      ...context,
      trace: this.trace,
    });
  }
}
```

### 65.1. Diagnosztikai kimenet

Mutatható:

- regisztrált handler;
- meghívott handler;
- kihagyott handler és ok;
- duration;
- failure policy;
- source definition;
- handler dependency.

Payload alapértelmezetten nem jelenik meg.

---

<a id="section-66"></a>

## 66. Metric, log, audit record és business event

### 66.1. Business event

A domainben megtörtént tény. Fogyasztó új üzleti műveletet indíthat.

### 66.2. Audit record

Jogilag vagy operációsan ellenőrizhető, append-only rekord. Tartalma, retentionje és hozzáférése szigorúbb lehet, mint egy integration eventé.

### 66.3. Log

Diagnosztikai vagy operációs record. Elvesztése nem változtatja meg az üzleti state-et.

### 66.4. Metric

Aggregált mérés. Nem hordoz egyedi business payloadot.

### 66.5. Trace

Egy request vagy distributed operation útja.

### 66.6. Nem automatikusan azonosak

```text
OrderPlaced event
≠ audit log
≠ info log
≠ counter metric
≠ span event
```

Egy occurrence több signalhoz vezethet, de mindegyik saját contracttal és retentionnel rendelkezik.

---

<a id="section-67"></a>

## 67. Teljesítmény, backpressure és terhelésvédelem

### 67.1. Fan-out limit

Egy eventhez tartozó handler számot és várható költséget dokumentálni kell.

### 67.2. Batch

Outbox relay és consumer batch mérete konfigurálható, de:

- memory limit;
- broker limit;
- transaction duration;
- ack semantics;
- partial failure;
- fairness

figyelembe veendő.

### 67.3. Backpressure

Mechanizmusok:

```text
consumer concurrency limit
queue depth alert
rate limit
adaptive polling
circuit breaker
load shedding
partition scaling
```

### 67.4. Slow handler

Synchronous domain handler latency a request latency része. Ha lassú vagy külső I/O-t végez, outbox/integration flow valószínűleg megfelelőbb.

### 67.5. Payload serialization

A serializáció CPU- és memory-költség. Nagy object graph és repeated deep clone kerülendő.

### 67.6. Event storm monitoring

Metric:

```text
events produced per command
events per aggregate transition
outbox lag
retry rate
dead-letter rate
consumer lag
```

---

<a id="section-68"></a>

## 68. Unit tesztelés

Domain event unit tesztje a domain döntést vizsgálja.

```ts
it('OrderPlaced eventet rögzít sikeres rendelésnél', () => {
  const order = Order.place(validInput, fixedDomainContext);
  const events = order.pullDomainEvents();

  expect(events).toEqual([
    expect.objectContaining({
      id: 'evt_001',
      type: 'orders.order.placed',
      occurredAt: '2026-07-19T10:00:00.000Z',
      aggregate: {
        type: 'order',
        id: 'ord_001',
        version: 1,
      },
    }),
  ]);
});
```

Negatív eset:

```ts
it('invalid rendelésnél nem rögzít eventet', () => {
  expect(() => Order.place(invalidInput, context)).toThrow();
  expect(recorder.events).toHaveLength(0);
});
```

A teszt ellenőrzi:

- type;
- payload;
- occurredAt;
- event ID;
- aggregate version;
- correlation/causation;
- immutabilityt.

---

<a id="section-69"></a>

## 69. Handler contract tesztek

Minden adapterhandler közös contract suite-ot kaphat.

```ts
export function eventHandlerContract(
  createHandler: () => IntegrationEventConsumer<OrderPlacedV1>,
) {
  it('elfogadja a támogatott v1 eventet', async () => {
    await expect(
      createHandler().handle(validOrderPlacedV1, context),
    ).resolves.toBeUndefined();
  });

  it('idempotensen kezeli a duplicate eventet', async () => {
    const handler = createHandler();
    await handler.handle(validOrderPlacedV1, context);
    await handler.handle(validOrderPlacedV1, context);
    expect(sideEffect.count).toBe(1);
  });
}
```

Contract tesztelendő:

- schema;
- supported version;
- unknown field policy;
- duplicate;
- out-of-order;
- transient failure;
- permanent failure;
- cancellation;
- tenant mismatch;
- redaction.

---

<a id="section-70"></a>

## 70. Outbox-, inbox- és integration tesztek

### 70.1. Outbox atomitás

Teszt:

```text
business write succeeds + outbox write fails
→ teljes transaction rollback
```

és:

```text
business write fails
→ outbox row nincs
```

### 70.2. Relay crash window

```text
publish succeeds
→ markPublished előtt crash
→ republish
→ consumer dedup
```

### 70.3. Inbox transaction

```text
duplicate message
→ business state nem változik másodszor
→ ack biztonságos
```

### 70.4. Retry

Fake clockkal ellenőrizhető:

- backoff;
- jitter tartomány;
- max attempt;
- dead-letter transition.

### 70.5. Broker contract

Testcontainer vagy provider emulator használható, de a core unit teszt nem függhet production brokertől.

---

<a id="section-71"></a>

## 71. Determinisztikus fixture-ek és recording adapterek

A tesztek determinisztikus adaptereket használnak.

```ts
export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now(): Date {
    return new Date(this.value);
  }
}

export class SequenceEventIdGenerator
  implements EventIdGenerator {
  #index = 0;
  constructor(private readonly values: readonly string[]) {}
  next(): string {
    const value = this.values[this.#index];
    if (!value) throw new Error('Nincs több event ID.');
    this.#index += 1;
    return value;
  }
}

export class RecordingIntegrationPublisher
  implements IntegrationPublisher {
  readonly messages: IntegrationEvent[] = [];
  async publish(message: IntegrationEvent): Promise<void> {
    this.messages.push(structuredClone(message));
  }
}
```

### 71.1. Fixture alapelvek

- fix timestamp;
- fix ID;
- explicit correlation;
- stabil sort;
- no random jitter vagy seedelt jitter;
- source hash;
- schema version;
- payload snapshot csak kontrollált méretben.

### 71.2. Negative fixture

- invalid type;
- old version;
- duplicate ID;
- missing tenant;
- secret payload;
- cyclic handler graph;
- retry exhaustion.

---

<a id="section-72"></a>

## 72. Teljes OrderPlaced vertikális példa

Ez a példa összeköti a domain eventet, a transactional local handlert, az integration mappinget, az outboxot és az idempotens consumert.

### 72.1. Domain event

```ts
export type OrderPlaced = DomainEventEnvelope<
  'orders.order.placed',
  Readonly<{
    customerId: string;
    totalMinor: number;
    currency: string;
  }>
>;
```

### 72.2. Aggregate

```ts
export class Order extends AggregateRoot {
  private constructor(
    readonly id: string,
    readonly customerId: string,
    readonly totalMinor: number,
    readonly currency: string,
    private version: number,
  ) {
    super();
  }

  static place(
    input: PlaceOrderDomainInput,
    events: EventFactoryContext,
  ): Order {
    assertOrderInput(input);

    const order = new Order(
      input.orderId,
      input.customerId,
      input.totalMinor,
      input.currency,
      1,
    );

    order.record(Object.freeze({
      id: events.ids.next(),
      type: 'orders.order.placed',
      occurredAt: events.clock.now().toISOString(),
      aggregate: {
        type: 'order',
        id: order.id,
        version: order.version,
      },
      correlationId: events.correlationId,
      causationId: events.causationId,
      tenantId: events.tenantId,
      data: {
        customerId: order.customerId,
        totalMinor: order.totalMinor,
        currency: order.currency,
      },
    } satisfies OrderPlaced));

    return order;
  }
}
```

### 72.3. Transactional audit handler

```ts
export class RecordOrderPlacedAudit
  implements DomainEventHandler<OrderPlaced> {
  readonly id = 'orders.order-placed.record-audit';
  readonly eventType = 'orders.order.placed' as const;

  constructor(private readonly audit: OrderAuditRepository) {}

  async handle(event, context): Promise<void> {
    await this.audit.append({
      eventId: event.id,
      orderId: event.aggregate.id,
      type: event.type,
      occurredAt: event.occurredAt,
    }, context.transaction);
  }
}
```

### 72.4. Integration mapping

```ts
export function toOrderPlacedV1(
  event: OrderPlaced,
): OrderPlacedV1 {
  return Object.freeze({
    specversion: '1.0',
    id: event.id,
    source: 'urn:winzard:orders',
    type: 'com.example.orders.order.placed.v1',
    subject: event.aggregate.id,
    time: event.occurredAt,
    datacontenttype: 'application/json',
    dataschema: 'urn:schema:orders:order-placed:v1',
    correlationid: event.correlationId,
    causationid: event.causationId,
    tenantid: event.tenantId,
    data: {
      orderId: event.aggregate.id,
      customerId: event.data.customerId,
      totalMinor: event.data.totalMinor,
      currency: event.data.currency,
    },
  });
}
```

### 72.5. Application command

```ts
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly transactions: TransactionManager,
    private readonly domainEvents: DomainEventDispatcher,
    private readonly outbox: OutboxWriter,
    private readonly eventContext: EventContextFactory,
  ) {}

  async execute(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    return this.transactions.run(async (transaction) => {
      const context = this.eventContext.forCommand(input.commandId, {
        correlationId: input.correlationId,
        tenantId: input.tenantId,
      });

      const order = Order.place(input, context);
      await this.orders.save(order, transaction);

      const domainEvents = order.pullDomainEvents();
      await this.domainEvents.dispatch(domainEvents, { transaction });

      await this.outbox.append(
        domainEvents
          .filter((event): event is OrderPlaced =>
            event.type === 'orders.order.placed')
          .map(toOrderPlacedV1),
        transaction,
      );

      return {
        status: 'placed',
        orderId: order.id,
      };
    });
  }
}
```

### 72.6. Idempotens email consumer

```ts
export class EnqueueOrderConfirmation
  implements IntegrationEventConsumer<OrderPlacedV1> {
  readonly consumerId = 'notifications.order-confirmation.v1';
  readonly eventType = 'com.example.orders.order.placed.v1';
  readonly acceptedMajorVersion = 1;

  constructor(
    private readonly inbox: InboxRepository,
    private readonly emails: EmailJobRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async handle(event: OrderPlacedV1): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const first = await this.inbox.tryRecord({
        consumerId: this.consumerId,
        source: event.source,
        eventId: event.id,
      }, transaction);

      if (!first) return;

      await this.emails.enqueue({
        idempotencyKey: `${this.consumerId}:${event.source}:${event.id}`,
        template: 'order-confirmation',
        subjectId: event.data.orderId,
      }, transaction);
    });
  }
}
```

### 72.7. Eredő garancia

```text
order + audit + outbox
→ egy DB transaction

broker duplicate
→ inbox dedup

email job
→ stable idempotency key
```

---

<a id="section-73"></a>

## 73. Ajánlott könyvtárstruktúra

```text
src/
  modules/
    orders/
      order/
        domain/
          order.ts
          events/
            order-placed.event.ts
            order-cancelled.event.ts
          aggregate-root.ts

        application/
          commands/
            place-order.ts
          event-handlers/
            record-order-placed-audit.ts
          ports/
            order.repository.ts
            order-audit.repository.ts
            outbox-writer.ts
          events/
            order-integration.mapper.ts

        infrastructure/
          persistence/
            prisma-order.repository.ts
          events/
            prisma-outbox.writer.ts

        presentation/
          actions/
          route-handlers/

      composition/
        order-events.server.ts
        order-module.server.ts

  platform/
    messaging/
      integration-event.ts
      publisher.ts
      consumer.ts
      outbox/
      inbox/
      retry/
    observability/
      event-dispatch-trace.ts
      diagnostics-channel.ts
    context/
      correlation.ts

tools/
  workers/
    outbox-relay.ts
    message-consumer.ts
```

### 73.1. Ownership

- domain event: owning aggregate/bounded context;
- domain handler: application layer;
- integration mapper: application vagy anti-corruption boundary;
- transport adapter: infrastructure/platform;
- registry: composition;
- worker entrypoint: delivery/operations;
- schema docs: publikus contract vagy module docs.

---

<a id="section-74"></a>

## 74. Forge célparancsok

A későbbi Forge célfelület:

```bash
pnpm forge event:list --project .
pnpm forge event:inspect orders.order.placed --project .
pnpm forge event:graph --project .
pnpm forge event:check --project .
pnpm forge event:aliases --project .
pnpm forge event:docs --project .

pnpm forge message:contracts --project .
pnpm forge message:inspect com.example.orders.order.placed.v1 --project .
pnpm forge message:compat --from v1 --to v2 --project .

pnpm forge outbox:status --project .
pnpm forge outbox:check --project .
pnpm forge outbox:replay-plan --project .

pnpm forge inbox:status --consumer notifications.order-confirmation.v1 --project .
pnpm forge dead-letter:list --project .
```

### 74.1. `event:list`

Mutassa:

- event type;
- kategória;
- producer;
- handlerlista;
- phase;
- failure policy;
- source file;
- version;
- payload schema.

### 74.2. `event:graph`

Mutassa:

```text
command
→ domain event
→ local handler
→ integration mapper
→ outbox
→ message type
→ consumer
→ command/event
```

### 74.3. Státusz

Ezek célparancsok; az implementáció külön fejlesztési scope.

---

<a id="section-75"></a>

## 75. Architecture checkek és hibakódok

Javasolt Forge hibakódok:

```text
EVENT_GLOBAL_BUS_IMPORT
EVENT_DOMAIN_FRAMEWORK_IMPORT
EVENT_DOMAIN_INFRASTRUCTURE_IMPORT
EVENT_MUTABLE_PAYLOAD
EVENT_SECRET_IN_PAYLOAD
EVENT_PII_UNCLASSIFIED
EVENT_HANDLER_ID_DUPLICATE
EVENT_HANDLER_EVENT_UNKNOWN
EVENT_HANDLER_CYCLE
EVENT_HANDLER_ORDER_HIDDEN
EVENT_INTEGER_PRIORITY_UNDOCUMENTED
EVENT_STOP_PROPAGATION_BUSINESS
EVENT_REENTRANCY_UNBOUNDED
EVENT_FAILURE_POLICY_MISSING
EVENT_ASYNC_LOCAL_BUSINESS_CRITICAL
EVENT_INTEGRATION_VERSION_MISSING
EVENT_INTEGRATION_SCHEMA_MISSING
EVENT_DIRECT_BROKER_PUBLISH_IN_TRANSACTION
EVENT_OUTBOX_TRANSACTION_MISSING
EVENT_CONSUMER_IDEMPOTENCY_MISSING
EVENT_RETRY_UNBOUNDED
EVENT_DEAD_LETTER_POLICY_MISSING
EVENT_TENANT_SCOPE_MISSING
EVENT_DYNAMIC_HANDLER_IMPORT
EVENT_AFTER_DURABLE_SIDE_EFFECT
EVENT_PROCESS_LOCAL_CROSS_INSTANCE_ASSUMPTION
EVENT_TELEMETRY_CHANGES_BUSINESS_RESULT
EVENT_ALIAS_BREAKING_SEMANTICS
EVENT_REPLAY_UNSAFE
EVENT_METRIC_HIGH_CARDINALITY
```

### 75.1. Jelenlegi architecture check kapcsolat

A meglévő Winzard checkek már tiltják az application réteg kifelé mutató framework- és infrastruktúraimportjait, a Client Component szerveroldali importjait és a composition root `server-only` hiányát. Egy későbbi event-check erre épülhet.

### 75.2. Generated registry drift

A generated handler registry és a definition source eltérése CI-hiba.

---

<a id="section-76"></a>

## 76. Implementációs elfogadási kritériumok

Az első event capability implementációja akkor tekinthető késznek, ha:

1. a projekt külön domain- és integration event contractot használ;
2. nincs univerzális globális business EventEmitter;
3. a domain event immutable és frameworkfüggetlen;
4. a handler registry statikus, egyedi ID-ket tartalmaz és ciklusmentes;
5. a handler failure policy explicit;
6. üzleti sorrend nem rejtett integer priorityn múlik;
7. a transaction boundary dokumentált és tesztelt;
8. a database write és integration publication outboxszal atomikus;
9. a consumer idempotens és inbox/dedup megoldással rendelkezik;
10. a retry korlátos, jitteres és dead-letter policyval rendelkezik;
11. az integration event verziózott és schema-validált;
12. correlation, causation, event ID és occurredAt elérhető;
13. tenant és PII scope explicit;
14. `after()` csak best-effort munkára szolgál;
15. Node process-lokális signal nem business delivery mechanizmus;
16. a teljes producer–outbox–consumer flow failure-injection tesztet kap;
17. replay és duplicate negatív esetek teszteltek;
18. observability nem logol raw secret/PII payloadot;
19. a dokumentáció felsorolja a producer- és consumer-ownereket;
20. production build és CI sikeres.

---

<a id="section-77"></a>

## 77. Migráció közvetlen side effectekből

### 77.1. Közvetlen side effect

Kiindulás:

```ts
await orders.save(order);
await email.sendConfirmation(order);
await broker.publish('order.placed', order);
```

Problémák:

- részleges siker;
- retry duplicate;
- raw model leak;
- nem dokumentált order;
- nehéz teszt.

### 77.2. Első lépés: explicit application orchestration

```text
save
→ result
→ explicit side effect port
```

### 77.3. Második lépés: domain event

A state transition immutable eventet rögzít, local transactional reaction külön handlerbe kerül.

### 77.4. Harmadik lépés: integration mapper + outbox

A külső payload külön contract; publication commit után relayből történik.

### 77.5. Negyedik lépés: idempotens consumer

Inbox, stable side-effect key, retry és dead-letter.

### 77.6. Ötödik lépés: diagnosztika

Handler registry, graph, schema docs, lag és failure metric.

A migráció fokozatos lehet, de a régi és új publication ne fusson párhuzamosan dedup nélkül.

---

<a id="section-78"></a>

## 78. Hibaelhárítás

### 78.1. A handler nem fut le

Ellenőrizd:

- a registry tartalmazza-e;
- event type pontos-e;
- capability aktív-e;
- generated registry friss-e;
- handler phase fut-e;
- transaction rollback történt-e;
- consumer subscription/topic helyes-e;
- event version támogatott-e.

### 78.2. Kétszer fut le

Lehetséges ok:

- at-least-once redelivery;
- relay crash window;
- duplikált registry;
- hot reload side-effectes listener registration;
- több subscription;
- webhook retry.

Javítás: stable event ID, unique handler ID, inbox/idempotency.

### 78.3. Event elveszik commit után

Valószínű direct broker publish vagy best-effort local signal. Használj transactional outboxot.

### 78.4. Handler sorrendprobléma

Ne priority számot növelj. Tedd explicitté a pipeline-t, egyesítsd a handlereket vagy használj dependency gráfot.

### 78.5. Retry storm

- circuit breaker;
- concurrency limit;
- exponential backoff + jitter;
- queue pause;
- dependency health;
- dead-letter threshold.

### 78.6. Cross-tenant adat jelenik meg

Vizsgáld:

- event tenant metadata forrását;
- partition keyt;
- consumer repository scope-ot;
- cache keyt;
- projection table tenant indexét;
- replay tooling tenant filterét.

### 78.7. `after()` callbackből hiányzik request adat

Server Componentben a request API-kat az `after()` hívás előtt kell olvasni és explicit értékként átadni. Route Handlerben és Server Functionben más szabályok érvényesek.

### 78.8. Node EventEmitter async listener rejection

Ne hagyj kezeletlen async listenert. Használj explicit wrapper/failure policyt, és az `'error'` eventet kezeld tudatosan.

---

<a id="section-79"></a>

## 79. Symfony–Winzard megfeleltetés

| Symfony fogalom | Winzard-megfelelő |
| --- | --- |
| `EventDispatcher` | kategóriaspecifikus dispatcher/publisher, nem univerzális globális busz |
| Event object | immutable readonly event record/envelope |
| Event name | stabil domain type vagy verziózott integration type |
| Event listener | típusos handler + definition |
| Event subscriber | modul-szintű handler factory/definition bundle |
| `AsEventListener` attribute | statikus definition vagy későbbi generated registry |
| Container tag | explicit composition registration |
| Listener priority | explicit phase + before/after dependency; üzleti ordernél orchestrator |
| Event alias | migrációs compatibility mapping, breaking semanticsre új version |
| `stopPropagation()` | business eventnél tiltott; policy/result/interceptor |
| Mutable event response | explicit presenter/response pipeline |
| `kernel.request` | next.config, Proxy, request mapper és explicit policies |
| `kernel.controller` before filter | route contract + explicit wrapper/policy chain |
| `kernel.response` after filter | response mapper/policy; telemetryhez decorator/after() |
| `kernel.exception` listener | explicit error mapper, error boundary, `onRequestError` |
| Main/subrequest check | direct Server Component/application composition; subrequest kerülendő |
| `debug:event-dispatcher` | cél: `forge event:list/inspect/graph/check` |
| Immutable dispatcher | frozen registry és public read-only dispatch interface |
| Traceable dispatcher | tracing decorator + handler execution report |
| Custom event | domain/application/integration event contract |
| Nested dispatch | explicit event queue + depth/cycle guard |
| Bundle event extension | recipe/package-owned static handler definitions |
| Before/after behavior without inheritance | decorator, interceptor, policy, presenter és explicit pipeline |

A legfontosabb különbség:

> Symfonyban a central dispatcher sokféle application és kernel notification közös mechanizmusa lehet. Winzardban az eventkategória és a delivery-garancia előbb kerül meghatározásra, és csak ezután választunk dispatchert, outboxot, hookot, UI handlert vagy telemetry signalt.

---

<a id="section-80"></a>

## 80. Források és attribúció

### 80.1. Symfony

- [Events and Event Listeners](https://symfony.com/doc/current/event_dispatcher.html)
- [The EventDispatcher Component](https://symfony.com/doc/current/components/event_dispatcher.html)
- [The Traceable Event Dispatcher](https://symfony.com/doc/current/components/event_dispatcher/traceable_dispatcher.html)
- [HttpKernel Component](https://symfony.com/doc/current/components/http_kernel.html)

### 80.2. Next.js

- [`after()`](https://nextjs.org/docs/app/api-reference/functions/after)
- [`instrumentation.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)
- [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Error Handling](https://nextjs.org/docs/app/getting-started/error-handling)

### 80.3. Node.js és React

- [Node.js Events / EventEmitter](https://nodejs.org/api/events.html)
- [Node.js Diagnostics Channel](https://nodejs.org/api/diagnostics_channel.html)
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [React — Responding to Events](https://react.dev/learn/responding-to-events)
- [React — Separating Events from Effects](https://react.dev/learn/separating-events-from-effects)

### 80.4. Esemény- és messaging contractok

- [CloudEvents specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- [AsyncAPI — Message](https://www.asyncapi.com/docs/concepts/message)
- [AsyncAPI — Payload Schema](https://www.asyncapi.com/docs/concepts/asyncapi-document/define-payload)
- [AWS Prescriptive Guidance — Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

### 80.5. Observability

- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/)
- [OpenTelemetry Traces and Span Events](https://opentelemetry.io/docs/concepts/signals/traces/)

### 80.6. Ellenőrzési dátum

```text
2026-07-19
```

A Next.js-, Node.js-, CloudEvents-, AsyncAPI- és messaging adapterek API-ja változhat. Dokumentációfrissítéskor újra ellenőrizendő:

- az `after()` statikus és hibás response melletti viselkedése;
- az instrumentation `onRequestError` contractja;
- a Proxy execution order és runtime;
- a Node EventEmitter async rejection szemantikája;
- a diagnostics channel stabilitása;
- a CloudEvents aktuális core version;
- a választott broker delivery és ordering garanciája;
- az outbox/inbox adatmodell és retention;
- a consumer idempotency és replay eljárás.
