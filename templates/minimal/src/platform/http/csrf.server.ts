import 'server-only';

export class CsrfValidationError extends Error {
  readonly code = 'CSRF_VALIDATION_FAILED';
  constructor() {
    super('The mutation request did not pass the same-origin policy.');
    this.name = 'CsrfValidationError';
  }
}

export function assertSameOriginMutation(request: Request, expectedOrigin?: string): void {
  const origin = request.headers.get('origin')?.trim();
  if (!origin || origin === 'null') throw new CsrfValidationError();
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new CsrfValidationError();
  }
  const targetOrigin = expectedOrigin ?? new URL(request.url).origin;
  if (normalizedOrigin !== targetOrigin) throw new CsrfValidationError();
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') throw new CsrfValidationError();
}
