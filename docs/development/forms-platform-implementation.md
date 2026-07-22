# Forms platform implementation

## Scope

This change implements the first static Winzard form-contract platform on top of the existing presentation and delivery layers.

It does not introduce a runtime form engine, service locator, ORM mapping layer or mandatory client-side form library.

## Forge modules

```text
packages/forge/src/forms/
  types.ts
  inventory.ts
  checks.ts
  render.ts
  docs.ts
  generator.ts
  cli.ts
```

The inventory combines:

```text
static *.form.definition.ts metadata
+ TypeScript and TSX source inspection
+ adjacent delivery contract evidence
```

The inventory is deterministic and exposes a SHA-256 fingerprint.

## Commands

```bash
pnpm forge form:list
pnpm forge form:inspect <form-id>
pnpm forge form:check
pnpm forge form:contracts
pnpm forge form:fields
pnpm forge form:errors
pnpm forge form:docs
pnpm forge form:fixtures
pnpm forge form:a11y
pnpm forge form:security
pnpm forge make:form <module/resource/operation>
pnpm forge make:server-action <module/resource/operation>
pnpm forge make:form-handler <module/resource/operation>
```

All inspection commands support `--project` and `--json`. Generators support `--dry-run` and fail closed on conflicts unless `--force` is supplied.

## Reference implementation

The Lucky Number Server Action form now uses:

- an explicit raw `FormData` extractor;
- a strict operation-specific Zod schema;
- an application input mapper;
- a discriminated serializable action state;
- stable field and form error records;
- a static form definition;
- field IDs, labels, help text and error descriptions;
- an error summary linked to invalid fields;
- a child `useFormStatus` submit control;
- generated form evidence.

The form continues to use the existing delivery contract and application command. No second authentication, authorization, tenant or HTTP contract system was added.

## Generated evidence

```text
apps/reference/docs/90-generated/forms/form-map.md
apps/reference/docs/90-generated/forms/form-contracts.md
apps/reference/docs/90-generated/forms/form-fields.md
apps/reference/docs/90-generated/forms/form-errors.md
apps/reference/docs/90-generated/forms/accessibility-status.md
apps/reference/docs/90-generated/forms/security-status.md
```

## CI

The dedicated `Forms` workflow performs TypeScript checking, Forge and reference unit tests, form contract verification, documentation drift verification and a production reference build.

## Deliberate exclusions

This version does not implement:

- a runtime form registry;
- automatic entity or Prisma mutation;
- automatic production forms from Prisma metadata;
- object-storage upload providers;
- CAPTCHA providers;
- a multi-step workflow engine;
- a mandatory client-side form package.
