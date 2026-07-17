import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkRouteDocumentation, generateRouteDocumentation } from '../src/routing/docs';
import { buildRouteInventory, inspectRoutePattern } from '../src/routing/inventory';
import { matchRoutePath } from '../src/routing/matcher';

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-routing-'));
}

async function file(root: string, projectPath: string, content = ''): Promise<void> {
  const target = path.join(root, projectPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

describe('Forge route inventory', () => {
  it('feltérképezi a route groupot, dinamikus paramétert, boundaryket és HTTP-metódusokat', async () => {
    const root = await fixture();
    await file(root, 'src/app/layout.tsx', 'export default function Layout() { return null; }');
    await file(root, 'src/app/(public)/products/[productId]/loading.tsx', 'export default function Loading() { return null; }');
    await file(root, 'src/app/(public)/products/[productId]/page.tsx', "import { productIdSchema } from './product.schemas'; export const runtime = 'nodejs'; export default function Page() { productIdSchema.parse('x'); return null; }");
    await file(root, 'src/app/api/products/route.ts', 'export function GET() { return new Response(); } export const POST = () => new Response();');
    await file(root, 'next.config.ts', "const nextConfig = { redirects: async () => [{ source: '/catalog/:productId', destination: '/products/:productId', permanent: true }] }; export default nextConfig;");

    const inventory = await buildRouteInventory(root);
    expect(inventory.issues.filter(({ severity }) => severity === 'error')).toHaveLength(0);
    expect(inspectRoutePattern(inventory, '/products/[productId]')).toContainEqual(expect.objectContaining({
      kind: 'page',
      routeGroups: ['public'],
      runtime: 'nodejs',
      hasInputSchema: true,
      dynamicSegments: [{ name: 'productId', kind: 'dynamic' }],
    }));
    expect(inspectRoutePattern(inventory, '/api/products')).toContainEqual(expect.objectContaining({ methods: ['GET', 'POST'] }));
    expect(inventory.aliases).toContainEqual(expect.objectContaining({ source: '/catalog/:productId', destination: '/products/:productId', type: 'redirect' }));
  });

  it('hibát ad route group collisionre, page/handler conflictre és hiányzó dinamikus schemára', async () => {
    const root = await fixture();
    await file(root, 'src/app/(a)/items/[id]/page.tsx', 'export default function Page() { return null; }');
    await file(root, 'src/app/(b)/items/[id]/page.tsx', 'export default function Page() { return null; }');
    await file(root, 'src/app/(a)/items/[id]/route.ts', 'export function GET() { return new Response(); }');

    const codes = (await buildRouteInventory(root)).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'ROUTE_PAGE_COLLISION',
      'ROUTE_PAGE_HANDLER_CONFLICT',
      'ROUTE_DYNAMIC_SCHEMA_MISSING',
    ]));
  });

  it('diagnosztikusan a specifikus route-ot sorolja előre', async () => {
    const root = await fixture();
    await file(root, 'src/app/products/new/page.tsx', 'export default function Page() { return null; }');
    await file(root, 'src/app/products/[productId]/page.tsx', "import { schema } from './route.schema'; export default function Page() { schema.parse('x'); return null; }");
    const matches = matchRoutePath(await buildRouteInventory(root), '/products/new');
    expect(matches.map(({ route }) => route.pattern)).toEqual(['/products/new', '/products/[productId]']);
  });

  it('HTTP-metódus szerint szűri a diagnosztikai route match eredményt', async () => {
    const root = await fixture();
    await file(root, 'src/app/api/products/[productId]/route.ts', "import { productIdSchema } from './product.schemas'; export function POST() { productIdSchema.parse('x'); return new Response(); }");

    const inventory = await buildRouteInventory(root);
    expect(matchRoutePath(inventory, '/api/products/red-shoe', 'GET')).toHaveLength(0);
    expect(matchRoutePath(inventory, '/api/products/red-shoe', 'POST')).toContainEqual(expect.objectContaining({
      route: expect.objectContaining({ methods: ['POST'] }),
      params: { productId: 'red-shoe' },
    }));
  });

  it('determinista routing dokumentációt generál és driftet észlel', async () => {
    const root = await fixture();
    await file(root, 'src/app/page.tsx', 'export default function Page() { return null; }');
    await generateRouteDocumentation(root);
    expect(await checkRouteDocumentation(root)).toHaveLength(0);
    const routeMap = path.join(root, 'docs/90-generated/routing/route-map.md');
    await writeFile(routeMap, `${await readFile(routeMap, 'utf8')}manual drift\n`, 'utf8');
    expect(await checkRouteDocumentation(root)).toContainEqual(expect.objectContaining({ code: 'ROUTE_DOC_DRIFT' }));
  });
});
