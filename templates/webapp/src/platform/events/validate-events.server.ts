import 'server-only';

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
