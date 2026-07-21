# HTTP-kernel és request–response lifecycle implementáció

Ez a jegyzőkönyv a `docs/public_documentation/winzard-http-kernel.md` specifikáció kódszintű megvalósítását rögzíti.

## Megvalósított scope

- `http-kernel` capability és recipe;
- adjacent, runtime-validált Page-, Route Handler- és Server Action contractok;
- explicit, resolver-portokra épülő immutable `RequestContext` és szűkebb `ApplicationContext`;
- Proxy által sanitizált `x-winzard-*` request-ID/locale/origin bridge;
- Route Handler lifecycle wrapper deklarált method-, auth-, tenant-, rate-limit-, CSRF-, idempotency-, body-limit-, response-policy- és telemetry-fázissal;
- byte-alapú JSON body reader tényleges méretlimittel, AbortSignal-kezeléssel és reader cleanuppal;
- RFC 9457-kompatibilis, request-ID-t tartalmazó Problem Details mapping;
- stream commit előtti központi response-policy;
- kizárólag best-effort telemetryt futtató `after()` adapter, alternatív microtask-fallback nélkül;
- redaktált `instrumentation.ts` `register()` és `onRequestError()` hook;
- Forge kernel inventory, graph, inspection, architecture/security check és determinisztikus lifecycle dokumentáció;
- `--changed-from` gyorsított kernelcheck;
- lifecycle-aware delivery inventory és generator;
- reference app, minimal template és webapp template integráció;
- publikus Winzard consumer contract.

## Tudatos határok

Nem készült második runtime router, globális EventDispatcher vagy custom Next.js server. A név szerinti rate-limit policy csak explicit `RateLimitExecutor`, a required idempotencia pedig csak explicit durable `IdempotencyExecutor` adapterrel futtatható; a referenciaalkalmazás `idempotency: none` contractot használ; látszat-idempotencia nem került be. Egy későbbi mutation csak valódi durable `IdempotencyExecutor` adapterrel deklarálhat optional vagy required idempotenciát. Queue/outbox, production authentikáció, tenant registry, SSE framework és distributed cache külön capability marad.

A RequestContext `receivedAt` mezője branded ISO-8601 string. JavaScriptben egy `Date` objektum `Object.freeze()` után is mutálható a saját setter metódusaival, ezért a string contract ad tényleges immutable értéket.

## Ellenőrzési felület

```bash
pnpm forge kernel:graph --project apps/reference
pnpm forge kernel:inspect /api/lucky/number --method=POST --project apps/reference
pnpm forge kernel:check --project apps/reference
pnpm forge request-context:check --project apps/reference
pnpm forge response-policy:check --project apps/reference
pnpm forge instrumentation:check --project apps/reference
pnpm forge lifecycle:docs --check --project apps/reference
pnpm verify:kernel
```

## Következő szakasz

A teljes typecheck, lint, unit/architecture, generator, production build, E2E, template és database ellenőrzés a külön tesztelési-javítási szakaszban fut.
