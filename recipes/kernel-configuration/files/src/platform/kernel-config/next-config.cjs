'use strict';

// CommonJS is intentional: Next.js loads next.config.ts before application TypeScript transpilation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');

const PORTABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const GIT_COMMIT = /^[0-9a-f]{7,64}$/u;

function requiredOrigin(value, stage) {
  const url = new URL(value || 'http://localhost:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (stage === 'production' && url.protocol !== 'https:')
  ) {
    throw new Error('APP_URL credential-free HTTP(S) origin must be used; production requires HTTPS.');
  }
  return url;
}

function portableId(value, label) {
  const normalized = String(value || '').trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label} must be a portable 1-128 character identifier.`);
  return normalized;
}


function requireServerActionEncryptionKey(environment, release) {
  const value = String(environment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || '').trim();
  if (!value) {
    if (release) {
      throw new Error('Release builds require NEXT_SERVER_ACTIONS_ENCRYPTION_KEY.');
    }
    return;
  }
  if (!/^[A-Za-z0-9+/]{43}=$/u.test(value)) {
    throw new Error('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be canonical base64 for a 32-byte key.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength !== 32 || bytes.toString('base64') !== value) {
    throw new Error('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be canonical base64 for a 32-byte key.');
  }
}

function createKernelNextConfig(input) {
  const environment = input.environment || process.env;
  const stage = environment.APP_STAGE || 'local';
  const release = ['preview', 'staging', 'production'].includes(stage);
  const gitCommit = String(environment.GIT_COMMIT || (release ? '' : '0000000')).trim();
  if (!GIT_COMMIT.test(gitCommit)) throw new Error('Release builds require a 7-64 character lowercase hexadecimal GIT_COMMIT.');
  const buildId = portableId(environment.BUILD_ID || gitCommit, 'BUILD_ID');
  const deploymentId = portableId(
    environment.DEPLOYMENT_ID || (release ? '' : `local-${buildId.slice(0, 16)}`),
    'DEPLOYMENT_ID',
  );
  if (release) {
    const epoch = String(environment.SOURCE_DATE_EPOCH || '');
    if (!/^(?:0|[1-9][0-9]*)$/u.test(epoch) || !Number.isSafeInteger(Number(epoch))) {
      throw new Error('Release builds require an integer SOURCE_DATE_EPOCH.');
    }
  }
  requireServerActionEncryptionKey(environment, release);
  const applicationRoot = path.resolve(input.applicationRoot);
  const distDir = String(environment.NEXT_DIST_DIR || '.next').trim();
  if (!distDir || distDir.includes('\0')) throw new Error('NEXT_DIST_DIR is invalid.');
  const buildDirectory = path.resolve(applicationRoot, distDir);
  const relative = path.relative(applicationRoot, buildDirectory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('NEXT_DIST_DIR must remain inside the application root.');
  }
  const origin = requiredOrigin(environment.APP_URL, stage);
  const trustedHosts = String(environment.TRUSTED_HOSTS || origin.host)
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (!trustedHosts.includes(origin.host) && !trustedHosts.includes(origin.hostname)) {
    throw new Error('The APP_URL host must be present in TRUSTED_HOSTS.');
  }
  const allowedOrigins = String(environment.SERVER_ACTION_ALLOWED_ORIGINS || origin.host)
    .split(',').map((value) => value.trim()).filter(Boolean);
  const browserSourceMaps = environment.PRODUCTION_BROWSER_SOURCE_MAPS === 'true';
  if (stage === 'production' && browserSourceMaps && !String(environment.PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER || '').trim()) {
    throw new Error('Production browser source maps require PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER.');
  }
  return {
    distDir: relative || '.next',
    typedRoutes: true,
    poweredByHeader: false,
    deploymentId,
    generateBuildId: async () => buildId,
    productionBrowserSourceMaps: browserSourceMaps,
    ...(environment.NEXT_OUTPUT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
    experimental: {
      serverActions: {
        bodySizeLimit: String(environment.SERVER_ACTION_BODY_SIZE_LIMIT || '1mb'),
        allowedOrigins,
      },
    },
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

module.exports = { createKernelNextConfig };
