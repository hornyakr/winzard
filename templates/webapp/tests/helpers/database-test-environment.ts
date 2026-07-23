const rawDatabaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (rawDatabaseUrl === '') {
  throw new Error('TEST_DATABASE_SHARED_WITH_NON_TEST: DATABASE_URL is required for database tests.');
}

const databaseUrl = new URL(rawDatabaseUrl);
const localHost = /^(?:127\.0\.0\.1|localhost|postgres)$/u.test(databaseUrl.hostname);
const testMarker = `${databaseUrl.pathname}${databaseUrl.searchParams.get('schema') ?? ''}`.toLowerCase().includes('test');

if (!localHost || !testMarker) {
  throw new Error(
    `TEST_DATABASE_SHARED_WITH_NON_TEST: refusing database tests for ${databaseUrl.hostname}${databaseUrl.pathname}.`,
  );
}
