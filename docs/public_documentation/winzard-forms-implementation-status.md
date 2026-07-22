---
title: "Winzard Forms implementációs állapot"
description: "A Winzard form-contract platform v1 implementált felülete és szándékosan kizárt runtime képességei."
status: "implementation-draft"
document_version: "0.1.0"
last_verified: "2026-07-22"
---

# Winzard Forms implementációs állapot

A normatív, teljes form-specifikáció forrásdokumentuma a fejlesztési feladat bemenete. Ez a rövid dokumentum kizárólag az első implementált platformverzió állapotát rögzíti; nem helyettesíti a teljes specifikációt.

## Implementált

```text
static *.form.definition.ts contract
Forge form inventory és fingerprint
form:list / inspect / check / contracts / fields / errors / docs
form:fixtures / a11y / security
make:form / make:server-action / make:form-handler
generált form evidence
reference Server Action form
explicit FormData extractor
strict operation schema
explicit application input mapper
stabil action state és hibakódok
accessible field és error-summary primitívek
minimal és webapp template alapok
```

## Runtime modell

```text
HTML form
→ FormData
→ explicit extractor
→ operation-specific runtime schema
→ normalized application input
→ existing delivery contract és request context
→ application command
→ explicit action state
```

Nincs automatikus entity- vagy ORM-mutáció.

## Nem implementált

- általános runtime form engine;
- runtime form registry;
- Prisma-alapú automatikus production formgenerálás;
- kötelező külső kliensoldali form library;
- object-storage upload provider;
- CAPTCHA provider;
- több lépéses workflow engine;
- automatikus autosave runtime.

## Ellenőrzés

A fejlesztési ág ellenőrzési kapuja:

```bash
pnpm typecheck
pnpm lint
pnpm vitest run packages/forge/tests/forms.test.ts
pnpm vitest run apps/reference/tests/unit/modules/demo/lucky-number/lucky-number.form.test.ts
pnpm verify:forms
pnpm build
```

A dokumentum `last_verified` mezője csak a specifikáció baseline-ját jelzi. Az implementáció teljes technikai ellenőrzése a külön Stage 3 folyamat feladata.
