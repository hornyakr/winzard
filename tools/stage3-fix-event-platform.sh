#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

root = Path('.')

inventory = root / 'packages/forge/src/events/inventory.ts'
source = inventory.read_text()
for name in ['EventCategory', 'EventClassification', 'EventFailurePolicy', 'EventPhase']:
    source = source.replace(f'  type {name},\n', '')
inventory.write_text(source)

project_checks = root / 'packages/forge/src/checks/project.ts'
source = project_checks.read_text()
source = source.replace(
    "    !projectFile.endsWith('.composition.definition.ts') &&\n    !importsServerOnly",
    "    !projectFile.endsWith('.composition.definition.ts') &&\n"
    "    !projectFile.endsWith('.event.definition.ts') &&\n"
    "    !importsServerOnly",
)
project_checks.write_text(source)

reference_script = root / 'tools/finalize-events-reference.sh'
source = reference_script.read_text()
source = source.replace(
    "import type { DomainEvent, DomainEventHandler, EventRegistry } from '@/platform/events/contract';",
    "import type { DomainEvent, DomainEventHandler, DomainEventHandlerContext, EventRegistry } from '@/platform/events/contract';",
)
source = source.replace(
    "async handle(_event, context) { calls.push('start'); context.record(event('test.finished', 'evt-2')); }",
    "async handle(_event: DomainEvent, context: DomainEventHandlerContext) { calls.push('start'); context.record(event('test.finished', 'evt-2')); }",
)
reference_script.write_text(source)

validator = """import 'server-only';

import { eventRegistryManifest } from '@/generated/events/registry';

type EventRegistryManifest = Readonly<{
  events: readonly Readonly<{
    handlers: readonly Readonly<{ id: string }>[];
  }>[];
}>;

export async function validateEventRegistry(): Promise<void> {
  const ids = new Set<string>();
  const manifest = eventRegistryManifest as EventRegistryManifest;
  for (const event of manifest.events) {
    for (const handler of event.handlers) {
      if (ids.has(handler.id)) {
        throw new Error(`EVENT_HANDLER_DUPLICATE_ID: ${handler.id}`);
      }
      ids.add(handler.id);
    }
  }
}
"""

for relative in [
    'apps/reference/src/platform/events/validate-events.server.ts',
    'templates/minimal/src/platform/events/validate-events.server.ts',
    'templates/webapp/src/platform/events/validate-events.server.ts',
    'recipes/event-dispatching/files/src/platform/events/validate-events.server.ts',
]:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(validator)
PY
