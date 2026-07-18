import type { ZodError } from 'zod';

export type ValidationError = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type HttpProblem = Readonly<{
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: readonly ValidationError[];
}>;

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/problem+json',
} as const;

export function problem(input: HttpProblem): Response {
  return Response.json(input, {
    status: input.status,
    headers: noStoreHeaders,
  });
}

export function validationProblem(
  error: ZodError,
  input: Readonly<Pick<HttpProblem, 'type' | 'title' | 'status' | 'code'>>,
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

export function isJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
}
