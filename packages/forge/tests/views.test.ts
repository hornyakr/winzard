import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkViewDocumentation, generateViewDocumentation } from '../src/views/docs';
import { generateView } from '../src/views/generator';
import { buildViewInventory, inspectViews } from '../src/views/inventory';

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-views-'));
}

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

describe('Forge view and presentation platform', () => {
  it('feltérképezi az App Router boundaryket, view modelleket, propsokat, asseteket és teszteket', async () => {
    const root = await fixture();
    await file(root, 'src/app/layout.tsx', "import './globals.css'; export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang=\"hu\"><body>{children}</body></html>; }");
    await file(root, 'src/app/products/loading.tsx', 'export default function ProductLoading() { return <p role="status">Loading</p>; }');
    await file(root, 'src/app/products/page.tsx', "import { ProductListView } from '@/modules/catalog/product/presentation/product-list-view'; export default function ProductPage() { return <ProductListView model={{ heading: 'Products', items: [] }} />; }");
    await file(root, 'src/modules/catalog/product/presentation/product-list.view-model.ts', "export type ProductListViewModel = Readonly<{ heading: string; items: readonly Readonly<{ id: string; name: string }>[] }>;");
    await file(root, 'src/modules/catalog/product/presentation/product.routes.ts', "export const productRoutes = { detail: (id: string) => `/products/${encodeURIComponent(id)}` } as const;");
    await file(root, 'src/modules/catalog/product/presentation/product-list-view.tsx', "import Image from 'next/image'; import hero from './hero.svg'; import type { ProductListViewModel } from './product-list.view-model'; import { productRoutes } from './product.routes'; type ProductListViewProps = Readonly<{ model: ProductListViewModel }>; export function ProductListView({ model }: ProductListViewProps) { return <section><Image alt=\"Catalog\" src={hero} /><h1>{model.heading}</h1>{model.items.map((item) => <a href={productRoutes.detail(item.id)} key={item.id}>{item.name}</a>)}</section>; }");
    await file(root, 'src/modules/catalog/product/presentation/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await file(root, 'tests/unit/product-list-view.test.ts', "import { ProductListView } from '../../src/modules/catalog/product/presentation/product-list-view'; void ProductListView;");

    const inventory = await buildViewInventory(root);
    expect(inventory.issues).toHaveLength(0);
    expect(inventory.records.map(({ kind }) => kind)).toEqual(['layout', 'page', 'loading', 'component']);
    expect(inspectViews(inventory, 'ProductListView')).toContainEqual(expect.objectContaining({
      boundary: 'server',
      propsType: 'ProductListViewProps',
      props: ['model'],
      viewModels: ['ProductListViewModel'],
      routeBuilders: ['./product.routes#productRoutes'],
      assets: expect.objectContaining({
        images: [{ kind: 'next-image', source: './hero.svg', hasAlt: true }],
        staticAssets: ['./hero.svg'],
      }),
      tests: ['tests/unit/product-list-view.test.ts'],
    }));
  });

  it('felismeri a normatív presentation hibakódokat', async () => {
    const root = await fixture();
    await file(root, 'src/app/layout.tsx', "'use client'; export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");
    await file(root, 'src/modules/catalog/product/domain/product.entity.ts', 'export type ProductEntity = Readonly<{ id: string }>;');
    await file(root, 'src/modules/catalog/product/presentation/danger-view.tsx', `import { database } from '@/platform/database/client';
import type { ProductEntity } from '../domain/product.entity';
type DangerViewProps = Readonly<{ product: ProductEntity; userUrl: string }>;
export async function DangerView({ product, userUrl }: DangerViewProps) {
  await fetch('/api/products');
  const view = process.env.VIEW;
  const Dynamic = await import(userUrl);
  const error = new Error('private');
  return <div><a href={userUrl}>unsafe</a><img src="/x.png" /><span key={Math.random()}>{error.message}{String(view)}{String(database)}{String(Dynamic)}{product.id}</span><div dangerouslySetInnerHTML={{ __html: userUrl }} /></div>;
}`);
    await file(root, 'src/modules/catalog/product/presentation/secret.client.tsx', "'use client'; import { readFile } from 'node:fs/promises'; export function SecretClient({ accessToken }: Readonly<{ accessToken: string }>) { void readFile; return <p>{accessToken}</p>; }");
    await file(root, 'src/modules/catalog/product/presentation/editor-email.tsx', "'use client'; import { useEffect } from 'react'; export function EditorEmail() { useEffect(() => window.alert('x')); return <p>Email</p>; }");
    await file(root, 'src/modules/catalog/product/presentation/remote-mdx.ts', "import { compile } from '@mdx-js/mdx'; export function render(source: string) { return compile(source); }");
    await file(root, 'src/modules/catalog/product/presentation/theme-loader.ts', "import { access } from 'node:fs/promises'; const themePaths = ['a', 'b']; export async function load(name: string) { for (const root of themePaths) if (await access(root + name)) return import(root + name); }");
    await file(root, 'src/platform/ui/card.tsx', "import { catalogModule } from '@/composition/catalog'; export function Card() { return <div>{String(catalogModule)}</div>; }");

    const codes = (await buildViewInventory(root)).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'VIEW_DIRECT_ORM_IMPORT',
      'VIEW_DOMAIN_ENTITY_PROP',
      'VIEW_SERVER_IMPORT_IN_CLIENT',
      'VIEW_INTERNAL_HTTP_FETCH',
      'VIEW_DANGEROUS_HTML',
      'VIEW_UNTRUSTED_URL',
      'VIEW_DYNAMIC_IMPORT_PATH',
      'VIEW_PROCESS_ENV_ACCESS',
      'VIEW_SECRET_PROP',
      'VIEW_RAW_ERROR_OUTPUT',
      'VIEW_MISSING_IMAGE_ALT',
      'VIEW_UNSTABLE_LIST_KEY',
      'VIEW_GLOBAL_CLIENT_BOUNDARY',
      'VIEW_EMAIL_BROWSER_API',
      'VIEW_UNSAFE_MDX_SOURCE',
      'VIEW_NAMESPACE_SHADOWING',
      'VIEW_GENERIC_UI_DATA_ACCESS',
    ]));
  });

  it('determinista view dokumentációt generál és driftet jelez', async () => {
    const root = await fixture();
    await file(root, 'src/app/page.tsx', 'export default function HomePage() { return <main>Home</main>; }');
    await generateViewDocumentation(root);
    expect(await checkViewDocumentation(root)).toHaveLength(0);
    const map = path.join(root, 'docs/90-generated/views/view-map.md');
    await writeFile(map, `${await readFile(map, 'utf8')}drift\n`, 'utf8');
    expect(await checkViewDocumentation(root)).toContainEqual(expect.objectContaining({ code: 'VIEW_DOC_DRIFT' }));
  });

  it('idempotens, dry-run, konfliktusvédett és email-képes view generátort ad', async () => {
    const root = await fixture();
    const dry = await generateView('catalog/product/product-card', { root, dryRun: true });
    expect(dry.created).toEqual([
      'src/modules/catalog/product/presentation/product-card.view-model.ts',
      'src/modules/catalog/product/presentation/product-card.presenter.ts',
      'src/modules/catalog/product/presentation/product-card-view.tsx',
    ]);

    const first = await generateView('catalog/product/product-card', { root });
    expect(first.created).toHaveLength(3);
    expect((await buildViewInventory(root)).issues).toHaveLength(0);
    expect((await generateView('catalog/product/product-card', { root })).skipped).toHaveLength(3);

    await writeFile(path.join(root, first.created[0] ?? ''), 'manual edit\n', 'utf8');
    await expect(generateView('catalog/product/product-card', { root })).rejects.toThrow('GENERATOR_CONFLICT');

    const email = await generateView('billing/invoice/payment-reminder', { root, email: true });
    expect(email.created).toContain('src/modules/billing/invoice/presentation/email/payment-reminder-email.renderer.tsx');
    await expect(generateView('billing/invoice/payment-reminder', { root, email: true, client: true })).rejects.toThrow('nem lehet Client Component');
  });
});
