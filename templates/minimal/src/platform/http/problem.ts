import type { ZodError } from 'zod';

export type ValidationError = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type HttpProblemInput = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  detail?: string;
  instance?: string;
  errors?: readonly ValidationError[];
  headers?: HeadersInit;
}>;

export type HttpProblem = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  detail?: string;
  instance: string;
  errors?: readonly ValidationError[];
}>;

function defaultInstance(requestId: string): string {
  return `urn:winzard:request:${encodeURIComponent(requestId)}`;
}

export function problem(input: HttpProblemInput): Response {
  if (!Number.isInteger(input.status) || input.status < 400 || input.status > 599) {
    throw new RangeError('Problem status must be an HTTP error status.');
  }

  const body: HttpProblem = Object.freeze({
    type: input.type,
    title: input.title,
    status: input.status,
    code: input.code,
    requestId: input.requestId,
    ...(input.detail ? { detail: input.detail } : {}),
    instance: input.instance ?? defaultInstance(input.requestId),
    ...(input.errors
      ? {
          errors: Object.freeze(
            input.errors.map((item) => Object.freeze({ ...item })),
          ),
        }
      : {}),
  });

  const headers = new Headers(input.headers);
  headers.set('Content-Type', 'application/problem+json');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return Response.json(body, { status: input.status, headers });
}

export function validationProblem(
  error: ZodError,
  input: Omit<HttpProblemInput, 'errors'>,
): Response {
  return problem({
    ...input,
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      code: issue.code,
      message: issue.message,
    })),
  });
}
