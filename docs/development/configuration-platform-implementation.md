# Configuration platform implementation

## Scope

This change implements the public configuration contract described in
`docs/public_documentation/winzard-configuration.md` across Forge, templates,
recipes, the reference application, CI, generated evidence and consumer
contracts.

## Implemented runtime and Forge behavior

- capability-owned configuration definitions for the application shell,
  PostgreSQL and authentication;
- Next.js-compatible environment precedence, including the intentional
  omission of `.env.local` under `NODE_ENV=test`;
- dotenv expansion, cycle diagnostics and source provenance;
- redacted inventory records with status, length and short SHA-256
  fingerprints, never raw values;
- typed validation for URL, origin, enum, integer bounds, PostgreSQL DSN,
  boolean, JSON and secret contracts;
- `config:list`, `config:inspect`, `config:reference`, `config:diff`,
  `config:drift`, `config:unused`, `config:doctor` and `secrets:check`;
- generated configuration references with defaults, validation constraints and introduced/deprecated/removed lifecycle metadata, plus drift checks;
- repository secret scanning and architecture rules for direct domain or
  application `process.env` access, client-side server config, global env bags,
  raw env logging and `next.config.env`;
- explicit build-time public configuration projection and fail-fast startup validation through `instrumentation.ts` in shipped
  templates and the reference application;
- hardened manifest parsing for invalid JSON, ambiguous sources, unknown
  fields and malformed capability configuration;
- detailed recipe metadata for every capability-owned key.

## Template and application changes

The minimal and webapp templates now ship:

- `.env.example` and deterministic `.env.test` contracts;
- `APP_STAGE` separately from `NODE_ENV`;
- server-only app configuration and an explicit public DTO projection;
- immutable config objects;
- startup validation;
- typed, side-effect-free `next.config.ts` defaults.

The webapp database contract additionally enforces PostgreSQL protocol,
connection-pool bounds and a bounded millisecond timeout. Authentication
rejects placeholder and development fallback secrets.

## Verification contract

`pnpm verify:configuration` checks the reference app and both templates for:

1. environment and recipe drift;
2. generated reference drift;
3. secret hygiene across the repository.

The core and database GitHub Actions jobs provide only their capability-owned
configuration. The database job still proves that Prisma validation,
generation and migration remain explicit operations.

## Security properties

- No CLI output contains raw configuration values.
- `NEXT_PUBLIC_` keys with secret semantics fail static checks.
- Runtime `.env*` files are rejected by repository scanning.
- Full `process.env` logging is rejected.
- Secret examples must be explicit placeholders or isolated local fixtures.
- Domain and application code cannot access deployment configuration directly.
