import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

const QUERY = `
SELECT "id"
FROM "OutboxMessage"
WHERE "status" = 'pending'
  AND "availableAt" <= TIMESTAMPTZ '2026-07-22T12:00:00.000Z'
  AND ("lockedAt" IS NULL OR "lockedAt" < TIMESTAMPTZ '2026-07-22T11:59:30.000Z')
ORDER BY "occurredAt", "id"
FOR UPDATE SKIP LOCKED
LIMIT 100
`.trim();

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function option(name: string): string | null {
  const inline = process.argv.slice(2).find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function collectIndexes(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectIndexes(item, output);
    return output;
  }
  if (typeof value !== 'object' || value === null) return output;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'Index Name' && typeof item === 'string') output.add(item);
    collectIndexes(item, output);
  }
  return output;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const outputFile = option('--output');
if (!outputFile) throw new Error('--output is required.');
const verifyFile = option('--verify');

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  await pool.query('TRUNCATE TABLE "DeadLetterMessage", "InboxMessage", "OutboxMessage"');
  await pool.query(`
    INSERT INTO "OutboxMessage" (
      "id", "source", "type", "occurredAt", "payload", "metadata",
      "status", "availableAt", "createdAt"
    )
    SELECT
      'plan-' || lpad(series::text, 5, '0'),
      'urn:winzard:query-plan',
      'query-plan.fixture.v1',
      TIMESTAMPTZ '2026-07-22T10:00:00.000Z' + (series * INTERVAL '1 second'),
      jsonb_build_object('sequence', series),
      '{}'::jsonb,
      CASE WHEN series <= 50 THEN 'pending' ELSE 'published' END,
      TIMESTAMPTZ '2026-07-22T09:00:00.000Z',
      TIMESTAMPTZ '2026-07-22T09:00:00.000Z'
    FROM generate_series(1, 10000) AS series
  `);
  await pool.query('ANALYZE "OutboxMessage"');
  const result = await pool.query<Record<string, unknown>>(`EXPLAIN (FORMAT JSON, VERBOSE TRUE) ${QUERY}`);
  const rawPlan = result.rows[0]?.['QUERY PLAN'];
  const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  if (plan === undefined) throw new Error('PostgreSQL did not return a JSON plan.');
  const indexes = [...collectIndexes(plan)].sort();
  if (!indexes.includes('OutboxMessage_status_availableAt_idx')) {
    throw new Error(`Expected index is missing from the plan: ${indexes.join(', ') || 'none'}`);
  }
  const evidence = {
    schemaVersion: 1,
    id: 'platform.messaging.outbox.claim-batch.postgresql-18',
    repositoryId: 'platform.messaging.outbox',
    queryId: 'claim-batch',
    database: 'PostgreSQL 18.4',
    capturedAt: new Date().toISOString(),
    queryFingerprint: sha256(QUERY),
    planHash: sha256(stableJson(plan)),
    indexes,
    maximumRows: 100,
    plan,
  } as const;

  if (verifyFile) {
    const expected = JSON.parse(await readFile(path.resolve(verifyFile), 'utf8')) as typeof evidence;
    if (expected.queryFingerprint !== evidence.queryFingerprint) throw new Error('Query fingerprint drift.');
    if (expected.planHash !== evidence.planHash) throw new Error(`Query plan drift: ${expected.planHash} -> ${evidence.planHash}`);
    if (JSON.stringify(expected.indexes) !== JSON.stringify(evidence.indexes)) throw new Error('Query plan index set drift.');
  }

  const target = path.resolve(outputFile);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`QUERY_PLAN_EVIDENCE=${target}`);
  console.log(`QUERY_PLAN_HASH=${evidence.planHash}`);
  console.log(`QUERY_PLAN_INDEXES=${evidence.indexes.join(',')}`);
} finally {
  await pool.end();
}
