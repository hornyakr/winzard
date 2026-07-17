import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { checkAiAdapters, generateAiAdapters } from '../src/documentation/adapters';
import { runDocumentationChecks } from '../src/documentation/checks';
import { buildContextPackage, checkContextPackage, expectedContextPackage } from '../src/documentation/context';
import { syncConsumerDocumentationPack } from '../src/documentation/consumer-pack';
import { parseMarkdownDocument, renderMarkdownDocument } from '../src/documentation/frontmatter';
import { createHandoff } from '../src/documentation/handoff';
import { initializeProjectDocumentation } from '../src/documentation/init';
import { createDocumentationDocument } from '../src/documentation/new-document';
import { generateDocumentationProjections } from '../src/documentation/projections';
import type { FrontmatterRecord } from '../src/documentation/types';
import { loadProjectManifest } from '../src/manifest';

const execFileAsync = promisify(execFile);
const today = '2026-07-17';

async function fixture(ai = true): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'winzard-docs-'));
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'atlas-app',
    private: true,
    type: 'module',
    winzard: {
      schemaVersion: 1,
      profile: 'minimal',
      capabilities: ['forge'],
    },
  }, null, 2)}\n`);
  await initializeProjectDocumentation(root, {
    projectPrefix: 'ATLAS',
    includeAiDelivery: ai,
    date: today,
  });
  return root;
}

async function manifest(root: string) {
  const result = await loadProjectManifest(root);
  if (!result.manifest) throw new Error(result.failures.map(({ message }) => message).join(' '));
  return result.manifest;
}

async function editMetadata(
  root: string,
  relative: string,
  update: (metadata: FrontmatterRecord) => FrontmatterRecord,
): Promise<void> {
  const filePath = path.join(root, relative);
  const parsed = parseMarkdownDocument(await readFile(filePath, 'utf8'), filePath, relative);
  await writeFile(filePath, renderMarkdownDocument(update({ ...parsed.metadata }), parsed.body));
}

async function editBody(root: string, relative: string, body: string): Promise<void> {
  const filePath = path.join(root, relative);
  const parsed = parseMarkdownDocument(await readFile(filePath, 'utf8'), filePath, relative);
  await writeFile(filePath, renderMarkdownDocument(parsed.metadata, body));
}

function completedTaskBody(title: string, negativeCase: string): string {
  return `# ${title}

## Outcome

The scoped implementation is complete.

## Non-goals

- No unrelated platform or security change.

## Context

The accepted task defines the executable delivery boundary.

## Contract

- Respect the accepted task metadata and path scope.

## Allowed changes

- Only the allowed_paths metadata entries.

## Forbidden changes

- All forbidden_paths metadata entries.

## Acceptance criteria

- [x] The implementation remains inside the accepted scope.

## Negative cases

- ${negativeCase}

## Required checks

- Run every required_checks command.

## Stop conditions

- Stop when the base commit or scope is no longer valid.

## Expected handoff

- A structured handoff with command results and remaining risks.
`;
}

async function createAcceptedSpecification(root: string, restricted = false): Promise<string> {
  const created = await createDocumentationDocument(root, await manifest(root), {
    type: 'specification',
    title: restricted ? 'Restricted integration contract' : 'Catalog filter contract',
    date: today,
  });
  await editMetadata(root, created.file, (metadata) => ({
    ...metadata,
    document_status: 'accepted',
    approvers: ['role:architecture-owner'],
    context_priority: 'required',
    classification: restricted ? 'restricted' : 'internal',
    ai_access: restricted ? 'restricted' : 'allowed',
  }));
  await editBody(root, created.file, `# ${restricted ? 'Restricted integration contract' : 'Catalog filter contract'}

## Summary

Defines the catalog filtering boundary.

## Contract

- Filters use explicit validated query fields.
- Unknown fields are rejected.

## Scope

- Catalog list queries.

## Constraints and prohibitions

- Persistence types are not exposed to clients.

## Correct examples

- A validated status filter.

## Incorrect examples

- Passing arbitrary ORM input.

## Security requirements

- Authorization remains in the application use case.

## Acceptance criteria

- [x] Positive and negative cases are testable.

## Evidence

- Pending independent verification.
`);
  return created.id;
}

async function createAcceptedTask(root: string, specificationId?: string): Promise<string> {
  const created = await createDocumentationDocument(root, await manifest(root), {
    type: 'task',
    title: 'Implement catalog filter',
    date: today,
    baseCommit: 'deadbeef',
  });
  await editMetadata(root, created.file, (metadata) => ({
    ...metadata,
    document_status: 'accepted',
    approvers: ['role:delivery-owner'],
    allowed_paths: ['src/modules/catalog/**', 'tests/catalog/**', 'docs/40-delivery/**'],
    forbidden_paths: ['docs/80-winzard/**', 'docs/90-generated/**'],
    related_specifications: specificationId ? [specificationId] : [],
  }));
  await editBody(root, created.file, completedTaskBody(
    'Implement catalog filter',
    'Unknown filter keys fail validation.',
  ));
  return created.id;
}

describe('project documentation capability', () => {
  it('inicializálja a Project Vaultot, a publikus consumer packot és az AI adaptereket', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);

    expect(projectManifest.capabilities).toEqual(expect.arrayContaining(['project-documentation', 'ai-delivery']));
    expect(projectManifest.documentation?.projectPrefix).toBe('ATLAS');
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Generated by Winzard Forge');
    expect(await readFile(path.join(root, 'docs/80-winzard/platform-contracts/WZ-CONTRACT-DOCUMENTATION-001.md'), 'utf8'))
      .toContain('Internal Winzard roadmap, tasks, handoffs, incidents and non-public ADRs must not be copied');

    const checked = await runDocumentationChecks(root, projectManifest);
    expect(checked.errors).toEqual([]);
  });

  it('nem telepít nem publikus vagy belső consumer contract forrást', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'winzard-consumer-source-'));
    await mkdir(path.join(sourceRoot, 'platform-contracts'), { recursive: true });
    await writeFile(
      path.join(sourceRoot, 'platform-contracts/WZ-INTERNAL-TASK-001.md'),
      `---
schema_version: 1
id: WZ-INTERNAL-TASK-001
title: Internal task
scope: winzard-consumer-contract
kind: contract
subtype: policy
authority: generated
document_status: accepted
implementation_status: not_applicable
verification_status: not_applicable
owner: role:winzard-maintainer
approvers: []
classification: internal
ai_access: allowed
context_priority: relevant
created: ${today}
updated: ${today}
---

# Internal task
`,
    );

    await expect(syncConsumerDocumentationPack(root, projectManifest, {
      sourceDirectory: sourceRoot,
    })).rejects.toMatchObject({ code: 'DOC_CONSUMER_SOURCE_INVALID' });
  });

  it('nem töröl kézi fájlt a consumer pack szinkronizálásakor', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    await writeFile(path.join(root, 'docs/80-winzard/manual.json'), '{"manual":true}\n');

    await expect(syncConsumerDocumentationPack(root, projectManifest)).rejects.toMatchObject({
      code: 'DOC_CONSUMER_PACK_MANUAL_CONTENT',
    });
  });

  it('elutasítja a dokumentumtípushoz nem illeszkedő explicit ID-t', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);

    await expect(createDocumentationDocument(root, projectManifest, {
      type: 'task',
      id: 'WZ-TASK-0001',
      title: 'Invalid ID',
      date: today,
      baseCommit: 'deadbeef',
    })).rejects.toMatchObject({ code: 'DOC_ID_INVALID' });
  });

  it('nem engedi a stabil projektprefix utólagos átnevezését', async () => {
    const root = await fixture();

    await expect(initializeProjectDocumentation(root, {
      projectPrefix: 'SHOP',
      includeAiDelivery: true,
      date: today,
      force: true,
    })).rejects.toMatchObject({ code: 'DOCUMENTATION_PROJECT_PREFIX_IMMUTABLE' });
  });

  it('nem fogad el feloldatlan placeholdert tartalmazó accepted dokumentumot', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    const created = await createDocumentationDocument(root, projectManifest, {
      type: 'specification',
      title: 'Incomplete contract',
      date: today,
    });
    await editMetadata(root, created.file, (metadata) => ({
      ...metadata,
      document_status: 'accepted',
      approvers: ['role:architecture-owner'],
    }));

    expect((await runDocumentationChecks(root, projectManifest)).errors).toContainEqual(
      expect.objectContaining({ code: 'DOC_PLACEHOLDER_UNRESOLVED', documentId: created.id }),
    );
  });

  it('nem enged projektlokális WZ- dokumentumot a consumer packen kívül', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    const source = await readFile(
      path.join(root, 'docs/80-winzard/platform-contracts/WZ-CONTRACT-DOCUMENTATION-001.md'),
      'utf8',
    );
    await writeFile(path.join(root, 'docs/30-architecture/WZ-CONTRACT-DOCUMENTATION-001.md'), source);

    expect((await runDocumentationChecks(root, projectManifest)).errors).toContainEqual(
      expect.objectContaining({ code: 'DOC_INTERNAL_PLATFORM_REFERENCE' }),
    );
  });

  it('elutasítja a repository gyökerén kívülre mutató relatív linket', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    const file = 'docs/10-product/ATLAS-VISION-001.md';
    await editBody(root, file, `# Product vision

## Summary

[Outside file](../../../../etc/passwd)
`);

    expect((await runDocumentationChecks(root, projectManifest, { includeGenerated: false })).errors).toContainEqual(
      expect.objectContaining({ code: 'DOC_LINK_OUTSIDE_PROJECT', file }),
    );
  });

  it('észleli a duplikált ID-t és a generált adapter driftet', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    const original = path.join(root, 'docs/10-product/ATLAS-VISION-001.md');
    await mkdir(path.join(root, 'docs/10-product/duplicate'), { recursive: true });
    await writeFile(path.join(root, 'docs/10-product/duplicate/ATLAS-VISION-001.md'), await readFile(original, 'utf8'));
    await writeFile(path.join(root, 'AGENTS.md'), `${await readFile(path.join(root, 'AGENTS.md'), 'utf8')}manual drift\n`);

    const checked = await runDocumentationChecks(root, projectManifest);
    expect(checked.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['DOC_ID_DUPLICATE', 'DOC_GENERATED_DRIFT']),
    );
  });

  it('determinista, hash-elt context package-et állít elő elfogadott taskból', async () => {
    const root = await fixture();
    const specificationId = await createAcceptedSpecification(root);
    const taskId = await createAcceptedTask(root, specificationId);
    const projectManifest = await manifest(root);
    await generateDocumentationProjections(root, projectManifest);
    await generateAiAdapters(root, projectManifest);

    const first = await expectedContextPackage(root, projectManifest, { taskId, enforceBaseCommit: false });
    const second = await expectedContextPackage(root, projectManifest, { taskId, enforceBaseCommit: false });
    expect(first.markdown).toBe(second.markdown);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.sourceDocuments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: taskId, reason: 'task' }),
      expect.objectContaining({ id: specificationId, reason: 'related' }),
      expect.objectContaining({ id: 'WZ-CONTRACT-DOCUMENTATION-001', reason: 'required' }),
    ]));

    await buildContextPackage(root, projectManifest, { taskId, enforceBaseCommit: false });
    expect(await checkContextPackage(root, projectManifest, { taskId, enforceBaseCommit: false })).toEqual([]);
    expect((await runDocumentationChecks(root, projectManifest)).errors).toEqual([]);
  });

  it('nem ad AI-kontextusba denied task briefet', async () => {
    const root = await fixture();
    const taskId = await createAcceptedTask(root);
    const projectManifest = await manifest(root);
    const task = projectManifest.documentation
      ? `docs/40-delivery/tasks/${taskId}.md`
      : '';
    await editMetadata(root, task, (metadata) => ({
      ...metadata,
      ai_access: 'denied',
      context_priority: 'never',
    }));

    await expect(expectedContextPackage(root, projectManifest, {
      taskId,
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_AI_ACCESS_DENIED' });
  });

  it('fail-closed módon elutasítja a nem ellenőrizhető Git base commitot', async () => {
    const root = await fixture();
    const taskId = await createAcceptedTask(root);
    const projectManifest = await manifest(root);

    await expect(expectedContextPackage(root, projectManifest, { taskId })).rejects.toMatchObject({
      code: 'DOC_TASK_BASE_COMMIT_UNVERIFIABLE',
    });
  });

  it('nem hagy el csendben restricted required contractot', async () => {
    const root = await fixture();
    const specificationId = await createAcceptedSpecification(root, true);
    const taskId = await createAcceptedTask(root);
    const projectManifest = await manifest(root);

    await expect(expectedContextPackage(root, projectManifest, {
      taskId,
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_AI_ACCESS_DENIED', file: expect.stringContaining(specificationId) });
  });

  it('fail-closed módon kizárja a restricted contractot explicit taskengedély nélkül', async () => {
    const root = await fixture();
    const specificationId = await createAcceptedSpecification(root, true);
    const taskId = await createAcceptedTask(root, specificationId);
    const projectManifest = await manifest(root);

    await expect(expectedContextPackage(root, projectManifest, { taskId, enforceBaseCommit: false })).rejects.toMatchObject({
      code: 'DOC_AI_ACCESS_DENIED',
    });
    await expect(expectedContextPackage(root, projectManifest, {
      taskId,
      allowRestricted: [specificationId],
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_AI_ACCESS_DENIED' });

    await editMetadata(root, `docs/40-delivery/tasks/${taskId}.md`, (metadata) => ({
      ...metadata,
      allowed_context_documents: [specificationId],
    }));
    await expect(expectedContextPackage(root, projectManifest, {
      taskId,
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_AI_ACCESS_DENIED' });
    await expect(expectedContextPackage(root, projectManifest, {
      taskId,
      allowRestricted: [specificationId],
      enforceBaseCommit: false,
    })).resolves.toMatchObject({ markdownPath: `docs/90-generated/ai-context/${taskId}.md` });
  });

  it('a teljes renderelt context package-re érvényesíti a byte budgetet', async () => {
    const root = await fixture();
    const specificationId = await createAcceptedSpecification(root);
    const taskId = await createAcceptedTask(root, specificationId);
    const projectManifest = await manifest(root);
    const specification = `docs/30-architecture/specifications/${specificationId}.md`;
    const parsed = parseMarkdownDocument(
      await readFile(path.join(root, specification), 'utf8'),
      path.join(root, specification),
      specification,
    );
    await writeFile(
      path.join(root, specification),
      renderMarkdownDocument(parsed.metadata, `${parsed.body}

## Large fixture

${'x'.repeat(20_000)}
`),
    );
    const constrainedManifest = {
      ...projectManifest,
      documentation: projectManifest.documentation
        ? { ...projectManifest.documentation, contextBudgetBytes: 16_384 }
        : null,
    };

    await expect(expectedContextPackage(root, constrainedManifest, {
      taskId,
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_CONTEXT_BUDGET_EXCEEDED' });
  });

  it('nem ír felül kézzel karbantartott projekciót vagy context fájlt', async () => {
    const root = await fixture();
    const specificationId = await createAcceptedSpecification(root);
    const taskId = await createAcceptedTask(root, specificationId);
    const projectManifest = await manifest(root);
    const projection = path.join(root, 'docs/90-generated/indexes/documentation-index.md');
    await writeFile(projection, '# Manual index\n');
    await expect(generateDocumentationProjections(root, projectManifest)).rejects.toMatchObject({
      code: 'DOC_PROJECTION_MANUAL_CONTENT',
    });

    await writeFile(
      path.join(root, `docs/90-generated/ai-context/${taskId}.md`),
      '# Manual context\n',
    );
    await expect(buildContextPackage(root, projectManifest, {
      taskId,
      enforceBaseCommit: false,
    })).rejects.toMatchObject({ code: 'DOC_CONTEXT_MANUAL_CONTENT' });
  });

  it('észleli az AI adapter driftet és determinisztikusan visszaállítja az adaptereket', async () => {
    const root = await fixture();
    const projectManifest = await manifest(root);
    await writeFile(path.join(root, 'CLAUDE.md'), 'manual content\n');

    expect(await checkAiAdapters(root, projectManifest)).toContainEqual(
      expect.objectContaining({ code: 'DOC_GENERATED_DRIFT', file: 'CLAUDE.md' }),
    );
    await expect(generateAiAdapters(root, projectManifest)).rejects.toMatchObject({
      code: 'DOC_ADAPTER_MANUAL_CONTENT',
    });
  });
});

describe('task and handoff scope', () => {
  it('a Git diffet az accepted task allowed és forbidden pathjaihoz köti', async () => {
    const root = await fixture(false);
    await mkdir(path.join(root, 'src/modules/catalog'), { recursive: true });
    await mkdir(path.join(root, 'tests/catalog'), { recursive: true });
    await writeFile(path.join(root, 'src/modules/catalog/query.ts'), 'export const value = 1;\n');
    await writeFile(path.join(root, 'tests/catalog/query.test.ts'), 'export {};\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Winzard Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    const baseCommit = stdout.trim();

    const created = await createDocumentationDocument(root, await manifest(root), {
      type: 'task',
      title: 'Implement catalog query',
      date: today,
      baseCommit,
    });
    await editMetadata(root, created.file, (metadata) => ({
      ...metadata,
      document_status: 'accepted',
      approvers: ['role:delivery-owner'],
      allowed_paths: ['src/modules/catalog/**', 'tests/catalog/**', 'docs/40-delivery/**'],
      forbidden_paths: ['src/platform/auth/**'],
    }));
    await editBody(root, created.file, completedTaskBody(
      'Implement catalog query',
      'A change outside the catalog module or its tests is rejected.',
    ));
    await generateDocumentationProjections(root, await manifest(root));
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'task'], { cwd: root });
    await writeFile(path.join(root, 'src/modules/catalog/query.ts'), 'export const value = 2;\n');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'implementation'], { cwd: root });
    const result = await createHandoff(root, await manifest(root), { taskId: created.id, date: today });

    expect(result.changedFiles).toContain('src/modules/catalog/query.ts');
    expect(await readFile(path.join(root, result.file), 'utf8')).toContain('ready_for_review');
  });

  it('a forbidden pathból történő átnevezést is tiltott változásként kezeli', async () => {
    const root = await fixture(false);
    await mkdir(path.join(root, 'src/platform/auth'), { recursive: true });
    await mkdir(path.join(root, 'src/modules/catalog'), { recursive: true });
    await writeFile(path.join(root, 'src/platform/auth/session.ts'), 'export const session = true;\n');
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Winzard Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    const created = await createDocumentationDocument(root, await manifest(root), {
      type: 'task',
      title: 'Move session code',
      date: today,
      baseCommit: stdout.trim(),
    });
    await editMetadata(root, created.file, (metadata) => ({
      ...metadata,
      document_status: 'accepted',
      approvers: ['role:security-owner'],
      allowed_paths: ['src/modules/catalog/**', 'docs/40-delivery/**'],
      forbidden_paths: ['src/platform/auth/**'],
    }));
    await editBody(root, created.file, `# Move session code

## Outcome

The scoped code move is implemented.

## Non-goals

- No auth contract change.

## Context

A refactor was requested.

## Contract

- Respect the path scope.

## Allowed changes

- Only the allowed_paths metadata entries.

## Forbidden changes

- All forbidden_paths metadata entries.

## Acceptance criteria

- [x] The diff remains inside scope.

## Negative cases

- Renaming from a forbidden path is rejected.

## Required checks

- Run every required_checks command.

## Stop conditions

- Stop when the base commit or scope is no longer valid.

## Expected handoff

- A structured handoff.
`);
    await generateDocumentationProjections(root, await manifest(root));
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'task'], { cwd: root });
    await execFileAsync('git', [
      'mv',
      'src/platform/auth/session.ts',
      'src/modules/catalog/session.ts',
    ], { cwd: root });
    await execFileAsync('git', ['commit', '-am', 'rename forbidden file'], { cwd: root });

    await expect(createHandoff(root, await manifest(root), {
      taskId: created.id,
      date: today,
    })).rejects.toMatchObject({ code: 'DOC_TASK_FORBIDDEN_PATH_CHANGED' });
  });

  it('megáll, ha a diff forbidden pathot érint', async () => {
    const root = await fixture(false);
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Winzard Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    const created = await createDocumentationDocument(root, await manifest(root), {
      type: 'task',
      title: 'Protected auth boundary',
      date: today,
      baseCommit: stdout.trim(),
    });
    await editMetadata(root, created.file, (metadata) => ({
      ...metadata,
      document_status: 'accepted',
      approvers: ['role:security-owner'],
      allowed_paths: ['src/modules/catalog/**', 'docs/40-delivery/**'],
      forbidden_paths: ['src/platform/auth/**'],
    }));
    await editBody(root, created.file, completedTaskBody(
      'Protected auth boundary',
      'Any change under src/platform/auth is rejected.',
    ));
    await generateDocumentationProjections(root, await manifest(root));
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'task'], { cwd: root });
    await mkdir(path.join(root, 'src/platform/auth'), { recursive: true });
    await writeFile(path.join(root, 'src/platform/auth/session.ts'), 'export const session = true;\n');
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'forbidden change'], { cwd: root });

    await expect(createHandoff(root, await manifest(root), {
      taskId: created.id,
      date: today,
    })).rejects.toMatchObject({ code: 'DOC_TASK_FORBIDDEN_PATH_CHANGED' });
  });
});
