#!/usr/bin/env bash
set -euo pipefail

for target in templates/minimal templates/webapp; do
  mkdir -p "$target/src/composition"
  cat > "$target/src/composition/application.event.definition.ts" <<'EOF'
import { defineEvents } from '@/platform/events/contract';

export const applicationEvents = defineEvents({
  schemaVersion: 1,
  id: 'application.events',
  events: [],
});
EOF
  rm -f "$target/src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts"
  rm -f "$target/src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts"
done

cat > packages/forge/tests/events-runtime.test.ts <<'EOF'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkEventGeneration, generateEvents } from '../src/events/generator';
import { buildEventInventory } from '../src/events/inventory';

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-events-runtime-'));
  await file(root, 'src/platform/events/contract.ts', 'export type EventRegistry = Readonly<Record<string, readonly unknown[]>>;\n');
  await file(root, 'src/modules/demo/application/events/created.ts', 'export type Created = Readonly<{ type: \'demo.created\' }>;\n');
  await file(root, 'src/modules/demo/application/commands/create.ts', 'export class Create {}\n');
  await file(root, 'src/modules/demo/application/event-handlers/record.ts', 'export const recordCreated = Object.freeze({ id: \'demo.created.record\', eventType: \'demo.created\', async handle() {} });\n');
  await file(root, 'src/composition/application.event.definition.ts', `
export const applicationEvents = defineEvents({
  schemaVersion: 1,
  id: 'demo.events',
  events: [{
    id: 'demo.created',
    type: 'demo.created',
    category: 'domain',
    version: 1,
    source: 'src/modules/demo/application/events/created.ts',
    export: 'Created',
    producer: 'src/modules/demo/application/commands/create.ts',
    payloadSchema: 'urn:schema:demo-created:v1',
    classification: 'internal',
    tenantScoped: false,
    aliases: [],
    handlers: [{
      id: 'demo.created.record',
      source: 'src/modules/demo/application/event-handlers/record.ts',
      export: 'recordCreated',
      phase: 'after-commit',
      failurePolicy: 'fail-fast',
      before: [],
      after: [],
      idempotent: true,
      maximumAttempts: 1,
    }],
  }],
});
`);
  return root;
}

describe('Forge executable event registry', () => {
  it('azonos event id és type értéket egyetlen eventen belül elfogad', async () => {
    const root = await fixture();
    const codes = (await buildEventInventory(root)).issues.map(({ code }) => code);
    expect(codes).not.toContain('EVENT_DUPLICATE_ID');
    expect(codes).not.toContain('EVENT_DUPLICATE_TYPE');
  });

  it('külön eventek duplikált id értékét elutasítja', async () => {
    const root = await fixture();
    const definition = path.join(root, 'src/composition/application.event.definition.ts');
    const source = await readFile(definition, 'utf8');
    await writeFile(definition, source.replace('  }],\n});', `  }, {
    id: 'demo.created',
    type: 'demo.created-again',
    category: 'domain',
    version: 1,
    source: 'src/modules/demo/application/events/created.ts',
    export: 'Created',
    producer: 'src/modules/demo/application/commands/create.ts',
    payloadSchema: 'urn:schema:demo-created-again:v1',
    classification: 'internal',
    tenantScoped: false,
    aliases: [],
    handlers: [],
  }],
});`), 'utf8');
    expect((await buildEventInventory(root)).issues).toContainEqual(expect.objectContaining({ code: 'EVENT_DUPLICATE_ID' }));
  });

  it('handler importot és futtatható eventHandlerRegistry objektumot generál', async () => {
    const root = await fixture();
    await generateEvents(root);
    const registry = await readFile(path.join(root, 'src/generated/events/registry.ts'), 'utf8');
    expect(registry).toContain("import { recordCreated as eventHandler0 }");
    expect(registry).toContain('export const eventHandlerRegistry');
    expect(registry).toContain('"demo.created": Object.freeze([eventHandler0])');
    expect(await checkEventGeneration(root)).toHaveLength(0);
  });

  it('generated registry driftet jelez', async () => {
    const root = await fixture();
    await generateEvents(root);
    const registry = path.join(root, 'src/generated/events/registry.ts');
    await writeFile(registry, `${await readFile(registry, 'utf8')}drift\n`, 'utf8');
    expect(await checkEventGeneration(root)).toContainEqual(expect.objectContaining({ code: 'EVENT_GENERATED_DRIFT' }));
  });
});
EOF

mkdir -p docs/development
cat > docs/development/event-dispatching-platform-implementation.md <<'EOF'
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
EOF
