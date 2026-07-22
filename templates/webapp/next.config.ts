import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const require = createRequire(import.meta.url);
const { createKernelNextConfig } = require(
  './src/platform/kernel-config/next-config.cjs'
) as Readonly<{
  createKernelNextConfig(input: Readonly<{ applicationRoot: string }>): NextConfig;
}>;

export default createKernelNextConfig({
  applicationRoot: fileURLToPath(new URL('.', import.meta.url)),
});
