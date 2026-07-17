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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(serverOutput: () => string, exitCode: () => number | null): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exitCode() !== null) throw new Error(`A Next.js szerver idő előtt leállt.\n${serverOutput()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
    } catch {
      // A szerver még nem fogad kapcsolatot.
    }
    await delay(250);
  }
  throw new Error(`A Next.js szerver nem indult el 30 másodpercen belül.\n${serverOutput()}`);
}

function assertLuckyNumberDto(body: unknown, minimum: number, maximum: number): void {
  if (
    typeof body !== 'object' || body === null ||
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

async function assertLuckyNumberPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  assert.match(html, /A szerencseszámod:/u);
  assert.match(html, /0–100 tartományból/u);
  assert.match(html, /\/lucky\/number\/range\/10\/20/u);
}

async function assertQueryPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number?minimum=5&maximum=7`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  assert.match(html, /5–7 tartományból/u);
}

async function assertDynamicPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number/range/10/20`);
  const html = (await response.text()).replaceAll('<!-- -->', '');
  assert.equal(response.status, 200);
  assert.match(html, /10–20 tartományból/u);

  const invalid = await fetch(`${baseUrl}/lucky/number/range/20/10`);
  assert.equal(invalid.status, 404);
}

async function assertLuckyNumberApi(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/lucky/number`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
  assert.match(response.headers.get('cache-control') ?? '', /\bno-store\b/u);
  assertLuckyNumberDto(await response.json(), 0, 100);

  const ranged = await fetch(`${baseUrl}/api/lucky/number/range/10/20`);
  assert.equal(ranged.status, 200);
  assert.match(ranged.headers.get('cache-control') ?? '', /\bno-store\b/u);
  assertLuckyNumberDto(await ranged.json(), 10, 20);

  const invalid = await fetch(`${baseUrl}/api/lucky/number/range/nope/20`);
  assert.equal(invalid.status, 400);
}

async function assertPostAuthorization(): Promise<void> {
  const unauthorized = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ minimum: 10, maximum: 20 }),
  });
  assert.equal(unauthorized.status, 403);

  const authorized = await fetch(`${baseUrl}/api/lucky/number`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-demo-role': 'operator' },
    body: JSON.stringify({ minimum: 10, maximum: 20 }),
  });
  assert.equal(authorized.status, 200);
  assertLuckyNumberDto(await authorized.json(), 10, 20);
}

async function assertRedirects(): Promise<void> {
  const permanent = await fetch(`${baseUrl}/random-number`, { redirect: 'manual' });
  assert.equal(permanent.status, 308);
  assert.equal(new URL(permanent.headers.get('location') ?? '', baseUrl).pathname, '/lucky/number');

  const transitional = await fetch(`${baseUrl}/lucky/10/20`, { redirect: 'manual' });
  assert.equal(transitional.status, 307);
  assert.equal(new URL(transitional.headers.get('location') ?? '', baseUrl).pathname, '/lucky/number/range/10/20');
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.exitCode !== null || server.pid === undefined) return;
  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), delay(5_000).then(() => false)]);
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
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
server.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
server.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });

try {
  const startupError = new Promise<never>((_resolve, reject) => server.once('error', reject));
  await Promise.race([waitForServer(() => output, () => server.exitCode), startupError]);
  await assertLuckyNumberPage();
  await assertQueryPage();
  await assertDynamicPage();
  await assertLuckyNumberApi();
  await assertPostAuthorization();
  await assertRedirects();
  console.log('PASS: reference routing and lucky-number E2E smoke');
} finally {
  await stopServer(server);
}
