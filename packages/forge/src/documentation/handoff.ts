import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import { runDocumentationChecks } from './checks';
import { renderMarkdownDocument } from './frontmatter';
import {
  currentGitCommit,
  gitChangedFiles,
  gitCommitIsAncestor,
  gitWorkingTreeFiles,
} from './git';
import { assertDocumentationInventoryValid, buildDocumentationInventory } from './inventory';
import { matchesAnyPath } from './path-matcher';
import { optionalString, stringArray } from './schema';
import type { FrontmatterRecord } from './types';
import { DocumentationCommandError } from './types';

export type HandoffOptions = Readonly<{
  taskId: string;
  resultCommit?: string;
  date: string;
}>;

function handoffId(taskId: string): string {
  if (taskId.includes('-TASK-')) return taskId.replace('-TASK-', '-HANDOFF-');
  throw new DocumentationCommandError('DOC_TASK_ID_INVALID', `Nem képezhető handoff ID ebből a task ID-ból: ${taskId}.`);
}

function isGeneratedDocumentationArtifact(projectPath: string): boolean {
  return (
    projectPath.startsWith('docs/80-winzard/') ||
    projectPath.startsWith('docs/90-generated/') ||
    projectPath.startsWith('docs/_system/') ||
    projectPath === 'AGENTS.md' ||
    projectPath === 'CLAUDE.md' ||
    projectPath === 'GEMINI.md' ||
    projectPath === '.github/copilot-instructions.md' ||
    projectPath.startsWith('.github/instructions/')
  );
}

export async function createHandoff(
  root: string,
  manifest: WinzardManifest,
  options: HandoffOptions,
): Promise<Readonly<{
  id: string;
  file: string;
  changedFiles: readonly string[];
  implementationFiles: readonly string[];
  generatedFiles: readonly string[];
}>> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError('DOCUMENTATION_MANIFEST_MISSING', 'A handoff generálásához documentation manifest szükséges.');
  }
  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  assertDocumentationInventoryValid(inventory, 'A handoff létrehozása');
  const task = inventory.byId.get(options.taskId);
  if (!task || task.subtype !== 'task-brief') {
    throw new DocumentationCommandError('DOC_TASK_NOT_FOUND', `A task brief nem található: ${options.taskId}.`);
  }
  if (task.documentStatus !== 'accepted') {
    throw new DocumentationCommandError('DOC_TASK_NOT_ACCEPTED', 'Handoff csak accepted task briefhez készíthető.', task.projectPath);
  }

  const baseCommit = optionalString(task.metadata, 'base_commit') ?? '';
  const currentCommit = await currentGitCommit(root);
  if (!currentCommit) {
    throw new DocumentationCommandError(
      'DOC_RESULT_COMMIT_MISSING',
      'A Git HEAD result commit nem állapítható meg.',
      task.projectPath,
    );
  }
  const resultCommit = options.resultCommit ?? currentCommit;
  if (resultCommit !== currentCommit) {
    throw new DocumentationCommandError(
      'DOC_RESULT_COMMIT_NOT_CHECKED_OUT',
      `A handoff csak a checkoutolt HEAD commitból készülhet. HEAD: ${currentCommit}, megadott result: ${resultCommit}.`,
      task.projectPath,
    );
  }
  if (!/^[0-9a-f]{7,64}$/u.test(resultCommit)) {
    throw new DocumentationCommandError('DOC_RESULT_COMMIT_INVALID', 'A result commit nem érvényes Git commit hash.', task.projectPath);
  }
  const workingTreeFiles = await gitWorkingTreeFiles(root);
  if (workingTreeFiles === null) {
    throw new DocumentationCommandError('DOC_GIT_STATUS_FAILED', 'A Git working tree állapota nem olvasható.', task.projectPath);
  }
  if (workingTreeFiles.length > 0) {
    throw new DocumentationCommandError(
      'DOC_WORKTREE_DIRTY',
      `Handoff csak tiszta working tree-ből készíthető. Nem commitolt fájlok: ${workingTreeFiles.join(', ')}.`,
      task.projectPath,
    );
  }
  const baseIsAncestor = await gitCommitIsAncestor(root, baseCommit, resultCommit);
  if (baseIsAncestor !== true) {
    throw new DocumentationCommandError(
      'DOC_TASK_BASE_COMMIT_MISMATCH',
      'A task base commitja nem őse a result commitnak.',
      task.projectPath,
    );
  }
  const changedFiles = await gitChangedFiles(root, baseCommit, resultCommit);
  if (changedFiles === null) {
    throw new DocumentationCommandError('DOC_GIT_DIFF_FAILED', 'A task Git diffje nem olvasható.', task.projectPath);
  }
  const generatedFiles = changedFiles.filter(isGeneratedDocumentationArtifact);
  const implementationFiles = changedFiles.filter((file) => !isGeneratedDocumentationArtifact(file));
  if (generatedFiles.length > 0 && manifest.capabilities.includes('project-documentation')) {
    const documentation = await runDocumentationChecks(root, manifest);
    if (documentation.errors.length > 0) {
      throw new DocumentationCommandError(
        'DOC_GENERATED_ARTIFACT_INVALID',
        `A task diffjében lévő generált dokumentáció nem érvényes: ${documentation.errors.map(({ code, file }) => `${code}:${file}`).join(', ')}.`,
        task.projectPath,
      );
    }
  }
  const forbidden = stringArray(task.metadata, 'forbidden_paths');
  const allowed = stringArray(task.metadata, 'allowed_paths');
  const forbiddenChanges = implementationFiles.filter((file) => matchesAnyPath(file, forbidden));
  const outsideScope = allowed.length === 0
    ? implementationFiles
    : implementationFiles.filter((file) => !matchesAnyPath(file, allowed));
  if (forbiddenChanges.length > 0) {
    throw new DocumentationCommandError(
      'DOC_TASK_FORBIDDEN_PATH_CHANGED',
      `Tiltott path változott: ${forbiddenChanges.join(', ')}.`,
      task.projectPath,
    );
  }
  if (outsideScope.length > 0) {
    throw new DocumentationCommandError(
      'DOC_TASK_SCOPE_EXCEEDED',
      `A diff az allowed_paths scope-on kívüli fájlokat tartalmaz: ${outsideScope.join(', ')}.`,
      task.projectPath,
    );
  }

  const id = handoffId(task.id);
  const relative = `docs/40-delivery/handoffs/${id}.md`;
  const metadata: FrontmatterRecord = {
    schema_version: 1,
    id,
    title: `Handoff — ${task.title}`,
    aliases: [],
    scope: 'generated-project',
    kind: 'delivery',
    subtype: 'handoff',
    authority: 'evidence',
    document_status: 'proposed',
    implementation_status: 'implemented',
    verification_status: 'unverified',
    owner: task.owner,
    approvers: [],
    classification: task.classification,
    ai_access: 'allowed',
    context_priority: 'relevant',
    created: options.date,
    updated: options.date,
    last_verified: null,
    review_due: null,
    applies_to: changedFiles,
    depends_on: [task.id],
    supersedes: [],
    superseded_by: [],
    evidence: [],
    related_task: task.id,
    base_commit: baseCommit,
    result_commit: resultCommit,
    modified_paths: changedFiles,
    implementation_paths: implementationFiles,
    generated_paths: generatedFiles,
    delivery_status: 'ready_for_review',
    tags: ['delivery', 'handoff'],
  };
  const requiredChecks = stringArray(task.metadata, 'required_checks');
  const body = `# Handoff — ${task.title}\n\n## Result\n\nDescribe the implemented result.\n\n## Modified paths\n\n${implementationFiles.length ? implementationFiles.map((file) => `- \`${file}\``).join('\n') : '- No implementation diff was detected.'}\n\n## Generated documentation artifacts\n\n${generatedFiles.length ? generatedFiles.map((file) => `- \`${file}\``).join('\n') : '- None.'}\n\n## Implemented contract\n\n- Task: [${task.id}](../tasks/${task.id}.md)\n\n## Executed checks\n\n${requiredChecks.map((command) => `- [ ] \`${command}\` — record exit code and result`).join('\n') || '- None declared.'}\n\n## Checks not executed\n\n- None.\n\n## Open risks\n\n- TODO\n\n## Operational impact\n\n- Migration: none\n- Environment: none\n- Cache: none\n- Deployment: none\n\n## Documentation impact\n\n- TODO\n\n## Next step\n\n- Independent review.\n`;

  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  try {
    await writeFile(path.join(root, relative), renderMarkdownDocument(metadata, body), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new DocumentationCommandError('DOC_FILE_EXISTS', `A handoff már létezik: ${relative}.`, relative);
    }
    throw error;
  }

  return { id, file: relative, changedFiles, implementationFiles, generatedFiles };
}
