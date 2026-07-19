import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ViewGenerationResult } from './types';

type ViewGeneratorOptions = Readonly<{
  root?: string;
  dryRun?: boolean;
  force?: boolean;
  client?: boolean;
  email?: boolean;
}>;

type FilePlan = Readonly<{ path: string; content: string }>;

function words(value: string): readonly string[] {
  return value.split(/[^A-Za-z0-9]+/u).filter(Boolean).map((word) => word.toLowerCase());
}

function pascal(value: string): string {
  return words(value).map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join('');
}

function kebab(value: string): string {
  return words(value).join('-');
}

function targetParts(target: string): readonly [string, string, string] {
  const parts = target.split('/').map(kebab).filter(Boolean);
  if (parts.length !== 3 || parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(part))) {
    throw new Error('A make:view célja module/resource/view-name formátumú legyen.');
  }
  return [parts[0] ?? '', parts[1] ?? '', parts[2] ?? ''];
}

function componentPlans(module: string, resource: string, view: string, client: boolean): readonly FilePlan[] {
  const name = pascal(view);
  const directory = `src/modules/${module}/${resource}/presentation`;
  const clientDirective = client ? "'use client';\n\n" : '';
  return [{
    path: `${directory}/${view}.view-model.ts`,
    content: `export type ${name}ViewModel = Readonly<{\n  heading: string;\n  description: string;\n}>;\n`,
  }, {
    path: `${directory}/${view}.presenter.ts`,
    content: `import type { ${name}ViewModel } from './${view}.view-model';\n\nexport type ${name}PresentationInput = Readonly<{\n  heading: string;\n  description: string;\n}>;\n\nexport function present${name}(input: ${name}PresentationInput): ${name}ViewModel {\n  return Object.freeze({\n    heading: input.heading,\n    description: input.description,\n  });\n}\n`,
  }, {
    path: `${directory}/${view}-view.tsx`,
    content: `${clientDirective}import type { ${name}ViewModel } from './${view}.view-model';\n\ntype ${name}ViewProps = Readonly<{\n  model: ${name}ViewModel;\n}>;\n\nexport function ${name}View({ model }: ${name}ViewProps) {\n  return (\n    <section aria-labelledby="${view}-heading">\n      <h2 id="${view}-heading">{model.heading}</h2>\n      <p>{model.description}</p>\n    </section>\n  );\n}\n`,
  }];
}

function emailPlans(module: string, resource: string, view: string): readonly FilePlan[] {
  const name = pascal(view);
  const directory = `src/modules/${module}/${resource}/presentation/email`;
  return [{
    path: `${directory}/${view}-email.view-model.ts`,
    content: `export type ${name}EmailViewModel = Readonly<{\n  subject: string;\n  recipientName: string;\n  actionUrl: string;\n}>;\n`,
  }, {
    path: `${directory}/${view}-email.tsx`,
    content: `import type { ${name}EmailViewModel } from './${view}-email.view-model';\n\ntype ${name}EmailProps = Readonly<{\n  model: ${name}EmailViewModel;\n}>;\n\nexport function ${name}Email({ model }: ${name}EmailProps) {\n  return (\n    <html lang="en">\n      <body>\n        <h1>{model.subject}</h1>\n        <p>Hello {model.recipientName}.</p>\n        <p><a href={model.actionUrl}>Open the application</a></p>\n      </body>\n    </html>\n  );\n}\n`,
  }, {
    path: `${directory}/${view}-email.renderer.tsx`,
    content: `import 'server-only';\n\nimport { renderToStaticMarkup } from 'react-dom/server';\n\nimport { ${name}Email } from './${view}-email';\nimport type { ${name}EmailViewModel } from './${view}-email.view-model';\n\nexport type Rendered${name}Email = Readonly<{\n  subject: string;\n  html: string;\n  text: string;\n}>;\n\nexport function render${name}Email(model: ${name}EmailViewModel): Rendered${name}Email {\n  return Object.freeze({\n    subject: model.subject,\n    html: '<!doctype html>' + renderToStaticMarkup(<${name}Email model={model} />),\n    text: \`${'${model.subject}'}\\n\\nHello ${'${model.recipientName}'}.\\n${'${model.actionUrl}'}\`,\n  });\n}\n`,
  }];
}

async function present(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function generateView(
  target: string,
  options: ViewGeneratorOptions = {},
): Promise<ViewGenerationResult> {
  if (options.client && options.email) throw new Error('Az email-template nem lehet Client Component.');
  const root = options.root ?? process.cwd();
  const [module, resource, view] = targetParts(target);
  const plan = options.email
    ? emailPlans(module, resource, view)
    : componentPlans(module, resource, view, options.client ?? false);
  const created: string[] = [];
  const skipped: string[] = [];
  const overwritten: string[] = [];

  for (const item of plan) {
    const absolute = path.join(root, item.path);
    const fileExists = await present(absolute);
    if (fileExists) {
      const current = await readFile(absolute, 'utf8');
      if (current === item.content) {
        skipped.push(item.path);
        continue;
      }
      if (!options.force) throw new Error(`GENERATOR_CONFLICT: ${item.path}`);
      overwritten.push(item.path);
    } else {
      created.push(item.path);
    }
    if (!options.dryRun) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, item.content, 'utf8');
    }
  }

  return Object.freeze({
    target,
    dryRun: options.dryRun ?? false,
    created: Object.freeze(created),
    skipped: Object.freeze(skipped),
    overwritten: Object.freeze(overwritten),
  });
}
