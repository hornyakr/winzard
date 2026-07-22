# Event-dispatching platform implementation

## Scope

This change implements typed domain and integration event contracts, deterministic static handler definitions, Forge inventory/graph/check/generation/documentation commands, runtime dispatch limits and traces, reference and template integration, and an optional PostgreSQL transactional outbox/inbox/dead-letter profile.

## Architectural boundary

No universal global business event bus, runtime reflection, filesystem scanning in production, or process-local durable delivery is introduced. Integration publication remains transport-independent and the consumer remains responsible for idempotency.
