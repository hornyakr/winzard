---
title: "Winzard extension-, capability-, recipe- és package-platform"
description: "A statikus Winzard extension lifecycle, recipe ownership, capability graph és package diagnostics implementációs szerződése."
status: "implemented-draft"
document_version: "0.1.0"
last_verified: "2026-07-22"
---

# Winzard extension-, capability-, recipe- és package-platform

## Alapelv

A megvalósítás nem vezet be runtime plugin kernelt, automatikus route discoveryt, reflectiont, globális service locatort vagy import side effectből működő regisztrációt.

Az extension egy statikus disztribúciós egység:

```text
extension manifest
+ package contractok
+ capability-k
+ deklaratív recipe
+ explicit composition
+ tényleges App Router fájlok
+ ownership state
```

A beépített platformcapability-k továbbra is a projekt Winzard manifestjében találhatók. A külső extension capability-k telepítési forrásigazsága a `.winzard/state/extensions.json`, így a core manifest zárt és visszafelé kompatibilis marad.

## Extension manifest

A lokális extension gyökerében az alábbi fájlok egyike kötelező:

```text
extension.json
winzard-extension.json
```

A manifest rögzíti:

- az extension nevét, verzióját és stabilitását;
- a biztosított, megkövetelt és tiltott capability-ket;
- a runtime-, development- és peer package-eket;
- a provider metadata-t;
- a recipe nevét, verzióját és relatív útvonalát;
- a dokumentáció belépési pontját;
- a Node.js-, pnpm-, Next.js- és React-kompatibilitást.

A validáció fail-closed. Hibás semver, duplikált capability, `provides`/`conflicts` átfedés vagy hiányos recipe metadata esetén az extension nem alkalmazható.

## Recipe contract

A `recipe.json` támogatja:

```text
provides
requires
conflicts
dependencies.runtime
dependencies.development
environment
configuration
files
generated
migrations
```

A fájlbejegyzés lehet egyszerű relatív útvonal vagy explicit objektum:

```json
{
  "path": "src/composition/acme-demo.server.ts",
  "source": "src/composition/acme-demo.server.ts",
  "ownership": "generated-read-only"
}
```

Támogatott ownership típusok:

```text
generated-read-only
generated-with-regions
consumer-owned-after-create
```

A `generated-with-regions` fájl csak explicit marker metadata-val frissíthető; ennek hiányában a Forge konfliktust jelez, nem írja felül a consumer fájlt.

## Biztonsági modell

A materializer:

- kizárja az abszolút pathokat és a repositoryn kívülre mutató `..` feloldást;
- ellenőrzi a meglévő ancestorok canonical pathját;
- blokkolja a symlink escape-et;
- source- és output SHA-256 hasht tárol;
- drift esetén nem ír felül;
- ideiglenes fájl és rename használatával materializál;
- nem hajt végre arbitrary shell scriptet;
- nem futtat adatbázis-migrációt vagy destruktív külső műveletet.

## Idempotencia és state

A telepített állapot:

```text
.winzard/state/extensions.json
```

Rögzíti:

- az extension és recipe verzióját;
- a forrásútvonalat;
- a capability-ket;
- a runtime és development dependency-ket;
- a fájlownershipet;
- a source és output hasheket;
- az alkalmazott migration ID-ket;
- a telepítés és frissítés idejét.

Sikeres apply után ugyanazon recipe ismételt planje nulla módosítást ad. Kézi drift esetén `EXTENSION_RECIPE_DRIFT` hiba keletkezik.

## CLI

### Extension lifecycle

```bash
pnpm forge extension:list --project <project>
pnpm forge extension:inspect <source> --project <project>
pnpm forge extension:check <source> --project <project>
pnpm forge extension:add <source> --project <project> --dry-run
pnpm forge extension:add <source> --project <project>
pnpm forge extension:update <source> --project <project>
pnpm forge extension:remove <name> --project <project> --dry-run
pnpm forge extension:remove <name> --project <project>
pnpm forge extension:docs <source> --project <project>
```

### Recipe

```bash
pnpm forge recipe:plan <recipe> --project <project>
pnpm forge recipe:apply <recipe> --project <project>
pnpm forge recipe:check <recipe> --project <project>
pnpm forge recipe:diff <recipe> --project <project>
pnpm forge recipe:ownership <name> --project <project>
```

### Capability graph

```bash
pnpm forge capability:graph --project <project>
pnpm forge capability:why <capability> --project <project>
pnpm forge capability:conflicts --project <project>
```

### Package diagnostics

```bash
pnpm forge package:check <package-directory>
pnpm forge package:exports <package-directory>
pnpm forge package:pack-smoke <package-directory>
pnpm forge package:consumers <package-name> --project <project>
```

Minden felület támogatja a `--json` kimenetet. Az installálási parancsok támogatják a review-zható `--dry-run` módot.

## Package ellenőrzések

A package-diagnosztika ellenőrzi:

- a `name`, `version` és ESM contractot;
- az explicit `exports` mezőt;
- az export targetek jelenlétét;
- a tarball `files` allowlistet;
- tiltott `.env`, coverage és `node_modules` útvonalakat;
- a React peer dependency modellt;
- a `sideEffects` deklarációt;
- a `pnpm pack` eredményét.

## Fixture

A repository tartós extension fixture-je:

```text
packages/forge/tests/fixtures/acme-demo-extension
```

A fixture package-et, recipe-t, composition fájlt, App Router route stubot és dokumentációt tartalmaz.

## Ellenőrzés

```bash
pnpm verify:extensions
```

A tesztcsomag lefedi a command surface-t, a plan/apply/idempotencia folyamatot, a driftet, removal safetyt, path traversal tiltást, capability conflictet és package export contractot.

## Jelenlegi határ

A v1 lokális repository- vagy path-alapú extensionforrást támogat. Nem része:

- hálózati extension registry;
- npm publish;
- trusted publishing konfigurálása;
- production migráció automatikus futtatása;
- runtime provider discovery;
- globális plugin registry.
