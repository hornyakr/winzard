# Forms platform — Stage 3 verification

## Scope

This record covers test execution, defect correction and merge-readiness verification for the Winzard Forms Platform v1 on draft pull request #26.

No merge is part of this stage. The branch remains separate from `main` until a distinct Stage 4 instruction.

## Verification status

Status: in progress.

The final branch head must pass:

```text
Forms / forms
Verify / core
Verify / database
Verify / runtime-security
Verify / reproducibility
Persistence / persistence
```

## Findings and repairs

### Action-state union was too narrow

The first TypeScript run found that idle, rejected and success variants used literal `{}` and `readonly []` members that were too narrow for shared UI access and mapped action results.

The state now uses a common immutable base with typed `LuckyNumberFieldErrors` and `readonly LuckyNumberFormError[]`, while `status` remains the discriminant and only the success variant owns `result`.

### Legacy action assertions

Existing action tests still asserted the removed `ok` and `formError` fields. They now assert the explicit `invalid`, `rejected` and `success` variants and safely narrow before reading the success result.

### Forge inventory type safety

The first Forge implementation declared the source collection as one readonly record rather than a readonly array. The inventory was replaced with a typed `SourceRecord[]` implementation, immutable outputs, validated field kinds and deterministic ordering.

### Generated evidence drift

After the inventory repair, all six generated form documents were regenerated from the canonical inventory and synchronized with its SHA-256 fingerprint.

### Form-only intent leaked into the HTTP contract

The first form schema reused `luckyNumberRequestSchema` and made `intent=generate` mandatory for both Server Action form submissions and JSON Route Handler requests. This caused otherwise valid API requests to return 422 and masked range errors.

The contracts are now separate:

```text
luckyNumberRequestSchema
  → JSON / Route Handler range input

luckyNumberFormSchema
  → Server Action FormData input + submit intent
```

Server Action tests now submit the same explicit `intent` value as the browser submitter.

### Safe form errors were classified as raw exceptions

The generic UI primitives used a local callback variable named `error`, which caused the existing view heuristic to interpret `error.message` as raw exception rendering.

The reference, minimal and webapp UI primitives now use the explicit `formError` name. The rendered contract is unchanged and the distinction between safe `FormError` values and exceptions is visible in the source.

### CI diagnostic scoping

The Forms workflow retains failure-only artifacts for TypeScript and form-contract/evidence diagnostics. Temporary full-suite and webapp diagnostic steps used during repair were removed after their findings were addressed; full regression ownership remains with Verify and Persistence.

## Proven checks before final-head verification

The repair sequence has already produced successful runs for:

- forms-platform TypeScript checking;
- targeted Forge and reference form tests;
- form contract, accessibility and security checks;
- reference production build;
- runtime read-only and network-boundary verification;
- reproducible artifact comparison;
- dedicated PostgreSQL persistence workflow.

These results are not treated as the final merge gate until the same matrix passes on the final branch head.

## Merge gate

Stage 3 is complete only when the final head has no failed or pending workflow jobs, generated evidence is synchronized, the branch is not behind `main`, the draft pull request is mergeable, and no known form security, accessibility, architecture or regression issue remains.
