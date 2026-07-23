import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      '@': path.join(root, 'apps/reference/src'),
      'server-only': path.join(root, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'apps/reference/src/modules/**/*.ts',
        'packages/config/src/**/*.ts',
        'packages/forge/src/testing/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/generated/**',
        '**/*.config.ts',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit-node',
          environment: 'node',
          include: [
            'apps/reference/tests/unit/**/*.test.ts',
            'packages/config/tests/**/*.test.ts',
            'packages/forge/tests/**/*.test.ts',
          ],
          exclude: [
            'packages/forge/tests/**/*.contract.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'contract-node',
          environment: 'node',
          include: [
            'packages/forge/tests/**/*.contract.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'component-jsdom',
          environment: 'jsdom',
          include: [
            'apps/reference/tests/component/**/*.test.tsx',
          ],
        },
      },
    ],
  },
});
