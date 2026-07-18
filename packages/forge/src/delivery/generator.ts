import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DeliveryGenerationKind, DeliveryGenerationResult } from './types';

type Options = Readonly<{ root?: string; dryRun?: boolean; force?: boolean }>;
type FilePlan = Readonly<{ path: string; content: string }>;

function words(value: string): readonly string[] {
  return value.split(/[^A-Za-z0-9]+/u).filter(Boolean).map((word) => word.toLowerCase());
}
function pascal(value: string): string { return words(value).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(''); }
function camel(value: string): string { const valuePascal = pascal(value); return valuePascal[0]?.toLowerCase() + valuePascal.slice(1); }
function kebab(value: string): string { return words(value).join('-'); }

function targetParts(target: string): readonly [string, string, string] {
  const parts = target.split('/').map(kebab).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(part))) {
    throw new Error('A generátor célja module/resource/operation formátumú legyen.');
  }
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

function pagePlan(module: string, resource: string, operation: string): FilePlan {
  const name = pascal(`${resource}-${operation}`);
  return {
    path: `src/app/${module}/${resource}/${operation}/page.tsx`,
    content: `import { ${camel(module)}Module } from '@/composition/${module}';\nimport { ${name}View } from '@/modules/${module}/${resource}/presentation/${operation}-view';\n\nexport default async function ${name}Page() {\n  const result = await ${camel(module)}Module.queries.${camel(operation)}.execute({});\n  return <${name}View result={result} />;\n}\n`,
  };
}

function routePlan(module: string, resource: string, operation: string): FilePlan {
  return {
    path: `src/app/api/${module}/${resource}/${operation}/route.ts`,
    content: `import { ${camel(module)}Module } from '@/composition/${module}';\nimport { ${camel(operation)}RequestSchema } from '@/modules/${module}/${resource}/presentation/${operation}.schemas';\n\nexport async function POST(request: Request): Promise<Response> {\n  const parsed = ${camel(operation)}RequestSchema.safeParse(await request.json());\n  if (!parsed.success) return Response.json({ code: 'VALIDATION_ERROR' }, { status: 422 });\n  return Response.json(await ${camel(module)}Module.commands.${camel(operation)}.execute(parsed.data));\n}\n`,
  };
}

function actionPlan(module: string, resource: string, operation: string): readonly FilePlan[] {
  const name = pascal(operation);
  return [{
    path: `src/modules/${module}/${resource}/presentation/${operation}.actions.ts`,
    content: `'use server';\n\nimport { ${camel(module)}Module } from '@/composition/${module}';\nimport { ${camel(operation)}RequestSchema } from './${operation}.schemas';\n\nexport async function ${camel(operation)}Action(_state: unknown, formData: FormData) {\n  const parsed = ${camel(operation)}RequestSchema.safeParse(Object.fromEntries(formData));\n  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };\n  const result = await ${camel(module)}Module.commands.${camel(operation)}.execute(parsed.data);\n  return { ok: true, result };\n}\n`,
  }, {
    path: `src/modules/${module}/${resource}/presentation/${operation}.action-state.ts`,
    content: `export type ${name}ActionState = Readonly<{ ok: boolean; formError?: string }>;\nexport const initial${name}ActionState: ${name}ActionState = Object.freeze({ ok: false });\n`,
  }];
}

function operationPlan(module: string, resource: string, operation: string): readonly FilePlan[] {
  const name = pascal(operation);
  return [{
    path: `src/modules/${module}/${resource}/application/ports/${operation}.port.ts`,
    content: `export interface ${name}Port { execute(input: unknown): Promise<unknown>; }\n`,
  }, {
    path: `src/modules/${module}/${resource}/application/queries/${operation}.ts`,
    content: `import type { ${name}Port } from '../ports/${operation}.port';\nexport class ${name} { constructor(private readonly port: ${name}Port) {} execute(input: unknown) { return this.port.execute(input); } }\n`,
  }, {
    path: `src/modules/${module}/${resource}/infrastructure/${operation}.adapter.ts`,
    content: `import 'server-only';\nimport type { ${name}Port } from '../application/ports/${operation}.port';\nexport class ${name}Adapter implements ${name}Port { async execute(input: unknown): Promise<unknown> { return input; } }\n`,
  }, {
    path: `src/modules/${module}/${resource}/presentation/${operation}.schemas.ts`,
    content: `import { z } from 'zod';\nexport const ${camel(operation)}RequestSchema = z.object({}).strict();\n`,
  }, {
    path: `src/modules/${module}/${resource}/presentation/${operation}-view.tsx`,
    content: `export function ${name}View({ result }: { result: unknown }) { return <pre>{JSON.stringify(result, null, 2)}</pre>; }\n`,
  }];
}

function compositionPlan(module: string, resource: string, operation: string): FilePlan {
  const name = pascal(operation);
  return {
    path: `src/composition/${module}.ts`,
    content: `import 'server-only';\nimport { ${name} } from '@/modules/${module}/${resource}/application/queries/${operation}';\nimport { ${name}Adapter } from '@/modules/${module}/${resource}/infrastructure/${operation}.adapter';\nconst adapter = new ${name}Adapter();\nexport const ${camel(module)}Module = Object.freeze({ queries: Object.freeze({ ${camel(operation)}: new ${name}(adapter) }), commands: Object.freeze({ ${camel(operation)}: new ${name}(adapter) }) });\n`,
  };
}

function plans(kind: DeliveryGenerationKind, target: string): readonly FilePlan[] {
  const [module, resource, operation] = targetParts(target);
  if (kind === 'page') return [pagePlan(module, resource, operation)];
  if (kind === 'route-handler') return [routePlan(module, resource, operation)];
  if (kind === 'action') return actionPlan(module, resource, operation);
  if (kind === 'operation') return [...operationPlan(module, resource, operation), compositionPlan(module, resource, operation)];
  return [
    ...operationPlan(module, resource, operation),
    compositionPlan(module, resource, operation),
    pagePlan(module, resource, operation),
    routePlan(module, resource, operation),
    ...actionPlan(module, resource, operation),
  ];
}

async function present(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

export async function generateDeliverySlice(kind: DeliveryGenerationKind, target: string, options: Options = {}): Promise<DeliveryGenerationResult> {
  const root = options.root ?? process.cwd();
  const created: string[] = []; const skipped: string[] = []; const overwritten: string[] = [];
  for (const item of plans(kind, target)) {
    const absolute = path.join(root, item.path);
    const exists = await present(absolute);
    if (exists) {
      const current = await readFile(absolute, 'utf8');
      if (current === item.content) { skipped.push(item.path); continue; }
      if (!options.force) throw new Error(`GENERATOR_CONFLICT: ${item.path}`);
      overwritten.push(item.path);
    } else created.push(item.path);
    if (!options.dryRun) { await mkdir(path.dirname(absolute), { recursive: true }); await writeFile(absolute, item.content, 'utf8'); }
  }
  return { kind, target, dryRun: options.dryRun ?? false, created, skipped, overwritten };
}
