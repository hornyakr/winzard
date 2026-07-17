import { access, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import { checkAiAdapters } from './adapters';
import { checkConsumerDocumentationPack } from './consumer-pack';
import { contentMatches } from './generated';
import { expectedContextPackage } from './context';
import { buildDocumentationInventory } from './inventory';
import { checkDocumentationProjections } from './projections';
import { optionalString, relationFields, stringArray } from './schema';
import type {
  CanonicalDocument,
  DocumentationCheckResult,
  DocumentationIssue,
  DocumentationInventory,
} from './types';

function issue(
  code: string,
  file: string,
  message: string,
  documentId?: string,
  severity: 'error' | 'warning' = 'error',
): DocumentationIssue {
  return { code, severity, file, message, ...(documentId ? { documentId } : {}) };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function markdownLinks(body: string): readonly string[] {
  const links = new Set<string>();
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
  for (const match of body.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const destination = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw.split(/\s+["']/u, 1)[0] ?? raw;
    if (
      destination === '' ||
      destination.startsWith('#') ||
      /^[a-z][a-z0-9+.-]*:/iu.test(destination)
    ) continue;
    links.add(destination);
  }
  return [...links].sort();
}

function pathWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

async function checkLinks(root: string, document: CanonicalDocument): Promise<readonly DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  const resolvedRoot = path.resolve(root);
  const canonicalRoot = await realpath(resolvedRoot).catch(() => resolvedRoot);

  for (const link of markdownLinks(document.body)) {
    const withoutAnchor = link.split('#', 1)[0]?.split('?', 1)[0] ?? '';
    if (withoutAnchor === '') continue;
    let decoded = withoutAnchor;
    try { decoded = decodeURIComponent(withoutAnchor); } catch { /* retain original */ }
    const target = path.resolve(path.dirname(document.filePath), decoded);
    if (!pathWithinRoot(resolvedRoot, target)) {
      issues.push(issue(
        'DOC_LINK_OUTSIDE_PROJECT',
        document.projectPath,
        `A relatív Markdown-link kilép a repository gyökeréből: ${link}.`,
        document.id,
      ));
      continue;
    }
    if (!(await exists(target))) {
      issues.push(issue('DOC_LINK_BROKEN', document.projectPath, `Törött relatív Markdown-link: ${link}.`, document.id));
      continue;
    }
    const canonicalTarget = await realpath(target).catch(() => target);
    if (!pathWithinRoot(canonicalRoot, canonicalTarget)) {
      issues.push(issue(
        'DOC_LINK_OUTSIDE_PROJECT',
        document.projectPath,
        `A relatív Markdown-link repositoryn kívüli célra vagy symlinkre mutat: ${link}.`,
        document.id,
      ));
    }
  }
  return issues;
}

function wikilinkTargets(body: string): readonly string[] {
  const targets = new Set<string>();
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/gu;
  for (const match of body.matchAll(pattern)) {
    const target = match[1]?.trim();
    if (target) targets.add(target);
  }
  return [...targets].sort();
}

function checkReferences(inventory: DocumentationInventory): readonly DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  for (const document of inventory.documents) {
    for (const targetId of wikilinkTargets(document.body)) {
      if (
        (targetId.startsWith(`${inventory.projectPrefix}-`) || targetId.startsWith('WZ-')) &&
        !inventory.byId.has(targetId)
      ) {
        issues.push(issue(
          'DOC_REFERENCE_MISSING',
          document.projectPath,
          `A wikilink nem létező dokumentumra hivatkozik: ${targetId}.`,
          document.id,
        ));
      }
    }

    for (const field of relationFields) {
      for (const targetId of stringArray(document.metadata, field)) {
        if (!targetId.startsWith(`${inventory.projectPrefix}-`) && !targetId.startsWith('WZ-')) {
          issues.push(issue('DOC_FOREIGN_PROJECT_REFERENCE', document.projectPath, `Más projektprefixre mutató kapcsolat: ${targetId}.`, document.id));
          continue;
        }
        if (!inventory.byId.has(targetId)) {
          issues.push(issue('DOC_REFERENCE_MISSING', document.projectPath, `A(z) ${field} nem létező dokumentumra hivatkozik: ${targetId}.`, document.id));
        }
      }
    }

    for (const supersededId of stringArray(document.metadata, 'supersedes')) {
      const superseded = inventory.byId.get(supersededId);
      if (superseded && !stringArray(superseded.metadata, 'superseded_by').includes(document.id)) {
        issues.push(issue('DOC_SUPERSESSION_INVALID', document.projectPath, `${supersededId} superseded_by mezője nem hivatkozik vissza ${document.id} dokumentumra.`, document.id));
      }
    }
  }
  return issues;
}

function checkDependencyCycles(inventory: DocumentationInventory): readonly DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  const state = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 'visited') return;
    if (current === 'visiting') {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(Math.max(start, 0)), id];
      const document = inventory.byId.get(id);
      issues.push(issue('DOC_DEPENDENCY_CYCLE', document?.projectPath ?? 'docs', `Dokumentumfüggőségi ciklus: ${cycle.join(' → ')}.`, id));
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    const document = inventory.byId.get(id);
    for (const dependency of document ? stringArray(document.metadata, 'depends_on') : []) {
      if (inventory.byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(id, 'visited');
  };

  for (const id of inventory.byId.keys()) visit(id);
  return issues;
}

function checkLifecycle(inventory: DocumentationInventory, today: string): readonly DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  const handoffsByTask = new Map<string, CanonicalDocument[]>();
  for (const document of inventory.documents) {
    const relatedTask = optionalString(document.metadata, 'related_task');
    if (document.subtype === 'handoff' && relatedTask) {
      const list = handoffsByTask.get(relatedTask) ?? [];
      list.push(document);
      handoffsByTask.set(relatedTask, list);
    }

    const reviewDue = optionalString(document.metadata, 'review_due');
    if (reviewDue && reviewDue < today && !['archived', 'superseded'].includes(document.documentStatus)) {
      issues.push(issue('DOC_REVIEW_OVERDUE', document.projectPath, `A dokumentum review_due dátuma lejárt: ${reviewDue}.`, document.id, 'warning'));
    }

    if (document.subtype === 'release') {
      const hasRollbackSection = /^##\s+Rollback\s*$/imu.test(document.body);
      const rollback = optionalString(document.metadata, 'rollback');
      if (!hasRollbackSection && rollback !== 'not_applicable') {
        issues.push(issue('DOC_RELEASE_ROLLBACK_MISSING', document.projectPath, 'A release dokumentumnak rollback fejezetet vagy rollback: not_applicable mezőt kell tartalmaznia.', document.id));
      }
    }
  }

  for (const task of inventory.documents.filter(({ subtype }) => subtype === 'task-brief')) {
    if (['implemented', 'partial'].includes(task.implementationStatus) && !(handoffsByTask.get(task.id)?.length)) {
      issues.push(issue('DOC_HANDOFF_MISSING', task.projectPath, 'Implementált vagy részben implementált taskhoz handoff szükséges.', task.id));
    }
  }
  return issues;
}

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?(?!<|\$\{|example|replace|redacted)[A-Za-z0-9+/_=-]{20,}/iu,
] as const;

function checkSecurity(document: CanonicalDocument): readonly DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];
  for (const pattern of secretPatterns) {
    if (pattern.test(document.source)) {
      issues.push(issue('DOC_SECRET_EXPOSED', document.projectPath, 'A dokumentum lehetséges secretet vagy privát kulcsot tartalmaz.', document.id));
      break;
    }
  }
  if (
    document.source.includes('obsidian://open?vault=winzard-core') ||
    /(?:\.\.\/){2,}winzard\/docs\//u.test(document.source) ||
    /\/winzard\/docs\/(?:internal|40-delivery|50-ai-delivery)\//u.test(document.source) ||
    /github\.com\/[^/]+\/winzard\/(?:blob|tree)\/[^/]+\/(?:packages\/forge|docs\/(?:adr|development)|apps\/reference)\//u.test(document.source) ||
    /(?:\.\.\/)+(?:packages\/forge|docs\/(?:adr|development)|apps\/reference)\//u.test(document.source)
  ) {
    issues.push(issue('DOC_INTERNAL_PLATFORM_REFERENCE', document.projectPath, 'A projekt dokumentuma belső Winzard repository- vagy vault-hivatkozást tartalmaz.', document.id));
  }
  return issues;
}

async function collectGeneratedMarkdown(root: string, relative: string): Promise<readonly string[]> {
  const directory = path.join(root, relative);
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files: string[] = [];
  for (const entry of entries) {
    const childRelative = `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collectGeneratedMarkdown(root, childRelative)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(childRelative);
  }
  return files.sort();
}

async function checkGeneratedHeaders(root: string): Promise<readonly DocumentationIssue[]> {
  const issues: DocumentationIssue[] = [];
  for (const directory of ['docs/80-winzard', 'docs/90-generated']) {
    for (const file of await collectGeneratedMarkdown(root, directory)) {
      const source = await readFile(path.join(root, file), 'utf8');
      if (!source.includes('Generated by Winzard Forge.')) {
        issues.push(issue('DOC_GENERATED_DRIFT', file, 'A generált dokumentumból hiányzik a Winzard Forge generated header.'));
      }
    }
  }
  return issues;
}

async function checkContextManifests(
  root: string,
  inventory: DocumentationInventory,
  manifest: WinzardManifest,
): Promise<readonly DocumentationIssue[]> {
  const directory = path.join(root, 'docs/90-generated/ai-context');
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const issues: DocumentationIssue[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.manifest.json')) continue;
    const relative = `docs/90-generated/ai-context/${entry.name}`;
    try {
      const stored = JSON.parse(await readFile(path.join(directory, entry.name), 'utf8')) as {
        taskId?: unknown;
        authorizedRestrictedDocuments?: unknown;
      };
      const taskId = typeof stored.taskId === 'string'
        ? stored.taskId
        : entry.name.replace('.manifest.json', '');
      const authorizedRestrictedDocuments = Array.isArray(stored.authorizedRestrictedDocuments)
        ? stored.authorizedRestrictedDocuments.filter((item): item is string => typeof item === 'string')
        : [];
      const expected = await expectedContextPackage(root, manifest, {
        taskId,
        allowRestricted: authorizedRestrictedDocuments,
        enforceBaseCommit: false,
      });
      if (!(await contentMatches(path.join(root, expected.markdownPath), expected.markdown))) {
        issues.push(issue(
          'DOC_CONTEXT_NONDETERMINISTIC',
          expected.markdownPath,
          'A context Markdown hiányzik vagy eltér a taskból és source contractokból várt eredménytől.',
          taskId,
        ));
      }
      const expectedManifest = `${JSON.stringify(expected.manifest, null, 2)}\n`;
      if (!(await contentMatches(path.join(root, expected.manifestPath), expectedManifest))) {
        issues.push(issue(
          'DOC_CONTEXT_NONDETERMINISTIC',
          expected.manifestPath,
          'A context provenance manifest hiányzik vagy nem determinisztikus.',
          taskId,
        ));
      }
    } catch (error) {
      issues.push(issue(
        'DOC_CONTEXT_NONDETERMINISTIC',
        relative,
        `A context package nem ellenőrizhető: ${error instanceof Error ? error.message : String(error)}.`,
      ));
    }
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const taskId = entry.name.slice(0, -3);
    if (!entries.some((candidate) => candidate.isFile() && candidate.name === `${taskId}.manifest.json`)) {
      issues.push(issue(
        'DOC_CONTEXT_NONDETERMINISTIC',
        `docs/90-generated/ai-context/${entry.name}`,
        'A context Markdown mellől hiányzik a provenance manifest.',
        taskId,
      ));
    }
  }

  void inventory;
  return issues;
}

export type DocumentationCheckOptions = Readonly<{
  today?: string;
  includeGenerated?: boolean;
}>;

export async function runDocumentationChecks(
  root: string,
  manifest: WinzardManifest,
  options: DocumentationCheckOptions = {},
): Promise<DocumentationCheckResult> {
  if (!manifest.documentation) {
    const empty = await buildDocumentationInventory(root, 'PROJECT');
    const missing = issue('DOCUMENTATION_MANIFEST_MISSING', 'winzard manifest', 'A project-documentation capabilityhez documentation manifest szükséges.');
    return { inventory: empty, issues: [missing], errors: [missing], warnings: [] };
  }

  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  const issues: DocumentationIssue[] = [...inventory.issues];
  issues.push(...checkReferences(inventory));
  issues.push(...checkDependencyCycles(inventory));
  issues.push(...checkLifecycle(inventory, options.today ?? new Date().toISOString().slice(0, 10)));

  for (const document of inventory.documents) {
    issues.push(...(await checkLinks(root, document)));
    issues.push(...checkSecurity(document));
  }

  if (options.includeGenerated !== false) {
    issues.push(...(await checkGeneratedHeaders(root)));
    issues.push(...(await checkConsumerDocumentationPack(root, manifest)));
    issues.push(...(await checkContextManifests(root, inventory, manifest)));
    issues.push(...(await checkDocumentationProjections(root, manifest)));
    if (manifest.capabilities.includes('ai-delivery')) {
      issues.push(...(await checkAiAdapters(root, manifest)));
    }
  }

  const sorted = issues.sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  const errors = sorted.filter(({ severity }) => severity === 'error');
  const warnings = sorted.filter(({ severity }) => severity === 'warning');
  return { inventory, issues: sorted, errors, warnings };
}
