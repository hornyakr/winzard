import type { TestingDefinition } from './types';

export function defineTestingContract<const T extends TestingDefinition>(definition: T): T {
  return Object.freeze(definition);
}
