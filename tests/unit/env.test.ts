import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '@/platform/config/env';
const valid = { APP_URL:'http://localhost:3000', APP_NAME:'Winzard', LOG_LEVEL:'debug', NEXT_PUBLIC_APP_NAME:'Winzard', DATABASE_URL:'postgresql://u:p@localhost:5432/db', DATABASE_POOL_MAX:'10', DATABASE_CONNECTION_TIMEOUT_MS:'5000', AUTH_SECRET:'12345678901234567890123456789012' };
describe('environment', () => { it('parses the documented contract', () => expect(parseEnvironment(valid).DATABASE_POOL_MAX).toBe(10)); it('rejects short secrets', () => expect(() => parseEnvironment({...valid, AUTH_SECRET:'short'})).toThrow()); });
