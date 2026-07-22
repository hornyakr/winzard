# Service composition platform implementation

## Scope

This change implements the explicit service-composition contract described in
`docs/public_documentation/winzard-service-container.md` across Forge diagnostics,
the reference application, application templates, runtime startup validation,
generated evidence and a reusable recipe.

## Implemented contracts

- explicit `defineComposition` definition files;
- deterministic service, root, dependency, alias, decorator and lifetime inventory;
- missing/ambiguous binding, cycle, lifetime, runtime and server-only checks;
- static generated registry, graph manifest and source-hash manifest;
- startup validation through `instrumentation.ts`;
- canonical secret-free composition fingerprint and `COMPOSITION_HASH` pinning;
- typed multiple binding and decorator example in the reference application;
- deterministic Markdown evidence and drift checks;
- human and JSON Forge diagnostics.

## Forge surface

```text
composition:list
composition:inspect
composition:graph
composition:check
composition:why
composition:docs
composition:generate
service:aliases
service:lifetimes
```

## Architectural boundary

The implementation does not introduce a runtime service locator, reflection
container, source-tree runtime scan or interface-based runtime autowiring. The
production object graph remains explicit TypeScript composition code. Generated
artifacts describe and validate that code; they do not replace constructor
injection.

## Verification status

The implementation and tests are authored in the development phase. The full
repository, template, database, build, E2E, runtime-security and reproducibility
gates run in the separate testing-and-repair phase before merge.
