# Kitelepített projekt-dokumentáció implementáció

Ez a jegyzőkönyv a `docs/public_documentation/winzard-human-ai-documentation.md` publikus projektszerződés kódszintű megvalósítását rögzíti. Az architekturális alapot a `docs/public_documentation/winzard-application-platform.md` foglalja össze.

## Megvalósított scope

- `project-documentation` és `ai-delivery` capability;
- dokumentációs manifest projectprefixszel, contractverzióval és context budgettel;
- `docs:init`, `docs:check`, `docs:status`, `docs:generate`, `docs:new`, `docs:adapters`, `docs:sync`, `context:build`, `context:check` és `handoff:new` Forge-parancsok;
- frontmatter-, ID-, lifecycle-, relationship-, link-, secret-, placeholder-, path-scope- és boundary-validáció, repositoryn kívülre mutató linkek tiltásával;
- publikus, read-only Winzard consumer documentation pack;
- generált `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` és Copilot adapterek drift-ellenőrzéssel;
- determinisztikus, source hash-eket tartalmazó task context package fail-closed Git base commit, teljes renderelt byte budget és kettős restricted-context engedélyezéssel;
- task path scope-ot, törléseket, tiszta working tree-t és checkoutolt result commitot ellenőrző handoff generátor;
- negatív fixture-ek és CI-ben futó dokumentációs contract ellenőrzés.

## Határ

Az implementáció kizárólag kitelepített vagy generált Winzard projektek dokumentációját kezeli. Nem generál és nem publikál:

- Winzard belső roadmapet;
- Winzard-core taskot, handoffot vagy incidentet;
- nem publikus platform-ADR-t;
- maintainer AI-policyt;
- teljes AI chatnaplót.

A `docs/80-winzard` tartalmát a `packages/forge/assets/consumer-contract` publikus, verziózott forrása adja. A sync előbb validálja a WZ-azonosítót, public besorolást, consumer scope-ot és a belső repository-hivatkozások hiányát; kézi fájlt nem töröl és nem ír felül.

## Ellenőrzés

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:documentation
pnpm verify:core
```

## Tudatosan későbbre hagyva

- külső package-registryből végzett consumer pack letöltés;
- automatikus recipe materializer;
- GitHub branch protection és CODEOWNERS konfiguráció automatikus kezelése;
- tokenizálófüggő context budget;
- szemantikus dokumentumkeresés;
- központi multi-project dokumentációs dashboard.
