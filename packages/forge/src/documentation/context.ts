import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import { renderMarkdownDocument } from './frontmatter';
import {
  GENERATED_HEADER,
  contentMatches,
  readOptional,
  sha256,
  writeJsonFile,
  writeTextFile,
} from './generated';
import { currentGitCommit, gitCommitIsAncestor } from './git';
import { assertDocumentationInventoryValid, buildDocumentationInventory } from './inventory';
import {
  FORGE_DOCUMENTATION_GENERATOR_VERSION,
  optionalString,
  stringArray,
} from './schema';
import type {
  CanonicalDocument,
  DocumentationIssue,
  FrontmatterRecord,
  FrontmatterValue,
} from './types';
import { DocumentationCommandError } from './types';

const directRelationFields = [
  'related_capabilities',
  'related_decisions',
  'related_specifications',
  'depends_on',
] as const;

export type ContextBuildOptions = Readonly<{
  taskId: string;
  allowRestricted?: readonly string[];
  enforceBaseCommit?: boolean;
}>;

type ContextSource = Readonly<{
  document: CanonicalDocument;
  reason: 'task' | 'related' | 'required' | 'previous-delivery';
}>;

type ExcludedSource = Readonly<{
  id: string;
  reason: string;
}>;

export type ExpectedContextPackage = Readonly<{
  markdownPath: string;
  manifestPath: string;
  markdown: string;
  manifest: Readonly<Record<string, unknown>>;
  warnings: readonly string[];
}>;

function sourcePriority(reason: ContextSource['reason']): number {
  return { task: 0, related: 1, required: 2, 'previous-delivery': 3 }[reason];
}

function chooseSource(
  sources: Map<string, ContextSource>,
  document: CanonicalDocument,
  reason: ContextSource['reason'],
): void {
  const existing = sources.get(document.id);
  if (!existing || sourcePriority(reason) < sourcePriority(existing.reason)) {
    sources.set(document.id, { document, reason });
  }
}

function relationIds(document: CanonicalDocument): readonly string[] {
  const ids = new Set<string>();
  for (const field of directRelationFields) {
    for (const id of stringArray(document.metadata, field)) ids.add(id);
  }
  return [...ids].sort();
}

function contextAllowed(
  document: CanonicalDocument,
  allowRestricted: ReadonlySet<string>,
): Readonly<{ allowed: boolean; reason?: string }> {
  if (document.aiAccess === 'denied' || document.contextPriority === 'never') {
    return { allowed: false, reason: 'AI access denied by document metadata' };
  }
  if (
    document.aiAccess === 'restricted' ||
    document.classification === 'restricted' ||
    document.classification === 'confidential'
  ) {
    return allowRestricted.has(document.id)
      ? { allowed: true }
      : { allowed: false, reason: 'restricted or confidential document requires explicit task access' };
  }
  return { allowed: true };
}

function taskContract(document: CanonicalDocument): string {
  const fields = [
    ['Base commit', optionalString(document.metadata, 'base_commit') ?? '<missing>'],
    ['Risk', optionalString(document.metadata, 'risk') ?? '<missing>'],
    ['Human approval', optionalString(document.metadata, 'human_approval') ?? '<missing>'],
    ['Allowed paths', stringArray(document.metadata, 'allowed_paths').join(', ') || '<none>'],
    ['Forbidden paths', stringArray(document.metadata, 'forbidden_paths').join(', ') || '<none>'],
    ['Required checks', stringArray(document.metadata, 'required_checks').join(', ') || '<none>'],
    ['Allowed tools', stringArray(document.metadata, 'allowed_tools').join(', ') || '<none>'],
    ['Denied tools', stringArray(document.metadata, 'denied_tools').join(', ') || '<none>'],
  ] as const;
  return fields.map(([name, value]) => `- **${name}:** ${value}`).join('\n');
}

function sourceSection(source: ContextSource): string {
  const { document, reason } = source;
  return [
    `## ${document.id} — ${document.title}`,
    '',
    `- Source: \`${document.projectPath}\``,
    `- Reason: \`${reason}\``,
    `- Hash: \`${sha256(document.source)}\``,
    `- Status: \`${document.documentStatus}\``,
    '',
    document.body.trim(),
  ].join('\n');
}

function metadataSources(sources: readonly ContextSource[]): readonly FrontmatterValue[] {
  return sources.map(({ document, reason }) => ({
    id: document.id,
    file: document.projectPath,
    reason,
    source_hash: sha256(document.source),
  }));
}

function metadataExcluded(excluded: readonly ExcludedSource[]): readonly FrontmatterValue[] {
  return excluded.map(({ id, reason }) => ({ id, reason }));
}

export async function expectedContextPackage(
  root: string,
  manifest: WinzardManifest,
  options: ContextBuildOptions,
): Promise<ExpectedContextPackage> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError('DOCUMENTATION_MANIFEST_MISSING', 'A context builderhez documentation manifest szükséges.');
  }
  if (!manifest.capabilities.includes('ai-delivery')) {
    throw new DocumentationCommandError('CAPABILITY_MISSING', 'A context builderhez ai-delivery capability szükséges.');
  }

  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  assertDocumentationInventoryValid(inventory, 'A context package generálása');
  const task = inventory.byId.get(options.taskId);
  if (!task) {
    throw new DocumentationCommandError('DOC_TASK_NOT_FOUND', `A task nem található: ${options.taskId}.`);
  }
  if (task.subtype !== 'task-brief') {
    throw new DocumentationCommandError('DOC_TASK_TYPE_INVALID', `${options.taskId} nem task-brief dokumentum.`, task.projectPath);
  }
  if (task.documentStatus !== 'accepted') {
    throw new DocumentationCommandError('DOC_TASK_NOT_ACCEPTED', 'Context csak accepted task briefből generálható.', task.projectPath);
  }

  const declaredRestrictedDocuments = new Set(
    stringArray(task.metadata, 'allowed_context_documents'),
  );
  for (const declaredId of declaredRestrictedDocuments) {
    if (!inventory.byId.has(declaredId)) {
      throw new DocumentationCommandError(
        'DOC_REFERENCE_MISSING',
        `Az allowed_context_documents nem létező dokumentumra hivatkozik: ${declaredId}.`,
        task.projectPath,
      );
    }
  }
  for (const requestedId of options.allowRestricted ?? []) {
    if (!declaredRestrictedDocuments.has(requestedId)) {
      throw new DocumentationCommandError(
        'DOC_AI_ACCESS_DENIED',
        `A --allow-restricted opció nem bővítheti a task contractját: ${requestedId} nincs az allowed_context_documents mezőben.`,
        task.projectPath,
      );
    }
  }
  const allowRestricted = declaredRestrictedDocuments;
  const taskAccess = contextAllowed(task, allowRestricted);
  if (!taskAccess.allowed) {
    throw new DocumentationCommandError(
      'DOC_AI_ACCESS_DENIED',
      `A task brief nem adható AI-kontextusba: ${task.id}.`,
      task.projectPath,
    );
  }
  const sources = new Map<string, ContextSource>();
  const excluded: ExcludedSource[] = [];
  const warnings: string[] = [];
  chooseSource(sources, task, 'task');

  for (const relatedId of relationIds(task)) {
    const related = inventory.byId.get(relatedId);
    if (!related) {
      throw new DocumentationCommandError('DOC_REFERENCE_MISSING', `A task nem létező dokumentumra hivatkozik: ${relatedId}.`, task.projectPath);
    }
    if (['superseded', 'deprecated', 'archived'].includes(related.documentStatus)) {
      excluded.push({ id: related.id, reason: `document status: ${related.documentStatus}` });
      throw new DocumentationCommandError('DOC_CONTEXT_SOURCE_INVALID', `A task elavult dokumentumra hivatkozik: ${related.id}.`, task.projectPath);
    }
    if (related.documentStatus !== 'accepted') {
      throw new DocumentationCommandError('DOC_CONTEXT_SOURCE_INVALID', `A taskhoz kapcsolt dokumentum nem accepted: ${related.id}.`, related.projectPath);
    }
    const access = contextAllowed(related, allowRestricted);
    if (!access.allowed) {
      excluded.push({ id: related.id, reason: access.reason ?? 'not allowed' });
      throw new DocumentationCommandError('DOC_AI_ACCESS_DENIED', `A szükséges dokumentum nem adható AI-kontextusba: ${related.id}.`, related.projectPath);
    }
    chooseSource(sources, related, 'related');
  }

  for (const document of inventory.documents) {
    if (
      document.id !== task.id &&
      document.documentStatus === 'accepted' &&
      document.contextPriority === 'required' &&
      (document.authority === 'normative' || document.scope === 'winzard-consumer-contract')
    ) {
      const access = contextAllowed(document, allowRestricted);
      if (!access.allowed) {
        excluded.push({ id: document.id, reason: access.reason ?? 'not allowed' });
        throw new DocumentationCommandError(
          'DOC_AI_ACCESS_DENIED',
          `A required context dokumentum nem adható AI-kontextusba: ${document.id}.`,
          document.projectPath,
        );
      }
      chooseSource(sources, document, 'required');
    }

    if (
      ['handoff', 'review'].includes(document.subtype) ||
      document.kind === 'evidence'
    ) {
      const relatedTask = optionalString(document.metadata, 'related_task');
      if (relatedTask === task.id && document.documentStatus !== 'archived') {
        const access = contextAllowed(document, allowRestricted);
        if (access.allowed) chooseSource(sources, document, 'previous-delivery');
      }
    }
  }

  const ordered = [...sources.values()].sort((left, right) =>
    sourcePriority(left.reason) - sourcePriority(right.reason) ||
    left.document.id.localeCompare(right.document.id));
  const totalSourceBytes = ordered.reduce(
    (total, { document }) => total + Buffer.byteLength(document.source, 'utf8'),
    0,
  );
  if (totalSourceBytes > manifest.documentation.contextBudgetBytes) {
    const largest = [...ordered]
      .sort((left, right) => Buffer.byteLength(right.document.source) - Buffer.byteLength(left.document.source))[0];
    throw new DocumentationCommandError(
      'DOC_CONTEXT_BUDGET_EXCEEDED',
      `A context forrásai ${totalSourceBytes} bájtot igényelnek, a budget ${manifest.documentation.contextBudgetBytes}. Legnagyobb forrás: ${largest?.document.id ?? 'unknown'}.`,
      task.projectPath,
    );
  }

  const baseCommit = optionalString(task.metadata, 'base_commit') ?? '';
  const currentCommit = await currentGitCommit(root);
  if (options.enforceBaseCommit !== false) {
    if (currentCommit === null) {
      throw new DocumentationCommandError(
        'DOC_TASK_BASE_COMMIT_UNVERIFIABLE',
        'A repository Git HEAD állapota nem ellenőrizhető; a task base commitja ezért nem validálható.',
        task.projectPath,
      );
    }

    const baseIsAncestor = await gitCommitIsAncestor(root, baseCommit, currentCommit);
    if (baseIsAncestor !== true) {
      const message = baseIsAncestor === false
        ? `A task base commitja (${baseCommit}) nem őse az aktuális HEAD-nek (${currentCommit}).`
        : `A task base commitja (${baseCommit}) nem ellenőrizhető az aktuális Git historyban.`;
      throw new DocumentationCommandError(
        baseIsAncestor === false ? 'DOC_TASK_BASE_COMMIT_MISMATCH' : 'DOC_TASK_BASE_COMMIT_UNVERIFIABLE',
        message,
        task.projectPath,
      );
    }
  }

  const generatedAt = optionalString(task.metadata, 'updated') ?? '1970-01-01';
  const authorizedRestrictedDocuments = [...allowRestricted].sort();
  const approval = optionalString(task.metadata, 'human_approval');
  if (approval === 'before_execute' && stringArray(task.metadata, 'approval_refs').length === 0) {
    throw new DocumentationCommandError(
      'DOC_TASK_APPROVAL_MISSING',
      'A task végrehajtás előtti emberi jóváhagyást követel, de approval_refs nincs megadva.',
      task.projectPath,
    );
  }

  const metadata: FrontmatterRecord = {
    schema_version: 1,
    task_id: task.id,
    base_commit: baseCommit,
    generated_at: generatedAt,
    documentation_contract_version: manifest.documentation.contractVersion,
    generator_version: FORGE_DOCUMENTATION_GENERATOR_VERSION,
    source_documents: metadataSources(ordered),
    excluded_documents: metadataExcluded(excluded.sort((left, right) => left.id.localeCompare(right.id))),
    authorized_restricted_documents: authorizedRestrictedDocuments,
    warnings,
  };
  const body = `${GENERATED_HEADER}\n\n# Context package — ${task.id}\n\n## Execution contract\n\n${taskContract(task)}\n\n## Sources\n\n${ordered.map(sourceSection).join('\n\n---\n\n')}\n`;
  const markdown = renderMarkdownDocument(metadata, body);
  const outputDirectory = 'docs/90-generated/ai-context';
  const markdownPath = `${outputDirectory}/${task.id}.md`;
  const manifestPath = `${outputDirectory}/${task.id}.manifest.json`;
  const provenance = {
    schemaVersion: 1,
    taskId: task.id,
    baseCommit,
    generatedAt,
    documentationContractVersion: manifest.documentation.contractVersion,
    generatorVersion: FORGE_DOCUMENTATION_GENERATOR_VERSION,
    contextSha256: sha256(markdown),
    sourceDocuments: ordered.map(({ document, reason }) => ({
      id: document.id,
      file: document.projectPath,
      reason,
      sourceHash: sha256(document.source),
    })),
    excludedDocuments: excluded.sort((left, right) => left.id.localeCompare(right.id)),
    authorizedRestrictedDocuments,
    warnings,
  };

  return {
    markdownPath,
    manifestPath,
    markdown,
    manifest: provenance,
    warnings,
  };
}

export async function buildContextPackage(
  root: string,
  manifest: WinzardManifest,
  options: ContextBuildOptions,
): Promise<ExpectedContextPackage> {
  const expected = await expectedContextPackage(root, manifest, options);
  const markdownTarget = path.join(root, expected.markdownPath);
  const manifestTarget = path.join(root, expected.manifestPath);
  const existingMarkdown = await readOptional(markdownTarget);
  if (existingMarkdown !== null && !existingMarkdown.includes('Generated by Winzard Forge.')) {
    throw new DocumentationCommandError(
      'DOC_CONTEXT_MANUAL_CONTENT',
      `A generátor nem ír felül kézzel karbantartott context fájlt: ${expected.markdownPath}.`,
      expected.markdownPath,
    );
  }
  const existingManifest = await readOptional(manifestTarget);
  if (existingManifest !== null) {
    try {
      const parsed = JSON.parse(existingManifest) as { generatorVersion?: unknown; taskId?: unknown };
      if (parsed.generatorVersion !== FORGE_DOCUMENTATION_GENERATOR_VERSION || parsed.taskId !== options.taskId) {
        throw new Error('not a matching generated context manifest');
      }
    } catch {
      throw new DocumentationCommandError(
        'DOC_CONTEXT_MANUAL_CONTENT',
        `A generátor nem ír felül kézzel karbantartott context manifestet: ${expected.manifestPath}.`,
        expected.manifestPath,
      );
    }
  }
  await writeTextFile(markdownTarget, expected.markdown);
  await writeJsonFile(manifestTarget, expected.manifest);
  return expected;
}

export async function checkContextPackage(
  root: string,
  manifest: WinzardManifest,
  options: ContextBuildOptions,
): Promise<readonly DocumentationIssue[]> {
  const expected = await expectedContextPackage(root, manifest, options);
  const issues: DocumentationIssue[] = [];
  if (!(await contentMatches(path.join(root, expected.markdownPath), expected.markdown))) {
    issues.push({
      code: 'DOC_CONTEXT_NONDETERMINISTIC',
      severity: 'error',
      file: expected.markdownPath,
      message: 'A context package hiányzik vagy eltér a kanonikus forrásokból generált eredménytől.',
      documentId: options.taskId,
    });
  }
  const expectedManifest = `${JSON.stringify(expected.manifest, null, 2)}\n`;
  if (!(await contentMatches(path.join(root, expected.manifestPath), expectedManifest))) {
    issues.push({
      code: 'DOC_CONTEXT_NONDETERMINISTIC',
      severity: 'error',
      file: expected.manifestPath,
      message: 'A context provenance manifest hiányzik vagy source hash driftet tartalmaz.',
      documentId: options.taskId,
    });
  }
  return issues;
}
