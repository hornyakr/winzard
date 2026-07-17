import { describe, expect, it } from 'vitest';

import { parseAppEnvironment } from '../src/app-env';

const valid = {
  APP_URL: 'http://localhost:3000',
  APP_NAME: 'Winzard',
  LOG_LEVEL: 'debug',
  NEXT_PUBLIC_APP_NAME: 'Winzard',
};

describe('app environment', () => {
  it('csak az alkalmazás általános változóit validálja', () => {
    expect(parseAppEnvironment(valid)).toEqual(valid);
  });

  it('nem követel adatbázis- vagy auth-változót', () => {
    expect(() => parseAppEnvironment(valid)).not.toThrow();
  });
});
