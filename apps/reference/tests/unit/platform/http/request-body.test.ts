import { describe, expect, it } from 'vitest';

import {
  MalformedJsonError,
  readJsonRequestBody,
  readRequestBytes,
  RequestAbortedError,
  RequestBodyTooLargeError,
  UnsupportedMediaTypeError,
} from '@/platform/http/request-body.server';

describe('request body reader', () => {
  it('a tényleges UTF-8 bytehosszt korlátozza Content-Length nélkül is', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'éééééééé' }),
    });

    await expect(readJsonRequestBody(request, 8)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it('külön kezeli a médiatípus- és JSON-szintaktikai hibát', async () => {
    const text = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    const malformed = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    await expect(readJsonRequestBody(text, 1024)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError,
    );
    await expect(readJsonRequestBody(malformed, 1024)).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
  });

  it('abortnál megszakítja az olvasást, cancelálja a streamet és feloldja a read lockot', async () => {
    const abortController = new AbortController();
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        // A stream szándékosan nyitva marad az abortig.
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: abortController.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const reading = readRequestBytes(request, 1024);
    abortController.abort('test abort');

    await expect(reading).rejects.toBeInstanceOf(RequestAbortedError);
    expect(canceled).toBe(true);
    expect(body.locked).toBe(false);
  });
});
