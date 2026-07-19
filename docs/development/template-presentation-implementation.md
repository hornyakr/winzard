# Template- és presentation-platform implementáció

Ez a jegyzőkönyv a `docs/public_documentation/winzard-templates.md` normatív szerződésének futtatható Winzard-megvalósítását rögzíti.

## Megvalósított scope

- új `presentation-contract` capability a referenciaalkalmazásban, valamint a `minimal` és `webapp` sablonokban;
- statikus App Router- és presentation-inventory Page, Layout, `template.tsx`, loading, error, not-found, komponens, email és MDX/content besorolással;
- Server Component, Client Component és statikus content boundary felismerése;
- komponensnév, route, props type, propsmező, view model, route builder, async státusz, asset és kapcsolódó teszt feltérképezése;
- `view:list`, `view:inspect`, `view:check`, `view:contracts` és `view:assets` Forge parancs;
- idempotens, dry-run- és konfliktusvédett `make:view` generátor explicit view modellel, presenterrel, Server/Client komponenssel és opcionális email-rendererrel;
- determinisztikus view map, view contract, asset inventory és security status dokumentáció;
- a dokumentált `VIEW_*` security és architecture checkek, továbbá generic platform UI data-access és explicit view-model contract ellenőrzés;
- a `forge check` integrációja a `presentation-contract` capabilityhez;
- explicit `LuckyNumberViewModel` és presenter a reference appban;
- külön HTTP/Server Action response projection a klienshatárhoz;
- root és nested layout, route-level `template.tsx`, loading, error és not-found boundary;
- kis Client Component island és szerveroldali presentation komponens;
- típusos route builderek, stabil list key, accessibility contract és lokális `next/image` asset;
- presenter unit teszt, Forge inventory/check/docs/generator tesztek és capability-integrációs teszt;
- külön `verify:views` script és CI-kapu.

## Implementált Forge parancsok

```bash
pnpm forge view:list --project apps/reference
pnpm forge view:inspect LuckyNumberView --project apps/reference
pnpm forge view:check --project apps/reference
pnpm forge view:contracts --project apps/reference
pnpm forge view:contracts --check --project apps/reference
pnpm forge view:assets --check --project apps/reference
pnpm forge make:view catalog/product/product-card --dry-run --project apps/reference
pnpm forge make:view billing/invoice/payment-reminder --email --dry-run --project apps/reference
```

A listázó, inspectáló, checkelő és generáló parancsok `--json` outputot is támogatnak. A generátor `--force`, `--dry-run`, `--client` és `--email` opciókat kezel; a Client Component és email-template kombinációját fail-closed módon elutasítja.

## Architecture és security hibakódok

A Forge többek között az alábbi hibákat jelzi:

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
VIEW_GENERIC_UI_DATA_ACCESS
VIEW_MODEL_MISSING
VIEW_DOC_MISSING
VIEW_DOC_DRIFT
```

## Generált bizonyíték

A reference app determinisztikus projekciói:

```text
apps/reference/docs/90-generated/views/view-map.md
apps/reference/docs/90-generated/views/view-contracts.md
apps/reference/docs/90-generated/views/view-assets.md
apps/reference/docs/90-generated/views/security-status.md
```

A fájlok inventory SHA-256 értéket tartalmaznak. A `view:contracts --check` hiány vagy drift esetén hibával áll le.

## Normatív dokumentum integritása

A teljes, 58 fejezetes specifikáció ellenőrzött SHA-256 értéke:

```text
9c8a6e82c4a4a2b938d749b1ce060b91fb7ff9cdd68f34450689feb3d6630ca3
```

Az ellenőrzés kiterjed a YAML front matterre, a folyamatos fejezetszámozásra, a tartalomjegyzék anchorjaira, a kódfence-ek párosságára, a JSON-példák szintaxisára és a trailing whitespace hiányára.

## Statikus diagnosztika határa

A Forge AST- és forrásszintű diagnosztikája buildidőben jól azonosítható, normatív veszélyes mintákat keres. Nem helyettesíti a Next.js typegent és production buildet, a böngészős accessibility- és visual-regression tesztet, a CSP deployment-konfigurációt, a runtime authorizációt, a sanitizer biztonsági felülvizsgálatát vagy az email-kliens kompatibilitási tesztet. Ezek továbbra is az adott capability és alkalmazás release-kapujának részei.

## Ellenőrzés

```bash
pnpm typegen
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:routing
pnpm verify:delivery
pnpm verify:views
pnpm forge check --project apps/reference
pnpm build
pnpm test:e2e:reference
```
