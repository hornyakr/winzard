import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkFormDocumentation, generateFormDocumentation } from '../src/forms/docs';
import { generateFormArtifact } from '../src/forms/generator';
import { buildFormInventory, inspectForms } from '../src/forms/inventory';

async function fixture(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'winzard-forms-'));
}

async function file(root: string, target: string, content: string): Promise<void> {
  const absolute = path.join(root, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function validFormFixture(root: string): Promise<void> {
  await file(root, 'src/platform/forms/form-contract.ts', 'export function defineFormContract<T>(value: T): T { return value; }');
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.form.definition.ts', `import { defineFormContract } from '@/platform/forms/form-contract';
export const createProductFormDefinition = defineFormContract({
  schemaVersion: 1,
  id: 'catalog.product.create',
  execution: 'server-action',
  mutation: true,
  component: 'CreateProductForm',
  deliveryContractId: 'catalog.product.create.action',
  extractor: 'createProductRawInput',
  schema: 'createProductSchema',
  actionState: 'CreateProductActionState',
  errorMapper: 'mapCreateProductIssues',
  unknownFields: 'reject',
  progressiveEnhancement: 'supported',
  authentication: 'required',
  tenant: 'none',
  idempotency: 'none',
  idempotencyRequired: false,
  fields: [{ name: 'name', id: 'product-create-name', kind: 'text', multiplicity: 'single', required: true, presentationOnly: false, authority: false, errorCodes: ['FORM_TOO_SMALL'] }],
  intents: [{ value: 'save', label: 'Save', operation: 'catalog.commands.createProduct' }],
  filePolicy: null,
} as const);`);
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.form.schema.ts', "import { z } from 'zod'; export const createProductSchema = z.object({ name: z.string().min(1) }).strict();");
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.form.extractor.ts', "export function createProductRawInput(formData: FormData) { return { name: formData.get('name') }; }");
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.form.errors.ts', "export function mapCreateProductIssues() { return {}; }");
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.action-state.ts', "export type CreateProductActionState = Readonly<{ status: 'idle' }>;");
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create-product-form.tsx', "export function CreateProductForm() { return <form><label htmlFor=\"product-create-name\">Name</label><input aria-describedby=\"product-create-name-errors\" id=\"product-create-name\" name=\"name\" /></form>; }");
  await file(root, 'src/modules/catalog/product/presentation/forms/create/create.actions.contract.ts', "export const contract = { id: 'catalog.product.create.action', authentication: 'required', tenant: 'none', idempotency: 'none' }; ");
  await file(root, 'tests/unit/create-product-form.test.ts', "import { CreateProductForm } from '../../src/modules/catalog/product/presentation/forms/create/create-product-form'; void CreateProductForm;");
}

describe('Forge form contract platform', () => {
  it('feltérképezi a statikus form contractot és kapcsolódó bizonyítékokat', async () => {
    const root = await fixture();
    await validFormFixture(root);
    const inventory = await buildFormInventory(root);
    expect(inventory.issues).toHaveLength(0);
    expect(inspectForms(inventory, 'catalog.product.create')).toContainEqual(expect.objectContaining({
      component: 'CreateProductForm',
      schema: 'createProductSchema',
      fields: [expect.objectContaining({ name: 'name', id: 'product-create-name' })],
      tests: ['tests/unit/create-product-form.test.ts'],
    }));
  });

  it('determinista form dokumentációt generál és driftet jelez', async () => {
    const root = await fixture();
    await validFormFixture(root);
    await generateFormDocumentation(root);
    expect(await checkFormDocumentation(root)).toHaveLength(0);
    const map = path.join(root, 'docs/90-generated/forms/form-map.md');
    await writeFile(map, `${await readFile(map, 'utf8')}drift\n`, 'utf8');
    expect(await checkFormDocumentation(root)).toContainEqual(expect.objectContaining({ code: 'FORM_DOC_DRIFT' }));
  });

  it('idempotens, dry-run és konfliktusvédett form generátorokat ad', async () => {
    const root = await fixture();
    const dry = await generateFormArtifact('form', 'catalog/product/create', { root, dryRun: true });
    expect(dry.created).toHaveLength(7);
    const first = await generateFormArtifact('form', 'catalog/product/create', { root });
    expect(first.created).toHaveLength(7);
    expect((await generateFormArtifact('form', 'catalog/product/create', { root })).skipped).toHaveLength(7);
    await writeFile(path.join(root, first.created[0] ?? ''), 'manual edit\n', 'utf8');
    await expect(generateFormArtifact('form', 'catalog/product/create', { root })).rejects.toThrow('GENERATOR_CONFLICT');
    expect((await generateFormArtifact('server-action', 'catalog/product/create', { root })).created).toHaveLength(2);
    expect((await generateFormArtifact('form-handler', 'catalog/product/create', { root })).created).toHaveLength(2);
  });
});
