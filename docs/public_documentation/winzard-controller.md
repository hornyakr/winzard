---
title: "Controller- és delivery adapterek Winzard alkalmazásokban"
description: "A Next.js Page, Route Handler és Server Action Winzard-szerződése, a hozzájuk tartozó Forge diagnosztikával, generátorokkal és referenciaimplementációval."
status: "partially-implemented-specification"
document_version: "0.2.0"
last_verified: "2026-07-18"
source_basis: "Symfony Docs — Controller; Next.js App Router"
nextjs_baseline: "16.2.10"
applies_to: "kitelepített Winzard projektek és a Reference App delivery rétege"
---

# Controller- és delivery adapterek Winzard alkalmazásokban

## 1. Cél és implementációs státusz

A Winzardban nincs külön controller framework vagy `AbstractController`. A Next.js App Router marad az autoritatív request-dispatcher. Controller-szerepet három elsődleges entrypoint tölt be:

```text
Page          → HTML és React UI
Route Handler → explicit HTTP Request/Response
Server Action → React form- és UI-mutation
```

A normatív szabály:

> **A Page, Route Handler és Server Action vékony delivery adapter. Bizalmatlan inputot olvas és validál, aktort és műveleti inputot készít, application műveletet hív, majd explicit UI- vagy HTTP-választ képez. Üzleti szabályt, ORM-hozzáférést, tranzakciós workflow-t és infrastruktúra-wiringot nem birtokolhat.**

A repository jelenlegi implementációja **részleges, de futtatható**. Elkészült:

- Page-, Route Handler- és Server Action-inventory;
- delivery architecture és security checkek;
- Forge diagnosztikai parancsok;
- determinisztikus HTTP/UI contract dokumentáció;
- Page-, Route Handler-, Action-, operation- és vertical-slice generátor;
- RFC 9457-alapú Problem Details helper;
- explicit presenter;
- application command és policy;
- Zod-validált Server Action és React form;
- unit-, adapter- és E2E-ellenőrzések.

Külön későbbi platformscope marad a production session és flash adapter, fájl upload/download, Range request, általános streaming és SSE, CSRF/CORS platformadapter, tartós idempotency store, transaction/outbox integráció, tenant-aware referenciafolyamat és production authentikáció.

## 2. Réteghatárok

A kanonikus függőségi irány:

```text
page.tsx / route.ts / actions.ts
  → composition root
    → application query vagy command
      → port
        ← infrastructure adapter
```

Az application réteg nem importálhat:

```text
next/*
react
server-only
Prisma Client
pg
process.env
cookies()
headers()
```

Requestfüggő actor, tenant, locale és request ID explicit inputként jut az application művelethez. A composition root szerveroldali wiring, ezért `server-only` határt deklarál.

A delivery adapterben tilos:

- közvetlen Prisma/SQL hívás;
- saját `/api` endpoint HTTP-n történő hívása;
- több repository tranzakciós koordinációja;
- domain entity vagy ORM rekord közvetlen szerializálása;
- user inputból ellenőrizetlen redirect;
- nyers exception vagy Zod belső issue objektum publikálása;
- GET kérésből mutation indítása.

## 3. Page

A Page HTML/UI controller. React UI-t ad vissza, nem `Response`-ot.

```tsx
import { notFound } from 'next/navigation';

import { catalogModule } from '@/composition/catalog';
import { ProductView } from '@/modules/catalog/product/presentation/product-view';
import { productIdSchema } from '@/modules/catalog/product/presentation/product.schemas';

export default async function ProductPage(
  props: PageProps<'/products/[productId]'>,
) {
  const parsed = productIdSchema.safeParse((await props.params).productId);
  if (!parsed.success) notFound();

  const result = await catalogModule.queries.getProduct.execute({
    productId: parsed.data,
  });
  if (result.kind === 'not_found') notFound();

  return <ProductView product={result.product} />;
}
```

Kanonikus folyamat:

```text
params/searchParams
→ presentation schema
→ actor/context
→ application query
→ explicit result/DTO
→ notFound/redirect vagy React view
```

A Page renderelés közben cookie-t nem írhat. Client Component csak a legkisebb interaktív subtree legyen; kizárólag minimális, szerializálható DTO-t kaphat.

## 4. Route Handler

A Route Handler explicit HTTP controller a Web `Request` és `Response` API-val.

```ts
export async function POST(request: Request): Promise<Response> {
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return problem({
      type: 'https://example.invalid/problems/unsupported-media-type',
      title: 'Unsupported Media Type',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem({
      type: 'https://example.invalid/problems/malformed-json',
      title: 'Malformed JSON',
      status: 400,
      code: 'MALFORMED_JSON',
    });
  }

  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) return validationProblem(parsed.error, {
    type: 'https://example.invalid/problems/invalid-product',
    title: 'Invalid product',
    status: 422,
    code: 'PRODUCT_INVALID',
  });

  const result = await catalogModule.commands.createProduct.execute({
    actor: actorFromRequest(request),
    input: parsed.data,
  });

  return Response.json(toProductResponse(result.product), { status: 201 });
}
```

HTTP mapping:

| Helyzet | Státusz |
| --- | --- |
| hibás route/query szintaxis vagy malformed JSON | 400 |
| nincs authentikáció | 401 |
| ismert actor, tiltott művelet | 403 |
| erőforrás nem létezik | 404 |
| állapot- vagy verziókonfliktus | 409 |
| payload túl nagy | 413 |
| nem támogatott médiatípus | 415 |
| jól formált, de szemantikailag invalid payload | 422 |
| váratlan szerverhiba | 500 |

A request body stream és egyszer olvasható. A `Content-Type` ellenőrzése megelőzi a parsingot. A Route Handler nem ad vissza domain entityt; explicit presenter készíti a publikus DTO-t.

## 5. Server Action

A Server Action mutation controller. Ugyanúgy publikus támadási felületként kezelendő, mint egy API endpoint.

```ts
'use server';

export async function updateProductAction(
  _state: UpdateProductActionState,
  formData: FormData,
): Promise<UpdateProductActionState> {
  const parsed = updateProductSchema.safeParse({
    productId: formData.get('productId'),
    name: formData.get('name'),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await productModule.commands.updateProduct.execute({
    actor: await getActor(),
    ...parsed.data,
  });
  if (result.kind === 'forbidden') {
    return { ok: false, formError: 'A művelet nem engedélyezett.' };
  }

  revalidatePath(`/products/${parsed.data.productId}`);
  redirect(`/products/${parsed.data.productId}`);
}
```

Kötelező szabályok:

- actor és jogosultság minden híváskor újra feloldandó;
- hidden input nem actor-, role-, tenant- vagy árforrás;
- minden FormData mező bizalmatlan;
- a `redirect()` kontrollfolyam-interruptját általános `catch` nem nyelheti el;
- cache invalidation csak sikeres command után történhet;
- garantált side effecthez queue/outbox szükséges, nem `after()` vagy közvetlen Action-kód.

Modulszintű `'use server'` fájl csak async függvényeket exportálhat. A szerializálható action state külön fájlba helyezhető.

## 6. Input mapping

Minden operation saját sémát kap. Különbséget kell tenni a következők között:

```text
hiányzó érték
üres string
null
hibás numerikus érték
ismételt query paraméter
üres objektum
malformed JSON
```

Boolean query paraméternél tilos a `Boolean(value)` coercion, mert `Boolean('false') === true`. Explicit enum és transzformáció szükséges.

Route paraméter:

```text
raw string
→ schema
→ branded ID/slug/domain value
→ application query
```

Tilos az implicit route-paraméter → ORM entity injection.

FormData esetén az `Object.fromEntries()` elveszítheti a többértékű mezőket. Listához `formData.getAll()` szükséges. A HTML-validáció UX, nem security boundary.

## 7. Actor, authorizáció és tenant

Minden mutation entrypoint újra feloldja az aktort és erőforrás-szinten authorizál. A UI elrejtése nem authorizáció.

```text
request/session
→ auth adapter
→ minimális Actor
→ application command/policy
→ explicit success/forbidden/not_found/conflict result
```

Tenant ID nem származhat kizárólag bodyból vagy hidden inputból. Host, path vagy session alapján feloldott scope-ot az application policy és a repository lekérdezés is alkalmazza.

A 404 használható existence concealmentre, ha az endpoint contract ezt dokumentálja.

## 8. Output, Problem Details és cache

JSON-válasz csak explicit DTO:

```ts
return Response.json(toProductResponse(result.product));
```

A presenter határozza meg a Date, BigInt, enum, null és relation formátumát, és megakadályozza a PII/secret vagy teljes ORM graph kiszivárgását.

Problem Details alapforma:

```ts
type HttpProblem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: Array<{ path: string; code: string; message: string }>;
};
```

Production válaszban nincs stack trace, SQL, filesystem path, belső classnév, secret vagy nyers exceptionüzenet.

User- vagy tenantfüggő válaszhoz public shared cache nem használható megfelelő scope nélkül. Mutation után revalidation csak sikeres application eredményre fut.

## 9. Session, fájlok és streaming contract

E területek a specifikáció részei, de a jelenlegi repositoryban még nem teljes platformimplementációk.

Session adapter mérlegeli a `HttpOnly`, `Secure`, `SameSite`, rotation, revocation, absolute és idle timeout szabályokat. Cookie írás csak Route Handlerből vagy Server Actionből, streamelés előtt történhet.

Feltöltésnél kötelező a méretlimit, MIME allowlist, magic-byte ellenőrzés, quota, malware/threat-model döntés és szerveroldali storage key. Nagy fájlhoz közvetlen object-storage upload ajánlott.

Letöltésnél object-storage redirect vagy kontrollált streaming Route Handler használható. A filename nem lehet filesystem path. Nagy média esetén Range, 206, 416, ETag és `Content-Range` kezelés szükséges.

Streaming és SSE előtt minden auth, authorizáció, validáció és resource lookup befejeződik. A stream alatt adatbázis-tranzakció nem maradhat nyitva; abort, cleanup, timeout és proxy buffering tesztelendő.

## 10. Forge parancsok

Implementált diagnosztika:

```bash
pnpm forge delivery:list --project apps/reference
pnpm forge delivery:inspect src/app/api/lucky/number/route.ts --project apps/reference
pnpm forge delivery:check --project apps/reference
pnpm forge http:contracts --check --project apps/reference
```

Implementált generátorok:

```bash
pnpm forge make:page catalog/product/show --project <PROJECT>
pnpm forge make:route-handler catalog/product/show --project <PROJECT>
pnpm forge make:action catalog/product/update --project <PROJECT>
pnpm forge make:operation catalog/product/get-product --project <PROJECT>
pnpm forge make:vertical-slice catalog/product/show --project <PROJECT>
```

A generátor támogatja a `--dry-run` és `--force` kapcsolót, idempotens újrafuttatást és kézzel eltérített fájl esetén konfliktusvédelmet. A generált skeleton kiindulópont; production actor, policy, domain invariáns és persistence adapter nem található ki automatikusan.

A generált contractok:

```text
docs/90-generated/delivery/delivery-map.md
docs/90-generated/delivery/http-contracts.md
docs/90-generated/delivery/security-status.md
```

## 11. Statikus delivery checkek

A Forge az alábbi hibakódokat implementálja:

```text
DELIVERY_PROCESS_ENV_ACCESS
DELIVERY_UNSAFE_REDIRECT
DELIVERY_RAW_ERROR_RESPONSE
DELIVERY_UNVALIDATED_BODY
DELIVERY_DOMAIN_ENTITY_RESPONSE
DELIVERY_GET_MUTATION
DELIVERY_UNSCOPED_TENANT_INPUT
DELIVERY_SESSION_WRITE_DURING_RENDER
DELIVERY_STREAM_BEFORE_AUTH
DELIVERY_SERVER_ACTION_EXPORT_INVALID
```

A statikus check bizonyítékot ad, de nem bizonyít teljes securityt. Nem helyettesíti a Next.js typegent, buildet, runtime negatív teszteket, production E2E-t, proxy/deployment ellenőrzést és manuális security review-t.

## 12. Tesztelés és Definition of Done

Minimális tesztpiramis:

```text
schema unit teszt
application command/query unit teszt
request mapper teszt
Route Handler adapterteszt
Server Action wiring teszt
architecture check
security negatív teszt
production E2E
```

Ellenőrzési workflow:

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:delivery
pnpm forge check --project apps/reference
pnpm build
pnpm test:e2e:reference
```

Egy delivery szelet akkor kész, ha az input validált, actor/tenant explicit, az application operation frameworkfüggetlen, az output presenter-alapú, a hibamapping és cache policy dokumentált, valamint a negatív auth és invalid-input esetek teszteltek.

## 13. Symfony–Winzard megfeleltetés

| Symfony | Winzard |
| --- | --- |
| controller method | Page, Route Handler vagy Server Action |
| `AbstractController` | nincs; explicit framework API és helper |
| `render()` | React Server Component és presentation DTO |
| `redirectToRoute()` | pure route builder + `redirect()` |
| `createNotFoundException()` | `notFound()` vagy explicit 404 Problem Details |
| service autowiring | explicit composition root és konstruktoros DI |
| request mapping attributes | operation-specifikus Zod schema |
| session/flash service | külön port és adapter |
| `json()` | `Response.json(explicitDto)` |
| automatikus serialization | explicit presenter |
| binary response | object-storage redirect vagy streaming Route Handler |
| EventStreamResponse | `ReadableStream` alapú SSE Route Handler |

## 14. Források

- Symfony Controller dokumentáció
- Next.js Route Handlers
- Next.js Forms and Server Actions
- Next.js Data Security és Authentication
- Next.js `redirect`, `notFound`, `cookies`, `headers`, `after`
- Web `Request`, `Response`, `ReadableStream`
- RFC 9457 Problem Details
- RFC 9110 HTTP Semantics

A Next.js request API-k, Server Action limitek és streaming deployment contractok változhatnak; verziófrissítéskor újra ellenőrizendők.
