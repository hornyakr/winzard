# Kernel-configuration platform implementation

## Scope

This change implements the public contract in
`docs/public_documentation/winzard-kernel-configuration.md` across the Forge,
the reference application, the minimal and webapp templates, recipes, generated
evidence and the consumer documentation pack.

## Implemented runtime contracts

- repository-, application-, package-, working- and build-root containment;
- immutable build, deployment and `SOURCE_DATE_EPOCH` identity;
- separate `NODE_ENV`, `APP_STAGE`, region, log and debug policy;
- explicit web, CLI and worker runtime factories;
- closed locale allowlist and weighted `Accept-Language` resolution;
- canonical origin, Host allowlist and one-label wildcard matching;
- `Forwarded`/`X-Forwarded-For`, fixed-hop and IPv4/IPv6 CIDR trust;
- proxy-owned internal request headers and fail-closed bad-request handling;
- deployment-, tenant- and locale-scoped cache namespaces;
- canonical composition fingerprints;
- capability-specific active/previous secret keyrings;
- disabled-by-default method override;
- internal-URI-only X-Accel/X-Sendfile responses;
- read-only application artifact and external writable-root contract;
- strict UTF-8, spreadsheet formula-injection and structured-log redaction.

## Forge surface

```text
kernel-config:list
kernel-config:inspect
kernel-config:check
kernel-config:diff
kernel-config:fingerprint
kernel-config:docs
runtime:mode
runtime:check
proxy:trust
locale:check
build:reproducibility
```

The commands provide deterministic human and JSON output. CLI misuse exits with
code 2, contract failures with code 1, and unsupported platforms with code 3.
Secret records never expose raw values, lengths or fingerprints.

## Product boundaries

The capability defines provider ports, metadata and validation for shared cache,
workers, key rotation and file offload. It does not silently install Redis, a
queue, an object store, a production authentication provider, a cloud secret
manager or a custom Next.js server. Those remain explicit optional capabilities.

## Verification status

The implementation and focused tests are part of the development change. The
full typegen, lint, unit, build, E2E, database, reproducibility and GitHub Actions
gates are executed in the separate testing-and-repair phase before merge.

## Reproducibility hardening

The release gate supplies one explicit `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to both isolated builds so Server Action identifiers remain stable across replicas and rebuilds. The canonical artifact comparator ignores only Next.js timing traces and normalizes the random Draft Mode preview secrets in `prerender-manifest.json`; all route, chunk, server-reference, asset and application bytes remain compared by relative path, canonical byte length and SHA-256.

## Testing-phase hardening

The production startup validator imports a dedicated
`runtime-writable-root.server.ts` adapter. It probes only the explicit external
writable root. The full application-artifact write probe remains in
`filesystem.server.ts` and is exercised by unit and deployment smoke tests, but
is deliberately not imported into bundled Next.js instrumentation: tracing a
filesystem operation against the application root causes Next.js output file
tracing to retain the entire project and emit an NFT warning.

The CI runtime-security job builds the reference application, removes write
permissions from the application tree, starts it as the non-root checkout user,
and verifies liveness, trusted Host enforcement and internal-header spoofing
protection. Project-path tests also cover a symlinked build directory escaping
the application root.
