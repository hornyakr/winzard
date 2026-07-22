# Event-dispatching platform implementation

## Stage 2 scope

This development stage implements the event architecture described in
`docs/public_documentation/winzard-event-dispatcher.md` without introducing a
universal global business event bus.

Implemented platform boundaries:

- immutable domain and integration event envelopes;
- explicit, statically generated handler registry;
- bounded sequential local dispatcher with nested-event queue, cancellation,
  failure policy and trace records;
- reference command → domain event → generated registry → handler vertical slice;
- Forge event inventory, inspection, graph, checks, generation and documentation;
- optional PostgreSQL transactional outbox, inbox and dead-letter persistence;
- leased `FOR UPDATE SKIP LOCKED` relay claims, bounded retry and payload-hash
  dead-letter metadata;
- minimal and webapp template contracts plus reusable recipes;
- deterministic generated evidence and drift checks.

Not implemented as part of this capability:

- a production broker adapter;
- a universal saga engine;
- process-local `EventEmitter` delivery for durable business effects;
- an end-to-end exactly-once guarantee.

The dedicated full verification matrix belongs to Stage 3. No merge to `main`
occurs in this stage.
