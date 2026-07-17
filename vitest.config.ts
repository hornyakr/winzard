import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'apps/reference/src'),
      'server-only': path.join(root, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'apps/reference/tests/unit/**/*.test.ts',
      'packages/config/tests/**/*.test.ts',
      'packages/forge/tests/**/*.test.ts',
    ],
  },
});
