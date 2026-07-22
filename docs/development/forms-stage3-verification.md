# Forms platform — Stage 3 verification

## Scope

This record covers test execution, defect correction and merge-readiness verification for the Winzard Forms Platform v1 on draft pull request #26.

No merge is part of this stage. The branch remains separate from `main` until a distinct Stage 4 instruction.

## Verification status

Status: complete.

Technical verification basis:

```text
commit: 20a4f31b0d6541e5065c35bf24f8e2fc100e1d91
Forms run: 29964365207 / success
Verify run: 29964365197 / success
Persistence run: 29964365223 / success
Fresh Checkout Build run: 29964365169 / success
```

The verified matrix:

```text
Forms / forms
Verify / core
Verify / database
Verify / runtime-security
Verify / reproducibility
Persistence / persistence
Fresh Checkout Build / fresh-checkout-build
```

## Findings and repairs

### Action-state union was too narrow

The first TypeScript run found that idle, rejected and success variants used literal `{}` and `readonly []` members that were too narrow for shared UI access and mapped action results.

The state now uses a common immutable base with typed `LuckyNumberFieldErrors` and `readonly LuckyNumberFormError[]`, while `status` remains the discriminant and only the success variant owns `result`.

### Legacy action assertions

Existing action tests still asserted the removed `ok` and `formError` fields. They now assert the explicit `invalid`, `rejected` and `success` variants and safely narrow before reading the success result.

### Forge inventory type safety

The first Forge implementation declared the source collection as one readonly record rather than a readonly array. The inventory was replaced with a typed `SourceRecord[]` implementation, immutable outputs, validated field kinds and deterministic ordering.

### Form-only intent leaked into the HTTP contract

The first form schema reused `luckyNumberRequestSchema` and made `intent=generate` mandatory for both Server Action form submissions and JSON Route Handler requests. This caused otherwise valid API requests to return 422 and masked range errors.

The contracts are now separate:

```text
luckyNumberRequestSchema
  → JSON / Route Handler range input

luckyNumberFormSchema
  → Server Action FormData input + submit intent
```

Server Action tests submit the same explicit `intent` value as the browser submitter.

### Safe form errors were classified as raw exceptions

The generic UI primitives used a local callback variable named `error`, which caused the existing view heuristic to interpret `error.message` as raw exception rendering.

The reference, minimal and webapp UI primitives now use the explicit `formError` name. The rendered contract is unchanged and the distinction between safe `FormError` values and exceptions is visible in the source.

### Form evidence drift

After the inventory repair, all six generated form documents were regenerated from the canonical inventory and synchronized with form inventory SHA-256:

```text
c908816d0e83dc4a07c077dec607d360cba78fb747c1c7487baf6c872bcc4794
```

### Adjacent delivery evidence drift

Changing the Server Action to `luckyNumberFormSchema` and adding the explicit mapper changed the delivery inventory. The generated delivery map, HTTP contracts and security status were regenerated and synchronized with delivery inventory SHA-256:

```text
30c9bf90ddc7bdca4c614602f3a11185e6f75ec4981855cdc8d1d9410ede8239
```

The Forms workflow now permanently verifies adjacent delivery contracts and uploads failure-only regenerated evidence.

### Adjacent view evidence drift

`LuckyNumberForm` and `LuckyNumberSubmitButton` became explicit client view records. The generated view map, contracts, assets and security status were regenerated and synchronized with view inventory SHA-256:

```text
dc983507f2404de5f8d14d8ccc4a5830c7711f10ef69d1924906fc2f9711e00d
```

The Forms workflow now permanently verifies adjacent view contracts and uploads failure-only regenerated evidence.

### Branch synchronization and history cleanup

During verification, `main` advanced with the local-environment setup change. The forms branch was rebuilt on the current `main` tree through the Git data API, preserving the final forms diff while removing the connector-generated multi-commit staging history and the `package.json` three-way conflict.

The final branch retains both:

- current `main` local setup and verification behavior;
- the forms `verify:forms` integration and implementation.

### CI diagnostic scoping

The Forms workflow retains failure-only artifacts for:

- TypeScript diagnostics;
- form contract and generated evidence diagnostics;
- adjacent delivery evidence diagnostics;
- adjacent view evidence diagnostics.

Temporary full-suite and webapp diagnostic steps used during repair were removed after their findings were addressed. Full regression ownership remains with Verify and Persistence.

## Verified coverage

The successful matrix includes:

- Node.js and pnpm setup from a clean checkout;
- TypeScript type checking;
- ESLint with zero warnings;
- 222 root unit and fixture tests;
- targeted Forge and reference forms tests;
- form contract, field, error, accessibility and security diagnostics;
- generated form, delivery and view evidence drift checks;
- project documentation, routing, delivery, HTTP-kernel, kernel configuration, composition, event, contract, extension, persistence, view and configuration checks;
- reference capability and architecture checks;
- minimal-template production type generation, type checking, tests and build;
- webapp-template Prisma validation, generation, type checking, tests, build and migration deployment;
- reference production build;
- reference production E2E smoke tests;
- runtime read-only and network-boundary verification;
- reproducible artifact comparison;
- PostgreSQL migration, query-plan and integration verification;
- fresh-checkout setup, build and smoke verification.

## Merge gate

The implementation is eligible for Stage 4 only when the documentation-only completion commit also has no failed or pending workflow jobs, the branch remains current with `main`, pull request #26 remains mergeable, and the user gives a separate explicit merge instruction.

The pull request must remain draft and unmerged at the end of Stage 3.
