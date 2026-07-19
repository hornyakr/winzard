import type { WinzardManifest } from './manifest';
import { buildConfigurationInventory } from './configuration/inventory';

export type EnvironmentFailure = Readonly<{
  code: string;
  file: string;
  message: string;
}>;

export async function checkCapabilityEnvironment(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly EnvironmentFailure[]> {
  const inventory = await buildConfigurationInventory(root, manifest);
  return inventory.issues
    .filter(({ severity }) => severity === 'error')
    .map(({ code, file, key, message }) => ({
      code,
      file,
      message: key ? `${key}: ${message}` : message,
    }));
}
