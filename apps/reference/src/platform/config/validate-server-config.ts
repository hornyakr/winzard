import 'server-only';

import { createAppConfig } from './app-env';
import { createPublicAppConfig } from './public-config';

export function validateServerConfiguration(): void {
  createAppConfig();
  createPublicAppConfig();
}
