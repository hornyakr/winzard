import type { NextConfig } from 'next';

import { createBuildIdentity } from './build-identity';
import { createHostPolicy } from './host-policy';
import { resolveProjectPaths } from './project-paths';
import { createRuntimeEnvironment } from './runtime-environment';

function booleanValue(value: string | undefined): boolean {
  return value === 'true';
}

export function createKernelNextConfig(input: Readonly<{
  applicationRoot: string;
  repositoryRoot?: string;
}>): NextConfig {
  const environment = createRuntimeEnvironment(process.env);
  const paths = resolveProjectPaths({
    applicationRoot: input.applicationRoot,
    ...(input.repositoryRoot ? { repositoryRoot: input.repositoryRoot } : {}),
    buildDirectory: process.env.NEXT_DIST_DIR ?? '.next',
  });
  const identity = createBuildIdentity(process.env, environment.stage);
  const hostPolicy = createHostPolicy(process.env, environment.stage);
  type ServerActionsConfiguration = NonNullable<NonNullable<NextConfig['experimental']>['serverActions']>;
  const serverActions: ServerActionsConfiguration = {
    bodySizeLimit: (process.env.SERVER_ACTION_BODY_SIZE_LIMIT ?? '1mb') as ServerActionsConfiguration['bodySizeLimit'],
    allowedOrigins: [...hostPolicy.serverActionAllowedOrigins],
  };
  return {
    distDir: paths.buildDirectoryRelative,
    typedRoutes: true,
    poweredByHeader: false,
    deploymentId: identity.deploymentId,
    generateBuildId: async () => identity.buildId,
    productionBrowserSourceMaps: environment.debug.browserSourceMaps,
    ...(booleanValue(process.env.NEXT_OUTPUT_STANDALONE) ? { output: 'standalone' } : {}),
    experimental: { serverActions },
    async headers() {
      return [{
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      }];
    },
  };
}
