import 'server-only';

import {
  INTERNAL_PROXY_MARKER_HEADER,
  INTERNAL_REQUEST_ID_HEADER,
} from '@/platform/http/internal-headers';

export type RequestErrorReport = Readonly<{
  event: 'next.request.error';
  errorName: string;
  digest?: string;
  requestId?: string;
  method: string;
  routePath: string;
  routeType: string;
  routerKind: string;
  renderSource?: string;
  revalidateReason?: string;
  headerNames: readonly string[];
}>;

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function safeText(value: string, maximum = 512): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]/gu, '').slice(0, maximum);
}

function firstHeader(
  headers: NodeJS.Dict<string | string[]>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function trustedRequestId(headers: NodeJS.Dict<string | string[]>): string | undefined {
  if (firstHeader(headers, INTERNAL_PROXY_MARKER_HEADER) !== '1') return undefined;
  const value = firstHeader(headers, INTERNAL_REQUEST_ID_HEADER)?.trim();
  return value && REQUEST_ID.test(value) ? value : undefined;
}

export function createRequestErrorReport(
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{
    routePath: string;
    routeType: string;
    routerKind: string;
    renderSource?: string;
    revalidateReason?: string;
  }>,
): RequestErrorReport {
  const digest =
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string'
      ? safeText(error.digest, 128)
      : undefined;
  const requestId = trustedRequestId(request.headers);

  return Object.freeze({
    event: 'next.request.error',
    errorName: error instanceof Error ? safeText(error.name, 128) : 'UnknownError',
    ...(digest ? { digest } : {}),
    ...(requestId ? { requestId } : {}),
    method: safeText(request.method, 16),
    routePath: safeText(context.routePath, 1024),
    routeType: safeText(context.routeType, 64),
    routerKind: safeText(context.routerKind, 64),
    ...(context.renderSource
      ? { renderSource: safeText(context.renderSource, 128) }
      : {}),
    ...(context.revalidateReason
      ? { revalidateReason: safeText(context.revalidateReason, 128) }
      : {}),
    headerNames: Object.freeze(
      Object.keys(request.headers)
        .map((name) => name.toLowerCase())
        .sort(),
    ),
  });
}

export async function reportRequestError(report: RequestErrorReport): Promise<void> {
  console.error(JSON.stringify(report));
}
