import { defineComposition } from '@/platform/composition/contract';

export const platformComposition = defineComposition({
  schemaVersion: 1,
  id: 'platform.web',
  capability: 'service-composition',
  roots: [
    {
      id: 'platform.http-kernel.root',
      source: 'src/composition/http-kernel.server.ts',
      export: 'withRouteLifecycle',
      runtime: 'nodejs',
      services: ['platform.http-kernel.route-lifecycle'],
    },
    {
      id: 'platform.request-context.root',
      source: 'src/composition/request-context.server.ts',
      export: 'createRouteRequestContext',
      runtime: 'nodejs',
      services: ['platform.request-context.factory'],
    },
  ],
  services: [
    {
      id: 'platform.request-context.factory',
      kind: 'factory',
      implementation: 'createRouteRequestContext',
      source: 'src/composition/request-context.server.ts',
      export: 'createRouteRequestContext',
      lifetime: 'process',
      runtime: 'nodejs',
      visibility: 'public',
      dependencies: [],
    },
    {
      id: 'platform.http-kernel.route-lifecycle',
      kind: 'platform',
      implementation: 'withRouteLifecycle',
      source: 'src/composition/http-kernel.server.ts',
      export: 'withRouteLifecycle',
      lifetime: 'process',
      runtime: 'nodejs',
      visibility: 'public',
      dependencies: ['platform.request-context.factory'],
    },
    {
      id: 'platform.kernel-configuration.validator',
      kind: 'platform',
      implementation: 'validateKernelConfiguration',
      source: 'src/platform/kernel-config/validate-kernel-config.server.ts',
      export: 'validateKernelConfiguration',
      lifetime: 'process',
      runtime: 'nodejs',
      visibility: 'private',
      dependencies: [],
      configKeys: ['APP_ID', 'APP_STAGE', 'COMPOSITION_HASH'],
    },
  ],
});
