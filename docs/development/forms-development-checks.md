# Forms development checks

## Forge inventory and diagnostics

```bash
pnpm forge form:list --project apps/reference
pnpm forge form:inspect demo.lucky-number.generate --project apps/reference
pnpm forge form:contracts --project apps/reference
pnpm forge form:fields --project apps/reference
pnpm forge form:errors --project apps/reference
pnpm forge form:a11y --project apps/reference
pnpm forge form:security --project apps/reference
pnpm forge form:check --project apps/reference
```

## Generated evidence

```bash
pnpm forge form:docs --project apps/reference
pnpm forge form:docs --check --project apps/reference
```

Generated files must be reviewed together with the source change. A changed inventory fingerprint is expected when a form definition, field contract, implementation reference or diagnostic result changes.

## Unit checks

```bash
pnpm vitest run packages/forge/tests/forms.test.ts
pnpm vitest run apps/reference/tests/unit/modules/demo/lucky-number/lucky-number.form.test.ts
```

## Static and production verification

```bash
pnpm typecheck
pnpm lint
pnpm verify:forms
pnpm build
pnpm test:e2e:reference
```

## Generator checks

```bash
pnpm forge make:form catalog/product/create --dry-run --project /tmp/form-project
pnpm forge make:server-action catalog/product/create --dry-run --project /tmp/form-project
pnpm forge make:form-handler catalog/product/create --dry-run --project /tmp/form-project
```

Generators must be deterministic, idempotent and conflict-protected. They must not overwrite manually changed files unless `--force` is explicitly supplied.

## Stage boundary

Stage 2 creates the implementation and test assets. Stage 3 executes the full matrix, records failures, repairs defects, regenerates evidence and leaves the pull request unmerged.
