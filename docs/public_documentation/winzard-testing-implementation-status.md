---
title: "Winzard Testing Platform implementációs státusz"
description: "A tesztelési specifikáció első kódszintű implementációjának aktuális állapota, működő parancsai, capability-i és szándékos kizárásai."
status: "implemented-draft"
document_version: "0.1.0"
last_verified: "2026-07-23"
---

# Winzard Testing Platform implementációs státusz

## Implementált

A Testing Platform v1 a következő működő felületeket vezeti be:

```text
statikus testing.definition.ts suite-contract
Forge testing inventory és fingerprint
suite discovery és elárvult teszt detektálás
focused/skip/env/fixed-wait diagnosztika
fixture, network, production-build és healthcheck policy
quarantine metadata és lejárat
konzervatív changed-files impact selection
generált testing dokumentáció
Vitest unit-node, contract-node és component-jsdom project
PostgreSQL integration contract
production HTTP application smoke
Playwright Chromium browser E2E
axe accessibility scan
rétegzett Testing GitHub Actions workflow
```

## Forge parancsok

```bash
pnpm forge test:list --project .
pnpm forge test:inspect <suite> --project .
pnpm forge test:check --project .
pnpm forge test:matrix --project .
pnpm forge test:impact --changed-from=<COMMIT> --project .
pnpm forge test:fixtures --project .
pnpm forge test:flaky --project .
pnpm forge test:coverage --project .
pnpm forge test:docs --project .
pnpm forge test:docs --check --project .
```

## Package scriptek

```bash
pnpm test:unit
pnpm test:contract
pnpm test:component
pnpm test:database
pnpm test:application
pnpm test:e2e
pnpm test:a11y
pnpm test:coverage
pnpm verify:testing
```

A történeti `test:e2e:reference` script kompatibilitási aliasként megmarad, de a tényleges contractja production HTTP application smoke. A valódi böngészőréteg a Playwright suite.

## Capability-k

```text
testing-core
testing-dom
testing-database
testing-e2e
testing-accessibility
testing-visual
```

A `testing-visual` jelenleg csak támogatott bővítési pont. Visual baseline még nem része az aktív tesztmátrixnak.

## Evidence-határok

```text
unit-node
  -> domain, application, config és Forge process-lokális contract

contract-node
  -> providerfüggetlen vagy platform reference suite

component-jsdom
  -> React DOM-szemantika és felhasználói interaction

PostgreSQL integration
  -> migrált valódi adatbázis és adapterviselkedés

application HTTP
  -> production Next.js process, route, status, header és body

browser E2E
  -> hydration, DOM, user event és Server Action wiring

accessibility
  -> semantic query és automatizált WCAG A/AA scan
```

## Biztonsági szabályok

- A database integration fail-closed módon elutasítja a nem lokális vagy `test` marker nélküli URL-t.
- A browser suite blokkolja a nem várt külső origin kéréseket.
- Playwright auth state nem kerül Gitbe vagy CI artifactba.
- Trace, screenshot és video csak hibánál marad meg.
- `.only`, indokolatlan `.skip`, `.env.local` függés és lejárt quarantine diagnosztikai hiba.

## Nem implementált ebben a verzióban

```text
visual screenshot baseline
Firefox és WebKit kötelező mátrix
load testing platform
provider sandbox automatizálás
grafikus flaky dashboard
automatikus fixture materializer
teljes importgráfos impact analysis
```

A részletes normatív tesztelési modell külön specifikáció. Ez a dokumentum kizárólag a repositoryban ténylegesen implementált első platformverzió státuszát rögzíti.
