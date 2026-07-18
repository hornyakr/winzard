import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkDeliveryDocumentation, generateDeliveryDocumentation } from '../src/delivery/docs';
import { generateDeliverySlice } from '../src/delivery/generator';
import { buildDeliveryInventory } from '../src/delivery/inventory';

async function fixture(): Promise<string> { return mkdtemp(path.join(os.tmpdir(), 'winzard-delivery-')); }
async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target); await mkdir(path.dirname(absolute), { recursive: true }); await writeFile(absolute, content, 'utf8');
}

describe('Forge delivery platform', () => {
  it('feltérképezi a page, route handler és server action contractot', async () => {
    const root = await fixture();
    await file(root, 'src/app/products/page.tsx', "import { products } from '@/composition/catalog'; export default async function Page() { return <main>{await products.queries.list.execute({})}</main>; }");
    await file(root, 'src/app/api/products/route.ts', "import { bodySchema } from './body.schema'; export async function POST(request: Request) { const parsed = bodySchema.safeParse(await request.json()); return Response.json(parsed); }");
    await file(root, 'src/modules/catalog/product/presentation/product.actions.ts', "'use server'; export async function createProductAction() { return { ok: true }; }");
    const inventory = await buildDeliveryInventory(root);
    expect(inventory.records.map(({ kind }) => kind)).toEqual(['page', 'route-handler', 'server-action']);
    expect(inventory.issues).toHaveLength(0);
  });

  it('felismeri a normatív veszélyes delivery mintákat', async () => {
    const root = await fixture();
    await file(root, 'src/app/api/danger/route.ts', "export async function POST(request: Request) { const body = await request.json(); return Response.json({ value: process.env.SECRET, body }); }");
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
    expect(await checkDeliveryDocumentation(root)).toContainEqual(expect.objectContaining({ code: 'DELIVERY_DOC_DRIFT' }));
  });

  it('idempotens, dry-run és konfliktusvédett vertical slice generátort ad', async () => {
    const root = await fixture();
    const dry = await generateDeliverySlice('vertical-slice', 'catalog/product/show', { root, dryRun: true });
    expect(dry.created).toContain('src/app/catalog/product/show/page.tsx');
    const first = await generateDeliverySlice('vertical-slice', 'catalog/product/show', { root });
    expect(first.created.length).toBeGreaterThan(5);
    const second = await generateDeliverySlice('vertical-slice', 'catalog/product/show', { root });
    expect(second.created).toHaveLength(0);
    await writeFile(path.join(root, first.created[0] ?? ''), 'manual edit\n', 'utf8');
    await expect(generateDeliverySlice('vertical-slice', 'catalog/product/show', { root })).rejects.toThrow('GENERATOR_CONFLICT');
  });
});
