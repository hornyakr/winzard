import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const require = createRequire(import.meta.url);
const { createKernelNextConfig } = require(
  './src/platform/kernel-config/next-config.cjs'
) as Readonly<{
  createKernelNextConfig(input: Readonly<{ applicationRoot: string }>): NextConfig;
}>;

const applicationRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  ...createKernelNextConfig({ applicationRoot }),
  async redirects() {
    return [
      {
        source: '/random-number',
        destination: '/lucky/number',
        permanent: true,
      },
      {
        source: '/lucky/:minimum/:maximum',
        destination: '/lucky/number/range/:minimum/:maximum',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
