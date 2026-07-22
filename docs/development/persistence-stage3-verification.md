# Persistence platform — Stage 3 verification

## Scope

This record covers the verification and repair stage for the Winzard Persistence Platform v1 on pull request #24.

No merge is part of this stage. The branch remains separate from `main` until an explicit Stage 4 instruction.

## Verification matrix

The final pull-request head must pass all of the following:

```text
Verify / core
Verify / database
Verify / runtime-security
Verify / reproducibility
Persistence / persistence
```

The matrix includes:

- TypeScript type-checking;
- ESLint with zero warnings;
- unit and fixture tests;
- documentation, routing, delivery, kernel, configuration, composition, event, contract, extension and view checks;
- minimal-template and reference builds;
- reference E2E smoke tests;
- Prisma schema validation and client generation;
- PostgreSQL migration deployment;
- persistence inventory and generated-evidence checks;
- PostgreSQL query-plan drift verification;
- PostgreSQL integration tests;
- runtime read-only and network-boundary tests;
- reproducible artifact comparison.

## Issues found and corrected

### Type inference loss during immutable mapping

The first verification run failed during TypeScript compilation because `Object.freeze` was passed directly to `Array.map` in schema and migration inventory construction. TypeScript inferred `unknown` instead of the domain record type.

The fix replaced method references with explicit callbacks:

```ts
values.map((value) => Object.freeze(value));
```

This preserves the array element type while retaining immutable output.

### Time-dependent outbox claim fixture

The initial PostgreSQL claim test inserted outbox rows with the database default for `availableAt`, while the repository was invoked with a fixed earlier `now` value. The rows were correctly excluded as not yet available, causing the test to receive an empty result.

The fixture now supplies an explicit `availableAt` before the fixed claim time. The test is deterministic and no longer depends on the CI runner clock.

### Diagnostic artifact scoping

The Persistence workflow now records type-check, query-plan and integration-test output only when the corresponding step fails. Diagnostic artifacts do not run for unrelated downstream failures.

### Portable JSON output

`database:about --json` no longer exposes the machine-specific absolute project root. A regression test verifies that the serialized inventory omits the filesystem root while retaining schema, migration, repository, query-plan, issue and fingerprint data.

### Missing query-plan evidence

The outbox repository contract requires `OutboxMessage_status_availableAt_idx` for `claim-batch`, but the initial template had no execution-plan evidence. This left a project-level persistence warning even though the error-only CI gate passed.

A PostgreSQL 18.4 capture now loads a deterministic 10,000-row fixture, runs `ANALYZE`, and explains the bounded `FOR UPDATE SKIP LOCKED` candidate query. The captured plan uses an `Index Scan` on `OutboxMessage_status_availableAt_idx` and is committed with query and plan fingerprints.

Every Persistence workflow run reconstructs the same plan and verifies the committed query fingerprint, plan hash and index set. Plan drift fails CI.

## PostgreSQL coverage

The dedicated integration and evidence suites verify:

- tagged, read-only readiness;
- rollback without partial outbox state;
- bounded and ordered `FOR UPDATE SKIP LOCKED` claiming;
- transaction-safe inbox idempotency through `createMany({ skipDuplicates: true })`;
- actual use of `OutboxMessage_status_availableAt_idx` by the claim query;
- stable query and plan fingerprints on PostgreSQL 18.4.

## Merge gate

Stage 3 is complete only when the final branch head has no failed or pending GitHub Actions jobs, no project-level persistence error or warning remains, the branch is not behind `main`, and the pull request remains mergeable.

The pull request must remain draft and unmerged at the end of this stage. Stage 4 requires separate explicit approval.
