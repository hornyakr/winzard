import 'server-only';
import { eventRegistryManifest } from '@/generated/events/registry';
export async function validateEventRegistry(): Promise<void> {
  const ids = new Set<string>();
  for (const event of eventRegistryManifest.events) for (const handler of event.handlers) { if (ids.has(handler.id)) throw new Error(`EVENT_HANDLER_DUPLICATE_ID: ${handler.id}`); ids.add(handler.id); }
  const expected = process.env.EVENT_REGISTRY_HASH;
  if (expected && expected !== 'auto' && expected !== eventRegistryManifest.fingerprint) throw new Error('EVENT_REGISTRY_HASH_MISMATCH');
}
