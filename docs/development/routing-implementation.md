# Routing implementáció

Ez a jegyzőkönyv a `docs/public_documentation/winzard-routing.md` specifikáció első futtatható kódszintű megvalósítását rögzíti.

## Megvalósított scope

- statikus App Router route inventory a `src/app` fájlrendszerből;
- route group-, parallel slot-, dinamikus-, catch-all- és intercepting-szegmens felismerés;
- Page és Route Handler entrypointok, HTTP-metódusok, runtime és boundary chain feltérképezése;
- egyszerű, statikus `next.config` redirect- és rewrite-inventory;
- `route:list`, `route:inspect`, HTTP-metódussal szűrhető `route:match`, `route:check`, `route:aliases` és `route:docs` Forge parancs;
- route collision, page/handler conflict, hiányzó dinamikus input schema, túl széles catch-all és alias hibák ellenőrzése;
- determinisztikus route map, redirect map és routing check dokumentáció;
- a `demo/lucky-number` referencia dinamikus path- és query route-okkal;
- műveletspecifikus Zod schema;
- pure, típusos route builder;
- permanent és transitional redirect alias;
- not-found és API 400 error mapping;
- jogosultságvédett POST Route Handler explicit application policyval;
- unit-, architecture- és production E2E tesztek.

## Nem cél

A Forge nem dispatchol requestet, nem helyettesíti a Next.js buildet, és a `route:match` eredménye nem production routinggarancia. Proxy által végzett runtime rewrite, encoded edge case és framework-internal prioritás esetén a Next.js a mérvadó.

## Ellenőrzés

```bash
pnpm forge route:list --project apps/reference
pnpm forge route:match /lucky/number --method=GET --project apps/reference
pnpm forge route:check --project apps/reference
pnpm forge route:docs --check --project apps/reference
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e:reference
```
