import path from 'node:path';

import { checkFormDocumentation, generateFormDocumentation } from './docs';
import { generateFormArtifact } from './generator';
import {
  buildFormInventory,
  inspectForms,
  isFormAccessibilityIssue,
  isFormSecurityIssue,
} from './inventory';
import {
  renderFormErrors,
  renderFormFields,
  renderFormInspection,
  renderFormIssues,
  renderFormList,
} from './render';
import type { FormGenerationKind, FormIssue } from './types';

export const FORM_COMMANDS = Object.freeze([
  'form:list',
  'form:inspect',
  'form:check',
  'form:contracts',
  'form:fields',
  'form:errors',
  'form:docs',
  'make:form',
  'make:server-action',
  'make:form-handler',
  'form:fixtures',
  'form:a11y',
  'form:security',
] as const);

const COMMANDS = new Set<string>(FORM_COMMANDS);

function parse(values: readonly string[]) {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index] ?? '';
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    if (equals > 2) {
      options.set(value.slice(0, equals), value.slice(equals + 1));
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith('--')) {
      options.set(value, next);
      index += 1;
    } else {
      options.set(value, true);
    }
  }
  return { positionals, options };
}

function hasErrors(issues: readonly FormIssue[]): boolean {
  return issues.some(({ severity }) => severity === 'error');
}

function failUsage(message: string): never {
  throw Object.assign(new Error(message), { exitCode: 2 });
}

function print(value: unknown, json: boolean, text: string): void {
  console.log(json ? JSON.stringify(value, null, 2) : text);
}

function generationKind(command: string): FormGenerationKind | null {
  if (command === 'make:form') return 'form';
  if (command === 'make:server-action') return 'server-action';
  if (command === 'make:form-handler') return 'form-handler';
  return null;
}

export async function runFormCli(args: readonly string[]): Promise<boolean> {
  const command = args[0] ?? '';
  if (!COMMANDS.has(command)) return false;
  const parsed = parse(args);
  const option = (name: string): string | null => {
    const value = parsed.options.get(name);
    return typeof value === 'string' ? value : null;
  };
  const flag = (name: string): boolean => parsed.options.get(name) === true;
  const project = option('--project') ?? '.';
  const root = path.resolve(process.cwd(), project);
  const json = flag('--json');
  const generation = generationKind(command);

  if (generation) {
    const target = parsed.positionals[0];
    if (!target) failUsage(`A ${command} parancshoz module/resource/operation cél szükséges.`);
    const result = await generateFormArtifact(generation, target, {
      root,
      dryRun: flag('--dry-run'),
      force: flag('--force'),
    });
    print(result, json, [
      `${result.dryRun ? 'PLAN' : 'DONE'}: ${command} ${target}`,
      `Created: ${result.created.length}`,
      `Skipped: ${result.skipped.length}`,
      `Overwritten: ${result.overwritten.length}`,
      ...result.created.map((file) => `+ ${file}`),
    ].join('\n'));
    return true;
  }

  if (command === 'form:docs') {
    if (flag('--check')) {
      const issues = await checkFormDocumentation(root);
      print({ issues }, json, renderFormIssues(issues, 'form:docs --check'));
      if (hasErrors(issues)) process.exitCode = 1;
    } else {
      const files = await generateFormDocumentation(root);
      print({ files }, json, `GENERATED: ${files.length} form document`);
    }
    return true;
  }

  const inventory = await buildFormInventory(root);
  if (command === 'form:list') {
    print(inventory, json, renderFormList(inventory));
    return true;
  }
  if (command === 'form:inspect') {
    const value = parsed.positionals[0];
    if (!value) failUsage('A form:inspect parancshoz form ID, komponens vagy fájl szükséges.');
    const records = inspectForms(inventory, value);
    print({ records }, json, renderFormInspection(records));
    if (records.length === 0) process.exitCode = 1;
    return true;
  }
  if (command === 'form:fields') {
    print({ records: inventory.records.map(({ id, fields }) => ({ id, fields })) }, json, renderFormFields(inventory));
    return true;
  }
  if (command === 'form:errors') {
    print({ records: inventory.records.map(({ id, fields }) => ({ id, fields: fields.map(({ name, errorCodes }) => ({ name, errorCodes })) })) }, json, renderFormErrors(inventory));
    return true;
  }
  if (command === 'form:contracts') {
    print({ records: inventory.records, issues: inventory.issues }, json, [renderFormList(inventory), '', renderFormIssues(inventory.issues, 'form:contracts')].join('\n'));
    if (hasErrors(inventory.issues)) process.exitCode = 1;
    return true;
  }

  const issues = command === 'form:a11y'
    ? inventory.issues.filter(isFormAccessibilityIssue)
    : command === 'form:security'
      ? inventory.issues.filter(isFormSecurityIssue)
      : inventory.issues;
  const label = command === 'form:fixtures' ? 'form:fixtures' : command;
  print({ fingerprint: inventory.fingerprint, records: inventory.records, issues }, json, renderFormIssues(issues, label));
  if (hasErrors(issues)) process.exitCode = 1;
  return true;
}
