---
title: "Sablonok, nézetek és UI-kompozíció Winzard alkalmazásokban"
description: "A Symfony Twig template-rendszerének teljes Winzard-specifikus átültetése React, Next.js App Router, Server Components, explicit view modellek, layoutok, komponensek, assetek, biztonság, tesztelés és diagnosztika használatával."
status: "implemented-specification"
document_version: "0.2.0"
last_verified: "2026-07-19"
source_basis: "Symfony Docs — Creating and Using Templates"
nextjs_baseline: "16.2.10"
react_baseline: "19.2.4"
typescript_baseline: "5.9.x"
applies_to: "kitelepített Winzard projektek, Winzard template-ek és a Reference App presentation rétege"
related_documents:
  - "winzard-page-creation.md"
  - "winzard-routing.md"
  - "winzard-controller.md"
  - "winzard-application-platform.md"
---

# Sablonok, nézetek és UI-kompozíció Winzard alkalmazásokban

## A dokumentum célja

Ez a dokumentum a Symfony **„Creating and Using Templates”** fejezetének teljes, Winzard-specifikus szakmai átültetése. Nem szó szerinti fordítás. A Symfony oldal témakészletét követi — template-nyelv, névválasztás, változók, linkek, assetek, globális kontextus, include-ok, öröklés, komponensek, fragmentek, renderelés, email, hibakeresés, escaping, namespace-ek és extensionök —, de minden fogalmat a Winzard **Next.js App Router + React Server Components + moduláris application layer + ports and adapters** célarchitektúrájához igazít.

A Winzard nem telepít második HTML template engine-t a React mellé. Az elsődleges webes nézeti nyelv:

```text
TypeScript
+ JSX / TSX
+ React komponensek
+ Next.js App Router layout- és page-konvenciók
```

A központi döntés:

> **A React-komponens a nézeti sablon, de nem alkalmazási service. A Page, Layout és presentation komponens kizárólag explicit, minimális és biztonságos view modelből renderelhet. Az üzleti szabály, az adatlekérés tulajdonjoga, a tranzakció, az authorizáció és az infrastruktúra-wiring nem rejtőzhet el a markupban.**

A dokumentum végére egy fejlesztő:

1. megérti a Twig és a React/Next.js nézeti modell közötti különbséget;
2. el tudja helyezni a Page, Layout, `template.tsx`, Server Component, Client Component és email-template fájlokat;
3. explicit props- és view-model szerződéseket tud kialakítani;
4. biztonságosan tud feltételes UI-t és listákat renderelni;
5. típusos linkeket, asseteket, képeket, fontokat, stílusokat és scripteket tud használni;
6. képes include helyett újrafelhasználható React-komponenst készíteni;
7. képes Twig-öröklés helyett root és nested layoutokat, slotokat és kompozíciót használni;
8. meg tudja különböztetni a persistent `layout.tsx` és a remountoló `template.tsx` szerepét;
9. képes aszinkron fragmenteket Suspense-szal és streaminggel felépíteni;
10. el tudja kerülni a saját API-n keresztüli szerveroldali subrequesteket;
11. Page-ből, Route Handlerből, service-adapterből és email-rendererből megfelelő kimenetet tud előállítani;
12. tudja, mikor indokolt MDX vagy más tartalomrenderelő capability;
13. ismeri a React escaping határát és a trusted HTML veszélyeit;
14. diagnosztizálni és tesztelni tudja a presentation réteget;
15. képes a Forge implementált view- és presentation-ellenőrzési contractjait használni.

> [!IMPORTANT]
> Ebben a dokumentumban a „template” általános értelemben nézeti sablont jelent. A Next.js speciális `template.tsx` fájlja ennél szűkebb, külön definiált fogalom: route-navigációkor remountoló wrapper.

> [!NOTE]
> A dokumentumban szereplő `forge view:*` és `forge make:view` parancsok implementált Forge-felületek. A statikus diagnosztika mellett a dokumentum továbbra is megadja a kötelező upstream typecheck-, lint-, build- és runtime ellenőrzéseket.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Hatókör és kizárások](#2-hatókör-és-kizárások)
3. [A Winzard nézeti modell központi döntései](#3-a-winzard-nézeti-modell-központi-döntései)
4. [Symfony Twig és Winzard React megfeleltetése](#4-symfony-twig-és-winzard-react-megfeleltetése)
5. [Telepítés és capability-határok](#5-telepítés-és-capability-határok)
6. [A JSX és TSX mint template-nyelv](#6-a-jsx-és-tsx-mint-template-nyelv)
7. [Template-ek és nézetek elhelyezése](#7-template-ek-és-nézetek-elhelyezése)
8. [Fájlnév- és exportkonvenciók](#8-fájlnév--és-exportkonvenciók)
9. [Az első teljes Winzard nézet](#9-az-első-teljes-winzard-nézet)
10. [View modellek, DTO-k és props-szerződések](#10-view-modellek-dto-k-és-props-szerződések)
11. [Feltételes renderelés és listák](#11-feltételes-renderelés-és-listák)
12. [Dátum-, szám-, pénz- és szövegformázás](#12-dátum--szám--pénz--és-szövegformázás)
13. [Linkelés oldalakra](#13-linkelés-oldalakra)
14. [Statikus assetek](#14-statikus-assetek)
15. [Képek](#15-képek)
16. [CSS és styling](#16-css-és-styling)
17. [Fontok](#17-fontok)
18. [JavaScript és külső scriptek](#18-javascript-és-külső-scriptek)
19. [Metadata és a dokumentum head része](#19-metadata-és-a-dokumentum-head-része)
20. [A Symfony `app` globális változó kiváltása](#20-a-symfony-app-globális-változó-kiváltása)
21. [Globális template-változók és konfiguráció](#21-globális-template-változók-és-konfiguráció)
22. [Include helyett explicit komponensek](#22-include-helyett-explicit-komponensek)
23. [Template-öröklés helyett layout-hierarchia](#23-template-öröklés-helyett-layout-hierarchia)
24. [A Next.js `template.tsx` speciális szerepe](#24-a-nextjs-templatetsx-speciális-szerepe)
25. [Slotok, parallel route-ok és kompozíció](#25-slotok-parallel-route-ok-és-kompozíció)
26. [Twig Components és React komponensek](#26-twig-components-és-react-komponensek)
27. [Server és Client Component határ](#27-server-és-client-component-határ)
28. [Adatot betöltő szerveroldali fragmentek](#28-adatot-betöltő-szerveroldali-fragmentek)
29. [Controller-embedding és belső subrequestek kiváltása](#29-controller-embedding-és-belső-subrequestek-kiváltása)
30. [Aszinkron tartalom, Suspense és streaming](#30-aszinkron-tartalom-suspense-és-streaming)
31. [Fragment- és adatszintű cache](#31-fragment--és-adatszintű-cache)
32. [Nézet renderelése Page-ből](#32-nézet-renderelése-page-ből)
33. [HTML renderelése Route Handlerből](#33-html-renderelése-route-handlerből)
34. [Nézet renderelése service-adapterből](#34-nézet-renderelése-service-adapterből)
35. [Email-template-ek](#35-email-template-ek)
36. [XML, RSS, szöveg és más formátumok](#36-xml-rss-szöveg-és-más-formátumok)
37. [Statikus oldal közvetlenül route-ból](#37-statikus-oldal-közvetlenül-route-ból)
38. [Template-létezés és dinamikus nézetválasztás](#38-template-létezés-és-dinamikus-nézetválasztás)
39. [Template namespace-ek helyett package exportok](#39-template-namespace-ek-helyett-package-exportok)
40. [Bundle template-ek, recipe-k és felülírás](#40-bundle-template-ek-recipe-k-és-felülírás)
41. [Témázás és design system](#41-témázás-és-design-system)
42. [Markdown, MDX és tartalomtemplate-ek](#42-markdown-mdx-és-tartalomtemplate-ek)
43. [Twig extensionök helyett presentation helperök](#43-twig-extensionök-helyett-presentation-helperök)
44. [Lazy betöltés és nehéz nézeti capability-k](#44-lazy-betöltés-és-nehéz-nézeti-capability-k)
45. [Output escaping és XSS](#45-output-escaping-és-xss)
46. [Trusted HTML, CSP és script-injekció](#46-trusted-html-csp-és-script-injekció)
47. [Akadálymentesség](#47-akadálymentesség)
48. [Lokalizáció és többnyelvű nézetek](#48-lokalizáció-és-többnyelvű-nézetek)
49. [Loading, error és not-found nézetek](#49-loading-error-és-not-found-nézetek)
50. [Hibakeresés és lintelés](#50-hibakeresés-és-lintelés)
51. [Tesztelési stratégia](#51-tesztelési-stratégia)
52. [Teljesítmény, hydration és bundle-határ](#52-teljesítmény-hydration-és-bundle-határ)
53. [Ajánlott projektstruktúra](#53-ajánlott-projektstruktúra)
54. [Biztonsági és architekturális ellenőrzések](#54-biztonsági-és-architekturális-ellenőrzések)
55. [Implementációs elfogadási kritériumok](#55-implementációs-elfogadási-kritériumok)
56. [Hibaelhárítás](#56-hibaelhárítás)
57. [Symfony–Winzard megfeleltetési táblázat](#57-symfonywinzard-megfeleltetési-táblázat)
58. [Források és attribúció](#58-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: megsértése nem támogatott, vagy architekturális, biztonsági, hozzáférhetőségi, reprodukálhatósági, illetve teljesítményhibát okozhat;
- **TILOS / MUST NOT**: Winzard-kompatibilis kódban nem alkalmazható;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak explicit trade-off mellett használható;
- **OPCIONÁLIS / MAY**: a projekt capability-jei és igényei szerint alkalmazható.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Nézet / view** | Felhasználónak vagy más HTML-fogyasztónak szánt, explicit adatszerződésből előállított megjelenítés. |
| **Template** | Általános értelemben a kimenet szerkezetét leíró TSX/JSX komponens vagy email/content renderer. |
| **`template.tsx`** | Next.js speciális route wrapper, amely navigációkor remountolja a saját subtree-jét. |
| **Presentation komponens** | React-komponens, amely explicit propsból renderel UI-t. |
| **View model** | A nézet konkrét igényeire szabott, minimális és jellemzően immutable adatstruktúra. |
| **Page** | Egy publikus route HTML/UI entrypointja a `page.tsx` fájlban. |
| **Layout** | Route-szegmensek között megosztott, navigációkor fennmaradó UI. |
| **Server Component** | Alapértelmezetten szerveren futó React-komponens. |
| **Client Component** | `"use client"` direktívával jelölt, böngészőoldali interakcióra vagy API-ra képes komponens. |
| **Fragment** | Egy oldal újrafelhasználható vagy önállóan aszinkron része. |
| **Design system** | Keresztmodulos vizuális primitívek, tokenek és komponens-API-k rendszere. |
| **Trusted HTML** | Auditált és megfelelően sanitizált HTML, amely raw DOM-beillesztésre engedélyezett. |
| **Projection** | Domain/application adatból a presentation réteg számára előállított olvasási modell. |

### 1.3. Parancsok státusza

| Státusz | Jelentés |
| --- | --- |
| **Upstream parancs** | Jelenleg használható Next.js-, React-, TypeScript-, ESLint-, pnpm- vagy tesztparancs. |
| **Winzard Forge-parancs** | Implementált, verziózott Forge-felület a view inventoryhoz, ellenőrzéshez, dokumentációhoz vagy generáláshoz. |
| **Manuális/upstream megfelelő** | A Forge statikus diagnosztikáját kiegészítő TypeScript-, Next.js-, browser- vagy security-ellenőrzés. |

---

## 2. Hatókör és kizárások

### 2.1. A fejezet lefedi

- webes HTML-oldalak presentation rétegét;
- root és nested layoutokat;
- route-specifikus `template.tsx` wrapperöket;
- Server és Client Componenteket;
- explicit props- és view-model szerződéseket;
- linkeket, asseteket, képeket, fontokat, CSS-t és scripteket;
- újrafelhasználható komponenseket;
- aszinkron fragmenteket, Suspense-t és streaminget;
- Page-, Route Handler-, service- és email-renderelést;
- XML/RSS/text jellegű prezentációs kimeneteket;
- MDX-alapú opcionális content capability-t;
- XSS-, CSP-, accessibility- és hydration-határokat;
- presentation teszteket és diagnosztikát.

### 2.2. Nem része ennek a fejezetnek

- a teljes routing contract;
- a controller/request mapping teljes szerződése;
- form- és mutation-workflow részletes tárgyalása;
- általános auth- vagy policy-rendszer;
- adatbázis- és repository-implementáció;
- általános CMS;
- email-szolgáltató vagy queue konkrét implementációja;
- több frontend framework támogatása;
- Twig runtime beépítése a Winzard core-ba.

### 2.3. Nem cél egy második template engine

A Winzard core nem telepít automatikusan:

```text
Twig
Handlebars
Nunjucks
EJS
Pug
Liquid
```

Ezek külön, explicit capability-k lehetnek speciális integrációhoz, de a webes App Router UI forrásigazsága React/TSX marad.

---

## 3. A Winzard nézeti modell központi döntései

### 3.1. A React-komponens nem service locator

A komponens nem kérhet le tetszőleges infrastruktúra-service-t globális registryből.

Tilos:

```ts
export function ProductCard() {
  const database = globalContainer.get('database');
  const product = database.product.findFirst();

  return <article>{product.name}</article>;
}
```

Használandó:

```tsx
type ProductCardProps = Readonly<{
  product: ProductCardViewModel;
}>;

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article>
      <h2>{product.name}</h2>
      <p>{product.formattedPrice}</p>
    </article>
  );
}
```

### 3.2. A Page kompozíciós entrypoint, nem üzleti nézetmodell

A Page:

1. validálja a route- és query inputot;
2. feloldja az actort és szükséges request contextet;
3. meghívja az application queryt;
4. eredményt presentation view modellre képez;
5. React-komponenst renderel.

### 3.3. Explicit adatáramlás

```text
Route input
  → presentation schema
  → application query
  → application DTO / result
  → presentation mapper
  → view model
  → React component
```

### 3.4. Szerver az alapértelmezett

A Page, Layout és presentation komponens Server Component marad, amíg nincs konkrét igény:

- local state-re;
- eseménykezelőre;
- browser API-ra;
- effectre;
- kliensoldali könyvtárra.

### 3.5. A klienshatár kicsi

A `"use client"` direktíva az adott modul teljes importfáját kliensoldali bundle-be emelheti. Ezért a klienskomponenst a lehető legkisebb interaktív subtree-re kell korlátozni.

### 3.6. Nincs rejtett környezeti kontextus

A nézet nem olvashat észrevétlenül:

```text
process.env
adatbázis
session store
request header
cookie
tenant registry
secret manager
```

Kivétel: route- vagy layout-entrypoint explicit request mappingje, amely biztonságos DTO-t ad tovább.

---

## 4. Symfony Twig és Winzard React megfeleltetése

| Symfony/Twig | Winzard/Next.js |
| --- | --- |
| `.html.twig` | `.tsx` React-komponens |
| `templates/` | `src/app`, modul `presentation/`, UI package vagy email/content könyvtár |
| `{{ value }}` | `{value}` JSX expression |
| `{% if %}` | JavaScript feltétel, ternary, `&&` vagy korai return |
| `{% for %}` | `array.map()` stabil `key` értékkel |
| `{# comment #}` | `{/* JSX comment */}` vagy TypeScript komment |
| filter | pure formatter/helper vagy célkomponens |
| function | pure helper, route builder vagy explicit adapter |
| `include()` | React-komponens explicit propsokkal |
| `extends` + block | root/nested layout, `children`, slot és kompozíció |
| Twig Component | Server vagy Client React-komponens |
| Live Component | kis Client Component + Server Action/Route Handler |
| `render(controller())` | közös application query közvetlen szerveroldali kompozícióval |
| `render_hinclude()` | Suspense/streaming vagy explicit kliensoldali fragment |
| `render()` | Page JSX-return vagy explicit HTML renderer adapter |
| `renderView()` | `renderToStaticMarkup()` csak nem hidratálható kimenethez |
| `app.*` | explicit request context/view model; nincs univerzális globális objektum |
| `twig.globals` | explicit config, layout props vagy szűk provider |
| `asset()` | statikus import, `public/`, `next/image`, `next/font`, CSS import |
| `path()` | `Link` + típusos route builder |
| `url()` | origin service + route builder |
| `raw` | `dangerouslySetInnerHTML`, kizárólag sanitizált trusted HTML-lel |
| namespace | package export, path alias vagy explicit komponensregistry |
| bundle template override | recipe extension point, theme registry vagy adapter |
| Twig extension | pure presentation helper vagy formázó service |

### 4.1. Fontos különbség: nincs template-objektumfeloldási mágia

Twig a `foo.bar` alaknál tömbkulcsot, propertyt, metódust, gettert és más elérési formákat próbálhat.

React/TypeScript esetén a szerződés explicit:

```ts
type UserSummaryViewModel = Readonly<{
  displayName: string;
  avatarUrl: string | null;
}>;
```

A komponens pontosan azt használhatja, amit a típus megenged. Ez megszünteti a rejtett getterhívást és a véletlen domainlogika-renderelést.

---

## 5. Telepítés és capability-határok

### 5.1. Alapnézethez nincs külön dependency

A Next.js App Router projekt már tartalmazza:

```text
React
React DOM
JSX / TSX fordítás
Server Components
Client Components
layout és page konvenció
asset build pipeline
```

Ezért a Twig Bundle megfelelőjeként nincs kötelező külön „view engine” telepítés.

### 5.2. Opcionális capability-k

Külön capability indokolt például:

```text
email-rendering
mdx-content
design-system
rich-text
pdf-rendering
visual-regression
storybook
```

Ezek nem lehetnek a minimal profil univerzális követelményei.

### 5.3. Javasolt manifest

```json
{
  "schemaVersion": 1,
  "profile": "webapp",
  "capabilities": [
    "next-app",
    "forge",
    "modular-application",
    "presentation-contract"
  ]
}
```

MDX esetén:

```json
{
  "capabilities": [
    "presentation-contract",
    "mdx-content"
  ]
}
```

Email esetén:

```json
{
  "capabilities": [
    "presentation-contract",
    "email-rendering"
  ]
}
```

---

## 6. A JSX és TSX mint template-nyelv

### 6.1. Alappélda

Twig:

```twig
<h1>{{ page_title }}</h1>

{% if user.isLoggedIn %}
    Hello {{ user.name }}!
{% endif %}
```

TSX:

```tsx
type WelcomeViewProps = Readonly<{
  title: string;
  viewer: Readonly<{
    isAuthenticated: boolean;
    displayName: string | null;
  }>;
}>;

export function WelcomeView({ title, viewer }: WelcomeViewProps) {
  return (
    <>
      <h1>{title}</h1>

      {viewer.isAuthenticated && viewer.displayName !== null ? (
        <p>Hello {viewer.displayName}!</p>
      ) : null}
    </>
  );
}
```

### 6.2. JSX expression

JSX-ben a `{...}` JavaScript expressiont tartalmaz.

```tsx
<p>{product.name}</p>
<p>{product.tags.length}</p>
<p>{formatPrice(product.price)}</p>
```

Tilos side effectet indítani közvetlen expressionből:

```tsx
{/* TILOS */}
<p>{auditLog.write('rendered')}</p>
```

### 6.3. Statement és expression különbség

Ez nem működik:

```tsx
<div>{if (visible) { return 'yes'; }}</div>
```

Használható:

```tsx
<div>{visible ? 'yes' : 'no'}</div>
```

vagy:

```tsx
export function Status({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return <div>yes</div>;
}
```

### 6.4. Komment

```tsx
export function ProductView() {
  return (
    <main>
      {/* Ez nem kerül a renderelt HTML-be. */}
      <h1>Products</h1>
    </main>
  );
}
```

### 6.5. Template-logika határa

Presentation logika lehet:

- feltételes megjelenítés;
- lista renderelése;
- formázás;
- vizuális variant kiválasztása;
- aria state előállítása;
- üresállapot kiválasztása.

Nem presentation logika:

- kedvezmény jogosultságának üzleti kiszámítása;
- rendelési állapotváltás;
- authorizációs döntés;
- készletfoglalás;
- adatbázislekérdezés általános UI helperből;
- tranzakció;
- külső API side effect.

---

## 7. Template-ek és nézetek elhelyezése

### 7.1. Nincs központi, mindent elnyelő `templates/`

Javasolt felosztás:

```text
src/
  app/
    layout.tsx
    page.tsx
    products/
      page.tsx
      loading.tsx
      error.tsx

  modules/
    catalog/
      product/
        application/
        domain/
        infrastructure/
        presentation/
          product-list-view.tsx
          product-card.tsx
          product-detail-view.tsx
          product.view-model.ts
          product.presenter.ts

  platform/
    ui/
      button.tsx
      card.tsx
      empty-state.tsx
      styles/
```

### 7.2. Elhelyezési szabályok

| Fájl | Hely |
| --- | --- |
| route entrypoint | `src/app/**/page.tsx` |
| route layout | `src/app/**/layout.tsx` |
| route remount wrapper | `src/app/**/template.tsx` |
| modul-specifikus presentation | `src/modules/<module>/<resource>/presentation/` |
| keresztmodulos UI primitive | `src/platform/ui/` vagy külön UI package |
| email view | capability szerint `src/emails/` vagy modul `presentation/email/` |
| MDX content | explicit `content/` vagy `src/content/` |
| view model | a presentation vagy application DTO közelében |
| formatter | pure presentation utility könyvtárban |

### 7.3. Colocation

Route-specifikus, máshol nem újrafelhasználható komponens colocálható:

```text
src/app/products/
  page.tsx
  product-filters.client.tsx
  product-page-header.tsx
```

Ha ugyanaz a komponens több route-ban vagy delivery adapterben használatos, kerüljön a modul presentation könyvtárába.

### 7.4. `src/app` továbbra is adapterréteg

A colocált komponens sem importálhat közvetlenül ORM-et csak azért, mert az `app` alatt található.

---

## 8. Fájlnév- és exportkonvenciók

### 8.1. Speciális Next.js fájlok

A framework által rögzített nevek:

```text
page.tsx
layout.tsx
template.tsx
loading.tsx
error.tsx
not-found.tsx
default.tsx
route.ts
```

### 8.2. Saját komponensfájlok

AJÁNLOTT:

```text
product-card.tsx
product-list-view.tsx
user-profile-summary.tsx
format-price.ts
product.view-model.ts
```

Export:

```tsx
export function ProductCard() {}
```

A fájlnév kebab-case, a React komponens PascalCase.

### 8.3. Props-típus

```tsx
type ProductCardProps = Readonly<{
  product: ProductCardViewModel;
  emphasis?: 'normal' | 'featured';
}>;
```

Publikus package API esetén a props-típus exportálható. Belső komponensnél maradhat lokális.

### 8.4. `View` suffix

A `View` suffix olyan nagyobb presentation komponenshez használható, amely egy teljes application resultot jelenít meg:

```text
ProductListView
ProductDetailView
CheckoutSummaryView
```

UI primitive-nél nem szükséges:

```text
Button
Card
Badge
Dialog
```

### 8.5. Kerülendő nevek

```text
utils.ts
helpers.ts
common.tsx
shared.tsx
misc.ts
template.tsx   // kivéve a Next.js speciális fájlt
```

A név jelezze a felelősséget.

---

## 9. Az első teljes Winzard nézet

A Symfony példa értesítéseket ad át controllerből Twig template-nek. A Winzard megfelelője külön application queryt, view modellt és presentation komponenst használ.

### 9.1. Application DTO

```ts
// src/modules/account/notification/application/dto/notification-list.dto.ts
export type NotificationListDto = Readonly<{
  viewerDisplayName: string;
  notifications: readonly Readonly<{
    id: string;
    title: string;
    occurredAt: Date;
    unread: boolean;
  }>[];
}>;
```

### 9.2. Presentation view model

```ts
// presentation/notification-list.view-model.ts
export type NotificationListViewModel = Readonly<{
  heading: string;
  viewerDisplayName: string;
  unreadCount: number;
  notifications: readonly Readonly<{
    id: string;
    title: string;
    occurredAtLabel: string;
    unread: boolean;
  }>[];
}>;
```

### 9.3. Presenter

```ts
// presentation/notification-list.presenter.ts
import type { NotificationListDto } from '../application/dto/notification-list.dto';
import type { NotificationListViewModel } from './notification-list.view-model';

export function presentNotificationList(
  dto: NotificationListDto,
  locale: string,
): NotificationListViewModel {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  return Object.freeze({
    heading: 'Notifications',
    viewerDisplayName: dto.viewerDisplayName,
    unreadCount: dto.notifications.filter((item) => item.unread).length,
    notifications: Object.freeze(
      dto.notifications.map((item) =>
        Object.freeze({
          id: item.id,
          title: item.title,
          occurredAtLabel: formatter.format(item.occurredAt),
          unread: item.unread,
        }),
      ),
    ),
  });
}
```

### 9.4. Presentation komponens

```tsx
// presentation/notification-list-view.tsx
import type { NotificationListViewModel } from './notification-list.view-model';

type NotificationListViewProps = Readonly<{
  model: NotificationListViewModel;
}>;

export function NotificationListView({
  model,
}: NotificationListViewProps) {
  return (
    <main>
      <header>
        <h1>{model.heading}</h1>
        <p>Hello {model.viewerDisplayName}.</p>
        <p>You have {model.unreadCount} unread notifications.</p>
      </header>

      {model.notifications.length === 0 ? (
        <p>No notifications.</p>
      ) : (
        <ul>
          {model.notifications.map((notification) => (
            <li key={notification.id}>
              <strong>{notification.title}</strong>{' '}
              <time>{notification.occurredAtLabel}</time>
              {notification.unread ? <span>Unread</span> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

### 9.5. Page entrypoint

```tsx
// src/app/account/notifications/page.tsx
import { accountModule } from '@/composition/account';
import { presentNotificationList } from '@/modules/account/notification/presentation/notification-list.presenter';
import { NotificationListView } from '@/modules/account/notification/presentation/notification-list-view';

export default async function NotificationsPage() {
  const actor = await accountModule.auth.requireActor();
  const locale = await accountModule.locale.resolve();

  const result =
    await accountModule.queries.getNotifications.execute({ actor });

  const model = presentNotificationList(result, locale);

  return <NotificationListView model={model} />;
}
```

### 9.6. Miért külön presenter?

A presenter:

- egységes formázást ad;
- explicit locale- és timezone-döntést hoz;
- nem teszi a React-komponenst domain-adattranszformáció tulajdonosává;
- külön unit tesztelhető;
- emailhez vagy JSON-hoz más presenter használható;
- megakadályozza az ORM/domain objektum közvetlen UI-ba szivárgását.

---

## 10. View modellek, DTO-k és props-szerződések

### 10.1. Ne adj át ORM rekordot

Tilos:

```tsx
<ProductView product={prismaProduct} />
```

A Prisma rekord:

- relationöket tartalmazhat;
- schema-változásra érzékeny;
- BigInt/Decimal/Date mezőket hordozhat;
- secret vagy belső mezőt szivárogtathat;
- klienskomponenshez nem feltétlenül szerializálható;
- a presentation réteget az ORM-hez köti.

### 10.2. Ne adj át domain aggregátumot

Tilos:

```tsx
<ProductView product={productAggregate} />
```

A domain objektum metódusai és invariantjai nem UI API-k.

### 10.3. Minimális view model

```ts
export type ProductCardViewModel = Readonly<{
  id: string;
  name: string;
  href: string;
  image: Readonly<{
    src: string;
    alt: string;
    width: number;
    height: number;
  }> | null;
  formattedPrice: string;
  availabilityLabel: string;
}>;
```

### 10.4. Szerializálhatóság Client Componentnél

Client Component propja csak olyan adat legyen, amely biztonságosan átadható a szerver–kliens határon.

Kerülendő:

```text
Date objektum implicit formátummal
class instance
Map
Set
Error
database client
logger
Request
Response
function a Server Componentből
secret
access token
teljes user objektum
```

A pontos szerializációs lehetőségeket mindig a használt React/Next baseline szerint kell ellenőrizni.

### 10.5. Props immutabilitás

A props olvasási szerződés:

```ts
type Props = Readonly<{
  items: readonly ItemViewModel[];
}>;
```

A komponens nem módosítja a kapott listát:

```tsx
// TILOS
items.sort();
```

Használható:

```tsx
const sortedItems = [...items].sort(compareItems);
```

Még jobb: a rendezés a query/presenter explicit szerződése legyen.

### 10.6. Discriminated union

Összetett állapothoz:

```ts
type ProductPageModel =
  | Readonly<{ state: 'ready'; product: ProductDetailViewModel }>
  | Readonly<{ state: 'not-found' }>
  | Readonly<{ state: 'forbidden' }>;
```

A view exhaustive módon kezelheti:

```tsx
export function ProductPageView({ model }: { model: ProductPageModel }) {
  switch (model.state) {
    case 'ready':
      return <ProductDetail product={model.product} />;
    case 'not-found':
      return <NotFoundState />;
    case 'forbidden':
      return <ForbiddenState />;
  }
}
```

A Page gyakran inkább `notFound()` vagy redirect segítségével kezeli a route-level állapotot; a union komponensszintű helyzetekben hasznos.

---

## 11. Feltételes renderelés és listák

### 11.1. Feltétel

```tsx
{viewer.isAuthenticated ? (
  <UserMenu viewer={viewer} />
) : (
  <SignInLink />
)}
```

### 11.2. Opcionális tartalom

```tsx
{product.description !== null ? (
  <p>{product.description}</p>
) : null}
```

### 11.3. Hamis érték csapda

Kerülendő:

```tsx
{items.length && <ItemList items={items} />}
```

Üres listánál `0` renderelhető.

Használható:

```tsx
{items.length > 0 ? <ItemList items={items} /> : null}
```

### 11.4. Lista és stabil key

```tsx
<ul>
  {products.map((product) => (
    <li key={product.id}>
      <ProductCard product={product} />
    </li>
  ))}
</ul>
```

A `key`:

- stabil;
- testvérek között egyedi;
- nem random;
- nem renderenként változó;
- lehetőleg tartós erőforrás-ID.

Kerülendő:

```tsx
key={crypto.randomUUID()}
key={index}
```

Az index csak statikus, soha nem rendeződő és nem mutálódó listánál tolerálható.

### 11.5. Üresállapot

```tsx
if (products.length === 0) {
  return (
    <EmptyState
      title="No products"
      description="Create the first product to get started."
    />
  );
}
```

### 11.6. Presentation vs business condition

Tilos:

```tsx
{order.total > 10000 && order.customerTier === 'gold' ? (
  <DiscountBadge />
) : null}
```

Ha ez üzleti jogosultság, a view model ezt kapja:

```ts
showPreferredDiscountBadge: boolean;
```

---

## 12. Dátum-, szám-, pénz- és szövegformázás

### 12.1. `Intl` az alapértelmezett

```ts
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountMinor / 100);
}
```

### 12.2. Timezone explicit

```ts
new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: viewerTimeZone,
});
```

Tilos implicit szerver-timezone-ra támaszkodni.

### 12.3. Formatter cache

Nagy listánál a formatter ne minden cellában jöjjön létre.

```ts
const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function getMoneyFormatter(
  locale: string,
  currency: string,
): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  const existing = moneyFormatters.get(key);

  if (existing) {
    return existing;
  }

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  });

  moneyFormatters.set(key, formatter);
  return formatter;
}
```

A cache kulcsának minden formázást befolyásoló paramétert tartalmaznia kell.

### 12.4. Relatív idő

A „3 perce” jellegű kliensoldali frissülő szöveg hydration eltérést okozhat. Lehetséges megoldások:

1. szerveroldali fix időpont és `<time dateTime>`;
2. Client Component mount után frissíti a relatív labelt;
3. a szerver és kliens ugyanazt a rögzített `now` értéket kapja;
4. csak statikus, abszolút dátumot renderelünk.

### 12.5. Rich text formázás

Szövegformázó helper ne adjon raw HTML stringet alapértelmezetten. Strukturált React node vagy auditált rich-text renderer használható.

---

## 13. Linkelés oldalakra

### 13.1. `Link` az alkalmazáson belül

```tsx
import Link from 'next/link';

<Link href={productRoutes.detail(product.id)}>
  {product.name}
</Link>
```

### 13.2. Típusos route builder

```ts
import type { Route } from 'next';

export const productRoutes = Object.freeze({
  list: (): Route => '/products',
  detail: (productId: string): Route =>
    `/products/${encodeURIComponent(productId)}` as Route,
});
```

### 13.3. Ne írj szétterített route stringeket

Kerülendő:

```tsx
<Link href={`/products/${product.id}`}>...</Link>
```

minden komponensben külön.

A route builder:

- központosítja az encodingot;
- támogatja az alias/deprecation migrációt;
- külön tesztelhető;
- abszolút URL-generáláshoz újrahasználható.

### 13.4. Külső link

```tsx
<a
  href={externalUrl}
  target="_blank"
  rel="noopener noreferrer"
>
  External documentation
</a>
```

### 13.5. URL-protokoll validáció

Felhasználói URL nem kerülhet közvetlenül `href` értékbe.

```ts
export function parsePublicHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url
      : null;
  } catch {
    return null;
  }
}
```

Tiltandó például:

```text
javascript:
data:
file:
vbscript:
```

a projekt contractja szerint.

### 13.6. Abszolút URL emailhez

```ts
export interface PublicOriginResolver {
  resolve(input: Readonly<{
    tenantId?: string;
    locale?: string;
  }>): URL;
}
```

```ts
const origin = originResolver.resolve({ tenantId });
const url = new URL(productRoutes.detail(product.id), origin);
```

A Host header nem válhat automatikusan email-link originjévé trusted proxy és allowlist nélkül.

---

## 14. Statikus assetek

### 14.1. `public/`

```text
public/
  brand/
    logo.svg
  downloads/
    terms.pdf
```

Hivatkozás:

```tsx
<img src="/brand/logo.svg" alt="Acme" />
```

A `public` fájl URL-je a roothoz képest képződik.

### 14.2. Cache-határ

A `public/` fájlok nem kapnak automatikusan tartalomhashes fájlnevet. A Next.js alapértelmezett cache headere ezekre konzervatív.

Hosszú immutable cache-hez:

- tartalomhashes fájlnév;
- CDN/object storage;
- statikus import;
- explicit deployment pipeline

használható.

### 14.3. Statikus import

```tsx
import heroImage from './hero.png';

<Image
  src={heroImage}
  alt="Warehouse overview"
/>
```

A bundler a statikus importot build assetként kezeli, és ismert dimenziókat biztosíthat.

### 14.4. Metadata-fájlok

Favicon, robots, sitemap és más támogatott metadata esetén az App Router metadata file conventionje az elsődleges, nem feltétlenül a kézi `public/` elhelyezés.

### 14.5. Secret nem asset

Tilos `public/` alá tenni:

```text
source map érzékeny forrással
belső konfiguráció
API schema, ha nem publikus
service account fájl
private key
backup
environment export
```

---

## 15. Képek

### 15.1. `next/image`

```tsx
import Image from 'next/image';

<Image
  src={product.image.src}
  alt={product.image.alt}
  width={product.image.width}
  height={product.image.height}
/>
```

A `next/image` automatikus képkiszolgálási és optimalizálási képességeket ad.

### 15.2. `alt` szerződés

Az `alt`:

- a kép jelentését helyettesítő szöveg;
- nem fájlnév;
- nem „image of...” ismétlés;
- dekoratív képnél üres string lehet;
- üzleti tartalomnál view-model mező legyen.

### 15.3. Távoli képek

`remotePatterns` legyen szűk:

```ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.example.com',
        pathname: '/catalog/**',
      },
    ],
  },
};
```

Ne engedélyezz tetszőleges user-controlled hostot.

### 15.4. Authentikált kép

A default image optimizer nem feltétlenül továbbít auth headereket. Privát képhez:

- rövid életű signed URL;
- saját védett image endpoint;
- megfelelő object-storage policy;
- esetleg `unoptimized` tudatosan

szükséges.

### 15.5. SVG

User-controlled SVG aktív tartalmat tartalmazhat.

Követelmények:

- sanitizálás;
- content disposition;
- CSP;
- megbízható source allowlist;
- inline SVG külön audit.

### 15.6. Layout shift

Távoli képnél explicit `width` és `height` vagy kontrollált `fill` layout szükséges.

### 15.7. LCP kép

Csak a tényleges LCP-kép kapjon magas prioritást. Több kép agresszív preloadja ronthatja a teljesítményt.

---

## 16. CSS és styling

### 16.1. Támogatott fő irányok

- Tailwind CSS;
- CSS Modules;
- globális CSS;
- Sass;
- külső stylesheet;
- kompatibilis CSS-in-JS megoldás.

A Winzard template döntse el a baseline-t. A minimal és webapp profil nem keverjen véletlenszerűen több styling paradigmát.

### 16.2. Globális CSS

```tsx
// src/app/layout.tsx
import './globals.css';
```

Globális CSS-be való:

- reset;
- design token;
- dokumentumszintű alap;
- Tailwind import;
- font variable;
- accessibility utility.

Nem való ide minden komponens lokális stílusa.

### 16.3. CSS Module

```tsx
import styles from './product-card.module.css';

export function ProductCard() {
  return <article className={styles.card}>...</article>;
}
```

### 16.4. Tailwind

A utility class lista presentation részlet. Ismétlődő, komplex kombinációt komponensbe vagy variant helperbe kell emelni.

Kerülendő egy korlátlan, user inputból felépített class string.

### 16.5. CSS sorrend

A production build CSS chunkingot és összevonást végezhet. A végső import-sorrendet mindig `next build` eredményével kell ellenőrizni, nem csak dev módban.

### 16.6. Dinamikus CSS érték

User input közvetlen CSS-be illesztése veszélyes lehet:

```tsx
// TILOS
<div style={{ backgroundImage: `url(${userValue})` }} />
```

Használj validált allowlistet vagy szerveroldali asset ID → URL mappinget.

---

## 17. Fontok

### 17.1. `next/font`

```tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

A Next font modul buildidőben kezeli és önhostolja a támogatott fontokat.

### 17.2. Egy definíció

Ha ugyanazt a fontot több helyen használjuk, egy központi definíciós modulból exportáljuk:

```ts
// src/platform/ui/fonts.ts
export const appSans = Inter({...});
```

Ne hívd meg minden komponensben külön a font loadert.

### 17.3. Lokális font

Licencelt vagy brand font:

```ts
import localFont from 'next/font/local';

export const brandFont = localFont({
  src: './brand-variable.woff2',
  display: 'swap',
});
```

### 17.4. Font privacy és performance

- külső runtime fontkérés kerülendő;
- subsetet tudatosan válassz;
- túl sok weight növeli a payloadot;
- fallback és `display` stratégia legyen dokumentált;
- fontlicencet ellenőrizni kell.

---

## 18. JavaScript és külső scriptek

### 18.1. Saját interaktív kód

Kis Client Component:

```tsx
'use client';

import { useState } from 'react';

export function ExpandableDetails({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide' : 'Show'} details
      </button>
      {open ? children : null}
    </section>
  );
}
```

### 18.2. Külső script

```tsx
import Script from 'next/script';

<Script
  src="https://analytics.example.com/client.js"
  strategy="afterInteractive"
/>
```

### 18.3. Script strategy

A választást dokumentálni kell:

- `beforeInteractive`: csak valóban kritikus, globális script;
- `afterInteractive`: alapértelmezett interaktív integráció;
- `lazyOnload`: alacsony prioritású script;
- worker/egyéb experimental opció: csak támogatott baseline-nal.

### 18.4. Third-party script kockázat

Minden külső script:

- hozzáférhet a DOM-hoz;
- olvashat nem `HttpOnly` adatot;
- módosíthat UI-t;
- teljesítményköltséget okozhat;
- supply-chain kockázat.

Szükséges lehet:

- CSP;
- consent gate;
- origin allowlist;
- SRI, ahol támogatott;
- privacy review;
- sandboxolt iframe;
- timeout és failure fallback.

### 18.5. Inline script

Inline script csak indokolt, auditált és CSP-kompatibilis módon használható. User input nem konkatenálható script stringbe.

---

## 19. Metadata és a dokumentum head része

### 19.1. Statikus metadata

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Browse the product catalog.',
};
```

### 19.2. Dinamikus metadata

```tsx
export async function generateMetadata({
  params,
}: PageProps<'/products/[productId]'>): Promise<Metadata> {
  const { productId } = await params;
  const product = await productMetadataQuery(productId);

  return {
    title: product.title,
    description: product.description,
  };
}
```

### 19.3. Ne duplikáld az adatlekérést kontroll nélkül

Ha Page és `generateMetadata` ugyanazt az adatot igényli:

- használj request-scope memoizationt;
- közös application queryt;
- explicit cache policyt;
- vagy kis metadata projectiont.

Ne legyen két eltérő authorizációs út.

### 19.4. Metadata-adatszivárgás

Title, description, Open Graph és structured data is publikus kimenet.

Tilos metadata-ba tenni:

```text
belső ID, ha érzékeny
secret
email cím engedély nélkül
privát dokumentumcím
stack trace
belső hibakód, ha információt szivárogtat
```

### 19.5. Resource hint

Preload/preconnect csak mért igény alapján. Túl sok hint erőforrásversenyt okozhat.

---

## 20. A Symfony `app` globális változó kiváltása

A Symfony Twig `app` objektuma requestet, usert, sessiont, flasht, környezetet, route-ot és locale-t tehet elérhetővé minden template-ben.

A Winzard ezt nem másolja át univerzális globális objektumként.

### 20.1. Megfeleltetés

| Symfony `app.*` | Winzard |
| --- | --- |
| `app.user` | explicit `ViewerViewModel` vagy actorból képzett minimális props |
| `app.request` | csak Page/Layout/Route Handler request mapping; nem továbbított teljes Request |
| `app.session` | session port/adapter; nézetnek minimális állapot |
| `app.flashes` | explicit flash store és FlashMessages komponens |
| `app.environment` | szerveroldali config; nem publikus kliensprop |
| `app.debug` | build/dev diagnosztika; nem UI üzleti feltétel |
| `app.token` | auth adapter belső részlete; nem view prop |
| `app.current_route` | route-specifikus entrypoint vagy kliensoldali pathname indokolt helyen |
| `app.current_route_parameters` | validált `params` |
| `app.locale` | validált locale context |
| `app.enabled_locales` | publikus config DTO |

### 20.2. App shell context

```ts
export type AppShellViewModel = Readonly<{
  viewer: Readonly<{
    displayName: string;
    avatarUrl: string | null;
  }> | null;
  locale: string;
  navigation: readonly NavigationItemViewModel[];
  flashes: readonly FlashMessageViewModel[];
}>;
```

### 20.3. Root layout példa

```tsx
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const shell = await resolveAppShell();

  return (
    <html lang={shell.locale}>
      <body>
        <AppHeader viewer={shell.viewer} navigation={shell.navigation} />
        <FlashMessages messages={shell.flashes} />
        {children}
      </body>
    </html>
  );
}
```

### 20.4. Kockázat: minden layoutdinamika globális

Ha a root layout minden requesten:

- authot olvas;
- cookie-t olvas;
- tenantot old fel;
- dinamikus adatot kér;

az egész route-fa renderelési és cache-viselkedésére hatással lehet.

Ezért csak valóban globális shelladat kerüljön a root layoutba. Modul- vagy route-specifikus adat maradjon közelebb a fogyasztóhoz.

---

## 21. Globális template-változók és konfiguráció

### 21.1. Statikus publikus config

```ts
export type PublicUiConfig = Readonly<{
  appName: string;
  supportUrl: string;
  enabledLocales: readonly string[];
}>;
```

A config szerveroldali parserből származik, és csak explicit publikus mezők kerülnek a view-ba.

### 21.2. Secret nem global prop

Tilos:

```tsx
<AppProvider config={process.env} />
```

vagy:

```tsx
<script>
  window.__CONFIG__ = {JSON.stringify(serverEnvironment)}
</script>
```

### 21.3. React context

Client-side React context indokolt lehet:

- theme;
- locale library;
- UI density;
- feature display preference;
- kliensoldali selection state.

Nem használható:

- server-only service containerként;
- Prisma kliens továbbítására;
- secretre;
- request-scope auth source of truthként;
- üzleti tranzakciós contextként.

### 21.4. Provider mérete

A provider kerüljön olyan mélyre, amennyire lehet. A root `<html>` teljes klienskomponenssé alakítása kerülendő.

### 21.5. Feature flag

A feature flag:

- szerveren értékelendő, ha security vagy entitlement;
- nem tehető titkosnak attól, hogy kliensoldali;
- view-model boolean lehet;
- client bundle-be kerülő flag publikus információ.


---

## 22. Include helyett explicit komponensek

### 22.1. Twig include és React komponens különbsége

A Twig `include()` alapértelmezetten hozzáférhet a befogadó template változókontextusához. Reactben az adatkapcsolat explicit props.

Twig:

```twig
{{ include('blog/_user_profile.html.twig') }}
```

Winzard:

```tsx
<UserProfileSummary user={article.author} />
```

Ez a különbség szándékos. Az implicit context:

- nehezen olvasható függőséget teremt;
- átnevezéskor rejtett törést okozhat;
- túl sok adatot adhat a fragmentnek;
- akadályozza a statikus típusellenőrzést;
- könnyebbé teszi secret vagy PII véletlen továbbadását.

### 22.2. Explicit props

```tsx
type UserProfileSummaryProps = Readonly<{
  user: Readonly<{
    displayName: string;
    profileImage: Readonly<{
      src: string;
      alt: string;
      width: number;
      height: number;
    }> | null;
  }>;
}>;

export function UserProfileSummary({
  user,
}: UserProfileSummaryProps) {
  return (
    <section aria-label="Author">
      {user.profileImage ? (
        <Image
          src={user.profileImage.src}
          alt={user.profileImage.alt}
          width={user.profileImage.width}
          height={user.profileImage.height}
        />
      ) : null}
      <p>{user.displayName}</p>
    </section>
  );
}
```

### 22.3. Kerüld a korlátlan prop spreadet

Kerülendő:

```tsx
<UserProfileSummary {...user} />
```

különösen akkor, ha `user` nagy vagy belső objektum.

Az explicit props megmutatja a publikus komponenscontractot.

### 22.4. `children` mint blokk

```tsx
type CardProps = Readonly<{
  title: string;
  children: React.ReactNode;
}>;

export function Card({ title, children }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
```

Használat:

```tsx
<Card title="Recent products">
  <ProductList products={products} />
</Card>
```

### 22.5. Named slot props

```tsx
type PageShellProps = Readonly<{
  header: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}>;

export function PageShell({
  header,
  sidebar,
  children,
}: PageShellProps) {
  return (
    <>
      <header>{header}</header>
      <div>
        {sidebar ? <aside>{sidebar}</aside> : null}
        <main>{children}</main>
      </div>
    </>
  );
}
```

### 22.6. Fragment ne kapjon teljes application resultot indoklás nélkül

Ha a komponens csak nevet és árat jelenít meg, ne kapjon teljes `ProductDetailDto`-t.

A minimális props contract:

- csökkenti a couplingot;
- könnyebben tesztelhető;
- biztonságosabb Client Componentnél;
- egyszerűbb design system API-t ad.

---

## 23. Template-öröklés helyett layout-hierarchia

### 23.1. Root layout

A root layout kötelező, és tartalmazza a dokumentum `html` és `body` elemeit.

```tsx
// src/app/layout.tsx
import type { ReactNode } from 'react';

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
```

### 23.2. Nested layout

```tsx
// src/app/blog/layout.tsx
export default function BlogLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <section>
      <BlogHeader />
      <div className="blog-grid">
        <BlogSidebar />
        <main>{children}</main>
      </div>
    </section>
  );
}
```

### 23.3. Twig háromszintű öröklés megfeleltetése

```text
base.html.twig
  → root layout

blog/layout.html.twig
  → nested blog layout

blog/index.html.twig
  → blog page
```

### 23.4. Layout állapotmegőrzés

A layout navigációkor fennmaradhat, állapotot őrizhet és nem feltétlenül renderelődik újra ugyanúgy, mint egy page.

Ezért:

- ne feltételezd, hogy minden navigációnál új lifecycle indul;
- ne helyezz page-view side effectet pusztán persistent layout mountba;
- Client Component layout state tudatos legyen;
- user- vagy tenantváltásnál vizsgáld a boundaryt.

### 23.5. Layout nem fér hozzá automatikusan a gyerek page adataihoz

A layout ne próbálja a child page view modeljét globálisan megszerezni.

Megoldások:

- route-paraméterből saját shell query;
- közös parent application query;
- komponenskompozíció;
- parallel route slot;
- metadata API;
- kliensoldali state csak valódi UI state-hez.

### 23.6. Több alkalmazásshell route groupokkal

```text
src/app/
  (public)/
    layout.tsx
  (admin)/
    layout.tsx
  (auth)/
    layout.tsx
```

A route group neve nem része az URL-nek.

### 23.7. Layout és authorizáció

Az admin layout végezhet korai auth/role gate-et, de:

- minden mutation és adatlekérés saját authorizációt is végez;
- a layout nem helyettesíti az erőforrásszintű policyt;
- a layoutban elrejtett UI nem biztonsági kontroll.

---

## 24. A Next.js `template.tsx` speciális szerepe

### 24.1. Nem általános template

A `template.tsx` a route-hierarchia speciális fájlja:

```text
layout.tsx
  → template.tsx
    → page vagy nested layout
```

### 24.2. Remount

A template saját route-szegmensének változásakor egyedi keyt kap, ezért subtree-je remountolhat.

Hasznos:

- route-váltáskor form state reset;
- effect újraszinkronizálás;
- animáció újraindítása;
- Suspense fallback minden releváns navigációnál;
- DOM subtree tudatos újraépítése.

### 24.3. Nem használható üzleti resetre

Tilos arra építeni, hogy a `template.tsx` remountja:

- törli a szerveroldali kosarat;
- visszavon tranzakciót;
- lezár sessiont;
- authorizációt érvényesít;
- idempotenciát garantál.

A remount presentation lifecycle, nem üzleti garancia.

### 24.4. Példa

```tsx
// src/app/checkout/template.tsx
export default function CheckoutTemplate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CheckoutTransition>{children}</CheckoutTransition>;
}
```

### 24.5. Layout vagy template?

| Igény | Használandó |
| --- | --- |
| navigációk között fennmaradó shell | `layout.tsx` |
| state megőrzése | `layout.tsx` |
| subtree reset route-váltáskor | `template.tsx` |
| minden navigációnál effect újrafutás | `template.tsx` |
| általános újrafelhasználható wrapper | normál React-komponens |
| üzleti state reset | application command |

---

## 25. Slotok, parallel route-ok és kompozíció

### 25.1. Named slot

Parallel route esetén a layout több propot kaphat.

```tsx
export default function DashboardLayout({
  children,
  analytics,
  activity,
}: Readonly<{
  children: React.ReactNode;
  analytics: React.ReactNode;
  activity: React.ReactNode;
}>) {
  return (
    <DashboardShell
      main={children}
      analytics={analytics}
      activity={activity}
    />
  );
}
```

### 25.2. Twig block megfelelő

A named slot funkcionálisan hasonlíthat Twig blockhoz, de:

- a route-fa része;
- önálló navigációs állapota lehet;
- saját loading/error/default boundaryt kaphat;
- nem tetszőleges runtime string alapján feloldott block.

### 25.3. `default.tsx`

Hard navigation vagy hiányzó slot state esetén `default.tsx` biztosíthat fallbacket.

A fallback legyen:

- biztonságos;
- minimális;
- nem félrevezető;
- külön tesztelt;
- authorizációs szempontból semleges.

### 25.4. Slot ne legyen rejtett subrequest

A slot ugyanabban a React renderfában komponálódik. Ne hívjon saját HTTP API-t csak azért, hogy „független fragment” legyen.

### 25.5. Mikor indokolt parallel route?

- dashboard több független panellel;
- modal/intercepting route;
- összehasonlító panelek;
- külön loading/error boundary;
- önálló navigációs állapot.

Egyszerű layout-oszlophoz normál komponensprop elegendő.

---

## 26. Twig Components és React komponensek

### 26.1. Három komponenskategória

#### Pure presentation component

```tsx
export function Alert({
  variant,
  children,
}: Readonly<{
  variant: 'info' | 'warning' | 'error';
  children: React.ReactNode;
}>) {
  return <div role="alert" data-variant={variant}>{children}</div>;
}
```

Nem kér adatot és nincs side effectje.

#### Async Server fragment

```tsx
export async function RecentArticles({
  limit,
}: Readonly<{ limit: number }>) {
  const dto = await articleModule.queries.listRecent.execute({ limit });
  const model = presentRecentArticles(dto);

  return <RecentArticleList model={model} />;
}
```

Szerveroldali application query tulajdonosa.

#### Client island

```tsx
'use client';

export function SearchBox() {
  // local state, event handler, browser interaction
}
```

### 26.2. Komponensosztály helyett TypeScript modul

A Twig component class logikáját Winzardban:

- pure props mapper;
- Server Component;
- presenter;
- Client Component state;
- explicit application query

között kell elhelyezni.

### 26.3. Generic UI komponens nem kér adatbázist

Tilos:

```tsx
export async function Card({ productId }) {
  const product = await db.product.findUnique(...);
  return ...;
}
```

egy általános `Card` komponensben.

### 26.4. Live Component megfelelő

Kis interaktív egység:

```text
Server-rendered initial view
  + minimal Client Component
  + Server Action vagy Route Handler
  + explicit validation
  + cache/revalidation contract
```

### 26.5. Komponens API

AJÁNLOTT:

- kis props surface;
- discriminated variant;
- explicit accessibility prop;
- predictable children;
- controlled/uncontrolled modell dokumentálva;
- stabil CSS contract;
- server/client kompatibilitás jelölve.

### 26.6. Polimorf komponens

Az `as` prop csak indokolt design-system primitive-nél:

```tsx
<Button asChild>
  <Link href="/products">Products</Link>
</Button>
```

A szemantikus HTML és accessibility nem sérülhet.

---

## 27. Server és Client Component határ

### 27.1. Server Component előnye

- közvetlen szerveroldali dependency használat;
- secret nem kerül bundle-be;
- kisebb kliens JavaScript;
- async render;
- streaming;
- szerveroldali data access;
- explicit DTO-val klienshatár.

### 27.2. Client Component indok

- `useState`;
- `useReducer`;
- `useEffect`;
- DOM event handler;
- browser API;
- third-party client-only widget;
- context, amely kliens state-et hordoz;
- optimistic UI.

### 27.3. Klienshatár példa

```tsx
// Server Component
export function ProductDetailView({
  model,
}: ProductDetailViewProps) {
  return (
    <>
      <ProductSummary product={model.product} />
      <AddToCartButton productId={model.product.id} />
    </>
  );
}
```

```tsx
// Client Component
'use client';

export function AddToCartButton({
  productId,
}: Readonly<{ productId: string }>) {
  // interakció
}
```

### 27.4. Ne jelöld az egész oldalt klienskomponensnek

Kerülendő:

```tsx
'use client';

export default function ProductPage() {
  // minden kliensbe kerül
}
```

csak azért, mert egy gomb state-et igényel.

### 27.5. Server-only import védelem

Szerveroldali modulban:

```ts
import 'server-only';
```

Ez segít megakadályozni a véletlen kliensimportot.

### 27.6. Client-only könyvtár wrapper

Ha egy package browser API-t használ és nincs megfelelő direktívája, kis wrapper Client Component szükséges.

### 27.7. Context provider

A React context provider jellemzően Client Component. A provider legyen a lehető legmélyebben.

### 27.8. Event handler nem adható Server Componentből DOM elemnek

Interaktív eseményhez Client Component kell. Server Action form `action` propja külön szerverfunkciós mechanizmus, nem általános event handler.

---

## 28. Adatot betöltő szerveroldali fragmentek

### 28.1. Mikor megfelelő?

Egy fragment saját queryt birtokolhat, ha:

- üzletileg jól körülhatárolt;
- több page-ben újrafelhasználható;
- explicit inputot kap;
- nincs rejtett request-context dependency;
- cache és error policy dokumentált;
- nem generic UI primitive.

### 28.2. Példa

```tsx
export async function RecentOrdersFragment({
  actor,
  limit,
}: Readonly<{
  actor: Actor;
  limit: number;
}>) {
  const result = await orderModule.queries.listRecent.execute({
    actor,
    limit,
  });

  return <RecentOrdersView model={presentRecentOrders(result)} />;
}
```

### 28.3. Actor prop kockázat

Domain/auth osztály Client Componentnek nem adható át. Server fragmenten belül használható, de a presentation view csak minimális DTO-t kapjon.

### 28.4. N+1 component query

Ha egy lista minden sora külön queryt indít:

```tsx
{ids.map((id) => <ProductRow key={id} productId={id} />)}
```

N+1 vagy connection pool terhelés keletkezhet.

Használj bulk application queryt:

```text
listProducts(ids)
→ list view model
→ ProductRow pure komponensek
```

### 28.5. Duplikált query

Page, metadata és fragment azonos queryjét request-scope memoization vagy explicit cache csökkentheti, de az authorizációs és tenantkulcsot nem szabad elveszíteni.

---

## 29. Controller-embedding és belső subrequestek kiváltása

### 29.1. Symfony minta

A Symfony `render(controller())` subrequestet futtathat egy fragment előállítására.

### 29.2. Winzard alapszabály

Server Component TILOS, hogy saját publikus API-t hívjon csak belső adateléréshez:

```tsx
// TILOS
const response = await fetch('http://localhost:3000/api/recent-products');
```

### 29.3. Helyes kompozíció

```tsx
const products =
  await catalogModule.queries.listRecentProducts.execute({ limit: 3 });

return <RecentProductsView model={presentRecentProducts(products)} />;
```

### 29.4. Miért tilos az own-API fetch?

- plusz hálózati hop;
- auth/cookie/header forwarding komplexitás;
- eltérő cache;
- deployment origin probléma;
- hibamapping duplikáció;
- request ID és tracing torzulása;
- SSRF/open redirect kockázat;
- lassabb render;
- connection pool és rate limit önterhelés.

### 29.5. Külön publikus API és Page

Mindkettő ugyanazt az application queryt használja:

```text
Page
  ┐
  ├→ application query
  ┘
Route Handler
```

### 29.6. ESI vagy edge fragment

Ha infrastruktúra-specifikus edge include valóban szükséges:

- külön capability;
- publikus vagy belső fragment endpoint;
- signed fragment request;
- cache key;
- auth policy;
- timeout/fallback;
- observability;
- CDN-kompatibilitás

kell. Ez nem Winzard core alapminta.

---

## 30. Aszinkron tartalom, Suspense és streaming

### 30.1. `loading.tsx`

```tsx
export default function Loading() {
  return <ProductListSkeleton />;
}
```

Route-szegmens loading UI.

### 30.2. Manuális Suspense

```tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <main>
      <DashboardHeader />

      <Suspense fallback={<SalesSummarySkeleton />}>
        <SalesSummaryFragment />
      </Suspense>

      <Suspense fallback={<RecentOrdersSkeleton />}>
        <RecentOrdersFragment />
      </Suspense>
    </main>
  );
}
```

### 30.3. A fallback szerződése

A fallback:

- tartsa a layout méretét, ahol lehet;
- legyen accessibility-kompatibilis;
- ne villogjon indokolatlanul;
- ne mutasson hamis adatot;
- ne tartalmazzon secretet;
- ne induljon benne side effect.

### 30.4. Streaming előtt status és header

Streaming megkezdése után a status és response header nem változtatható tetszőlegesen.

Ezért:

- authorizáció;
- route param validáció;
- kritikus not-found döntés;
- redirect;
- kötelező response header

történjen a megfelelő Suspense boundary és első streamelt byte előtt.

### 30.5. `notFound()` helye

Ha a route fő erőforrása nem létezik, a not-found döntést ne rejtsd egy későn streamelő alfragmentbe, ha az egész oldal 404.

### 30.6. Független hiba

Egy másodlagos dashboard panel hibája kezelhető lokális error/fallback view-val, ha nem teszi érvénytelenné az egész oldalt.

### 30.7. hinclude megfeleltetés

A Symfony hinclude legacy aszinkron fragmentje helyett:

| Igény | Winzard |
| --- | --- |
| szerveroldali progresszív HTML | Suspense + streaming |
| kliensoldali önfrissülő widget | Client Component + endpoint/action |
| külön cache-elt edge fragment | külön edge-fragment capability |
| fallback JavaScript nélkül | szerveroldali Suspense fallback |
| interaktív live fragment | Client island |

### 30.8. Credentiales kliensfragment

Kliensoldali fetch esetén explicit:

- same-origin;
- credential policy;
- CSRF;
- CORS;
- loading/error state;
- abort;
- retry;
- stale response;
- race condition

contract szükséges.

---

## 31. Fragment- és adatszintű cache

### 31.1. A cache nem template-funkció

A cache policy a query, data adapter vagy route/render boundary szerződése, nem a markupban elrejtett helper.

### 31.2. Cache kulcs

Tartalmazhatja:

```text
query neve
input
locale
currency
tenant ID
actor scope, ha szükséges
feature flags
schema/version
```

### 31.3. Privát adat

User-specific fragment nem kerülhet publikus, megosztott cache-be.

### 31.4. Tenant adat

Tenant ID hiánya a cache keyből cross-tenant leaket okozhat.

### 31.5. Invalidation

Mutation után csak a ténylegesen érintett path/tag/query invalidálódjon.

### 31.6. Cache és Suspense

A Suspense nem cache. Csak aszinkron render boundary.

### 31.7. Request memoization vs shared cache

Külön fogalmak:

```text
requesten belüli duplikációcsökkentés
≠
requestek közötti shared cache
```

### 31.8. Fragment TTL

A TTL üzleti frissességi contractból következik, nem UI convenience-ből.

---

## 32. Nézet renderelése Page-ből

### 32.1. Alapminta

```tsx
export default async function ProductListPage({
  searchParams,
}: PageProps<'/products'>) {
  const rawSearchParams = await searchParams;
  const input = productListSearchSchema.parse(rawSearchParams);
  const actor = await requireActor();

  const result =
    await catalogModule.queries.listProducts.execute({
      actor,
      input,
    });

  return (
    <ProductListView
      model={presentProductList(result)}
    />
  );
}
```

### 32.2. A Page returnje

A Page React node-ot ad vissza. Nem:

```ts
return new Response(...)
```

### 32.3. Response header

HTTP headerhez:

- Next.js header konfiguráció;
- Proxy;
- cookie/header API megfelelő szerverfunkcióban;
- Route Handler, ha explicit HTTP endpoint

szükséges.

### 32.4. Status

Page route-nál a framework conventionök:

- normál oldal;
- `notFound()`;
- redirect;
- error boundary

használatosak. Egyedi raw status-controlhoz Route Handler lehet indokolt.

### 32.5. Statikus render

Ha a Page nem használ requestfüggő dinamikus API-t és adata prerenderelhető, a framework statikus outputot készíthet.

A dokumentumban minden Page-hez explicit render/cache döntést kell adni, ha az adat érzékeny vagy frissességkritikus.

---

## 33. HTML renderelése Route Handlerből

### 33.1. Mikor indokolt?

- külső rendszer HTML-fragmentet kér;
- legacy endpoint;
- webhook callback landing;
- nem interaktív export;
- preview service;
- email/browser közös static markup indokolt;
- text/html API-contract.

Normál alkalmazásoldalhoz Page az elsődleges.

### 33.2. Statikus markup

```tsx
import { renderToStaticMarkup } from 'react-dom/server';

export async function GET(): Promise<Response> {
  const model = await buildPublicStatusViewModel();
  const html = renderToStaticMarkup(
    <PublicStatusDocument model={model} />,
  );

  return new Response(`<!doctype html>${html}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
```

### 33.3. Caveat

A `renderToStaticMarkup()` output:

- nem hidratálható;
- korlátozott Suspense viselkedésű;
- interaktív React alkalmazáshoz nem megfelelő;
- emailhez vagy teljesen statikus HTML-hez alkalmas.

### 33.4. Teljes dokumentum

A komponens tartalmazhat:

```tsx
export function PublicStatusDocument({ model }: Props) {
  return (
    <html lang="en">
      <head>
        <title>{model.title}</title>
      </head>
      <body>...</body>
    </html>
  );
}
```

### 33.5. Security header

Raw HTML Route Handlernél különösen fontos:

- CSP;
- `X-Content-Type-Options: nosniff`;
- frame policy;
- referrer policy;
- cache;
- content disposition, ha letöltés;
- escaping/trusted HTML audit.

---

## 34. Nézet renderelése service-adapterből

### 34.1. Application layer ne importáljon Reactot

Tilos:

```ts
// application service
import { renderToStaticMarkup } from 'react-dom/server';
```

### 34.2. Port

```ts
export interface HtmlDocumentRenderer<Input> {
  render(input: Input): Promise<string>;
}
```

### 34.3. Infrastruktúra/presentation adapter

```tsx
import { renderToStaticMarkup } from 'react-dom/server';

export class ReactInvoiceHtmlRenderer
  implements HtmlDocumentRenderer<InvoiceViewModel>
{
  async render(model: InvoiceViewModel): Promise<string> {
    return '<!doctype html>' +
      renderToStaticMarkup(<InvoiceDocument model={model} />);
  }
}
```

### 34.4. Composition root

```ts
const invoiceHtmlRenderer =
  new ReactInvoiceHtmlRenderer();

const sendInvoice =
  new SendInvoiceCommand(
    invoiceRepository,
    invoiceHtmlRenderer,
    mailer,
  );
```

### 34.5. Renderer input

A renderer view modellt kap, nem domain aggregate-et vagy Prisma rekordot.

### 34.6. Determinizmus

Service renderelésnél explicit input kell:

```text
locale
timezone
currency
public origin
brand/theme
render timestamp
template version
```

A `new Date()` vagy environmentből implicit olvasott locale reprodukálhatatlan outputot okozhat.

---

## 35. Email-template-ek

### 35.1. Külön capability

Az email rendering nem része automatikusan minden projekttemplate-nek.

Lehetséges szerkezet:

```text
src/modules/billing/invoice/
  presentation/
    email/
      invoice-email.tsx
      invoice-email.view-model.ts
      invoice-email.presenter.ts
      invoice-email.renderer.ts
```

### 35.2. Email view model

```ts
export type InvoiceEmailViewModel = Readonly<{
  recipientName: string;
  invoiceNumber: string;
  totalLabel: string;
  invoiceUrl: string;
  supportUrl: string;
}>;
```

### 35.3. HTML és text

A mailer contract lehet:

```ts
export type RenderedEmail = Readonly<{
  subject: string;
  html: string;
  text: string;
}>;
```

Mindkét változat legyen tesztelt.

### 35.4. Abszolút URL

Emailben relatív URL nem elég:

```ts
const invoiceUrl =
  new URL(invoiceRoutes.detail(id), publicOrigin).toString();
```

### 35.5. Email CSS

Sok email kliens korlátozott CSS-t támogat.

Szükséges lehet:

- inline style;
- táblázatos layout;
- kompatibilitási teszt;
- plain-text fallback;
- tracking pixel privacy review;
- remote image policy;
- dark mode teszt.

### 35.6. Ne használj browser-only komponenst

Email template nem tartalmazhat:

```text
useState
useEffect
window
localStorage
Next Link navigation
client hydration
Server Action
```

### 35.7. Secret és PII

Email outputba csak a címzettnek szükséges adat kerülhet.

A logban ne jelenjen meg a teljes HTML, ha PII-t tartalmaz.

### 35.8. Template verzió

Jogi vagy pénzügyi emailnél rögzíthető:

```text
template ID
template version
locale
render timestamp
business document version
```

---

## 36. XML, RSS, szöveg és más formátumok

### 36.1. Nem minden kimenet React template

RSS vagy XML esetén explicit serializer gyakran megfelelőbb.

```ts
export interface FeedRenderer {
  render(feed: FeedViewModel): string;
}
```

### 36.2. XML escaping

XML text és attribute escaping különösen fontos. String concatenation helyett megbízható XML builder ajánlott.

### 36.3. RSS URL-ek

Minden link abszolút, canonical és megfelelően encoded legyen.

### 36.4. Content-Type

```text
application/rss+xml; charset=utf-8
application/xml; charset=utf-8
text/plain; charset=utf-8
text/csv; charset=utf-8
```

### 36.5. CSV

CSV template-nél:

- delimiter;
- quote;
- line ending;
- BOM;
- encoding;
- formula injection;
- locale;
- exportlimit;
- streaming

contract szükséges.

### 36.6. JSON

JSON-hoz ne használj React renderer-t. Explicit DTO és `Response.json()` szükséges.

### 36.7. PDF

PDF külön capability:

```text
HTML → browser/PDF engine
vagy
natív PDF renderer
```

Kell:

- font embedding;
- pagination;
- deterministic asset access;
- SSRF-védelem;
- sandbox;
- timeout;
- memory limit;
- golden visual test.

---

## 37. Statikus oldal közvetlenül route-ból

A Symfony `TemplateController` megfelelője egyszerű Page.

```tsx
// src/app/legal/privacy/page.tsx
export const metadata = {
  title: 'Privacy policy',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument>
      <h1>Privacy policy</h1>
      <p>...</p>
    </LegalDocument>
  );
}
```

### 37.1. Nincs külön route config → template mapping

A fájlrendszer route már maga a mapping.

### 37.2. Statikus tartalom helye

Rövid, ritkán változó oldal TSX lehet.

Hosszabb szerkesztői tartalomhoz:

- MDX capability;
- CMS adapter;
- content repository;
- verziózott Markdown

lehet megfelelőbb.

### 37.3. Cache

Statikus Page természetesen prerenderelhető, ha nincs requestfüggő adat.

### 37.4. Jogi dokumentum

Jogi szövegnél:

- verzió;
- effective date;
- locale;
- archival history;
- canonical URL;
- release evidence

szükséges lehet.

---

## 38. Template-létezés és dinamikus nézetválasztás

### 38.1. Statikus import az alap

```tsx
import { DefaultProductCard } from './default-product-card';
```

A hiányzó import buildhibát okoz.

### 38.2. Dinamikus fájlnév user inputból tilos

```ts
// TILOS
const Template = await import(`./themes/${requestTheme}.tsx`);
```

Ez:

- path traversal;
- bundle explosion;
- nem determinisztikus build;
- jogosulatlan kódválasztás;
- error handling probléma.

### 38.3. Explicit registry

```ts
const productCardRegistry = {
  default: DefaultProductCard,
  compact: CompactProductCard,
  editorial: EditorialProductCard,
} as const;

export type ProductCardVariant =
  keyof typeof productCardRegistry;

export function getProductCard(
  variant: ProductCardVariant,
) {
  return productCardRegistry[variant];
}
```

### 38.4. Runtime validáció

```ts
const variantSchema = z.enum([
  'default',
  'compact',
  'editorial',
]);
```

### 38.5. Fallback

Ismeretlen variant:

- validation error;
- default fallback csak dokumentált esetben;
- telemetry;
- nem csendes file search.

### 38.6. Template existence check

Implementált:

```bash
pnpm forge view:check
pnpm forge view:list
```

Manuálisan:

```bash
pnpm typecheck
pnpm build
```

A build a statikus importok létezését és TSX szintaxisát ellenőrzi.

---

## 39. Template namespace-ek helyett package exportok

### 39.1. Explicit import

```tsx
import { Button } from '@winzard/ui/button';
import { ProductCard } from '@/modules/catalog/product/presentation';
```

### 39.2. Public API

Modul `index.server.ts`:

```ts
import 'server-only';

export { ProductListView } from './presentation/product-list-view';
export type {
  ProductListViewModel,
} from './presentation/product-list.view-model';
```

Client API külön:

```ts
// index.client.ts
export { ProductFilters } from './presentation/product-filters.client';
```

### 39.3. Package export map

```json
{
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx",
    "./server": "./src/index.server.ts"
  }
}
```

### 39.4. Nincs search precedence

A Twig namespace több könyvtár között kereshet sorrend alapján. Winzardban az import target egyértelmű.

Kerülendő egy olyan globális loader, amely:

```text
tenant theme
→ project override
→ recipe override
→ default component
```

sorrendben csendben fájlokat keres.

Ha override kell, explicit registry és validáció szükséges.

### 39.5. Path alias nem security boundary

Az `@/` alias csak importkényelmi eszköz. Architecture check kell a tiltott réteghatárokhoz.

---

## 40. Bundle template-ek, recipe-k és felülírás

### 40.1. Package által szállított UI

Egy package exportálhat:

- componentet;
- design tokent;
- default view model typet;
- renderer adaptert;
- CSS-t;
- extension pointot.

### 40.2. Ne másold automatikusan a teljes package template-jét

A fogyasztói projektbe másolt fájl ownershipet és upgrade-driftet okoz.

### 40.3. Extension point

```ts
export type ProductUiOverrides = Readonly<{
  ProductCard?: React.ComponentType<ProductCardProps>;
  EmptyState?: React.ComponentType<EmptyStateProps>;
}>;
```

### 40.4. Composition root választás

```ts
const ProductCard =
  projectOverrides.ProductCard ??
  DefaultProductCard;
```

### 40.5. Override contract

Kötelező:

- props kompatibilitás;
- accessibility;
- server/client boundary;
- styling contract;
- version compatibility;
- fallback;
- tests.

### 40.6. Recipe-generated file

A recipe manifest jelölje:

```text
generated
developer-owned
merge-managed
read-only
```

### 40.7. Upgrade

Komponens override esetén:

- base component version;
- override version;
- breaking prop diff;
- visual regression;
- migration guide

szükséges.

---

## 41. Témázás és design system

### 41.1. Design token

```css
:root {
  --color-surface: #ffffff;
  --color-text: #111111;
  --space-4: 1rem;
}
```

### 41.2. Theme választás

Lehet:

- build-time brand;
- tenant config;
- user preference;
- system preference.

A source of truth és fallback legyen dokumentált.

### 41.3. Theme cookie

Theme preference cookie UI state lehet. Írás Route Handlerből vagy Server Actionből történjen, nem Server Component render közben.

### 41.4. Hydration flicker

Dark mode első rendernél:

- szerveroldali cookie;
- inline auditált script;
- CSS media query;
- class strategy

közül kell tudatosan választani.

### 41.5. Tenant theme biztonság

Tenant által megadott raw CSS veszélyes.

Biztonságosabb:

```text
theme token ID
→ validált tokenérték
→ CSS custom property allowlist
```

Tilos tetszőleges `<style>` string.

### 41.6. Design system rétegek

```text
tokens
→ primitives
→ composite components
→ module presentation
→ page/layout composition
```

### 41.7. Domain-specifikus komponens

A `ProductAvailabilityBadge` maradjon a catalog modulban, ha üzleti fogalmat jelenít meg. Ne kerüljön általános UI package-be csak azért, mert vizuális.

---

## 42. Markdown, MDX és tartalomtemplate-ek

### 42.1. Opcionális capability

MDX nem minimal követelmény.

Telepítési példa:

```bash
pnpm add @next/mdx @mdx-js/loader @mdx-js/react @types/mdx
```

### 42.2. App Router komponensmap

```tsx
// mdx-components.tsx
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(
  components: MDXComponents,
): MDXComponents {
  return {
    ...components,
    h2: (props) => <h2 className="section-title" {...props} />,
  };
}
```

### 42.3. Lokális MDX

Buildtime vagy source-controlled MDX megbízhatósága magasabb, de plugin és JSX import továbbra is kódfuttatási felület.

### 42.4. Remote MDX veszély

A remote MDX nem egyszerűen „szöveg”: JSX-et és kódot tartalmazhat.

Tilos nem megbízható user contentet közvetlen MDX-ként fordítani vagy futtatni.

### 42.5. Untrusted Markdown

Untrusted Markdown esetén:

```text
Markdown parse
→ HTML AST
→ sanitization
→ allowlisted renderer
```

Raw HTML legyen alapértelmezetten tiltva vagy sanitizálva.

### 42.6. Plugin audit

Remark/rehype plugin:

- supply-chain dependency;
- buildtime code;
- AST-transzformáció;
- output security;
- performance.

Pinning, audit és fixture szükséges.

### 42.7. Frontmatter

A content frontmatter külön schema:

```ts
const articleFrontmatterSchema = z.object({
  title: z.string().min(1),
  publishedAt: z.iso.datetime(),
  description: z.string().max(300),
  draft: z.boolean().default(false),
}).strict();
```

### 42.8. Dinamikus import allowlist

Ne importálj tetszőleges slugból korlátozás nélkül. `generateStaticParams`, `dynamicParams = false` vagy explicit content registry használható.

---

## 43. Twig extensionök helyett presentation helperök

### 43.1. Pure helper

Twig `price` filter megfelelő:

```ts
export function formatPrice(
  amount: number,
  locale: string,
  currency: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
```

### 43.2. Component helper

Ha a kimenet strukturált markup:

```tsx
export function Price({
  amount,
  currency,
  locale,
}: PriceProps) {
  return (
    <data
      value={amount}
      data-currency={currency}
    >
      {formatPrice(amount, locale, currency)}
    </data>
  );
}
```

### 43.3. Route helper

Twig `path()` megfelelője route builder, nem általános template extension.

### 43.4. Business logic nem filter

Tilos:

```ts
export function calculateCustomerDiscount(
  customer: Customer,
): number {}
```

presentation helper könyvtárban.

### 43.5. Requestfüggő helper

Kerülendő:

```ts
export function currentUser() {
  return cookies().get('session');
}
```

globális presentation utilityben.

### 43.6. Helper dependency

Pure helper importálhat:

- standard libraryt;
- `Intl`;
- explicit config value objectot;
- presentation type-ot.

Ne importáljon:

- Prisma;
- DB;
- Next request API-t;
- auth store-t;
- queue-t;
- filesystemet, ha kliensbe kerülhet.

### 43.7. Helper teszt

Formatterhez:

- locale;
- currency;
- zero;
- negative;
- large number;
- invalid input;
- timezone;
- DST;
- Unicode

teszt szükséges.

---

## 44. Lazy betöltés és nehéz nézeti capability-k

### 44.1. Kliensoldali lazy import

Nehéz editor vagy chart:

```tsx
import dynamic from 'next/dynamic';

const RichEditor = dynamic(
  () => import('./rich-editor.client'),
  { ssr: false },
);
```

Az `ssr: false` csak Client Component kontextusban és valódi browser-only függésnél indokolt.

### 44.2. Server Component code splitting

Server Componenteknél normál route- és component splitet a framework kezeli. Ne alkalmazz kliens-dinamikus importot reflexből.

### 44.3. Lazy-loaded Twig extension megfelelő

Nehéz presentation adapter csak ott importálódjon, ahol használják.

Például:

```ts
const { renderChartSvg } =
  await import('./chart-svg-renderer.server');
```

### 44.4. Side effectes module init

Kerülendő:

```ts
const browser = await launchBrowser();
```

modulbetöltéskor.

Használj explicit factoryt és lifecycle-t.

### 44.5. Loading UI

Lazy klienskomponenshez:

- skeleton;
- min-height;
- error fallback;
- retry;
- accessibility status

szükséges.

### 44.6. Bundle budget

Nehéz komponensnél dokumentálni kell:

```text
initial JS delta
CSS delta
font/image delta
hydration time
interaction latency
fallback
```

---

## 45. Output escaping és XSS

### 45.1. React alapértelmezett escaping

String child:

```tsx
<p>Hello {name}</p>
```

React szövegként rendereli, nem raw HTML-ként.

Ha `name`:

```html
<script>alert(1)</script>
```

akkor nem scriptként fut.

### 45.2. Escaping nem teljes security solution

Külön validálni kell:

- URL protokoll;
- CSS URL;
- iframe `src`;
- SVG;
- script;
- JSON script context;
- HTML attribute semantics;
- DOM API;
- third-party component;
- Markdown/MDX.

### 45.3. `dangerouslySetInnerHTML`

```tsx
<div
  dangerouslySetInnerHTML={{
    __html: sanitizedHtml.value,
  }}
/>
```

Csak auditált trusted type vagy sanitizált wrapper fogadható el.

### 45.4. Branded trusted HTML

```ts
declare const trustedHtmlBrand: unique symbol;

export type TrustedHtml = Readonly<{
  value: string;
  [trustedHtmlBrand]: true;
}>;
```

A constructort/exportot korlátozni kell:

```ts
export interface HtmlSanitizer {
  sanitize(input: string): TrustedHtml;
}
```

### 45.5. Sanitizer policy

Dokumentálni kell:

- engedélyezett tagek;
- engedélyezett attribútumok;
- URL protokollok;
- iframe policy;
- style policy;
- SVG policy;
- link `rel`;
- image source;
- max input méret;
- parser library verzió.

### 45.6. Double escaping

Már HTML entityzett string normál JSX textként duplán escaped lehet. A megoldás nem automatikusan raw HTML, hanem a data contract tisztázása.

### 45.7. DOM-based XSS

Client Componentben kerülendő:

```ts
element.innerHTML = userValue;
document.write(userValue);
eval(userValue);
new Function(userValue);
```

### 45.8. Template injection

User input nem válhat:

- komponensnévvé allowlist nélkül;
- dinamikus import pathszá;
- MDX kóddá;
- CSS selector vagy rule stringgé;
- script bodyvá;
- raw React element factory inputtá.

---

## 46. Trusted HTML, CSP és script-injekció

### 46.1. Defense in depth

Az escaping mellett CSP:

- script source;
- style source;
- image source;
- font source;
- object source;
- frame ancestors;
- form action;
- base URI

korlátozást ad.

### 46.2. Nonce trade-off

Requestenkénti nonce szigorú CSP-t tesz lehetővé, de dinamikus renderelési és cache-költséget okozhat.

A projektnek választania kell:

```text
nonce-alapú strict CSP
vagy
statikus/hash-alapú stratégia
vagy
szigorú origin allowlist megfelelő trade-offokkal
```

### 46.3. Nonce ne kerüljön üzleti view modelbe

A nonce request-level rendering concern.

### 46.4. JSON script

Ha strukturált adatot `<script type="application/ld+json">` blokkba teszünk:

- megbízható serializer;
- `<` és script-end sequence kezelés;
- minimális publikus adatok;
- schema validation

szükséges.

### 46.5. `next/script`

User inputból script URL nem adható.

### 46.6. Inline event attribútum

React event handler functiont használ, ne generálj `onclick="..."` stringet.

### 46.7. CSP teszt

Production E2E ellenőrizze:

- header jelenlét;
- nonce/hash formátum;
- tiltott inline script blokkolása;
- third-party script allowlist;
- report-only és enforcing különbség;
- dev/prod eltérés.

---

## 47. Akadálymentesség

### 47.1. Szemantikus HTML

Használj:

```text
header
nav
main
section
article
aside
footer
button
a
form
label
fieldset
legend
table
```

megfelelő jelentéssel.

### 47.2. Button vs link

- navigáció: `<a>` / `Link`;
- művelet: `<button>`;
- ne cseréld fel styling miatt.

### 47.3. Heading hierarchy

Minden page-nek legyen érthető főcíme. A komponens ne feltételezze vakon, hogy mindig `h2` kell; szükség lehet `headingLevel` vagy komponenskompozíció contractra.

### 47.4. Form label

Placeholder nem label.

### 47.5. Focus

Modal, dialog, route transition és error után:

- focus placement;
- focus trap;
- focus restore;
- keyboard close;
- skip link

tesztelendő.

### 47.6. Loading

```tsx
<div role="status" aria-live="polite">
  Loading orders…
</div>
```

Ne legyen minden skeleton zajos screen reader számára.

### 47.7. Error

Hiba summary és field error programmatikusan kapcsolódjon az inputhoz.

### 47.8. Kép

Minden információs képnek megfelelő `alt`; dekoratív kép `alt=""`.

### 47.9. Szín

Információ ne csak színnel legyen jelölve.

### 47.10. Component test

Accessibility automation hasznos, de nem helyettesíti:

- keyboard;
- screen reader;
- zoom;
- contrast;
- reduced motion;
- focus order

manuális ellenőrzését.

---

## 48. Lokalizáció és többnyelvű nézetek

### 48.1. Locale explicit

A locale:

- route param;
- domain;
- user preference;
- tenant config;
- Accept-Language fallback

alapján oldható fel.

### 48.2. Translation key

```ts
type TranslationKey =
  | 'product.list.title'
  | 'product.empty.title'
  | 'product.empty.description';
```

### 48.3. Translation adapter

```ts
export interface Translator {
  translate(
    key: TranslationKey,
    parameters?: Readonly<Record<string, string | number>>,
  ): string;
}
```

### 48.4. Server vagy client translation

A projekt válasszon következetesen:

- szerveroldali string projection;
- message dictionary átadás;
- client i18n provider;
- hibrid modell.

Ne adj át teljes, minden nyelvű dictionaryt minden Client Componentnek.

### 48.5. Rich translation

HTML string helyett komponensslot:

```tsx
<Trans
  id="legal.acceptance"
  components={{
    terms: <Link href={legalRoutes.terms()} />,
  }}
/>
```

csak megbízható library és explicit component allowlist mellett.

### 48.6. Plural

`Intl.PluralRules` vagy i18n library. Kézi `count === 1` nem minden nyelvre helyes.

### 48.7. Locale-formázás

Dátum, szám, pénz és listák ugyanazt a validált locale-t használják.

### 48.8. RTL

A root/nested layout állítsa:

```tsx
<html lang={locale} dir={direction}>
```

A CSS és icon irány is tesztelendő.

### 48.9. Missing translation

Production policy:

- fail build kritikus keynél;
- fallback locale;
- telemetry;
- látható key csak devben.

---

## 49. Loading, error és not-found nézetek

### 49.1. `loading.tsx`

Route-szegmens instant fallback.

### 49.2. `error.tsx`

Error boundary általában Client Component.

```tsx
'use client';

export default function ErrorPage({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <ErrorState
      title="Something went wrong"
      onRetry={reset}
    />
  );
}
```

### 49.3. Ne renderelj stack trace-t

Production UI-ban tilos:

```tsx
<pre>{error.stack}</pre>
```

### 49.4. Digest/request ID

Biztonságos support reference mutatható:

```text
Reference: 01J...
```

amely loghoz köthető, de nem tartalmaz internalsot.

### 49.5. `not-found.tsx`

```tsx
export default function NotFound() {
  return (
    <NotFoundState
      title="Product not found"
      homeHref="/products"
    />
  );
}
```

### 49.6. Lokális boundary

Modul route saját loading/error/not-found nézetet kaphat.

### 49.7. Error taxonomy

Presentation mapping:

| Hiba | UI |
| --- | --- |
| invalid route input | 400/404 contract szerint |
| resource missing | not-found |
| forbidden | biztonsági policy szerinti UI/404 |
| conflict | conflict state |
| validation | field/form error |
| infrastructure outage | generic retry state |
| programmer error | error boundary + log |

---

## 50. Hibakeresés és lintelés

### 50.1. Alapparancsok

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 50.2. Typegen

Route-aware típusokat generálhat Page, Layout és Route Handler használatához.

### 50.3. ESLint

Ellenőrizheti:

- React hooks;
- Next convention;
- image/link használat;
- importhatárok;
- accessibility plugin, ha telepített;
- no-floating-promise;
- no-explicit-any;
- dangerous HTML policy.

### 50.4. Production build

A build észlelhet:

- TSX szintaxist;
- hiányzó importot;
- server/client boundary problémát;
- route collisiont;
- metadata hibát;
- statikus render problémát;
- CSS ordering/build hibát;
- nem támogatott browser/server importot.

### 50.5. Debug output

Fejlesztéskor:

```ts
console.debug({
  component: 'ProductListPage',
  resultCount: model.products.length,
});
```

Csak strukturált, redaktált adat.

Tilos:

```tsx
<pre>{JSON.stringify(user, null, 2)}</pre>
```

productionban.

### 50.6. React DevTools

Client Component state és render vizsgálatára használható. Server Component adatfolyamot application loggal, tracinggel és teszttel kell vizsgálni.

### 50.7. Forge view-parancsok

```bash
pnpm forge view:list
pnpm forge view:inspect ProductListView
pnpm forge view:check
pnpm forge view:contracts
pnpm forge view:assets
```

Jelenlegi feladatuk:

- Server/Client/static classification;
- props- és view-model contract;
- route usage és route-builder kapcsolat;
- importhatár és normatív `VIEW_*` hibák;
- dangerous HTML és URL-kockázatok;
- image, stylesheet, font, script és statikus asset inventory;
- kapcsolódó unit tesztek feltérképezése;
- determinisztikus generált view-dokumentáció és drift detection.

Az accessibility automatizálás, visual regression és bundle budget külön release-kapu; ezeket a statikus Forge inventory nem állítja teljeskörűen elő.

### 50.8. Storybook vagy preview

Opcionális capability. A preview fixture:

- ne importáljon production adatbázist;
- determinisztikus view modelt használjon;
- minden állapotot lefedjen;
- security-sensitive UI-t se tekintsen authorizációnak.

---

## 51. Tesztelési stratégia

### 51.1. Presenter unit teszt

```ts
describe('presentProductList', () => {
  it('lokalizált price labelt készít', () => {
    // ...
  });

  it('nem ad át belső mezőt', () => {
    // ...
  });
});
```

### 51.2. Pure component teszt

Ellenőrzi:

- heading;
- empty state;
- list item;
- aria label;
- link;
- conditional element;
- escaped text.

### 51.3. Server Component teszt

Egyszerű Server Component közvetlenül renderelhető lehet tesztkörnyezetben. Async Page és framework API esetén gyakran integrációs/E2E teszt stabilabb.

### 51.4. Client Component teszt

- event;
- state;
- keyboard;
- focus;
- disabled;
- optimistic state;
- error recovery.

### 51.5. Layout teszt

- children elhelyezés;
- slot;
- navigation shell;
- locale/dir;
- provider boundary;
- auth gate;
- metadata.

### 51.6. Email snapshot

Snapshot csak strukturált assertion mellett.

Ellenőrizendő:

- subject;
- text;
- absolute links;
- escaped user input;
- required legal footer;
- locale;
- template version.

### 51.7. Visual regression

Hasznos:

- design system;
- critical checkout;
- email;
- PDF;
- responsive layout;
- dark theme;
- RTL.

### 51.8. Accessibility teszt

Automation + manuális forgatókönyv.

### 51.9. Security negatív teszt

```text
<script> input textként jelenik meg
javascript: link elutasítva
raw HTML sanitizálva
restricted image host elutasítva
secret nem kerül client propsba
stack trace nem jelenik meg
```

### 51.10. Production E2E

- full navigation;
- streaming fallback;
- JS disabled critical content;
- hydration warning hiánya;
- responsive image;
- CSP;
- error/not-found;
- locale;
- tenant theme;
- client interaction.

---

## 52. Teljesítmény, hydration és bundle-határ

### 52.1. Server-first

A szerveren maradó presentation komponens nem növeli közvetlenül a kliens JS bundle-t ugyanúgy, mint egy Client Component.

### 52.2. Kliensfüggőség fertőzése

Egy túl magas `"use client"` határ sok child importot kliensbe emelhet.

### 52.3. Props méret

Nagy view model RSC payloadot és hydration költséget okozhat.

Ne adj át:

- több ezer sort lapozás nélkül;
- teljes rich text több helyen;
- nem használt relationöket;
- teljes translation dictionaryt;
- binary/base64 assetet.

### 52.4. Hydration mismatch okok

- `Date.now()` renderben;
- `Math.random()` renderben;
- locale/timezone eltérés;
- browser-only condition SSR alatt;
- invalid HTML nesting;
- user-specific extension;
- theme első render;
- nem determinisztikus ID;
- kliens és szerver eltérő data snapshot.

### 52.5. `suppressHydrationWarning`

Escape hatch, nem általános megoldás. Csak kis, indokolt és dokumentált eltérésre.

### 52.6. Random és idő

Szerverről explicit értéket adj:

```tsx
<ClientClock initialTimestamp={timestamp} />
```

### 52.7. Komponens granularitás

Túl sok apró wrapper növeli a komplexitást; túl nagy komponens nehezen tesztelhető.

Határ szempontok:

- önálló felelősség;
- újrafelhasználás;
- server/client boundary;
- async boundary;
- cache boundary;
- accessibility unit;
- design system primitive.

### 52.8. Bundle mérés

Kritikus Client Componenthez bundle budget és build report ajánlott.

### 52.9. Image/font/script budget

Presentation performance nem csak JS:

```text
image bytes
font subsets
CSS
third-party script
server render latency
RSC payload
client hydration
```

### 52.10. Streaming trade-off

Streaming javíthatja a gyors első megjelenést, de:

- túl sok fallback villoghat;
- proxy bufferelhet;
- státusz későn nem módosítható;
- fragment waterfall keletkezhet;
- telemetry kell.

---

## 53. Ajánlott projektstruktúra

```text
src/
  app/
    layout.tsx
    globals.css

    (public)/
      layout.tsx
      products/
        page.tsx
        loading.tsx
        error.tsx
        [productId]/
          page.tsx
          not-found.tsx

    (admin)/
      layout.tsx
      admin/
        products/
          page.tsx

  modules/
    catalog/
      product/
        domain/
        application/
          dto/
          queries/
          commands/
          ports/
        infrastructure/
        presentation/
          product-list-view.tsx
          product-detail-view.tsx
          product-card.tsx
          product-filters.client.tsx
          product-list.view-model.ts
          product-detail.view-model.ts
          product.presenter.ts
          routes.ts
          email/
            product-back-in-stock-email.tsx
            product-email.renderer.ts

  platform/
    ui/
      button.tsx
      card.tsx
      dialog.client.tsx
      empty-state.tsx
      fonts.ts
      styles/
    i18n/
    security/
    config/

content/
  legal/
  help/

public/
  brand/
  downloads/
```

### 53.1. Modul public API

```text
index.server.ts
index.client.ts
```

különítheti el a szerver- és kliensbiztonságos exportokat.

### 53.2. Presentation függési irány

```text
presentation
  → application DTO/type
  → pure formatter
  → platform UI primitive

presentation TILOS
  → infrastructure repository
  → Prisma
  → database client
```

### 53.3. Platform UI nem ismeri a domaint

```text
Button
Card
Dialog
Table primitive
```

keresztmodulos.

```text
ProductPrice
OrderStatusBadge
InvoiceSummary
```

modul presentation.

---

## 54. Biztonsági és architekturális ellenőrzések

### 54.1. Kötelező szabályok

A Forge `view:check` hibát jelez, ha:

- Client Component server-only modult importál;
- presentation közvetlen ORM-et importál;
- generic UI component application queryt hív;
- Server Component saját `/api` endpointot fetch-el;
- domain aggregate Client Component prop;
- `dangerouslySetInnerHTML` trusted wrapper nélkül;
- raw `process.env` presentation komponensben;
- user-controlled dinamikus import path;
- user URL protokollvalidáció nélkül;
- secret Client Component propba kerül;
- raw error/stack trace renderelődik;
- user CSS/script string kerül a DOM-ba;
- `img` információs képnél alt nélkül;
- random key vagy index key dinamikus listában;
- `use client` indokolatlanul magas boundaryn;
- view model túl széles ORM/domain typet aliasol.

### 54.2. Implementált hibakódok

```text
VIEW_DIRECT_ORM_IMPORT
VIEW_DOMAIN_ENTITY_PROP
VIEW_SERVER_IMPORT_IN_CLIENT
VIEW_INTERNAL_HTTP_FETCH
VIEW_DANGEROUS_HTML
VIEW_UNTRUSTED_URL
VIEW_DYNAMIC_IMPORT_PATH
VIEW_PROCESS_ENV_ACCESS
VIEW_SECRET_PROP
VIEW_RAW_ERROR_OUTPUT
VIEW_MISSING_IMAGE_ALT
VIEW_UNSTABLE_LIST_KEY
VIEW_GLOBAL_CLIENT_BOUNDARY
VIEW_EMAIL_BROWSER_API
VIEW_UNSAFE_MDX_SOURCE
VIEW_NAMESPACE_SHADOWING
```

### 54.3. `dangerouslySetInnerHTML` allowlist

A check engedheti, ha:

- prop type `TrustedHtml`;
- sanitizer adapterből származik;
- fájl explicit security review listán van;
- test fixture létezik.

### 54.4. Architecture fixture

Pozitív:

```tsx
export function ProductName({
  name,
}: Readonly<{ name: string }>) {
  return <span>{name}</span>;
}
```

Negatív:

```tsx
import { db } from '@/platform/database/client';

export async function ProductName() {
  const product = await db.product.findFirst();
  return <span>{product?.name}</span>;
}
```

---

## 55. Implementációs elfogadási kritériumok

Egy Winzard template/presentation implementation elfogadható, ha:

1. a Page, Layout és komponens felelőssége dokumentált;
2. a nézet explicit propsot vagy view modellt kap;
3. nincs közvetlen ORM/domain aggregate átadás;
4. a Server/Client boundary minimális;
5. klienspropok biztonságosak és szükségesek;
6. linkek route buildert vagy validált URL-t használnak;
7. asset-, image-, font- és script-policy teljesül;
8. minden információs képnek megfelelő altja van;
9. raw HTML csak sanitizált trusted wrapperrel jelenik meg;
10. user-controlled dinamikus import nincs;
11. aszinkron fragmentnek loading/error/cache contractja van;
12. saját API szerveroldali fetch nincs;
13. Page és API ugyanazt az application use case-t használhatja;
14. email output abszolút linket és text fallbacket ad;
15. locale/timezone/currency explicit;
16. hydration szempontból determinisztikus az első render;
17. accessibility alaptesztek teljesülnek;
18. typecheck, lint és unit teszt zöld;
19. production build zöld;
20. kritikus UI E2E vagy visual evidence-del rendelkezik;
21. security negatív esetek teszteltek;
22. dokumentáció és view contract együtt frissült.

### 55.1. Minimális ellenőrzés

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm forge check
pnpm build
```

### 55.2. Presentation contract ellenőrzés

```bash
pnpm forge view:check --project apps/reference
pnpm forge view:contracts --check --project apps/reference
pnpm forge view:assets --check --project apps/reference
pnpm verify:views
```

---

## 56. Hibaelhárítás

### 56.1. „Event handlers cannot be passed…”

Ok: Server Componentből kliensoldali event handlert próbálsz átadni normál propként.

Megoldás:

- emeld a legkisebb interaktív részt Client Componentbe;
- Server Actiont csak támogatott form/action contractban használj;
- ne alakítsd az egész Page-et klienskomponenssé automatikusan.

### 56.2. „You're importing a component that needs server-only…”

Ok: Client Component szervermodult importál.

Megoldás:

- bontsd szét `index.server.ts` és `index.client.ts` exportokra;
- adj át serializable DTO-t;
- tartsd a queryt a szerveren.

### 56.3. Hydration mismatch

Vizsgáld:

```text
Date.now
Math.random
timezone
locale
theme
invalid nesting
browser-only branch
extension-modified DOM
non-deterministic ID
```

### 56.4. CSS másképp működik productionben

- ellenőrizd import-sorrendet;
- ne auto-sortold vakon a CSS importot;
- vizsgáld a chunkingot;
- futtasd a production buildet;
- nézd meg a specificityt.

### 56.5. Kép nem töltődik

- `remotePatterns`;
- protocol/hostname/path;
- width/height;
- auth header hiánya;
- CSP `img-src`;
- signed URL expiry;
- object storage CORS.

### 56.6. Layout nem renderelődik újra

Ez lehet elvárt persistent layout behavior. Ha remount kell, vizsgáld a `template.tsx` használatát, de ne használd üzleti state resetre.

### 56.7. Suspense fallback nem jelenik meg minden navigációnál

Persistent layout boundary csak első loadnál viselkedhet így. `template.tsx` vagy közelebbi Suspense boundary lehet szükséges.

### 56.8. Raw HTML duplán escaped

Tisztázd:

- plain text-e;
- entityzett string-e;
- sanitizált HTML-e;
- ki a contract tulajdonosa.

Ne válts automatikusan `dangerouslySetInnerHTML`-re.

### 56.9. Emailben törött link

Relatív URL helyett explicit public origin és route builder szükséges.

### 56.10. Email renderben Client Component hiba

Email komponens ne használjon browser hookot vagy Next navigation komponenst.

### 56.11. Dynamic import nem találja a fájlt

Cseréld explicit registryre. Runtime slug ne legyen file path.

### 56.12. Túl nagy kliens bundle

- csökkentsd a `"use client"` határt;
- lazy load nehéz widgetet;
- tartsd a formatálást szerveren;
- ne add át a teljes data graphot;
- vizsgáld third-party package-eket.

### 56.13. Szerverkomponens lassú

- N+1 query;
- waterfall;
- hiányzó bulk query;
- rossz cache;
- metadata duplikáció;
- túl sok fragment;
- slow origin;
- serialization méret;
- log/tracing.

### 56.14. XSS CSP mellett is

CSP defense in depth, nem sanitization-helyettesítő. Vizsgáld raw HTML, URL, SVG, script és DOM sink útvonalakat.

---

## 57. Symfony–Winzard megfeleltetési táblázat

| Symfony template fogalom | Winzard megfelelő | Megjegyzés |
| --- | --- | --- |
| Twig Bundle telepítés | React/Next beépített presentation baseline | külön engine nem kell |
| Twig template | TSX React-komponens | webes nézethez |
| `templates/` | `src/app`, modul `presentation`, UI package | ownership szerint |
| két extension | explicit renderer/content type | HTML, email, XML külön contract |
| template változó | typed prop/view model | nincs magic getter |
| `{{ }}` | JSX `{}` | React escaping |
| `{% if %}` | JS condition | presentation logika |
| `{% for %}` | `.map()` | stabil key |
| filter | pure formatter/helper | domainlogika nélkül |
| function | helper/route builder | explicit import |
| `path()` | route builder + `Link` | típusos URL |
| `url()` | origin resolver + route builder | abszolút URL |
| `asset()` | public/static import/Image/Font | assettípus szerint |
| `app.user` | Viewer view model | minimális adat |
| `app.request` | entrypoint request mapping | teljes Request nem props |
| `app.session` | session adapter | nézetnek DTO |
| `app.flashes` | FlashMessageStore + komponens | consume contract |
| global variable | explicit config/layout/provider | secret nélkül |
| `include()` | komponens explicit propsokkal | nincs implicit context |
| `extends` | nested layout | route tree |
| block | `children`, slot, component prop | explicit kompozíció |
| Twig Component | React Server/Client Component | kategorizált |
| Live Component | Client island + server mutation | auth/validation kötelező |
| controller embedding | direct application query composition | own API fetch tiltott |
| hinclude | Suspense/stream vagy client fragment | use case szerint |
| `render()` controllerből | Page JSX return | web page |
| `renderView()` | static renderer adapter | nem hidratálható output |
| render service-ből | HtmlRenderer port/adapter | application React-független |
| email Twig | email React renderer capability | text + html |
| route template controller | statikus `page.tsx` | file-system route |
| template exists | compile-time import/registry | user path tiltott |
| `lint:twig` | typecheck + lint + build | plusz Forge view check |
| `debug:twig` | `forge view:list` és `forge view:inspect` | explicit import graph |
| `dump()` | redaktált log/DevTools | production PII tiltott |
| autoescape | React text escaping | raw HTML külön veszély |
| `raw` | `dangerouslySetInnerHTML` | csak TrustedHtml |
| Twig namespace | package export/path alias | nincs shadow search |
| bundle template | package component/recipe asset | explicit ownership |
| bundle override | override registry/extension point | kompatibilitási contract |
| Twig extension | pure presentation helper | külön teszt |
| lazy runtime extension | lazy adapter/dynamic import | side effect nélkül |

---

## 58. Források és attribúció

### 58.1. Symfony referencia

- [Creating and Using Templates](https://symfony.com/doc/current/templates.html)
- [Twig documentation](https://twig.symfony.com/doc/)
- [Symfony Routing](https://symfony.com/doc/current/routing.html)
- [Symfony Controllers](https://symfony.com/doc/current/controller.html)
- [Symfony Mailer](https://symfony.com/doc/current/mailer.html)
- [Symfony UX Twig Components](https://symfony.com/bundles/ux-twig-component/current/index.html)

A Winzard dokumentum nem másolja a Twig runtime API-ját. A témák, problémák és biztonsági célok teljes megfelelőjét adja React/Next.js környezetben.

### 58.2. Next.js hivatalos dokumentáció

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [File-system conventions](https://nextjs.org/docs/app/api-reference/file-conventions)
- [`template.tsx` convention](https://nextjs.org/docs/app/api-reference/file-conventions/template)
- [`loading.tsx` and streaming](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [CSS](https://nextjs.org/docs/app/getting-started/css)
- [Image component](https://nextjs.org/docs/app/api-reference/components/image)
- [Font module](https://nextjs.org/docs/app/api-reference/components/font)
- [Script component](https://nextjs.org/docs/app/api-reference/components/script)
- [Public folder](https://nextjs.org/docs/app/api-reference/file-conventions/public-folder)
- [Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [MDX guide](https://nextjs.org/docs/app/guides/mdx)
- [Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)

### 58.3. React hivatalos dokumentáció

- [Passing Props to a Component](https://react.dev/learn/passing-props-to-a-component)
- [Conditional Rendering](https://react.dev/learn/conditional-rendering)
- [Rendering Lists](https://react.dev/learn/rendering-lists)
- [Server rendering: `renderToStaticMarkup`](https://react.dev/reference/react-dom/server/renderToStaticMarkup)
- [Common DOM components and `dangerouslySetInnerHTML`](https://react.dev/reference/react-dom/components/common)

### 58.4. Ellenőrzési baseline

```text
Ellenőrzés dátuma: 2026-07-18
Next.js baseline: 16.2.10
React baseline: 19.2.4
TypeScript baseline: 5.9.x
```

A Next.js és React Server Component, cache, CSP, MDX és asset API-k változhatnak. Dokumentációfrissítéskor újra ellenőrizni kell legalább:

- layout és `template.tsx` lifecycle;
- Server/Client Component serialization;
- metadata API;
- CSS chunking;
- Image remote policy;
- Font API;
- Script strategy;
- CSP nonce/SRI támogatás;
- MDX compiler és plugin compatibility;
- streaming és deployment support;
- route-aware type generation.

---

## Rövid végső összefoglalás

A Symfony Twig rendszerének Winzard megfelelője nem egy új template engine, hanem egy fegyelmezett presentation architektúra:

```text
explicit application result
→ explicit presenter
→ minimális view model
→ Server Component alapértelmezés
→ kis Client Component island
→ layout/slot/component kompozíció
→ biztonságos asset és HTML policy
→ typecheck, build, test és architecture check
```

A sablon nem lehet rejtett service container. A globális template context helyett explicit props, a controller subrequest helyett közös application query, az öröklés helyett layout és kompozíció, a raw HTML helyett sanitizált trusted contract, a dinamikus file lookup helyett explicit komponensregistry szükséges.

Ez adja azt a Symfonyhoz hasonló stabilitást, amelyben a nézeti réteg:

- könnyen olvasható;
- típusosan ellenőrizhető;
- biztonságos;
- külön tesztelhető;
- framework boundaryként kezelhető;
- nem szivárogtatja az ORM-et és a domainmodellt;
- ember és AI számára egyaránt explicit contractot ad.
