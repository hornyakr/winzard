import { describe, expect, it } from 'vitest';

import {
  createAppConfig,
  createPublicAppConfig,
  parseAppEnvironment,
  parsePublicEnvironment,
} from '../src/app-env';

const validApp = {
  APP_URL: 'http://localhost:3000',
  APP_NAME: 'Winzard',
  APP_STAGE: 'local',
  LOG_LEVEL: 'debug',
} as const;

const validPublic = {
  NEXT_PUBLIC_APP_NAME: 'Winzard',
} as const;

describe('app environment', () => {
  it('csak az alkalmazás általános változóit validálja', () => {
    expect(parseAppEnvironment({ ...validApp, ...validPublic })).toEqual(validApp);
  });

  it('nem követel adatbázis- vagy auth-változót', () => {
    expect(() => parseAppEnvironment(validApp)).not.toThrow();
  });

  it('elutasítja a nem standard deployment stage értéket', () => {
    expect(() => parseAppEnvironment({ ...validApp, APP_STAGE: 'qa' })).toThrow();
  });

  it('csak credentialmentes HTTP(S) origint fogad el', () => {
    expect(() => parseAppEnvironment({ ...validApp, APP_URL: 'ftp://example.com/path' })).toThrow();
    expect(() => parseAppEnvironment({ ...validApp, APP_URL: 'https://user:pass@example.com/' })).toThrow();
    expect(() => parseAppEnvironment({ ...validApp, APP_URL: 'https://example.com/path' })).toThrow();
  });

  it('production stage-ben HTTPS origint követel', () => {
    expect(() => parseAppEnvironment({
      ...validApp,
      APP_STAGE: 'production',
      APP_URL: 'http://example.com',
    })).toThrow();
    expect(() => parseAppEnvironment({
      ...validApp,
      APP_STAGE: 'production',
      APP_URL: 'https://example.com',
    })).not.toThrow();
  });

  it('külön, allowlistelt publikus környezeti szerződést ad', () => {
    expect(parsePublicEnvironment({
      NEXT_PUBLIC_APP_NAME: 'Atlas',
      AUTH_SECRET: 'never-exposed',
    })).toEqual({ NEXT_PUBLIC_APP_NAME: 'Atlas' });
  });

  it('immutable, típusos config objektumokat hoz létre', () => {
    const app = createAppConfig(validApp);
    const publicConfig = createPublicAppConfig(validPublic);

    expect(app.origin.href).toBe('http://localhost:3000/');
    expect(app.stage).toBe('local');
    expect(Object.isFrozen(app)).toBe(true);
    expect(publicConfig).toEqual({ appName: 'Winzard' });
    expect(Object.isFrozen(publicConfig)).toBe(true);
  });
});
