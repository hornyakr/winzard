#!/usr/bin/env node
import path from 'node:path';

import { runProjectChecks, type CheckFailure } from './checks/project';
import {
  checkAiAdapters,
  generateAiAdapters,
} from './documentation/adapters';
import { runDocumentationChecks } from './documentation/checks';
import {
  checkConsumerDocumentationPack,
  syncConsumerDocumentationPack,
} from './documentation/consumer-pack';
import {
  buildContextPackage,
  checkContextPackage,
} from './documentation/context';
import { createHandoff } from './documentation/handoff';
import {
  inferProjectPrefix,
  initializeProjectDocumentation,
} from './documentation/init';
import { createDocumentationDocument } from './documentation/new-document';
import {
  checkDocumentationProjections,
  generateDocumentationProjections,
} from './documentation/projections';
import { documentationStatus } from './documentation/status';
import type { SupportedDocumentTemplate } from './documentation/templates';
import {
  DocumentationCommandError,
  type DocumentationIssue,
} from './documentation/types';
import { checkCapabilityEnvironment } from './environment';
import { loadProjectManifest, type WinzardManifest } from './manifest';

const supportedCommands = [
  'about',
  'doctor',
  'check',
  'env:check',
  'security:check',
  'docs:init',
  'docs:check',
  'docs:status',
  'docs:generate',
  'docs:new',
  'docs:adapters',
  'docs:sync',
  'context:build',
  'context:check',
  'handoff:new',
] as const;

const argumentsList = process.argv.slice(2);
const command = argumentsList[0]?.startsWith('-') === false ? argumentsList[0] : 'list';
const commandArguments = command === 'list' ? argumentsList : argumentsList.slice(1);

type ParsedArguments = Readonly<{
  options: ReadonlyMap<string, string | true>;
  positionals: readonly string[];
}>;

function parseArguments(values: readonly string[]): ParsedArguments {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index] ?? '';
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }

    const equalsIndex = argument.indexOf('=');
    if (equalsIndex > 2) {
      options.set(argument.slice(0, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }

    const next = values[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options.set(argument, next);
      index += 1;
    } else {
      options.set(argument, true);
    }
  }

  return { options, positionals };
}

const parsedArguments = parseArguments(commandArguments);

function option(name: string): string | null {
  const value = parsedArguments.options.get(name);
  return typeof value === 'string' ? value : null;
}

function flag(name: string): boolean {
  return parsedArguments.options.get(name) === true;
}

function commaSeparatedOption(name: string): readonly string[] {
  const value = option(name);
  return value === null
    ? []
    : value.split(',').map((item) => item.trim()).filter(Boolean).sort();
}

const projectArgument = option('--project') ?? '.';
const root = path.resolve(process.cwd(), projectArgument);
const jsonOutput = flag('--json');

function dateOption(): string {
  const value = option('--date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new DocumentationCommandError('DOC_DATE_INVALID', '--date YYYY-MM-DD formátumú legyen.');
  }
  return value;
}

function printFailures(failures: readonly CheckFailure[]): void {
  for (const failure of failures) {
    console.error(`[${failure.code}] ${failure.file}: ${failure.message}`);
  }
}

function printDocumentationIssues(issues: readonly DocumentationIssue[]): void {
  for (const issue of issues) {
    const label = issue.severity === 'warning' ? 'WARN' : 'ERROR';
    console.error(`${label} [${issue.code}] ${issue.file}: ${issue.message}`);
  }
}

async function manifestOrExit(): Promise<WinzardManifest | null> {
  const result = await loadProjectManifest(root);
  if (result.manifest === null) {
    printFailures(result.failures);
    process.exitCode = 1;
    return null;
  }
  return result.manifest;
}

async function requireDocumentationManifest(
  capability?: 'project-documentation' | 'ai-delivery',
): Promise<WinzardManifest | null> {
  const manifest = await manifestOrExit();
  if (!manifest) return null;
  if (!manifest.documentation || !manifest.capabilities.includes('project-documentation')) {
    console.error('[CAPABILITY_MISSING] A parancshoz project-documentation capability szükséges.');
    process.exitCode = 1;
    return null;
  }
  if (capability && !manifest.capabilities.includes(capability)) {
    console.error(`[CAPABILITY_MISSING] A parancshoz ${capability} capability szükséges.`);
    process.exitCode = 1;
    return null;
  }
  return manifest;
}

async function runChecks(label: string): Promise<void> {
  const failures = await runProjectChecks(root);
  if (failures.length > 0) {
    printFailures(failures);
    console.error(`FAIL: ${label} (${failures.length} hiba)`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${label} (${projectArgument})`);
}

async function runEnvironmentCheck(): Promise<void> {
  const manifest = await manifestOrExit();
  if (!manifest) return;
  const failures = await checkCapabilityEnvironment(root, manifest);
  if (failures.length > 0) {
    printFailures(failures);
    console.error(`FAIL: env:check (${failures.length} hiba)`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: env:check (${projectArgument})`);
}

async function printAbout(): Promise<void> {
  const manifest = await manifestOrExit();
  if (!manifest) return;
  const documentation = manifest.documentation
    ? ` docs-v${manifest.documentation.contractVersion}:${manifest.documentation.projectPrefix}`
    : '';
  console.log(`${manifest.profile} [${manifest.capabilities.join(', ')}]${documentation}`);
}

async function runDocsInit(): Promise<void> {
  const prefix = (option('--prefix') ?? await inferProjectPrefix(root)).toUpperCase();
  const includeAiDelivery = flag('--ai') || option('--ai') === 'true';
  const result = await initializeProjectDocumentation(root, {
    projectPrefix: prefix,
    includeAiDelivery,
    force: flag('--force'),
    date: dateOption(),
    ...(option('--consumer-version') ? { consumerContractVersion: option('--consumer-version') ?? undefined } : {}),
    ...(option('--consumer-source') ? { consumerSourceDirectory: path.resolve(option('--consumer-source') ?? '') } : {}),
  });
  const payload = {
    profile: result.manifest.profile,
    capabilities: result.manifest.capabilities,
    created: result.created,
    skipped: result.skipped,
    generated: result.generated,
  };
  console.log(jsonOutput ? JSON.stringify(payload, null, 2) : [
    `PASS: docs:init (${projectArgument})`,
    `Created: ${result.created.length}`,
    `Skipped: ${result.skipped.length}`,
    `Generated: ${result.generated.length}`,
  ].join('\n'));
}

async function runDocsCheck(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  const result = await runDocumentationChecks(root, manifest, {
    ...(option('--today') ? { today: option('--today') ?? undefined } : {}),
    includeGenerated: !flag('--canonical-only'),
  });
  if (jsonOutput) {
    console.log(JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2));
  } else {
    printDocumentationIssues(result.issues);
  }
  if (result.errors.length > 0) {
    if (!jsonOutput) console.error(`FAIL: docs:check (${result.errors.length} hiba, ${result.warnings.length} warning)`);
    process.exitCode = 1;
    return;
  }
  if (!jsonOutput) console.log(`PASS: docs:check (${result.inventory.documents.length} dokumentum, ${result.warnings.length} warning)`);
}

async function runDocsStatus(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  if (flag('--write')) await generateDocumentationProjections(root, manifest);
  const status = await documentationStatus(root, manifest, option('--today') ?? undefined);
  if (jsonOutput) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log([
    `Documents: ${status.total}`,
    `Canonical: ${status.canonical}`,
    `Generated: ${status.generated}`,
    `Errors: ${status.errors}`,
    `Warnings: ${status.warnings}`,
    `Overdue reviews: ${status.overdueReviews}`,
    `Document status: ${JSON.stringify(status.byDocumentStatus)}`,
    `Implementation status: ${JSON.stringify(status.byImplementationStatus)}`,
    `Verification status: ${JSON.stringify(status.byVerificationStatus)}`,
  ].join('\n'));
  if (status.errors > 0) process.exitCode = 1;
}

const supportedTemplates: readonly SupportedDocumentTemplate[] = [
  'capability', 'adr', 'specification', 'policy', 'task', 'handoff', 'review', 'evidence', 'runbook', 'release', 'incident',
];

function templateArgument(): SupportedDocumentTemplate {
  const value = parsedArguments.positionals[0] ?? '';
  if (!supportedTemplates.includes(value as SupportedDocumentTemplate)) {
    throw new DocumentationCommandError(
      'DOC_TEMPLATE_UNKNOWN',
      `Ismeretlen dokumentumsablon: ${value || '<hiányzik>'}. Támogatott: ${supportedTemplates.join(', ')}.`,
    );
  }
  return value as SupportedDocumentTemplate;
}


async function runDocsGenerate(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  if (flag('--check')) {
    const issues = [
      ...(await checkConsumerDocumentationPack(root, manifest)),
      ...(await checkDocumentationProjections(root, manifest)),
      ...(manifest.capabilities.includes('ai-delivery') ? await checkAiAdapters(root, manifest) : []),
    ];
    printDocumentationIssues(issues);
    if (issues.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log('PASS: docs:generate --check');
    return;
  }

  const files = [
    ...(await syncConsumerDocumentationPack(root, manifest)),
    ...(await generateDocumentationProjections(root, manifest)),
    ...(manifest.capabilities.includes('ai-delivery') ? await generateAiAdapters(root, manifest) : []),
  ];
  console.log(jsonOutput ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} dokumentációs projekció`);
}

async function runDocsNew(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  const title = option('--title');
  if (!title) throw new DocumentationCommandError('DOC_TITLE_MISSING', 'A docs:new parancshoz --title szükséges.');
  const result = await createDocumentationDocument(root, manifest, {
    type: templateArgument(),
    title,
    date: dateOption(),
    ...(option('--id') ? { id: option('--id') ?? undefined } : {}),
    ...(option('--base-commit') ? { baseCommit: option('--base-commit') ?? undefined } : {}),
  });
  await generateDocumentationProjections(root, manifest);
  if (manifest.capabilities.includes('ai-delivery')) await generateAiAdapters(root, manifest);
  console.log(jsonOutput ? JSON.stringify(result, null, 2) : `CREATED: ${result.file} (${result.id})`);
}

async function runDocsAdapters(): Promise<void> {
  const manifest = await requireDocumentationManifest('ai-delivery');
  if (!manifest) return;
  if (flag('--check')) {
    const issues = await checkAiAdapters(root, manifest);
    printDocumentationIssues(issues);
    if (issues.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log('PASS: docs:adapters --check');
    return;
  }
  const files = await generateAiAdapters(root, manifest);
  console.log(jsonOutput ? JSON.stringify({ files }, null, 2) : `GENERATED: ${files.length} AI adapter`);
}

async function runDocsSync(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  const options = option('--source') ? { sourceDirectory: path.resolve(option('--source') ?? '') } : {};
  if (flag('--check')) {
    const issues = await checkConsumerDocumentationPack(root, manifest, options);
    printDocumentationIssues(issues);
    if (issues.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log('PASS: docs:sync --check');
    return;
  }
  const files = await syncConsumerDocumentationPack(root, manifest, options);
  console.log(jsonOutput ? JSON.stringify({ files }, null, 2) : `SYNCED: ${files.length} consumer contract fájl`);
}

function taskIdArgument(): string {
  const value = parsedArguments.positionals[0]?.trim();
  if (!value) throw new DocumentationCommandError('DOC_TASK_ID_MISSING', 'A parancshoz task ID szükséges.');
  return value;
}

function contextOptions() {
  return {
    taskId: taskIdArgument(),
    allowRestricted: commaSeparatedOption('--allow-restricted'),
    enforceBaseCommit: !flag('--allow-stale-base'),
  } as const;
}

async function runContextBuild(): Promise<void> {
  const manifest = await requireDocumentationManifest('ai-delivery');
  if (!manifest) return;
  const result = await buildContextPackage(root, manifest, contextOptions());
  console.log(jsonOutput ? JSON.stringify(result.manifest, null, 2) : [
    `GENERATED: ${result.markdownPath}`,
    `GENERATED: ${result.manifestPath}`,
    ...result.warnings.map((warning) => `WARN: ${warning}`),
  ].join('\n'));
}

async function runContextCheck(): Promise<void> {
  const manifest = await requireDocumentationManifest('ai-delivery');
  if (!manifest) return;
  const issues = await checkContextPackage(root, manifest, contextOptions());
  printDocumentationIssues(issues);
  if (issues.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: context:check (${taskIdArgument()})`);
}

async function runHandoffNew(): Promise<void> {
  const manifest = await requireDocumentationManifest();
  if (!manifest) return;
  const result = await createHandoff(root, manifest, {
    taskId: taskIdArgument(),
    date: dateOption(),
    ...(option('--result-commit') ? { resultCommit: option('--result-commit') ?? undefined } : {}),
  });
  await generateDocumentationProjections(root, manifest);
  if (manifest.capabilities.includes('ai-delivery')) await generateAiAdapters(root, manifest);
  console.log(jsonOutput ? JSON.stringify(result, null, 2) : `CREATED: ${result.file} (${result.id})`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'list':
      console.log(supportedCommands.join('\n'));
      break;
    case 'about':
      await printAbout();
      break;
    case 'env:check':
      await runEnvironmentCheck();
      break;
    case 'doctor':
      await runEnvironmentCheck();
      if (!process.exitCode) await runChecks('doctor');
      break;
    case 'check':
    case 'security:check':
      await runChecks(command);
      break;
    case 'docs:init':
      await runDocsInit();
      break;
    case 'docs:check':
      await runDocsCheck();
      break;
    case 'docs:status':
      await runDocsStatus();
      break;
    case 'docs:generate':
      await runDocsGenerate();
      break;
    case 'docs:new':
      await runDocsNew();
      break;
    case 'docs:adapters':
      await runDocsAdapters();
      break;
    case 'docs:sync':
      await runDocsSync();
      break;
    case 'context:build':
      await runContextBuild();
      break;
    case 'context:check':
      await runContextCheck();
      break;
    case 'handoff:new':
      await runHandoffNew();
      break;
    default:
      console.error(`Unknown Forge command: ${command}`);
      process.exitCode = 2;
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof DocumentationCommandError) {
    console.error(`[${error.code}] ${error.file}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}
