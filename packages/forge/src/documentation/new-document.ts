import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import { currentGitCommit } from './git';
import { assertDocumentationInventoryValid, buildDocumentationInventory } from './inventory';
import {
  documentTemplate,
  templateDefinition,
  type SupportedDocumentTemplate,
} from './templates';
import { DocumentationCommandError } from './types';

export const supportedDocumentTemplates = [
  'capability',
  'adr',
  'specification',
  'policy',
  'task',
  'handoff',
  'review',
  'evidence',
  'runbook',
  'release',
  'incident',
] as const satisfies readonly SupportedDocumentTemplate[];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function nextDocumentId(
  projectPrefix: string,
  type: SupportedDocumentTemplate,
  existingIds: readonly string[],
): string {
  const definition = templateDefinition(type);
  const pattern = new RegExp(`^${escapeRegex(projectPrefix)}-${definition.token}-(\\d{${definition.digits}})$`, 'u');
  let maximum = 0;
  for (const id of existingIds) {
    const match = pattern.exec(id);
    if (match?.[1]) maximum = Math.max(maximum, Number.parseInt(match[1], 10));
  }
  return `${projectPrefix}-${definition.token}-${String(maximum + 1).padStart(definition.digits, '0')}`;
}

export type NewDocumentOptions = Readonly<{
  type: SupportedDocumentTemplate;
  title: string;
  date: string;
  id?: string;
  baseCommit?: string;
}>;

export async function createDocumentationDocument(
  root: string,
  manifest: WinzardManifest,
  options: NewDocumentOptions,
): Promise<Readonly<{ id: string; file: string }>> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError(
      'DOCUMENTATION_MANIFEST_MISSING',
      'A docs:new használatához project-documentation capability és documentation manifest szükséges.',
    );
  }

  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  assertDocumentationInventoryValid(inventory, 'Az új dokumentum létrehozása');
  const definition = templateDefinition(options.type);
  const id = options.id ?? nextDocumentId(
    manifest.documentation.projectPrefix,
    options.type,
    inventory.documents.map(({ id: documentId }) => documentId),
  );
  const explicitPattern = new RegExp(
    `^${escapeRegex(manifest.documentation.projectPrefix)}-${definition.token}-\\d{${definition.digits}}$`,
    'u',
  );
  if (!explicitPattern.test(id)) {
    throw new DocumentationCommandError(
      'DOC_ID_INVALID',
      `A(z) ${options.type} dokumentum ID-ja ezt a formátumot kövesse: ${manifest.documentation.projectPrefix}-${definition.token}-${'0'.repeat(definition.digits)}.`,
    );
  }
  if (inventory.byId.has(id)) {
    throw new DocumentationCommandError('DOC_ID_DUPLICATE', `A dokumentumazonosító már használatban van: ${id}.`);
  }
  if (options.title.trim() === '') {
    throw new DocumentationCommandError('DOC_TITLE_MISSING', 'A dokumentum címe nem lehet üres.');
  }
  const relative = `${definition.directory}/${id}.md`;
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const baseCommit = options.type === 'task'
      ? options.baseCommit ?? await currentGitCommit(root)
      : null;
    if (options.type === 'task' && !baseCommit) {
      throw new DocumentationCommandError(
        'DOC_TASK_BASE_COMMIT_MISSING',
        'A task briefhez nem állapítható meg Git base commit. Add meg a --base-commit opciót.',
        relative,
      );
    }
    await writeFile(target, documentTemplate(
      options.type,
      id,
      options.title,
      options.date,
      baseCommit ? { base_commit: baseCommit } : {},
    ), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new DocumentationCommandError('DOC_FILE_EXISTS', `A dokumentum már létezik: ${relative}.`, relative);
    }
    throw error;
  }

  return { id, file: relative };
}
