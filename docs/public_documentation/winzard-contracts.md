---
title: "Contract governance és interoperabilitási határok Winzardban"
description: "A Winzard statikus contract inventoryjának, provider evidence modelljének, kompatibilitási ellenőrzésének és referencia-tesztelésének implementációs leírása."
status: "implemented-draft"
document_version: "0.1.0"
source_specification_sha256: "b1e88bad9ffa4b4d73112b0b4c054868018ddc2f17e624b8ce360e2e708233b9"
---

# Contract governance és interoperabilitási határok Winzardban

## Normatív alapelv

Egy Winzard contract nem pusztán TypeScript interface. A stabil típusfelület, a runtime validáció, a normatív viselkedés, a hibamodell, a security- és lifecycle-szabály, a kompatibilitási policy, valamint a referencia-tesztek együtt alkotják a szerződést.

A megvalósítás nem vezet be globális `@winzard/contracts` god package-et, runtime reflectiont, interface-scant, autowiringot vagy általános service locatort. A contractokat explicit TypeScript definition fájlok deklarálják, a provider-kapcsolatot statikus metadata és composition service ID rögzíti, a Forge pedig determinisztikus inventoryt és evidence-et készít.

## Autoritatív források

| Kérdés | Autoritatív forrás |
| --- | --- |
| Contract és provider metadata | `*.contract.definition.ts`, `*.contract-provider.ts` |
| Compile-time shape | A deklarált TypeScript source és export |
| Runtime adatvalidáció | A deklarált runtime schema |
| Viselkedés | A contract dokumentáció |
| Provider megfelelőség | A reference suite |
| Kompatibilitás | A generált contract manifest és a Git-baseline diff |
| Startup megfelelőség | A generált registry runtime validációja |

A definition, source, dokumentáció, reference suite és generált evidence nem mondhat egymásnak ellent.

## Definition contract

A `defineContracts()` deklaráció minden contracthoz rögzíti:

- a stabil contract ID-t, ownert és szemantikus verziót;
- a stability és visibility állapotot;
- a contractkategóriákat;
- a TypeScript source-t és exportot;
- a normatív dokumentációt;
- a runtime validation és schema állapotát;
- az error code készletet;
- a cancellation, timeout, concurrency és idempotencia szemantikát;
- a security classification és tenant scope értékét;
- a reference suite útvonalát;
- a deprecation és migration metadata-t.

Stable contracthoz reference suite és legalább egy production-közeli provider kötelező.

## Provider contract

A `defineContractProviders()` deklaráció rögzíti:

- a provider ID-t és verziót;
- az implementált contract ID-t és major verziót;
- a provider kindot (`production`, `fake`, `decorator`);
- a source-t és exportot;
- a runtime környezetet;
- a bizonyított capability-ket;
- a reference suite evidence-et;
- az explicit composition service ID-t.

A provider nem deklarálhat ismeretlen contractot, inkompatibilis majort vagy teszteletlen capabilityt.

## Statikus source-ellenőrzések

A Forge célzott hibát jelez többek között az alábbi esetekre:

```text
CONTRACT_ANY_EXPORTED
CONTRACT_MARKER_INTERFACE_EMPTY
CONTRACT_CONTAINER_EXPOSED
CONTRACT_DEEP_IMPORT
CONTRACT_FRAMEWORK_DEPENDENCY
CONTRACT_EXPORT_MISSING
CONTRACT_PROVIDER_EXPORT_MISSING
CONTRACT_RUNTIME_VALIDATION_MISSING
CONTRACT_REFERENCE_SUITE_MISSING
CONTRACT_PROVEN_IMPLEMENTATION_MISSING
CONTRACT_PROVIDER_CAPABILITY_UNTESTED
CONTRACT_PROVIDER_VERSION_INCOMPATIBLE
CONTRACT_BREAKING_CHANGE_UNDECLARED
CONTRACT_DEPRECATION_MIGRATION_MISSING
CONTRACT_GENERATED_DRIFT
```

A vizsgálat TypeScript AST-t használ. A definition fájlokban csak explicit, statikusan kiértékelhető object literal támogatott; spread, computed key és runtime factory logic nem.

## Forge parancsok

```bash
pnpm forge contract:list --project <PROJECT>
pnpm forge contract:inspect <CONTRACT> --project <PROJECT>
pnpm forge contract:check --project <PROJECT>
pnpm forge contract:diff --base <REF> --project <PROJECT>
pnpm forge contract:compat --base <REF> --project <PROJECT>
pnpm forge contract:providers [CONTRACT] --project <PROJECT>
pnpm forge contract:test [CONTRACT] --project <PROJECT>
pnpm forge contract:graph --format=mermaid --project <PROJECT>
pnpm forge contract:why <SYMBOL> --project <PROJECT>
pnpm forge contract:docs --check --project <PROJECT>
pnpm forge contract:generate --check --project <PROJECT>
pnpm forge deprecation:check --project <PROJECT>
```

A `contract:diff` leírja a változásokat. A `contract:compat` hibával tér vissza, ha undeclared breaking change vagy kompatibilitási hiba található.

## Generált evidence

A Forge az alábbi canonical artefaktumokat állítja elő:

```text
src/generated/contracts/registry.ts
src/generated/contracts/contract-manifest.json
docs/90-generated/contracts/contract-inventory.md
docs/90-generated/contracts/provider-matrix.md
docs/90-generated/contracts/contract-graph.md
docs/90-generated/contracts/security-status.md
docs/90-generated/contracts/deprecation-status.md
```

A fingerprint a rendezett definition-, contract- és provider-inventory SHA-256 lenyomata. A `--check` mód fail-closed driftellenőrzést végez.

## Runtime startup validation

A `validateContractRegistry()` startupkor ellenőrzi:

- a manifest schema versiont és fingerprint formátumot;
- a duplikált contract- és providerazonosítókat;
- a provider által hivatkozott contract létezését;
- a contract/provider major kompatibilitását;
- a capability evidence jelenlétét;
- stable contract esetén a production-közeli provider meglétét.

A runtime validator metadata-registryt ellenőriz; nem hoz létre service containert és nem választ providert az application réteg helyett.

## Reference App bizonyított példa

A referenciaalkalmazás module-local contractja:

```text
demo.random-integer-generator
```

Compile-time felülete a `RandomIntegerGenerator`. Production providere a `NodeCryptoRandomIntegerGenerator`, a `ValidatedRandomIntegerGenerator` pedig postconditiont érvényesítő decorator. Mindkettő ugyanazt a reference suite-ot használja, amely ellenőrzi az inkluzív tartományt, a safe integer eredményt, a degenerált tartományt és a hibás provider output elutasítását.

## Template-ek és recipe

A `minimal` és `webapp` template üres, de teljesen típusos contract és provider definitionnel, generált manifesttel és startup-validációval indul. A `contract-governance` recipe ugyanezt a scaffoldingot telepíti meglévő Winzard projektre.

## Kompatibilitási modell

Breaking változásnak minősülhet:

- stable contract eltávolítása;
- major verzió regressziója;
- visibility, category vagy source/export contract módosítása;
- runtime schema, error taxonomy, cancellation vagy timeout változása;
- concurrency, idempotencia, security classification vagy tenant scope változása major emelés nélkül.

Új contract alapértelmezetten non-breaking. Experimental contract eltávolítása warning lehet. Provider eltávolítása warning, de a stable contract proven-provider követelménye továbbra is külön ellenőrzött.

## Fejlesztési és CI kapu

```bash
pnpm verify:contracts
```

A kapu a reference, minimal és webapp contract inventoryt, generált driftet és deprecation állapotot ellenőrzi. A teljes release-ellenőrzés részeként ezt követi a repository typecheck, lint, Vitest, production build, E2E, PostgreSQL, runtime-security és reproducibility mátrixa.

## Forrásspecifikáció

A megvalósítás szakmai alapja a 2026-07-19-én ellenőrzött, 97 fejezetes „Szerződések és interoperabilitási határok Winzardban” specifikáció. A forrásspecifikáció SHA-256 lenyomata:

```text
b1e88bad9ffa4b4d73112b0b4c054868018ddc2f17e624b8ce360e2e708233b9
```
