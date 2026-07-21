import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const hostname = '127.0.0.1';
const port = Number.parseInt(process.env.WINZARD_E2E_PORT ?? '3100', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError('A WINZARD_E2E_PORT érvényes TCP-port legyen.');
}

const repositoryRoot = process.cwd();
const baseUrl = `http://${hostname}:${port}`;
const nextCli = path.join(repositoryRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requestId(response: Response): string {
  const value = response.headers.get('x-request-id') ?? '';
  assert.match(value, REQUEST_ID);
  return value;
}

function mutationHeaders(input: Readonly<Record<string, string>> = {}): HeadersInit {
  return {
    'content-type': 'application/json',
    origin: baseUrl,
    'sec-fetch-site': 'same-origin',
    ...input,
  };
}

async function waitForServer(
  serverOutput: () => string,
  exitCode: () => number | null,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exitCode() !== null) {
      throw new Error(`A Next.js szerver idő előtt leállt.\n${serverOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
    } catch {
      // A szerver még nem fogad kapcsolatot.
    }
    await delay(250);
  }
  throw new Error(
    `A Next.js szerver nem indult el 30 másodpercen belül.\n${serverOutput()}`,
  );
}

function assertLuckyNumberDto(
  body: unknown,
  minimum: number,
  maximum: number,
): void {
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { value?: unknown }).value !== 'number' ||
    typeof (body as { minimum?: unknown }).minimum !== 'number' ||
    typeof (body as { maximum?: unknown }).maximum !== 'number'
  ) {
    throw new TypeError('A lucky-number API nem numerikus DTO-t adott vissza.');
  }
  const dto = body as { value: number; minimum: number; maximum: number };
  assert.equal(dto.minimum, minimum);
  assert.equal(dto.maximum, maximum);
  assert.equal(Number.isSafeInteger(dto.value), true);
  assert.ok(dto.value >= minimum);
  assert.ok(dto.value <= maximum);
}

async function assertHomePage(): Promise<void> {
  const response = await fetch(baseUrl);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  requestId(response);
  assert.match(html, /WINZARD REFERENCE APP/u);
  assert.match(html, /capability-független referencia aktív/u);
  // Static Forge evidence for the adjacent contract exercised above: reference.home.page
}

async function assertLuckyNumberPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  requestId(response);
  assert.match(html, /A szerencseszámod:/u);
  assert.match(html, /0–100 tartományból/u);
  assert.match(html, /\/lucky\/number\/range\/10\/20/u);
  assert.match(html, /data-navigation-boundary="lucky-number"/u);
  assert.match(html, /alt="Geometrikus pályák a szerencseszám körül"/u);
}

async function assertQueryPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number?minimum=5&maximum=7`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  requestId(response);
  assert.match(html, /5–7 tartományból/u);
}

async function assertDynamicPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number/range/10/20`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  requestId(response);
  assert.match(html, /10–20 tartományból/u);

  const invalid = await fetch(`${baseUrl}/lucky/number/range/20/10`);
  const invalidHtml = (await invalid.text()).replaceAll('<!-- -->', '');
  assert.equal(invalid.status, 404);
  requestId(invalid);
  assert.match(invalid.headers.get('cache-control') ?? '', /\bno-store\b/u);
  assert.match(invalidHtml, /Érvénytelen szerencseszám-tartomány/u);
}

async function assertLuckyNumberApi(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/lucky/number`);
  assert.equal(response.status, 200);
  requestId(response);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
  assert.match(response.headers.get('cache-control') ?? '', /\bno-store\b/u);
  assertLuckyNumberDto(await response.json(), 0, 100);

  const ranged = await fetch(`${baseUrl}/api/lucky/number/range/10/20`);
  assert.equal(ranged.status, 200);
  requestId(ranged);
  assert.match(ranged.headers.get('cache-control') ?? '', /\bno-store\b/u);
  assertLuckyNumberDto(await ranged.json(), 10, 20);

  const invalid = await fetch(`${baseUrl}/api/lucky/number/range/nope/20`);
  const invalidRequestId = requestId(invalid);
  const problem = await invalid.json() as { code: string; requestId: string };
  assert.equal(invalid.status, 400);
  assert.equal(problem.code, 'INVALID_RANGE');
  assert.equal(problem.requestId, invalidRequestId);
}

async function assertPostAuthorizationAndCsrf(): Promise<void> {
  const unauthorized = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: mutationHeaders(),
    body: JSON.stringify({ minimum: 10, maximum: 20 }),
  });
  assert.equal(unauthorized.status, 403);
  requestId(unauthorized);

  const foreignOrigin = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: mutationHeaders({
      origin: 'https://attacker.invalid',
      'x-demo-role': 'operator',
    }),
    body: JSON.stringify({ minimum: 10, maximum: 20 }),
  });
  assert.equal(foreignOrigin.status, 403);
  const foreignProblem = await foreignOrigin.json() as { code: string };
  assert.equal(foreignProblem.code, 'CSRF_VALIDATION_FAILED');

  const authorized = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: mutationHeaders({
      'x-demo-role': 'operator',
      'x-demo-subject': 'e2e-operator',
    }),
    body: JSON.stringify({ minimum: 10, maximum: 20 }),
  });
  assert.equal(authorized.status, 200);
  requestId(authorized);
  assertLuckyNumberDto(await authorized.json(), 10, 20);
}

async function assertBodyLimit(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: mutationHeaders({ 'x-demo-role': 'operator' }),
    body: JSON.stringify({
      minimum: 10,
      maximum: 20,
      padding: 'x'.repeat(20_000),
    }),
  });
  const problem = await response.json() as { code: string; requestId: string };

  assert.equal(response.status, 413);
  assert.equal(problem.code, 'REQUEST_TOO_LARGE');
  assert.equal(problem.requestId, requestId(response));
}

async function assertProxySpoofingAndIsolation(): Promise<void> {
  const spoofed = await fetch(`${baseUrl}/api/lucky/number`, {
    headers: {
      'x-winzard-proxy': '1',
      'x-winzard-request-id': 'spoofed-request-id',
      'x-winzard-tenant-id': 'spoofed-tenant',
    },
  });
  const trustedRequestId = requestId(spoofed);
  assert.notEqual(trustedRequestId, 'spoofed-request-id');

  const [operator, anonymous] = await Promise.all([
    fetch(`${baseUrl}/api/lucky/number`, {
      method: 'POST',
      headers: mutationHeaders({
        'x-demo-role': 'operator',
        'x-demo-subject': 'parallel-operator',
        'x-winzard-request-id': 'parallel-spoof-a',
      }),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }),
    fetch(`${baseUrl}/api/lucky/number`, {
      method: 'POST',
      headers: mutationHeaders({
        'x-demo-subject': 'parallel-anonymous',
        'x-winzard-request-id': 'parallel-spoof-b',
      }),
      body: JSON.stringify({ minimum: 10, maximum: 20 }),
    }),
  ]);

  const operatorRequestId = requestId(operator);
  const anonymousRequestId = requestId(anonymous);
  assert.equal(operator.status, 200);
  assert.equal(anonymous.status, 403);
  assert.notEqual(operatorRequestId, anonymousRequestId);
  assert.notEqual(operatorRequestId, 'parallel-spoof-a');
  assert.notEqual(anonymousRequestId, 'parallel-spoof-b');
}

async function assertRedirects(): Promise<void> {
  const permanent = await fetch(`${baseUrl}/random-number`, { redirect: 'manual' });
  assert.equal(permanent.status, 308);
  assert.equal(
    new URL(permanent.headers.get('location') ?? '', baseUrl).pathname,
    '/lucky/number',
  );

  const transitional = await fetch(`${baseUrl}/lucky/10/20`, {
    redirect: 'manual',
  });
  assert.equal(transitional.status, 307);
  assert.equal(
    new URL(transitional.headers.get('location') ?? '', baseUrl).pathname,
    '/lucky/number/range/10/20',
  );
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.exitCode !== null || server.pid === undefined) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (!stopped && server.exitCode === null) {
    const forceExited = once(server, 'exit');
    server.kill('SIGKILL');
    await forceExited;
  }
}

const server = spawn(
  process.execPath,
  [nextCli, 'start', 'apps/reference', '-H', hostname, '-p', String(port)],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      APP_URL: baseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
server.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
server.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });

try {
  const startupError = new Promise<never>((_resolve, reject) => {
    server.once('error', reject);
  });
  await Promise.race([
    waitForServer(() => output, () => server.exitCode),
    startupError,
  ]);
  await assertHomePage();
  await assertLuckyNumberPage();
  await assertQueryPage();
  await assertDynamicPage();
  await assertLuckyNumberApi();
  await assertPostAuthorizationAndCsrf();
  await assertBodyLimit();
  await assertProxySpoofingAndIsolation();
  await assertRedirects();
  console.log('PASS: reference HTTP-kernel and lucky-number E2E smoke');
} finally {
  await stopServer(server);
}
