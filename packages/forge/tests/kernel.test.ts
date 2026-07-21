import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkKernelDocumentation, generateKernelDocumentation } from '../src/kernel/docs';
import { buildKernelInventory, inspectKernel } from '../src/kernel/inventory';

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-kernel-'));
}

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function validKernelFixture(): Promise<string> {
  const root = await fixture();
  await file(root, 'instrumentation.ts', [
    'export async function register() {}',
    'export const onRequestError = async () => {};',
  ].join('\n'));
  await file(root, 'src/proxy.ts', [
    "import { INTERNAL_REQUEST_HEADERS, INTERNAL_REQUEST_ID_HEADER } from './platform/http/internal-headers';",
    'export function proxy(request: { headers: Headers }) {',
    '  const headers = new Headers(request.headers);',
    '  for (const name of INTERNAL_REQUEST_HEADERS) headers.delete(name);',
    "  headers.set(INTERNAL_REQUEST_ID_HEADER, 'request-id');",
    '  return headers;',
    '}',
  ].join('\n'));
  await file(root, 'src/application/application-context.ts', 'export type ApplicationContext = Readonly<{ requestId: string }>;\n');
  await file(root, 'src/platform/http/internal-headers.ts', "export const INTERNAL_REQUEST_HEADERS = ['x-winzard-request-id']; export const INTERNAL_REQUEST_ID_HEADER = 'x-winzard-request-id';\n");
  await file(root, 'src/platform/http/request-context.ts', 'export type RequestContext = Readonly<{ requestId: string }>;\n');
  await file(root, 'src/platform/http/request-context.server.ts', 'export async function createRouteRequestContext() { return { requestId: \'request-id\' }; }\n');
  await file(root, 'src/platform/http/response-policy.ts', 'export function applyResponsePolicy(response: Response) { return response; }\n');
  await file(root, 'src/app/api/products/route.contract.ts', `
export const productRouteContract = defineRouteContract({
  kind: 'route-handler',
  id: 'catalog.product.list.api',
  route: '/api/products',
  methods: ['GET'],
  runtime: 'nodejs',
  requestContext: 'required',
  authentication: 'optional',
  tenant: 'none',
  authorization: { GET: 'catalog.product.read' },
  cache: 'private-no-store',
  responsePolicy: 'api-private',
  csrf: 'none',
  idempotency: 'none',
  rateLimit: 'read-standard',
  streaming: false,
  operations: { GET: 'catalogModule.queries.listProducts' },
  presenters: { GET: 'presentProductsHttp' },
  responseSchemas: { GET: 'ProductsHttpDto@1' },
  errors: ['INTERNAL_ERROR'],
});
`);
  await file(root, 'src/app/api/products/route.ts', `
import { productRouteContract } from './route.contract';
export const runtime = 'nodejs';
export const GET = withRouteLifecycle(productRouteContract, 'GET', async () => {
  const result = await catalogModule.queries.listProducts.execute({});
  return Response.json(presentProductsHttp(result));
});
`);
  await file(root, 'tests/unit/api/products.test.ts', `
// multi-request isolation evidence
// catalog.product.list.api /api/products
import '@/app/api/products/route';
`);
  return root;
}

describe('Forge HTTP-kernel platform', () => {
  it('adjacent contractból determinisztikus lifecycle gráfot épít', async () => {
    const root = await validKernelFixture();
    const inventory = await buildKernelInventory(root);

    expect(inventory.records).toHaveLength(1);
    expect(inventory.records[0]).toMatchObject({
      id: 'catalog.product.list.api',
      entrypoint: 'src/app/api/products/route.ts',
      route: '/api/products',
      methods: ['GET'],
      requestContext: 'required',
      operations: { GET: 'catalogModule.queries.listProducts' },
      presenters: { GET: 'presentProductsHttp' },
    });
    expect(inventory.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(inspectKernel(inventory, '/api/products', 'GET')).toHaveLength(1);
  });

  it('fail-closed módon jelzi a Proxy internal-header spoofingot és a hiányzó request ID bridge-et', async () => {
    const root = await validKernelFixture();
    await file(root, 'src/proxy.ts', `
export function proxy(request: { headers: Headers }) {
  const headers = new Headers(request.headers);
  return headers;
}
`);

    const codes = (await buildKernelInventory(root)).issues.map(({ code }) => code);
    expect(codes).toContain('KERNEL_PROXY_INTERNAL_HEADER_SPOOFING');
    expect(codes).toContain('KERNEL_PROXY_REQUEST_ID_MISSING');
  });

  it('felismeri a mutable request-globalt, belső HTTP subrequestet és durable after side effectet', async () => {
    const root = await validKernelFixture();
    await file(root, 'src/platform/http/danger.server.ts', `
let currentTenant = '';
export async function danger() {
  await fetch('http://localhost:3000/api/internal');
  after(() => mailer.sendEmail());
  return currentTenant;
}
`);
    const codes = (await buildKernelInventory(root)).issues.map(({ code }) => code);

    expect(codes).toContain('KERNEL_MUTABLE_REQUEST_GLOBAL');
    expect(codes).toContain('KERNEL_INTERNAL_HTTP_SUBREQUEST');
    expect(codes).toContain('KERNEL_AFTER_DURABLE_SIDE_EFFECT');
  });

  it('determinista dokumentációt generál és driftet jelez', async () => {
    const root = await validKernelFixture();
    await generateKernelDocumentation(root);
    expect(await checkKernelDocumentation(root)).toHaveLength(0);

    const graph = path.join(root, 'docs/90-generated/kernel/kernel-graph.md');
    await writeFile(graph, `${await readFile(graph, 'utf8')}drift\n`, 'utf8');
    expect(await checkKernelDocumentation(root)).toContainEqual(expect.objectContaining({
      code: 'KERNEL_DOC_DRIFT',
    }));
  });

  it('fail-closed módon jelzi az adjacent contract nélküli entrypointot', async () => {
    const root = await validKernelFixture();
    await file(root, 'src/app/api/orphan/route.ts', "export const runtime = 'nodejs'; export function GET() { return Response.json({ ok: true }); }\n");
    expect((await buildKernelInventory(root)).issues).toContainEqual(expect.objectContaining({
      code: 'KERNEL_ROUTE_CONTRACT_MISSING',
      file: 'src/app/api/orphan/route.ts',
    }));
  });
});
