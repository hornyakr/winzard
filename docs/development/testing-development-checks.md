# Testing platform development checks

## Static inventory and diagnostics

```bash
pnpm forge test:list --project .
pnpm forge test:matrix --project .
pnpm forge test:check --project .
pnpm forge test:fixtures --project .
pnpm forge test:flaky --project .
pnpm forge test:coverage --project .
pnpm forge test:docs --check --project .
```

Project-specific checks:

```bash
pnpm forge test:check --project apps/reference
pnpm forge test:check --project templates/minimal
pnpm forge test:check --project templates/webapp
```

## Fast runner layers

```bash
pnpm test:unit
pnpm test:contract
pnpm test:component
pnpm test:coverage
```

## PostgreSQL contract layer

Use an explicit test database. The integration setup refuses URLs without a local host and a `test` marker.

```bash
export DATABASE_URL='postgresql://winzard:winzard_test_only@127.0.0.1:5432/winzard_test?schema=public'
export DATABASE_POOL_MAX=4
export DATABASE_CONNECTION_TIMEOUT_MS=5000

docker compose -f templates/webapp/compose.yaml up -d postgres
pnpm db:validate:webapp
pnpm db:generate:webapp
pnpm db:migrate:deploy:webapp
pnpm test:database
```

## Production application and browser layers

```bash
pnpm build
pnpm test:application
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:a11y
```

The application smoke uses Node `fetch()` and does not prove browser hydration. The Playwright suite starts a production server and executes client interaction in Chromium.

## Impact selection

```bash
pnpm forge test:impact --changed-from=origin/main --project .
```

The impact command intentionally returns all suites when the changed-file relation is uncertain.

## Generated evidence

When definitions, suite globs, test files, capabilities or testing checks change:

```bash
pnpm forge test:docs --project .
git diff -- docs/90-generated/testing
pnpm forge test:docs --check --project .
```

## Merge-stage matrix

The verification stage must include:

```text
TypeScript
ESLint
unit-node
contract-node
component-jsdom
PostgreSQL integration
production HTTP application smoke
Playwright Chromium
axe accessibility
Forge testing inventory and drift
minimal template build
webapp template build
Reference App production build
existing Verify, Forms and Persistence workflows
```

Do not merge while any required job is failed, pending, skipped without policy, or using a stale generated testing document.
