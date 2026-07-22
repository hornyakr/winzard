const secretName = /(?:authorization|cookie|set-cookie|secret|token|password|private|credential|database_url|dsn|api_key)/iu;
const controlCharacters = /[\u0000-\u001f\u007f]/gu;

export type StructuredLogRecord = Readonly<{
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  timestamp: string;
  buildId: string;
  deploymentId: string;
  runtimeMode: 'web' | 'cli' | 'worker';
  requestId?: string;
  traceId?: string;
  fields?: Readonly<Record<string, unknown>>;
}>;

function safeString(value: string): string {
  return value.replace(controlCharacters, '').slice(0, 2048);
}

export function redactStructuredValue(value: unknown, key = ''): unknown {
  if (secretName.test(key)) return '[redacted]';
  if (typeof value === 'string') return safeString(value);
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([childKey, childValue]) => [childKey, redactStructuredValue(childValue, childKey)]),
    );
  }
  return value;
}

export function safeStructuredLogRecord(record: StructuredLogRecord): StructuredLogRecord {
  return Object.freeze({
    ...record,
    event: safeString(record.event),
    timestamp: safeString(record.timestamp),
    buildId: safeString(record.buildId),
    deploymentId: safeString(record.deploymentId),
    ...(record.requestId ? { requestId: safeString(record.requestId) } : {}),
    ...(record.traceId ? { traceId: safeString(record.traceId) } : {}),
    ...(record.fields
      ? { fields: Object.freeze(redactStructuredValue(record.fields) as Record<string, unknown>) }
      : {}),
  });
}
