import 'server-only';

export class RequestBodyTooLargeError extends Error {
  readonly code = 'REQUEST_TOO_LARGE';

  constructor(readonly maximumBytes: number) {
    super(`The request body exceeds ${maximumBytes} bytes.`);
    this.name = 'RequestBodyTooLargeError';
  }
}

export class MalformedJsonError extends Error {
  readonly code = 'MALFORMED_JSON';

  constructor() {
    super('The request body is not valid UTF-8 JSON.');
    this.name = 'MalformedJsonError';
  }
}

export class UnsupportedMediaTypeError extends Error {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';

  constructor() {
    super('The request body must use a JSON media type.');
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class UnsupportedContentEncodingError extends Error {
  readonly code = 'UNSUPPORTED_CONTENT_ENCODING';

  constructor() {
    super('The request body uses an unsupported content encoding.');
    this.name = 'UnsupportedContentEncodingError';
  }
}

export class MalformedContentLengthError extends Error {
  readonly code = 'CONTENT_LENGTH_INVALID';

  constructor() {
    super('Content-Length must be a non-negative decimal integer.');
    this.name = 'MalformedContentLengthError';
  }
}

export class RequestAbortedError extends Error {
  readonly code = 'REQUEST_ABORTED';

  constructor() {
    super('The request was aborted while reading its body.');
    this.name = 'RequestAbortedError';
  }
}

export function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json' ||
    /^application\/[a-z0-9!#$&^_.+-]+\+json$/u.test(mediaType);
}

function assertContentEncoding(request: Request): void {
  const value = request.headers.get('content-encoding')?.trim().toLowerCase();
  if (value && value !== 'identity') throw new UnsupportedContentEncodingError();
}

export function assertDeclaredContentLength(request: Request, maximumBytes: number): void {
  const value = request.headers.get('content-length')?.trim();
  if (!value) return;
  if (!/^\d+$/u.test(value)) throw new MalformedContentLengthError();
  const declared = Number(value);
  if (!Number.isSafeInteger(declared)) throw new RequestBodyTooLargeError(maximumBytes);
  if (declared > maximumBytes) throw new RequestBodyTooLargeError(maximumBytes);
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new RequestAbortedError();

  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => {
      void reader.cancel(signal.reason).then(
        () => complete(() => reject(new RequestAbortedError())),
        () => complete(() => reject(new RequestAbortedError())),
      );
    };

    signal.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      (value) => complete(() => {
        if (signal.aborted) reject(new RequestAbortedError());
        else resolve(value);
      }),
      (error: unknown) => complete(() => reject(
        signal.aborted ? new RequestAbortedError() : error,
      )),
    );
  });
}

export async function readRequestBytes(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError('maximumBytes must be a positive safe integer.');
  }

  assertContentEncoding(request);
  assertDeclaredContentLength(request, maximumBytes);
  if (request.signal.aborted) throw new RequestAbortedError();
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, request.signal);
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('request body limit exceeded').catch(() => undefined);
        throw new RequestBodyTooLargeError(maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function parseJsonRequestBytes(
  bytes: Uint8Array,
  contentType: string | null,
): unknown {
  if (!isJsonContentType(contentType)) {
    throw new UnsupportedMediaTypeError();
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}

export async function readJsonRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  return parseJsonRequestBytes(
    await readRequestBytes(request, maximumBytes),
    request.headers.get('content-type'),
  );
}
