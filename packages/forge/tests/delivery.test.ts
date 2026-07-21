import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkDeliveryDocumentation,
  generateDeliveryDocumentation,
} from '../src/delivery/docs';
import { generateDeliverySlice } from '../src/delivery/generator';
import { buildDeliveryInventory } from '../src/delivery/inventory';

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-delivery-'));
}

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

describe('Forge delivery platform', () => {
  it('feltérképezi a Page, Route Handler és Server Action adjacent contractját', async () => {
    const root = await fixture();
    await file(root, 'src/app/products/page.contract.ts', `
export const productPageContract = definePageContract({
  kind: 'page', id: 'catalog.product.page', route: '/products', methods: ['GET'],
  runtime: 'nodejs', requestContext: 'required', authentication: 'optional',
  tenant: 'none', authorization: 'catalog.product.read', cache: 'private-no-store',
  operation: 'products.queries.list', presenter: 'presentProducts',
} as const);
`);
    await file(root, 'src/app/products/page.tsx', `
import { products } from '@/composition/catalog';
export const runtime = 'nodejs';
enforcePageContract(productPageContract);
export default async function Page() {
  return <main>{presentProducts(await products.queries.list.execute({}))}</main>;
}
`);
    await file(root, 'src/app/api/products/route.contract.ts', `
export const productApiContract = defineRouteContract({
  kind: 'route-handler', id: 'catalog.product.create.api', route: '/api/products',
  methods: ['POST'], runtime: 'nodejs', requestContext: 'required',
  authentication: 'required', tenant: 'none', authorization: { POST: 'catalog.product.create' },
  cache: 'private-no-store', responsePolicy: 'api-private', csrf: 'same-origin',
  idempotency: 'none', rateLimit: 'write-standard', bodyLimitBytes: 65536,
  streaming: false, operations: { POST: 'products.commands.create' },
  presenters: { POST: 'presentProductHttp' }, errors: ['VALIDATION_ERROR'],
} as const);
`);
    await file(root, 'src/app/api/products/route.ts', `
import { bodySchema } from './body.schema';
export const runtime = 'nodejs';
export const POST = withRouteLifecycle(productApiContract, 'POST', async (_request, _context, invocation) => {
  const parsed = bodySchema.safeParse(await invocation.readJsonBody());
  return Response.json(presentProductHttp(await products.commands.create.execute(parsed.data)));
});
`);
    await file(root, 'src/modules/catalog/product/presentation/product.actions.contract.ts', `
export const productActionContract = defineActionContract({
  kind: 'server-action', id: 'catalog.product.create.action', actions: ['createProductAction'],
  runtime: 'nodejs', requestContext: 'required', authentication: 'required', tenant: 'none',
  authorization: 'catalog.product.create', csrf: 'framework-origin-plus-session',
  idempotency: 'none', rateLimit: 'write-standard', operation: 'products.commands.create',
  revalidation: ['/products'],
} as const);
`);
    await file(root, 'src/modules/catalog/product/presentation/product.actions.ts', `
'use server';
export async function createProductAction() {
  enforceServerActionContract(productActionContract, 'createProductAction');
  return { ok: true };
}
`);
    await file(root, 'tests/delivery.test.ts', `
import { POST } from '@/app/api/products/route';
void POST;
void 'catalog.product.create.api';
`);

    const inventory = await buildDeliveryInventory(root);

    expect(inventory.records.map(({ kind }) => kind)).toEqual([
      'page',
      'route-handler',
      'server-action',
    ]);
    expect(inventory.issues).toHaveLength(0);
    expect(inventory.records.find(({ kind }) => kind === 'route-handler')).toMatchObject({
      contractId: 'catalog.product.create.api',
      contractFile: 'src/app/api/products/route.contract.ts',
      requestContext: 'required',
      authentication: 'required',
      responsePolicy: 'api-private',
      csrf: 'same-origin',
      bodyLimitBytes: 65_536,
      applicationOperations: ['products.commands.create'],
      presenter: 'presentProductHttp',
    });
  });

  it('felismeri a normatív veszélyes delivery mintákat', async () => {
    const root = await fixture();
    await file(
      root,
      'src/app/api/danger/route.ts',
      "export async function POST(request: Request) { const body = await request.json(); return Response.json({ value: process.env.SECRET, body }); }",
    );
    const codes = (await buildDeliveryInventory(root)).issues.map(({ code }) => code);
    expect(codes).toContain('DELIVERY_PROCESS_ENV_ACCESS');
    expect(codes).toContain('DELIVERY_UNVALIDATED_BODY');
  });

  it('determinista dokumentációt generál és driftet jelez', async () => {
    const root = await fixture();
    await file(root, 'src/app/page.tsx', 'export default function Page() { return null; }');
    await generateDeliveryDocumentation(root);
    expect(await checkDeliveryDocumentation(root)).toHaveLength(0);
    const map = path.join(root, 'docs/90-generated/delivery/delivery-map.md');
    await writeFile(map, `${await readFile(map, 'utf8')}drift\n`, 'utf8');
    expect(await checkDeliveryDocumentation(root)).toContainEqual(
      expect.objectContaining({ code: 'DELIVERY_DOC_DRIFT' }),
    );
  });

  it('idempotens, dry-run és konfliktusvédett lifecycle-aware vertical slice generátort ad', async () => {
    const root = await fixture();
    const dry = await generateDeliverySlice(
      'vertical-slice',
      'catalog/product/show',
      { root, dryRun: true },
    );
    expect(dry.created).toEqual(expect.arrayContaining([
      'src/app/catalog/product/show/page.contract.ts',
      'src/app/api/catalog/product/show/route.contract.ts',
      'tests/unit/app/catalog/product/show/page.contract.test.ts',
      'tests/unit/app/api/catalog/product/show/route.contract.test.ts',
      'tests/unit/modules/catalog/product/show.actions.contract.test.ts',
      'tests/unit/modules/catalog/product/show.test.ts',
    ]));

    const first = await generateDeliverySlice(
      'vertical-slice',
      'catalog/product/show',
      { root },
    );
    const routeContract = await readFile(
      path.join(root, 'src/app/api/catalog/product/show/route.contract.ts'),
      'utf8',
    );
    expect(routeContract).toContain("authorization: { POST: 'catalog.product.show' }");
    expect(routeContract).toContain("idempotency: 'none'");
    expect(routeContract).toContain("operations: { POST: 'catalog.commands.show' }");

    const second = await generateDeliverySlice(
      'vertical-slice',
      'catalog/product/show',
      { root },
    );
    expect(second.created).toHaveLength(0);
    await writeFile(path.join(root, first.created[0] ?? ''), 'manual edit\n', 'utf8');
    await expect(generateDeliverySlice(
      'vertical-slice',
      'catalog/product/show',
      { root },
    )).rejects.toThrow('GENERATOR_CONFLICT');
  });
});
