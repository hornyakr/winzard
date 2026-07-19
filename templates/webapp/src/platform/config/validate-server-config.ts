import 'server-only';

import { createAppConfig } from './app-env';
import { createPublicAppConfig } from './public-config';
import { getDatabaseEnvironment } from '../database/database-env.server';

export function validateServerConfiguration(): void {
  createAppConfig();
  createPublicAppConfig();
  getDatabaseEnvironment();
}
