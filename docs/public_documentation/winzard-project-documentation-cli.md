---
title: "Kitelepített Winzard projektek dokumentációs CLI-je"
description: "A project-documentation és ai-delivery capability jelenleg implementált Forge-parancsainak referenciaoldala."
status: "implemented-reference"
document_version: "0.1.0"
last_verified: "2026-07-17"
applies_to: "kitelepített vagy generált Winzard projektek"
excludes:
  - "a Winzard alaprendszer belső dokumentációs vaultja"
  - "Winzard-core roadmap, task, handoff és nem publikus ADR"
  - "alkalmazás-runtime AI provider vagy agent integráció"
---

# Kitelepített Winzard projektek dokumentációs CLI-je

## Hatókör

Ez az oldal kizárólag a Winzarddal létrehozott alkalmazás saját Project Vaultjának futtatható parancsait dokumentálja. A parancsok nem exportálják a Winzard alaprendszer belső fejlesztési dokumentumait.

A kitelepített projektbe kerülő egyetlen platformdokumentációs híd:

```text
docs/80-winzard/
```

Ez verziózott, generált és csak olvasható consumer documentation pack.

## Capability manifest

```json
{
  "schemaVersion": 1,
  "profile": "minimal",
  "capabilities": [
    "forge",
    "project-documentation",
    "ai-delivery"
  ],
  "documentation": {
    "contractVersion": 1,
    "projectPrefix": "ATLAS",
    "consumerContractVersion": "0.1.0",
    "contextBudgetBytes": 262144
  }
}
```

Az `ai-delivery` megköveteli a `project-documentation` capability-t. A `project-documentation` megköveteli a `forge` capability-t.

## Inicializálás

```bash
pnpm forge docs:init \
  --prefix=ATLAS \
  --ai
```

A parancs:

- létrehozza a projekt dokumentációs könyvtárszerkezetét;
- létrehozza a kezdeti projekt-, domain-, architecture- és delivery-dokumentumokat;
- telepíti a publikus consumer documentation packet;
- létrehozza a dokumentumsablonokat;
- előállítja a humán indexeket és status projekciókat;
- `--ai` mellett generálja az AI-instrukciós adaptereket;
- capability-aware módon frissíti a Winzard manifestet.

Más projektgyökérhez:

```bash
pnpm forge docs:init \
  --project=../atlas \
  --prefix=ATLAS \
  --ai
```

A `--force` explicit, destruktív scaffold-felülírás. Generált consumer packet vagy kézzel karbantartott AI-instrukciós fájlt a Forge ezzel sem ír felül ellenőrzés nélkül.

## Dokumentáció ellenőrzése

```bash
pnpm forge docs:check
```

JSON kimenet:

```bash
pnpm forge docs:check --json
```

Csak kanonikus források ellenőrzése, generált drift nélkül:

```bash
pnpm forge docs:check --canonical-only
```

A teljes ellenőrzés vizsgálja többek között:

- a frontmatter schema verzióját és kötelező mezőit;
- az ID- és fájlnév-egyezést;
- a projektprefixet és az idegen projektkapcsolatokat;
- a dokumentum-, implementáció- és verifikációs lifecycle-t;
- a kapcsolatokat, supersessiont és dependency cycle-t;
- a relatív Markdown-linkeket, beleértve a repositoryn kívülre mutató vagy symlinken kiszökő célokat;
- a required human approval hivatkozásokat;
- a task scope-ot és base commitot;
- a secretmintákat és tiltott belső Winzard-hivatkozásokat;
- a consumer pack, AI adapter, projekció és context package driftet;
- a context source hash-eket és AI access szabályokat.

A parancs hibánál nem nulla exit code-dal áll le.

## Státusz és generált projekciók

```bash
pnpm forge docs:status
pnpm forge docs:status --json
```

A projekciók újragenerálása:

```bash
pnpm forge docs:generate
```

Csak drift ellenőrzése:

```bash
pnpm forge docs:generate --check
```

A generált nézetek például:

```text
docs/90-generated/indexes/documentation-index.md
docs/90-generated/traceability/delivery-traceability.md
docs/90-generated/status/documentation-status.md
docs/90-generated/status/stale-documents.md
docs/90-generated/status/missing-evidence.md
```

Ezek projekciók, nem forrásigazságok.

## Új kanonikus dokumentum

```bash
pnpm forge docs:new specification \
  --title="Catalog filter contract"
```

Támogatott első sablonok:

```text
capability
adr
specification
policy
task
handoff
review
evidence
runbook
release
incident
```

Task létrehozása:

```bash
pnpm forge docs:new task \
  --title="Implement catalog filter"
```

A Forge Git repositoryban automatikusan rögzíti az aktuális commitot `base_commit` értékként. Repositoryn kívüli fixture-nél explicit érték adható:

```bash
pnpm forge docs:new task \
  --title="Implement catalog filter" \
  --base-commit=<COMMIT_SHA>
```

A generált task kezdetben `proposed`. Végrehajtható context csak ember által elfogadott, teljes path-, check-, kockázat- és approval-szerződéssel rendelkező taskból készül.

## Consumer documentation pack

Frissítés:

```bash
pnpm forge docs:sync
```

Drift ellenőrzése:

```bash
pnpm forge docs:sync --check
```

A pack TILOS, hogy Winzard belső roadmapet, taskot, handoffot, incidentet, maintainer jegyzetet vagy nem publikus ADR-t tartalmazzon.

## AI-instrukciós adapterek

Generálás:

```bash
pnpm forge docs:adapters
```

Drift ellenőrzése:

```bash
pnpm forge docs:adapters --check
```

A generált célok:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
.github/copilot-instructions.md
.github/instructions/*.instructions.md
```

Az adapterek elfogadott, AI számára engedélyezett, required projektcontractokból és a consumer packből készülnek. Kézi módosításuk drift.

## Task context package

```bash
pnpm forge context:build ATLAS-TASK-0001
```

Ellenőrzés:

```bash
pnpm forge context:check ATLAS-TASK-0001
```

Kimenet:

```text
docs/90-generated/ai-context/ATLAS-TASK-0001.md
docs/90-generated/ai-context/ATLAS-TASK-0001.manifest.json
```

A context package:

- determinisztikusan rendezett;
- task-, relation- és priority-alapú;
- source hash-eket rögzít;
- nem tölti be automatikusan a teljes vaultot;
- kizárja a denied, superseded és jogosulatlan dokumentumokat;
- a teljes renderelt context package byte budgetjének túllépésénél hibázik;
- alapértelmezetten ellenőrzi, hogy a task base commitja az aktuális HEAD őse.

Kivételes, dokumentált diagnosztikai célra a stale base ellenőrzés lazítható:

```bash
pnpm forge context:build ATLAS-TASK-0001 --allow-stale-base
```

Restricted vagy confidential dokumentum csak a verziózott task `allowed_context_documents` mezőjében előzetesen rögzített engedéllyel kerülhet be. A CLI flag ezt a már elfogadott taskengedélyt erősíti meg, de nem bővítheti a task scope-ját:

```yaml
allowed_context_documents:
  - ATLAS-SPEC-042
```

```bash
pnpm forge context:build ATLAS-TASK-0001 \
  --allow-restricted=ATLAS-SPEC-042
```

A két feltétel együttesen kötelező: az ID szerepeljen az accepted task metadata mezőjében, és ugyanaz az ID legyen explicit megadva a `--allow-restricted` opciónak. Bármelyik hiányában a parancs fail-closed hibával leáll.

## Handoff

```bash
pnpm forge handoff:new ATLAS-TASK-0001
```

A Forge megköveteli:

- az accepted task briefet;
- a tiszta Git working tree-t;
- az érvényes base és result commitot;
- hogy a base commit a result commit őse legyen;
- az allowed pathokon belüli implementációs diffet;
- a forbidden pathok érintetlenségét;
- a generált dokumentációs artifactok driftmentességét.

A generált context, consumer pack és AI adapter nem számít alkalmazáskód-scope túllépésnek, de csak akkor, ha a dokumentációs ellenőrzés bizonyítja, hogy valóban determinisztikus generált artifact.

## Fail-closed hibák

A parancsok stabil hibakódokat adnak. Példák:

```text
DOCUMENTATION_MANIFEST_MISSING
DOC_SCHEMA_INVALID
DOC_ID_DUPLICATE
DOC_REFERENCE_MISSING
DOC_LINK_OUTSIDE_PROJECT
DOC_AI_ACCESS_DENIED
DOC_TASK_APPROVAL_MISSING
DOC_TASK_BASE_COMMIT_MISMATCH
DOC_TASK_BASE_COMMIT_UNVERIFIABLE
DOC_RESULT_COMMIT_NOT_CHECKED_OUT
DOC_CONTEXT_BUDGET_EXCEEDED
DOC_CONTEXT_NONDETERMINISTIC
DOC_CONTEXT_MANUAL_CONTENT
DOC_GENERATED_DRIFT
DOC_PROJECTION_MANUAL_CONTENT
DOC_CONSUMER_PACK_MANUAL_CONTENT
DOC_WORKTREE_DIRTY
DOC_TASK_FORBIDDEN_PATH_CHANGED
DOC_TASK_SCOPE_EXCEEDED
DOC_PLACEHOLDER_UNRESOLVED
DOC_PATH_PATTERN_INVALID
DOCUMENTATION_PROJECT_PREFIX_IMMUTABLE
```

Hiányzó approval enforcement, hibás source hash vagy nem értelmezhető Git diff nem eredményezhet automatikus engedélyezést.

## CI

Kitelepített projekt minimális ellenőrzése:

```bash
pnpm forge check
pnpm forge docs:check
pnpm forge docs:generate --check
pnpm forge context:check <ACTIVE_TASK_ID>
```

Az aktív task context checkje csak akkor kerüljön általános CI-be, ha az adott context package verziózott projektartifact. Egyébként task-specifikus workflow futtassa. A base commit ellenőrzéséhez a CI checkoutnak elérhetővé kell tennie a szükséges Git historyt; sekély checkout mellett a Forge szándékosan `DOC_TASK_BASE_COMMIT_UNVERIFIABLE` hibával áll le.
