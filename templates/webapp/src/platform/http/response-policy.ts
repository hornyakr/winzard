import type { ResponsePolicy } from './delivery-contract';

const CACHE_CONTROL: Readonly<Record<ResponsePolicy, string>> = Object.freeze({
  'api-private': 'private, no-store',
  'api-public': 'public, max-age=0, must-revalidate',
  health: 'no-store',
  sse: 'no-store',
});

const RESOURCE_POLICY: Readonly<Record<ResponsePolicy, string>> = Object.freeze({
  'api-private': 'same-origin',
  'api-public': 'cross-origin',
  health: 'same-origin',
  sse: 'same-origin',
});

const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type ResponsePolicyInput = Readonly<{
  policy: ResponsePolicy;
  requestId: string;
  vary?: readonly string[];
}>;

function appendVary(headers: Headers, values: readonly string[]): void {
  const requested = values.map((value) => value.trim()).filter(Boolean);
  if (requested.some((value) => !HEADER_TOKEN.test(value))) {
    throw new TypeError('Vary contains an invalid HTTP header name.');
  }
  const current = headers
    .get('Vary')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  headers.set('Vary', [...new Set([...current, ...requested])].join(', '));
}

export function applyResponsePolicy(response: Response, input: ResponsePolicyInput): Response {
  if (!REQUEST_ID.test(input.requestId)) throw new TypeError('Invalid request ID for response policy.');
  if (response.bodyUsed) {
    throw new TypeError('Response policy must be applied before the response body is consumed.');
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', CACHE_CONTROL[input.policy]);
  headers.set('X-Request-Id', input.requestId);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cross-Origin-Resource-Policy', RESOURCE_POLICY[input.policy]);
  if (input.vary && input.vary.length > 0) appendVary(headers, input.vary);

  if (input.policy === 'sse') {
    headers.set('X-Accel-Buffering', 'no');
    headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
