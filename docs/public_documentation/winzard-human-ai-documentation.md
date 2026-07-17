---
title: "Humán és AI dokumentáció Winzard projektekben"
description: "A Winzarddal létrehozott alkalmazások projektlokális dokumentációs, AI-kontextus-, jóváhagyási és evidence-szerződése."
status: "draft-specification"
document_version: "0.1.0"
last_verified: "2026-07-17"
source_basis: "Symfony Docs — Symfony AI Documentation"
applies_to: "kitelepített vagy generált Winzard projektek"
excludes:
  - "a Winzard alaprendszer belső fejlesztése"
  - "a Winzard belső dokumentációs vaultja"
  - "AI modellek alkalmazás-runtime integrációja"
---

# Humán és AI dokumentáció Winzard projektekben

## A dokumentum célja

Ez a dokumentum a Symfony **„Symfony AI Documentation”** oldalának Winzard-specifikus, önálló szakmai átültetése és kibővítése.

A Symfony referencia jól különíti el az AI-platformot, agenteket, toolokat, memóriát, emberi jóváhagyást, komponensreferenciát és cookbook jellegű útmutatókat. A Winzard jelen fejezete azonban más problémát old meg:

> **azt írja le, hogyan dokumentálja, hogyan adja át és hogyan ellenőrzi saját üzleti alkalmazását egy Winzarddal létrehozott projekt emberi és AI-asszisztált fejlesztés során.**

Ez nem szó szerinti fordítás, és nem AI SDK-k, modellproviderek vagy alkalmazásoldali agent runtime-ok használati útmutatója.

A fejezet kizárólag a **kitelepített Winzard-projektben** érvényes szerződést mutatja be:

- a projekt saját humán dokumentációját;
- a projekt saját architekturális és delivery-dokumentumait;
- az AI-asszisztált fejlesztéshez előállított projektszintű instrukciókat;
- a task-, context-, handoff-, review- és evidence-folyamatot;
- a projektbe telepített, csak olvasható Winzard consumer contractot;
- a dokumentáció ellenőrzésének és CI-integrációjának célfelületét.

> [!IMPORTANT]
> Ez a publikus dokumentum **nem** tartalmazza a Winzard alaprendszer belső roadmapjét, belső ADR-jeit, Forge-fejlesztési taskjait, platform-maintainer handoffjait, belső AI-policyját vagy a Winzard saját dokumentációs vaultjának felépítését.

> [!NOTE]
> Az AI-asszisztált fejlesztés dokumentációja és az alkalmazásba épített AI-funkció két külön terület. Modellprovider, agent runtime, RAG, vector store, chatmemória, MCP-szerver vagy alkalmazásoldali tool calling külön capability és külön dokumentáció tárgya.

A dokumentum végére egy projektcsapat:

1. ki tudja alakítani a projekt kanonikus dokumentációs terét;
2. meg tudja különböztetni a kézzel karbantartott és generált dokumentumokat;
3. stabil dokumentumazonosítókat és metadata-szerződést tud használni;
4. külön tudja kezelni a dokumentum, az implementáció és a verifikáció állapotát;
5. végrehajtható task briefet tud adni embernek vagy AI-agentnek;
6. reprodukálható AI context package-et tud előállítani;
7. korlátozni tudja az AI olvasási, írási és integrációs jogosultságát;
8. handoffot, review-t és evidence-et tud kapcsolni a kódváltozáshoz;
9. meg tudja akadályozni a belső, elavult vagy jogosulatlan dokumentumok kontextusba kerülését;
10. CI-ben ellenőrizhető dokumentációs minimumot tud fenntartani.

---

## Tartalomjegyzék

1. [Fogalmak és normatív nyelv](#1-fogalmak-és-normatív-nyelv)
2. [Hatókör és kizárások](#2-hatókör-és-kizárások)
3. [A kitelepített dokumentációs képességek](#3-a-kitelepített-dokumentációs-képességek)
4. [Gyors kezdés](#4-gyors-kezdés)
5. [A repository mint dokumentációs vault](#5-a-repository-mint-dokumentációs-vault)
6. [Forrásigazság és autoritási sorrend](#6-forrásigazság-és-autoritási-sorrend)
7. [Projekt-dokumentációs struktúra](#7-projekt-dokumentációs-struktúra)
8. [Kezdeti projekt-dokumentumok](#8-kezdeti-projekt-dokumentumok)
9. [Azonosítók és fájlnevek](#9-azonosítók-és-fájlnevek)
10. [Frontmatter-szerződés](#10-frontmatter-szerződés)
11. [Dokumentumfajták](#11-dokumentumfajták)
12. [Lifecycle-ok](#12-lifecycle-ok)
13. [Kanonikus dokumentumszerkezet](#13-kanonikus-dokumentumszerkezet)
14. [Humán és AI projekció](#14-humán-és-ai-projekció)
15. [AI-instrukciós adapterek](#15-ai-instrukciós-adapterek)
16. [Task brief](#16-task-brief)
17. [AI context package](#17-ai-context-package)
18. [AI-jogosultságok és emberi kontroll](#18-ai-jogosultságok-és-emberi-kontroll)
19. [Toolhasználat és fail-closed működés](#19-toolhasználat-és-fail-closed-működés)
20. [Handoff, review és evidence](#20-handoff-review-és-evidence)
21. [Dokumentációs változási kötelezettség](#21-dokumentációs-változási-kötelezettség)
22. [Pull request hatásnyilatkozat](#22-pull-request-hatásnyilatkozat)
23. [A telepített Winzard consumer documentation pack](#23-a-telepített-winzard-consumer-documentation-pack)
24. [Adatbesorolás, AI-hozzáférés és secretek](#24-adatbesorolás-ai-hozzáférés-és-secretek)
25. [Obsidian használata](#25-obsidian-használata)
26. [Kézi és generált fájlok határa](#26-kézi-és-generált-fájlok-határa)
27. [Dokumentációs ellenőrzés](#27-dokumentációs-ellenőrzés)
28. [CI-szerződés](#28-ci-szerződés)
29. [Mintafolyamat](#29-mintafolyamat)
30. [Fokozatos bevezetés](#30-fokozatos-bevezetés)
31. [Symfony–Winzard megfeleltetés](#31-symfonywinzard-megfeleltetés)
32. [Források és attribúció](#32-források-és-attribúció)

---

## 1. Fogalmak és normatív nyelv

### 1.1. Kötelező erejű kifejezések

A dokumentumban:

- **KÖTELEZŐ / MUST**: a szabály megsértése nem támogatott, vagy traceability-, biztonsági, reprodukálhatósági, illetve együttműködési hibát okozhat;
- **TILOS / MUST NOT**: a megoldás nem használható Winzard-kompatibilis projektben;
- **AJÁNLOTT / SHOULD**: indokolt esetben eltérhető, de az eltérést dokumentálni kell;
- **NEM AJÁNLOTT / SHOULD NOT**: csak kifejezett indoklással használható;
- **OPCIONÁLIS / MAY**: a projekt igénye szerint alkalmazható.

A normatív jelentés csak a nagybetűs kulcsszavakhoz tartozik.

### 1.2. Alapfogalmak

| Fogalom | Jelentés |
| --- | --- |
| **Winzard projekt** | Winzard template-ből vagy támogatott bootstrapból létrehozott alkalmazás-repository. |
| **Project Vault** | A repositoryban lévő Markdown-alapú dokumentációs tér. Obsidianban megnyitható, de nem függ Obsidian használatától. |
| **Kanonikus dokumentum** | Stabil azonosítóval, metadata-szerződéssel és kijelölt autoritással rendelkező forrásdokumentum. |
| **Humán projekció** | Emberi navigációra, megértésre és review-ra optimalizált nézet. |
| **AI projekció** | Egy kanonikus forrásból származtatott, korlátozott gépi kontextus vagy instrukció. |
| **Task brief** | Egy végrehajtható változtatás scope-, jogosultság-, kockázat- és acceptance-szerződése. |
| **Context package** | Egy taskhoz determinisztikusan kiválasztott dokumentációs és repository-kontextus. |
| **Handoff** | Az implementáló által átadott, ellenőrizhető eredményjegyzőkönyv. |
| **Evidence** | Teszt, build, mérés, diff, futási eredmény vagy más ellenőrizhető bizonyíték. |
| **Consumer documentation pack** | A projekthez telepített, verziózott és csak olvasható Winzard platformcontract. |

### 1.3. Parancsok státusza

| Státusz | Jelentés |
| --- | --- |
| **Upstream parancs** | Jelenleg használható Git-, pnpm-, Next.js- vagy más upstream parancs. |
| **Winzard célparancs** | A kitelepített projektben elvárt, implementálandó Forge-felület. |
| **Manuális megfelelő** | A célparancs hiányában ember által végrehajtható ellenőrzés vagy fájllétrehozás. |

> [!WARNING]
> A dokumentáció előbb rögzíti a publikus projektszerződést, mint a teljes `forge docs:*` és `forge context:*` implementáció. Egy célparancs nem tekinthető elérhetőnek csak azért, mert ebben a fejezetben szerepel.

---

## 2. Hatókör és kizárások

### 2.1. Mire vonatkozik?

A fejezet a következőkre vonatkozik:

```text
egy konkrét, kitelepített Winzard alkalmazás
+ annak üzleti és technikai dokumentációja
+ annak emberi fejlesztési folyamata
+ annak AI-asszisztált delivery folyamata
+ a projektben lokálisan elérhető Winzard consumer contract
```

A projekt saját dokumentációja tartalmazhatja:

- a termék célját és stakeholdereit;
- üzleti capability-ket és domainfogalmakat;
- bounded contexteket és architekturális döntéseket;
- feature-specifikációkat;
- taskokat, handoffokat és review-kat;
- teszt-, release- és operációs evidence-et;
- runbookokat és incidenteket;
- felhasználói dokumentációt;
- a használt Winzard-verzió kompatibilitási contractját.

### 2.2. Mire nem vonatkozik?

A projekt dokumentációjába TILOS automatikusan kitelepíteni:

- a Winzard termék belső roadmapjét;
- a Forge belső implementációs döntéseit;
- a Winzard maintainerek saját taskjait;
- a Winzard belső handoffjait vagy review-it;
- nem publikus platform-ADR-eket;
- más Winzard projektek dokumentációját;
- a Winzard belső kutatási jegyzeteit;
- fejlesztői személyes memóriát vagy AI-chatnaplót.

### 2.3. AI runtime nem része ennek a fejezetnek

A következők külön alkalmazáscapability-k:

```text
LLM provider integráció
agent runtime
chat
tool calling
RAG
vector store
embedding
MCP server
AI memory
structured model output
multimodális feldolgozás
```

Egy projekt használhatja ezeket, de attól még a jelen dokumentációs contract változatlanul érvényes.

### 2.4. Támogatott platformismeret

A projekt csak kétféle Winzard-ismeretet kap:

1. a template-ben és telepített recipe-kben megjelenő fájlokat;
2. a `docs/80-winzard` alatt elhelyezett publikus consumer contractot.

A projekt nem hivatkozhat kanonikusan a Winzard belső repository-elérési útjaira.

---

## 3. A kitelepített dokumentációs képességek

A dokumentációs rendszer két külön projektszintű capability-re bontható.

### 3.1. `project-documentation`

Biztosítja:

- a `docs/` könyvtár alapstruktúráját;
- a dokumentumazonosító- és metadata-szerződést;
- ADR-, specification-, task-, handoff- és evidence-template-eket;
- dokumentációs validációt;
- generated indexek helyét;
- a consumer documentation pack célkönyvtárát.

### 3.2. `ai-delivery`

Megköveteli a `project-documentation` capability-t, és hozzáadja:

- a taskból generált AI context package-et;
- vendorsemleges agent policyt;
- AI-instrukciós adaptereket;
- path- és tool-jogosultságokat;
- human approval gate-eket;
- AI delivery handoff- és eval-szerződést.

### 3.3. Példa manifest

```json
{
  "schemaVersion": 1,
  "profile": "webapp",
  "capabilities": [
    "next-app",
    "forge",
    "modular-application",
    "project-documentation",
    "ai-delivery"
  ],
  "documentation": {
    "contractVersion": 1,
    "projectPrefix": "ATLAS",
    "consumerContractVersion": "0.3.0"
  }
}
```

A `projectPrefix` KÖTELEZŐEN stabil, rövid és a szervezeten belül egyértelmű.

---

## 4. Gyors kezdés

### 4.1. Célparancsok

```bash
pnpm forge docs:init
pnpm forge docs:check
pnpm forge docs:status
pnpm forge docs:new capability
pnpm forge docs:new adr
pnpm forge docs:new specification
pnpm forge docs:new task
pnpm forge context:build ATLAS-TASK-0042
pnpm forge handoff:new ATLAS-TASK-0042
```

Ezek Winzard célparancsok.

### 4.2. Manuális minimum

A célparancsok hiányában legalább az alábbiakat kell létrehozni:

```text
docs/
  00-home/
  10-product/
  20-domain/
  30-architecture/
  40-delivery/
  50-user-documentation/
  60-operations/
  70-ai/
  80-winzard/
  90-generated/
  _templates/
  _assets/
  _system/
```

Kezdeti dokumentumok:

```text
PROJECT-HOME
PROJECT-BRIEF
DOMAIN-GLOSSARY
ARCHITECTURE-MAP
DELIVERY-MAP
WINZARD-MANIFEST
```

### 4.3. Első ellenőrzés

Manuálisan ellenőrizni kell:

- minden kanonikus dokumentumnak van-e stabil ID-ja;
- egyértelmű-e a projektprefix;
- nincs-e belső Winzard-anyag a projekt docs terében;
- nincs-e secret vagy személyes AI-chat a repositoryban;
- a `docs/80-winzard` csak generált, publikus contractot tartalmaz-e;
- a taskok megadják-e az engedélyezett és tiltott pathokat.

---

## 5. A repository mint dokumentációs vault

A projekt repository-ja egyben a dokumentációs vault gyökere.

```text
atlas/
  docs/
  src/
  tests/
  package.json
  winzard.json
```

Ennek előnye:

- a dokumentáció és a kód ugyanabban a commitban változhat;
- a dokumentum relatív linkkel hivatkozhat source fájlra;
- a task `base_commit` értéke egyértelmű;
- az AI context builder ugyanabból a working tree-ből dolgozhat;
- a review egyetlen diffben látja a contractot és az implementációt.

Az Obsidian authoring- és navigációs felület lehet. A kanonikus formátum azonban Markdown, YAML metadata és Git.

A dokumentáció helyessége nem függhet közösségi Obsidian plugintól.

---

## 6. Forrásigazság és autoritási sorrend

### 6.1. Egy állítás, egy autoritatív tulajdonos

Egy normatív állításnak pontosan egy kanonikus forrása legyen.

Például:

- az ADR birtokolja a tartós döntést és indoklást;
- a specification birtokolja a viselkedési contractot;
- a schema birtokolja a géppel ellenőrizhető formátumot;
- a teszt és evidence bizonyítja a megvalósulást;
- a guide elmagyarázza a használatot.

A guide nem másolhatja át teljes egészében a specificationt.

### 6.2. Autoritási sorrend

Konfliktus esetén:

1. elfogadott projekt-ADR;
2. elfogadott projekt-specification vagy policy;
3. telepített Winzard consumer contract;
4. végrehajtható schema vagy API contract;
5. teszt és evidence;
6. guide vagy README;
7. generált index és AI adapter;
8. research note, chat vagy személyes jegyzet.

A magasabb szintű dokumentum nem írhat felül újabb, kifejezetten superseding döntést.

### 6.3. Nem kanonikus források

Nem lehet önmagában forrásigazság:

- AI-chat;
- issue-komment;
- daily note;
- dashboard;
- graph view;
- Canvas;
- generált index;
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` vagy Copilot adapter, ha azok generált projekciók.

---

## 7. Projekt-dokumentációs struktúra

```text
docs/
  00-home/
    PROJECT-HOME.md
    PROJECT-MAP.md
    DELIVERY-MAP.md

  10-product/
    vision/
    capabilities/
    roadmap/
    stakeholders/

  20-domain/
    glossary/
    contexts/
    models/
    workflows/
    rules/

  30-architecture/
    principles/
    adr/
    specifications/
    integrations/
    security/

  40-delivery/
    initiatives/
    tasks/
    handoffs/
    reviews/
    evidence/

  50-user-documentation/
    tutorials/
    how-to/
    reference/
    explanation/

  60-operations/
    environments/
    runbooks/
    releases/
    incidents/

  70-ai/
    policies/
    context-contracts/
    adapters/
    evals/

  80-winzard/
    manifest/
    platform-contracts/
    compatibility/
    upgrade-guides/

  90-generated/
    indexes/
    traceability/
    status/
    ai-context/

  _templates/
  _assets/
  _system/
```

Nem kötelező minden üres könyvtárat előre létrehozni. A szerkezet logikai contract.

A projekt üzleti dokumentációja nem kerülhet a `docs/80-winzard` alá.

---

## 8. Kezdeti projekt-dokumentumok

### 8.1. `PROJECT-HOME`

Tartalmazza:

- a projekt rövid célját;
- a dokumentációs térképet;
- az aktív delivery státuszt;
- a legfontosabb runbook- és release-linkeket.

Nem tartalmaz teljes specifikációkat.

### 8.2. `PROJECT-BRIEF`

Rögzíti:

- a problémát;
- a célfelhasználót;
- a termékhatárt;
- a sikerkritériumokat;
- a legfontosabb non-goalokat.

### 8.3. `DOMAIN-GLOSSARY`

Minden üzletileg jelentős kifejezéshez tartalmazza:

- a kanonikus nevet;
- rövid definíciót;
- tiltott vagy elavult szinonimát;
- owning bounded contextet;
- releváns specification-linket.

### 8.4. `ARCHITECTURE-MAP`

Navigációs nézet a rendszerhatárokról, modulokról, adatfolyamokról és integrációkról. Nem helyettesíti az ADR-eket.

### 8.5. `DELIVERY-MAP`

Összekapcsolja:

```text
capability
→ ADR
→ specification
→ task
→ handoff
→ review
→ evidence
→ release
```

### 8.6. `WINZARD-MANIFEST`

Emberi nézetben mutatja:

- a Winzard verzióját;
- a documentation contract verzióját;
- a consumer contract verzióját;
- a telepített capability-ket;
- az utolsó sync idejét.

---

## 9. Azonosítók és fájlnevek

### 9.1. Projektprefix

Minden projekt egy stabil prefixet kap:

```text
ATLAS
SHOP
CRM
ACME
```

### 9.2. Azonosítók

```text
ATLAS-CAP-001
ATLAS-ADR-0001
ATLAS-SPEC-001
ATLAS-TASK-0042
ATLAS-HANDOFF-0042
ATLAS-REVIEW-0042
ATLAS-EVIDENCE-0042
ATLAS-RUN-001
ATLAS-REL-001
```

Az azonosító nem változik címátnevezéskor.

### 9.3. Fájlnév

AJÁNLOTT:

```text
ATLAS-ADR-0001.md
ATLAS-SPEC-001.md
ATLAS-TASK-0042.md
```

A cím a frontmatter `title` mezője.

### 9.4. Duplikáció

Két fájl nem használhat azonos `id` értéket.

A törölt ID nem használható újra más jelentéssel.

---

## 10. Frontmatter-szerződés

### 10.1. Minimális metadata

```yaml
---
schema_version: 1

id: ATLAS-SPEC-001
title: Terméklista lekérdezési szerződés
aliases: []

scope: generated-project
kind: contract
subtype: specification
authority: normative

document_status: proposed
implementation_status: not_started
verification_status: unverified

owner: role:catalog-maintainer
approvers:
  - role:architecture-owner

classification: internal
ai_access: allowed
context_priority: required

created: 2026-07-17
updated: 2026-07-17
last_verified:
review_due: 2026-10-17

applies_to:
  - src/modules/catalog/**

depends_on:
  - ATLAS-ADR-0001

supersedes: []
superseded_by: []
evidence: []

tags:
  - catalog
  - query
---
```

### 10.2. Lapos metadata

A frontmatter legyen lapos és egyszerűen parse-olható.

Nem ajánlott:

```yaml
lifecycle:
  document:
    status: accepted
```

Használandó:

```yaml
document_status: accepted
implementation_status: implemented
verification_status: verified
```

### 10.3. `classification`

Engedélyezett kezdeti értékek:

```text
public
internal
confidential
restricted
```

### 10.4. `ai_access`

```text
allowed
restricted
denied
```

### 10.5. `context_priority`

```text
required
relevant
optional
never
```

Az `ai_access` a hozzáférést, a `context_priority` a releváns taskban történő kiválasztási prioritást jelenti.

---

## 11. Dokumentumfajták

A `kind` magas szintű szerepet, a `subtype` konkrét típust jelöl.

### 11.1. `product`

Subtypes:

```text
vision
capability
roadmap
stakeholder-map
```

### 11.2. `decision`

Subtypes:

```text
adr
waiver
```

### 11.3. `contract`

Subtypes:

```text
specification
policy
api-contract
data-contract
security-contract
```

### 11.4. `delivery`

Subtypes:

```text
initiative
task-brief
handoff
review
```

### 11.5. `evidence`

Subtypes:

```text
test-result
build-result
measurement
migration-evidence
release-evidence
```

### 11.6. `operation`

Subtypes:

```text
runbook
release
incident
postmortem
```

### 11.7. `guidance`

Felhasználói dokumentációhoz:

```text
tutorial
how-to
reference
explanation
```

Generated index vagy dashboard nem kanonikus dokumentumtípus, hanem projekció.

---

## 12. Lifecycle-ok

Három külön státuszt KÖTELEZŐ használni.

### 12.1. Dokumentumstátusz

```text
draft
proposed
accepted
superseded
deprecated
archived
```

Ez a dokumentum szakmai érvényességét jelenti.

### 12.2. Implementációstátusz

```text
not_started
in_progress
partial
implemented
not_applicable
```

Ez a contract kódszintű megvalósulását jelenti.

### 12.3. Verifikációs státusz

```text
unverified
verified
failed
stale
not_applicable
```

Ez a bizonyíték aktuális állapotát jelenti.

### 12.4. Példák

Elfogadott terv, még nincs implementálva:

```yaml
document_status: accepted
implementation_status: not_started
verification_status: unverified
```

Implementált kód, de elavult bizonyíték:

```yaml
document_status: accepted
implementation_status: implemented
verification_status: stale
```

`verified` státuszhoz KÖTELEZŐ evidence-hivatkozás.

---

## 13. Kanonikus dokumentumszerkezet

Egy normatív dokumentum AJÁNLOTT szerkezete:

```markdown
# Cím

## Összefoglalás

## Contract

## Kontextus és indoklás

## Hatókör

## Korlátok és tiltások

## Helyes példák

## Helytelen példák

## Biztonsági követelmények

## Elfogadási kritériumok

## Evidence

## Kapcsolódó dokumentumok

## Források
```

Nem minden szakasz kötelező minden subtype-nál. A schema subtype szerint határozhat meg kötelező fejezeteket.

A normatív szabály a `Contract`, `Korlátok`, `Biztonsági követelmények` és `Elfogadási kritériumok` részben legyen.

---

## 14. Humán és AI projekció

### 14.1. Egy forrás, több nézet

A humán és AI dokumentáció nem két kézzel karbantartott dokumentumhalmaz.

```text
kanonikus dokumentum
  ├─ humán navigációs nézet
  ├─ AI context package
  ├─ AGENTS.md adapter
  ├─ CLAUDE.md adapter
  ├─ GEMINI.md adapter
  └─ Copilot path instruction
```

### 14.2. Humán projekció

Az ember számára hangsúlyos:

- összefoglalás;
- kontextus és indoklás;
- diagramok;
- példák;
- kapcsolódó dokumentumok;
- státusz és ownership.

### 14.3. AI projekció

Az AI számára hangsúlyos:

- task brief;
- stabil metadata;
- accepted ADR-ek és specificationök;
- explicit tiltások;
- allowed/forbidden pathok;
- acceptance criteria;
- required checks;
- stop conditions;
- aktuális evidence;
- base commit.

### 14.4. Kizárandó tartalom

Az AI context package-be nem kerülhet automatikusan:

- teljes vault;
- unrelated daily note;
- superseded ADR;
- nem hivatkozott draft specification;
- más projekt dokumentációja;
- `ai_access: denied` dokumentum;
- restricted dokumentum explicit taskengedély nélkül;
- teljes korábbi AI-beszélgetés.

---

## 15. AI-instrukciós adapterek

### 15.1. Célfájlok

A projekt generálhat:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
.github/copilot-instructions.md
.github/instructions/*.instructions.md
```

### 15.2. Nem kanonikusak

Ezek projekciók. Fejlécük:

```markdown
<!-- Generated from project documentation contracts. -->
<!-- Do not edit manually. -->
```

A forrásuk projekt-specification, policy és task contract.

### 15.3. Hierarchikus scope

Könyvtárspecifikus adapter csak az adott subtree szabályait tartalmazza.

Például:

```text
AGENTS.md
src/modules/catalog/AGENTS.md
src/platform/auth/AGENTS.md
```

A lokális szabály szűkítheti vagy pontosíthatja a root szabályt, de nem oldhat fel magasabb szintű biztonsági tiltást dokumentált waiver nélkül.

### 15.4. Drift

A generált adapter és a kanonikus forrás eltérése hibának számít.

Célparancs:

```bash
pnpm forge docs:adapters --check
```

---

## 16. Task brief

A task brief az ember vagy AI tényleges végrehajtási szerződése.

### 16.1. Kötelező metadata

```yaml
---
id: ATLAS-TASK-0042
kind: delivery
subtype: task-brief

document_status: accepted
implementation_status: not_started
verification_status: unverified

related_capabilities:
  - ATLAS-CAP-012

related_decisions:
  - ATLAS-ADR-0007

related_specifications:
  - ATLAS-SPEC-023

base_commit: abc1234

allowed_paths:
  - src/modules/catalog/**
  - tests/catalog/**

forbidden_paths:
  - prisma/migrations/**
  - src/platform/auth/**

required_checks:
  - pnpm typecheck
  - pnpm test
  - pnpm forge check

risk: medium
human_approval: before_merge
---
```

### 16.2. Kötelező tartalom

```text
Outcome
Non-goals
Context
Contract
Allowed changes
Forbidden changes
Acceptance criteria
Negative cases
Required checks
Stop conditions
Expected handoff
```

### 16.3. Stop condition

Az implementáló KÖTELEZŐEN megáll, ha:

- a base commit már nem érvényes;
- tiltott path módosítása szükséges;
- destructive migráció válik szükségessé;
- secret vagy jogosultsági modell változik;
- az elfogadott specification ellentmond a kódnak;
- az acceptance criteria nem teljesíthető a megadott scope-ban.

Ilyenkor scope-bővítés vagy új döntés szükséges.

---

## 17. AI context package

### 17.1. Tartalom

A context package tartalmazza:

1. a task briefet;
2. kapcsolódó accepted ADR-eket;
3. kapcsolódó accepted specificationöket;
4. releváns Winzard consumer contractot;
5. érintett source pathokat;
6. kötelező ellenőrzéseket;
7. tiltásokat és stop conditionöket;
8. az aktuális base commitot;
9. ismert kockázatokat;
10. korábbi releváns handoffot és evidence-et.

### 17.2. Provenance manifest

```yaml
task_id: ATLAS-TASK-0042
base_commit: abc1234
generated_at: 2026-07-17
documentation_contract_version: 1

source_documents:
  - id: ATLAS-ADR-0007
    source_hash: sha256:...
  - id: ATLAS-SPEC-023
    source_hash: sha256:...
  - id: WZ-CONTRACT-DELIVERY-001
    source_hash: sha256:...

excluded_documents:
  - id: ATLAS-ADR-0002
    reason: superseded

warnings: []
```

### 17.3. Determinizmus

Azonos:

```text
base commit
+ task ID
+ documentation contract version
+ generator version
```

azonos forráslistát és rendezést kell eredményezzen.

### 17.4. Budget

A context builder byte- vagy tokenbudgetet alkalmazhat, de required dokumentumot nem hagyhat el csendben.

Budgettúllépéskor:

- hibát ad;
- megnevezi a túl nagy forrást;
- tömörítési vagy scope-szűkítési javaslatot ad;
- nem vált át észrevétlenül hiányos kontextusra.

### 17.5. Célparancsok

```bash
pnpm forge context:build ATLAS-TASK-0042
pnpm forge context:check ATLAS-TASK-0042
```

---

## 18. AI-jogosultságok és emberi kontroll

### 18.1. Szintek

#### Read

Az AI kereshet, olvashat, elemezhet és összefoglalhat. Nem módosíthat.

#### Draft

Az AI készíthet:

- proposed ADR-t;
- draft specificationt;
- task brief javaslatot;
- review-javaslatot.

Nem fogadhat el dokumentumot.

#### Execute

Az AI kizárólag:

- elfogadott task alapján;
- rögzített base commitból;
- engedélyezett pathokon;
- megadott toolokkal;
- required checkekkel dolgozhat.

#### Integrate

Merge vagy release csak explicit integrátori jogosultsággal és a repository védelmi szabályai szerint történhet.

### 18.2. Kötelező emberi gate

Emberi jóváhagyás szükséges legalább:

1. ADR elfogadásakor;
2. publikus vagy biztonsági specification elfogadásakor;
3. destructive migráció előtt;
4. secret-, auth- vagy jogosultságmodell-változáskor;
5. tiltott path scope-ba emelésekor;
6. kritikus komponens merge-e előtt;
7. release előtt.

### 18.3. Önjóváhagyás tilalma

Az AI nem:

- állíthatja saját ADR-jét `accepted` állapotba;
- verifikálhatja saját handoffját végleges evidence-ként;
- enyhítheti saját `ai_access` korlátozását;
- hagyhatja jóvá saját destructive műveletét;
- jelölheti saját taskját emberi review nélkül released állapotúnak.

---

## 19. Toolhasználat és fail-closed működés

### 19.1. A metadata nem enforcement

Egy dokumentált jelölés:

```yaml
human_approval: before_execute
```

önmagában nem blokkol semmilyen műveletet.

A tényleges gate-et külön kell érvényesíteni:

- sandbox vagy tool permission;
- GitHub branch protection;
- CODEOWNERS review;
- CI environment approval;
- külön integrátori workflow;
- runtime interceptor vagy hook.

### 19.2. Fail-closed

Approval-szükségletnél:

```text
hiányzó enforcement
→ művelet tiltva
```

Nem támogatott:

```text
hiányzó enforcement
→ művelet automatikusan engedélyezve
```

### 19.3. Tool inventory

A task megadhatja:

```yaml
allowed_tools:
  - filesystem.read
  - filesystem.write:allowed_paths
  - shell:required_checks
  - github.pull_request.read

denied_tools:
  - secret.read
  - production.deploy
  - database.destructive
```

A toolazonosítók projekt- vagy agentadapter-specifikusak lehetnek, de a kanonikus task vendorsemleges jelentést tartson fenn.

### 19.4. Audit

Minden write vagy külső side effect esetén AJÁNLOTT rögzíteni:

- task ID;
- actor vagy agentazonosító;
- időpont;
- használt tool;
- input összefoglaló vagy hash;
- eredmény;
- approval referencia;
- érintett path vagy külső erőforrás.

---

## 20. Handoff, review és evidence

### 20.1. Handoff

A handoff kötelező tartalma:

```text
Task ID
Base commit
Result commit
Módosított pathok
Megvalósított contract
Futtatott parancsok
Exit code és eredmény
Nem futtatott ellenőrzések
Nyitott kockázatok
Migration/env/cache/deploy hatás
Dokumentációs változás
Következő pontos lépés
```

Példa metadata:

```yaml
id: ATLAS-HANDOFF-0042
kind: delivery
subtype: handoff
authority: evidence
related_task: ATLAS-TASK-0042
base_commit: abc1234
result_commit: def5678
delivery_status: ready_for_review
```

### 20.2. Független review

A reviewer:

- összeveti a task contractot a diff-fel;
- ellenőrzi a forbidden pathokat;
- újrafuttat vagy hitelesít required checkeket;
- vizsgálja a negatív eseteket;
- ellenőrzi a dokumentációs hatást;
- elfogad vagy javítást kér.

Az implementáló és a végleges reviewer lehetőleg ne ugyanaz az agent legyen.

### 20.3. Evidence

Elfogadható evidence:

- unit-, integration- vagy E2E teszteredmény;
- production build;
- architecture check;
- security scan;
- migrációs dry-run;
- teljesítménymérés;
- screenshot vagy request/response fixture;
- review-jóváhagyás;
- release artifact hash.

Csak a „tesztek lefutottak” állítás nem elég. A dokumentumnak meg kell neveznie a parancsot, eredményt és lehetőség szerint a commitot vagy artifactot.

### 20.4. Verifikáció elavulása

A verification `stale`, ha például:

- megváltozott az érintett specification;
- megváltozott a releváns kód;
- lejárt a `review_due`;
- jelentős dependency upgrade történt;
- a korábbi evidence már nem reprodukálható.

---

## 21. Dokumentációs változási kötelezettség

Dokumentációt KÖTELEZŐ módosítani, ha a változás érinti:

| Változás | Kötelező dokumentum |
| --- | --- |
| Új üzleti capability | Capability dokumentum |
| Tartós architekturális döntés | ADR |
| Publikus CLI/API/config/schema | Specification és reference |
| Törő változás | Upgrade vagy migration guide |
| Domainfogalom | Glossary és érintett specification |
| Template vagy recipe eredetű projektcontract | Consumer contract sync és compatibility evidence |
| Auth, secret vagy jogosultság | Security specification és emberi approval |
| Adatmodell vagy migráció | Data specification és migration evidence |
| Operációs folyamat | Runbook |
| Incident | Incident és szükség szerint postmortem |
| Implementáció | Task, handoff és evidence |
| Release | Release dokumentum |

Egy belső refaktor esetén lehet `user_facing: none`, de a task/handoff/evidence lánc továbbra is szükséges lehet.

A dokumentációt ugyanabban a PR-ban AJÁNLOTT frissíteni, mint a kódot.

---

## 22. Pull request hatásnyilatkozat

Minden PR adjon dokumentációs hatásnyilatkozatot.

```yaml
documentation_impact:
  level: normative
  changed_documents:
    - ATLAS-SPEC-023
    - ATLAS-HANDOFF-0042
  generated_outputs:
    - docs/90-generated/traceability.md
  consumer_contract_impact: none
  user_documentation_impact: updated
  reason: "A listafilter publikus query contractja megváltozott."
```

Engedélyezett kezdeti szintek:

```text
none
internal
normative
user_facing
operational
ai_context
consumer_contract
```

A `none` értékhez indoklás kell.

PR checklist:

```markdown
- [ ] A dokumentációs hatás meg van adva.
- [ ] A normatív forrás frissült.
- [ ] A generált adapterek szinkronban vannak.
- [ ] A task és handoff hivatkozása szerepel.
- [ ] A required checkek evidence-e elérhető.
- [ ] Nincs secret vagy jogosulatlan dokumentum a diffben.
```

---

## 23. A telepített Winzard consumer documentation pack

### 23.1. Cél

A projekt lokálisan, verziózott formában kapja meg a használt Winzard-verzió publikus contractját.

```text
docs/80-winzard/
  manifest/
    winzard-version.md
    documentation-contract-version.md
    source-manifest.md

  platform-contracts/
    module-boundaries.md
    generated-code-policy.md
    delivery-adapter-contract.md
    forge-command-contract.md
    documentation-contract.md

  compatibility/
    supported-runtime.md
    feature-matrix.md

  upgrade-guides/
```

### 23.2. Read-only

A könyvtár:

- generált;
- csak olvasható;
- verzióhoz kötött;
- ellenőrzött source manifesttel rendelkezik;
- támogatott Winzard upgrade során frissül.

TILOS kézzel javítani benne a platformcontractot.

Helyi projekteltéréshez projekt-ADR vagy waiver szükséges.

### 23.3. Nincs belső Winzard-anyag

A pack nem tartalmaz:

- Winzard belső taskot;
- belső handoffot;
- belső incidentet;
- belső roadmapet;
- nem publikus platform-ADR-t;
- maintainer személyes jegyzetét;
- Winzard research vaultot.

### 23.4. Hivatkozás

```markdown
A modulhatárt lásd:
[Module boundaries](../../80-winzard/platform-contracts/module-boundaries.md).
```

Nem kanonikus:

```text
obsidian://open?vault=winzard-core&file=...
../../../../winzard/docs/internal/...
```

### 23.5. Upgrade

Winzard upgrade után:

1. frissül a manifest;
2. frissül a consumer pack;
3. compatibility diff készül;
4. a projekt saját ADR/spec hivatkozásait ellenőrizni kell;
5. törő documentation contractnál migráció szükséges.

---

## 24. Adatbesorolás, AI-hozzáférés és secretek

### 24.1. Besorolás

#### `public`

Nyilvánosan megosztható.

#### `internal`

A projektcsapat és jóváhagyott automatizmusok használhatják.

#### `confidential`

Szerződéses, üzleti vagy személyes érzékenységet tartalmaz. AI-nak csak jóváhagyott környezetben adható.

#### `restricted`

Erősen korlátozott. Alapértelmezés szerint nem kerül AI-kontextusba.

### 24.2. Secret tilalom

Dokumentumba, taskba, handoffba és context package-be TILOS valós secretet tenni:

```text
API key
access token
private key
password
session secret
production connection string
customer credential
```

Használható:

```dotenv
AI_PROVIDER_API_KEY=<secret-manager-reference>
```

### 24.3. Redaction

Evidence rögzítés előtt el kell távolítani:

- Authorization headert;
- cookie-t;
- session ID-t;
- személyes adatot;
- ügyféladatot;
- teljes production payloadot;
- nem szükséges stack trace környezetet.

### 24.4. Chatnapló

Teljes AI-chatnapló nem kanonikus evidence.

A handoff a releváns döntést, parancsot és eredményt strukturáltan rögzíti, nem a teljes beszélgetést.

---

## 25. Obsidian használata

### 25.1. Opcionális authoring felület

A repository gyökere megnyitható Obsidian-vaultként.

A dokumentumok sima Markdown-fájlok maradnak, ezért más szerkesztővel és CI-ben is olvashatók.

### 25.2. Kanonikus elemek

Kanonikus lehet:

- Markdown note;
- YAML frontmatter;
- relatív Markdown-link;
- attachment;
- Git commit.

### 25.3. Nem kanonikus elemek

Nem lehet önmagában source of truth:

- Canvas;
- MOC;
- dashboard;
- graph view;
- search result;
- daily note;
- generated index.

### 25.4. Linkformátum

Kanonikus body-linkként AJÁNLOTT a relatív Markdown-link:

```markdown
[ATLAS-ADR-0007](../adr/ATLAS-ADR-0007.md)
```

Metadata-kapcsolatban stabil ID szerepeljen:

```yaml
depends_on:
  - ATLAS-ADR-0007
```

Obsidian wikilink használható authoring-kényelmi rétegként, de nem lehet az egyetlen géppel értelmezhető kapcsolat.

### 25.5. Pluginfüggőség

Community plugin nem lehet szükséges a dokumentáció parse-olásához vagy validálásához.

---

## 26. Kézi és generált fájlok határa

### 26.1. Kézzel karbantartott

- capability;
- ADR;
- specification;
- policy;
- task brief;
- handoff;
- review;
- runbook;
- release;
- incident;
- user documentation.

### 26.2. Generált

- dokumentációs index;
- traceability map;
- stale document report;
- missing evidence report;
- context package;
- AI adapter;
- consumer pack;
- status dashboard.

### 26.3. Generated header

```markdown
<!-- Generated by Winzard Forge. -->
<!-- Source contract version: 1 -->
<!-- Do not edit directly. -->
```

### 26.4. Manuális módosítás

A generált fájl kézi módosítása driftnek számít.

A javítást a kanonikus forrásban vagy a generatorban kell elvégezni.

---

## 27. Dokumentációs ellenőrzés

Tervezett célparancs:

```bash
pnpm forge docs:check
```

### 27.1. Schema check

Ellenőrzi:

- a kötelező mezőket;
- enumértékeket;
- ID és fájlnév megfelelését;
- duplikált ID-ket;
- dátumformátumokat;
- schema verziót.

### 27.2. Kapcsolatellenőrzés

- a hivatkozott ID létezik;
- nincs törött relatív link;
- nincs érvénytelen supersession;
- nincs tiltott dokumentumfüggőségi ciklus;
- a task hivatkozott specificationje elérhető.

### 27.3. Lifecycle check

- accepted dokumentumnak van ownerje és approvere;
- verified állapothoz van evidence;
- superseded dokumentumnak van utódja;
- ready-for-review taskhoz van handoff;
- lejárt `review_due` warningot vagy hibát ad;
- release-hez van rollback vagy explicit `not_applicable`.

### 27.4. Határellenőrzés

- a `docs/80-winzard` csak generated consumer contractot tartalmaz;
- a projekt nem hivatkozik Winzard belső pathra;
- projekt-dokumentum scope-ja nem lehet `winzard-core`;
- generated fájl nem kézzel szerkesztett;
- más projektprefix nem jelenik meg engedély nélkül.

### 27.5. AI-biztonság

- `ai_access: denied` nem kerül context package-be;
- restricted dokumentumhoz explicit engedély kell;
- superseded dokumentum nem lehet required context;
- draft dokumentum nem válik implicit normatív instrukcióvá;
- a context manifest source hash-e ellenőrizhető;
- az adapter drift észlelhető.

### 27.6. Példa hibakódok

```text
DOC_SCHEMA_INVALID
DOC_ID_DUPLICATE
DOC_LINK_BROKEN
DOC_OWNER_MISSING
DOC_EVIDENCE_MISSING
DOC_REVIEW_OVERDUE
DOC_GENERATED_DRIFT
DOC_INTERNAL_PLATFORM_REFERENCE
DOC_AI_ACCESS_DENIED
DOC_CONTEXT_NONDETERMINISTIC
```

---

## 28. CI-szerződés

### 28.1. Minimális pipeline

```text
install
document schema check
link and ID check
AI adapter drift check
context fixture test
typecheck
lint
unit tests
architecture checks
build
```

A dokumentációs check lehet önálló job, de normatív dokumentumváltozásnál a merge gate része legyen.

### 28.2. Changed-files mód

Gyors PR-ellenőrzés vizsgálhatja csak:

- megváltozott dokumentumokat;
- közvetlen dependenseiket;
- érintett generated adaptereket;
- kapcsolódó context fixture-öket.

### 28.3. Teljes mód

Default branch vagy release előtt teljes vault-ellenőrzés szükséges.

### 28.4. Fixture-ek

A context builder és adaptergenerator tesztje legyen determinisztikus:

- rögzített dokumentumkészlet;
- rögzített task;
- rögzített source hash;
- elvárt output;
- tiltott dokumentum fixture;
- superseded dokumentum fixture;
- restricted hozzáférési fixture.

---

## 29. Mintafolyamat

### 29.1. Capability

Létrejön:

```text
ATLAS-CAP-012 — Terméklista szűrése
```

### 29.2. Döntés

Létrejön és ember elfogadja:

```text
ATLAS-ADR-0007 — A listafilterek query schema alapján működnek
```

### 29.3. Specification

```text
ATLAS-SPEC-023 — Product list query contract
```

Tartalmazza:

- inputmezőket;
- defaultokat;
- jogosultságot;
- maximális oldalméretet;
- DTO-t;
- negatív eseteket;
- acceptance criteria-t.

### 29.4. Task brief

```text
ATLAS-TASK-0042
```

Rögzíti a base commitot, allowed pathokat, forbidden pathokat és required checkeket.

### 29.5. Context package

A context builder csak a taskhoz szükséges accepted dokumentumokat és publikus Winzard contractot választja ki.

### 29.6. Implementáció

Az ember vagy AI az engedélyezett pathokon dolgozik.

Scope-problémánál megáll és változtatási kérelmet ad.

### 29.7. Handoff

```text
ATLAS-HANDOFF-0042
```

Rögzíti a commitot, diff scope-ot, parancsokat és nyitott kockázatokat.

### 29.8. Review

A reviewer újrafuttatja a lényeges ellenőrzéseket és összeveti a contractot a kóddal.

### 29.9. Evidence

```text
ATLAS-EVIDENCE-0042
```

A specification verification állapota `verified` lehet.

### 29.10. Release

A release dokumentum hivatkozik a capability-re, specificationre és evidence-re.

---

## 30. Fokozatos bevezetés

### 30.1. Első fázis: repository docs

Hozd létre:

```text
docs/
PROJECT-HOME
PROJECT-BRIEF
DOMAIN-GLOSSARY
ARCHITECTURE-MAP
DELIVERY-MAP
```

### 30.2. Második fázis: lifecycle és ID

- válassz projectprefixet;
- vezess be stabil ID-ket;
- különítsd el a három lifecycle-t;
- jelöld az ownert és review időpontot.

### 30.3. Harmadik fázis: task és handoff

Az új fejlesztések task briefből és strukturált handoffból dolgozzanak.

A történeti taskokat nem kell mind visszamenőleg migrálni.

### 30.4. Negyedik fázis: AI adapterek

Inventorizáld:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
.github/copilot-instructions.md
path-specific rules
```

Az ismétlődő szabályt emeld kanonikus policyba, majd generáld az adaptereket.

### 30.5. Ötödik fázis: CI

Fokozatos mód:

```text
warning
→ required on changed docs
→ required on all canonical docs
```

### 30.6. Hatodik fázis: consumer pack

A Winzard-verzió publikus contractját támogatott sync folyamat telepíti a `docs/80-winzard` könyvtárba.

Közvetlen belső Winzard-dokumentum másolása tilos.

---

## 31. Symfony–Winzard megfeleltetés

### 31.1. Mit ad a Symfony AI referencia?

A Symfony AI dokumentáció jó mintát ad arra, hogyan lehet:

- komponensekre bontani egy AI-területet;
- gyors kezdést és mély referenciát külön kezelni;
- agent-, tool- és message-lifecycle-t dokumentálni;
- human-in-the-loop mintát bemutatni;
- mockolható, tesztelhető felületet kialakítani;
- cookbook recepteket adni.

### 31.2. Miért szükséges több a projektdokumentációhoz?

A kitelepített Winzard-projektnek ezen felül kezelnie kell:

- dokumentumautoritást;
- source of truthot;
- projektprefixet és stabil ID-ket;
- külön lifecycle-okat;
- task scope-ot és base commitot;
- path- és tool-jogosultságot;
- context provenance-t;
- AI adapter driftet;
- handoffot és független review-t;
- evidence-et;
- telepített consumer platformcontractot.

### 31.3. Fogalmi megfeleltetés

| Symfony AI fogalom | Winzard projektdokumentációs megfelelő |
| --- | --- |
| Platform abstraction | Vendorsemleges kanonikus dokumentáció |
| Agent | Taskot végrehajtó ember vagy AI |
| Tool | Engedélyezett repository- vagy külső művelet |
| Tool metadata | Task permission és risk metadata |
| Tool event | Végrehajtási approval, hook vagy audit esemény |
| Human-in-the-loop | Explicit human approval gate |
| Message/context | Task context package |
| Memory | Projektinstrukció és korábbi releváns evidence |
| MockAgent | Determinisztikus AI adapter- vagy eval-fixture |
| Cookbook | Projekt how-to és tutorial |
| Component reference | Projekt specification és reference |
| MCP | Külön runtime/integrációs capability, nem dokumentációs alap |

### 31.4. Kritikus különbség

A tool metadata önmagában nem hajt végre biztonsági döntést.

```text
dokumentált approval igény
≠ tényleges végrehajtási blokk
```

A hard gate külön enforcement.

### 31.5. Tesztelés

Az AI delivery tesztjei determinisztikus fixture-öket használjanak:

- rögzített task;
- rögzített context manifest;
- rögzített adapter output;
- tiltott dokumentumok;
- elvárt validation hibák;
- tool permission tesztek.

---

## 32. Források és attribúció

### 32.1. Symfony referencia

- [Symfony AI Documentation](https://symfony.com/doc/current/ai/index.html)
- [Symfony AI Components](https://symfony.com/doc/current/ai/components/index.html)
- [Symfony AI Bundles](https://symfony.com/doc/current/ai/bundles/index.html)
- [Symfony AI Cookbook](https://symfony.com/doc/current/ai/cookbook/index.html)
- [Symfony AI Agent Component](https://symfony.com/doc/current/ai/components/agent.html)

A Winzard fejezet ezeket nem runtime API-ként másolja át. A komponensességet, a gyors kezdést, az explicit tool lifecycle-t, a human approval és a determinisztikus tesztelés elvét alkalmazza a kitelepített projekt dokumentációs és AI-delivery szerződésére.

### 32.2. AI-fejlesztőeszközök hivatalos dokumentációja

- [OpenAI Codex — Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Claude Code — How Claude remembers your project](https://docs.anthropic.com/en/docs/claude-code/memory)
- [GitHub Copilot — Repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [GitHub Copilot CLI — Custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
- [Gemini CLI — Provide Context with GEMINI.md Files](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html)

Ezek eltérő instrukciós fájlneveket, hierarchiákat, path-scope-ot és betöltési szabályokat használnak. Ez indokolja, hogy a projekt vendorsemleges kanonikus contractból generáljon adaptereket, ne több, kézzel párhuzamosan karbantartott forrást tartson fenn.

### 32.3. Dokumentációs alapok

- [Obsidian — How Obsidian stores data](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data)
- [Diátaxis documentation framework](https://diataxis.fr/)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)

### 32.4. Ellenőrzési dátum

```text
2026-07-17
```

Az AI-eszközök instrukciós fájljai és betöltési szabályai változhatnak. Dokumentációfrissítéskor újra ellenőrizni kell legalább:

- az `AGENTS.md` discovery és override sorrendjét;
- a `CLAUDE.md` import- és path-rule működését;
- a `GEMINI.md` hierarchiát;
- a Copilot repository- és path-specific instruction formátumát;
- a context- és tool permission különbségét;
- a vendor adapterek méret- és priority szabályait.
