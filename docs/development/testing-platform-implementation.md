# Testing Platform v1 implementation

## Scope

This implementation adds the first code-level Winzard testing platform described by the testing specification. It preserves the existing fast Node/Vitest baseline and production HTTP smoke, then adds explicit suite contracts, Forge diagnostics, a jsdom component layer, a PostgreSQL contract layer, and a production Playwright browser layer.

The platform is evidence-oriented. A suite records the exact boundary it executes; a mocked repository does not claim database evidence, the HTTP smoke does not claim browser evidence, and Playwright does not replace domain or application tests.

## Static testing contract

Every participating project owns a `testing.definition.ts` file. The file contains a static `defineTestingContract({...})` literal with:

```text
suite ID and owner
layer and runtime
runner command
include and source globs
fixtures and required services
capabilities
CI job
duration and serial policy
production-build and healthcheck requirements
network policy
coverage ownership
quarantine metadata
```

Forge parses the definition through the TypeScript AST. It does not execute project code and does not create a runtime test registry or service locator.

## Forge module

```text
packages/forge/src/testing/
  types.ts
  contract.ts
  inventory.ts
  render.ts
  docs.ts
  cli.ts
```

Implemented commands:

```bash
pnpm forge test:list --project .
pnpm forge test:inspect reference.browser --project .
pnpm forge test:check --project .
pnpm forge test:matrix --project .
pnpm forge test:impact --changed-from=<COMMIT> --project .
pnpm forge test:fixtures --project .
pnpm forge test:flaky --project .
pnpm forge test:coverage --project .
pnpm forge test:docs --project .
pnpm forge test:docs --check --project .
```

`test:impact` is deliberately conservative. A shared configuration change, an unavailable Git diff, or a change with no exact source match returns the complete suite set instead of silently omitting evidence.

## Diagnostics

The first implementation detects:

```text
TEST_SUITE_UNREGISTERED
TEST_DEFINITION_INVALID
TEST_SUITE_CONTRACT_INVALID
TEST_SUITE_ID_INVALID
TEST_SUITE_OWNER_INVALID
TEST_SUITE_LAYER_INVALID
TEST_SUITE_RUNTIME_INVALID
TEST_SUITE_DURATION_INVALID
TEST_SUITE_NETWORK_INVALID
TEST_SUITE_COMMAND_MISSING
TEST_SUITE_CI_JOB_MISSING
TEST_SUITE_DUPLICATE
TEST_GLOB_EMPTY
TEST_FILE_NOT_DISCOVERED
TEST_FIXTURE_MISSING
TEST_ONLY_COMMITTED
TEST_SKIP_UNJUSTIFIED
TEST_ENV_LOCAL_DEPENDENCY
TEST_FIXED_SLEEP_USED
TEST_EXTERNAL_NETWORK_UNCONTROLLED
TEST_BROWSER_PRODUCTION_BUILD_MISSING
TEST_E2E_HEALTHCHECK_MISSING
TEST_QUARANTINE_INVALID
TEST_QUARANTINE_EXPIRED
TEST_DOCUMENTATION_DRIFT
```

Fixed time waits are warnings in the first release because the existing production HTTP readiness loop uses a bounded polling delay. Browser `waitForTimeout()` remains detectable and must not become the default synchronization mechanism.

## Capabilities

Registered capabilities:

```text
testing-core
testing-dom
testing-database
testing-e2e
testing-accessibility
testing-visual
```

Dependency model:

```text
testing-dom           -> testing-core + next-app
testing-database      -> testing-core + prisma-postgresql
testing-e2e           -> testing-core + next-app
testing-accessibility -> testing-e2e
testing-visual        -> testing-e2e
```

Activated profiles:

```text
repository      -> testing-core
Reference App   -> testing-core, testing-dom, testing-e2e, testing-accessibility
minimal         -> testing-core
webapp          -> testing-core, testing-database
```

`testing-visual` is registered as an extension point but is not activated in v1.

## Vitest projects

The root Vitest configuration now exposes:

```text
unit-node
contract-node
component-jsdom
```

The existing root Node suites remain in `unit-node`. The testing platform reference suite runs in `contract-node`. Accessible React form primitives run in `component-jsdom` with React Testing Library and `user-event`.

The webapp template retains its isolated PostgreSQL configuration. Database tests remain serial until schema-per-worker or database-per-worker isolation is introduced.

## Production HTTP and browser evidence

The existing `apps/reference/tests/e2e/lucky-number.smoke.ts` remains a production HTTP application smoke. The preferred script name is now:

```bash
pnpm test:application
```

The historical `test:e2e:reference` script remains as a compatibility alias and no longer defines the browser layer.

The browser layer uses Playwright with:

```text
production build and next start
health readiness endpoint
Chromium baseline
semantic locators
external network blocking
failure-only trace, screenshot and video
Server Action positive flow
negative field validation
axe WCAG A/AA scan
```

## Database safety

The webapp integration runner loads `tests/helpers/database-test-environment.ts` before the suite. It rejects database URLs unless:

- the host is an explicit local test host; and
- the database name or schema contains a `test` marker.

The dedicated Testing workflow uses `winzard_test` and a test-only credential. Existing rollback, `SKIP LOCKED`, readiness and inbox-idempotency evidence is preserved.

## CI

`.github/workflows/testing.yml` provides separately identifiable jobs:

```text
unit-contract
component
database-contract
browser-accessibility
```

Browser diagnostics are retained only on failure and exclude persisted authentication state. PostgreSQL is provisioned independently for the database contract job.

## Deliberate exclusions

The first release does not implement:

- committed visual screenshot baselines;
- a full Chromium, Firefox and WebKit matrix;
- production-like load testing;
- provider sandbox credentials;
- a graphical flakiness dashboard;
- automatic fixture materialization;
- a perfect import-graph impact analyzer.

The capability and CLI contracts reserve stable extension points for these later layers.
