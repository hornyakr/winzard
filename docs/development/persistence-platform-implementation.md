# Persistence platform implementation

## Scope

This change implements the first static Winzard persistence platform for projects with the `prisma-postgresql` capability.

The implementation is additive. It does not make PostgreSQL a core requirement and does not change the database-free reference or minimal-template build contract.

## Forge modules

```text
packages/forge/src/persistence/
  types.ts
  schema.ts
  inventory.ts
  docs.ts
  render.ts
  cli.ts
```

The inventory is deterministic and contains:

- Prisma datasource, generator, models, enums, fields, keys and indexes;
- ordered migration records with SHA-256 fingerprints and static risk classification;
- static `*.repository.definition.ts` contracts;
- optional `*.query-plan.json` evidence;
- architecture and security diagnostics;
- one aggregate fingerprint.

No private Prisma parser API is used. Prisma CLI remains authoritative for Prisma schema syntax and provider validation.

## Repository definitions

Repository metadata is a static TypeScript literal exported as `repositoryDefinition`. Forge parses the literal through the TypeScript AST without executing project code.

The definition records:

```text
repository ID
application port
infrastructure adapter
Prisma models
read/write role
tenant scope
soft-delete policy
optimistic concurrency policy
transaction policy
bounded query contracts
stable ordering
required indexes
```

This is evidence and diagnostics metadata. It is not a runtime registry or service locator.

## Migration governance

Each migration receives a canonical SHA-256 hash, statement count and static risk list. Destructive `DROP` operations require an adjacent `migration.approval.json` file.

Generated evidence:

```text
docs/90-generated/persistence/schema.md
docs/90-generated/persistence/repositories.md
docs/90-generated/persistence/query-plans.md
docs/90-generated/persistence/migration-manifest.json
```

## Runtime changes

Database readiness now uses a tagged, read-only Prisma query and clears its timeout resource in all outcomes.

Inbox idempotency no longer catches a unique-constraint exception inside an open PostgreSQL transaction. It uses `createMany({ skipDuplicates: true })`, preventing a duplicate claim from aborting the surrounding transaction.

## Reference fixture

`packages/forge/tests/fixtures/persistence-project` contains a complete Product reference slice:

- Prisma schema and SQL migration;
- domain model;
- read/write repository ports;
- Prisma read/write adapters;
- optimistic update command;
- operation-specific Zod schemas;
- delivery adapter factory;
- repository definition.

The fixture is excluded from package TypeScript compilation and is used by Forge inventory tests.

## PostgreSQL tests

The webapp template has a separate Vitest integration configuration. The integration suite covers:

- read-only readiness;
- transaction rollback;
- bounded and ordered `FOR UPDATE SKIP LOCKED` claims;
- compound-key inbox idempotency.

A dedicated GitHub Actions workflow provisions PostgreSQL 18.4, applies migrations, verifies persistence evidence and runs the integration suite.

## Deliberate exclusions

This version does not implement:

- automatic resource generation;
- Row-Level Security setup;
- read replicas;
- TypedSQL registry;
- automatic production `EXPLAIN ANALYZE` execution;
- ORM-neutral persistence abstraction;
- startup-time migration execution.
