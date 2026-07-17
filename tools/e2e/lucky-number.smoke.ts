import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const hostname = '127.0.0.1';
const port = Number.parseInt(process.env.WINZARD_E2E_PORT ?? '3100', 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError('A WINZARD_E2E_PORT érvényes TCP-port legyen.');
}

const baseUrl = `http://${hostname}:${port}`;
const standaloneServer = '.next/standalone/server.js';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(serverOutput: () => string, exitCode: () => number | null): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (exitCode() !== null) {
      throw new Error(`A Next.js szerver idő előtt leállt.\n${serverOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health/live`);

      if (response.ok) {
        return;
      }
    } catch {
      // A szerver még nem fogad kapcsolatot.
    }

    await delay(250);
  }

  throw new Error(`A Next.js szerver nem indult el 30 másodpercen belül.\n${serverOutput()}`);
}

async function assertLuckyNumberPage(): Promise<void> {
  const response = await fetch(`${baseUrl}/lucky/number`);
  const html = await response.text();
  const normalizedHtml = html.replaceAll('<!-- -->', '');

  assert.equal(response.status, 200);
  assert.match(normalizedHtml, /A szerencseszámod:/u);
  assert.match(normalizedHtml, /0–100 tartományból/u);
  assert.match(normalizedHtml, /\/api\/lucky\/number/u);
}

async function assertLuckyNumberApi(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/lucky/number`);
  const body = (await response.json()) as {
    value: unknown;
    minimum: unknown;
    maximum: unknown;
  };

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
  assert.match(response.headers.get('cache-control') ?? '', /\bno-store\b/u);
  if (
    typeof body.value !== 'number' ||
    typeof body.minimum !== 'number' ||
    typeof body.maximum !== 'number'
  ) {
    throw new TypeError('A lucky-number API nem numerikus DTO-t adott vissza.');
  }

  assert.equal(body.minimum, 0);
  assert.equal(body.maximum, 100);
  assert.equal(Number.isSafeInteger(body.value), true);
  assert.ok(body.value >= body.minimum);
  assert.ok(body.value <= body.maximum);
}

async function stopServer(server: ReturnType<typeof spawn>): Promise<void> {
  if (server.exitCode !== null || server.pid === undefined) {
    return;
  }

  const exited = once(server, 'exit');
  server.kill('SIGTERM');

  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);

  if (!stoppedGracefully && server.exitCode === null) {
    const forceExited = once(server, 'exit');
    server.kill('SIGKILL');
    await forceExited;
  }
}

const server = spawn(
  process.execPath,
  [standaloneServer],
  {
    cwd: process.cwd(),
    env: { ...process.env, HOSTNAME: hostname, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';

server.stdout?.on('data', (chunk: Buffer) => {
  output += chunk.toString('utf8');
});
server.stderr?.on('data', (chunk: Buffer) => {
  output += chunk.toString('utf8');
});

try {
  const startupError = new Promise<never>((_resolve, reject) => {
    server.once('error', reject);
  });

  await Promise.race([
    waitForServer(
      () => output,
      () => server.exitCode,
    ),
    startupError,
  ]);
  await assertLuckyNumberPage();
  await assertLuckyNumberApi();
  console.log('PASS: lucky-number E2E smoke');
} finally {
  await stopServer(server);
}
