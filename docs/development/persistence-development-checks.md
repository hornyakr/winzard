# Persistence development checks

## Static Forge checks

```bash
pnpm forge database:about --project templates/webapp
pnpm forge database:check --project templates/webapp
pnpm forge schema:list --project templates/webapp
pnpm forge schema:docs --check --project templates/webapp
pnpm forge migration:check --project templates/webapp
pnpm forge migration:drift --project templates/webapp
pnpm forge repository:check --project templates/webapp
pnpm forge query:plans --project templates/webapp
```

## Forge unit and fixture tests

```bash
pnpm vitest run packages/forge/tests/persistence.test.ts
pnpm typecheck
pnpm lint
```

## Prisma and template checks

```bash
pnpm db:validate:webapp
pnpm db:generate:webapp
pnpm verify:webapp-template
```

## PostgreSQL integration

```bash
export DATABASE_URL='postgresql://winzard:winzard_dev_only@127.0.0.1:5432/winzard?schema=public'
export DATABASE_POOL_MAX=10
export DATABASE_CONNECTION_TIMEOUT_MS=5000

docker compose -f templates/webapp/compose.yaml up -d postgres
pnpm db:migrate:deploy:webapp
pnpm --dir templates/webapp test:integration
```

## Generated evidence

When persistence sources change:

```bash
pnpm forge schema:docs --project templates/webapp
git diff -- templates/webapp/docs/90-generated/persistence
pnpm forge schema:docs --check --project templates/webapp
```

A changed migration hash must be treated as a migration-history incident unless the migration is a branch-local draft that has never been applied.

## Full matrix

```bash
pnpm verify:core
pnpm verify:database
```

The persistence GitHub Actions workflow independently provisions PostgreSQL 18.4 and runs the dedicated persistence suite.
