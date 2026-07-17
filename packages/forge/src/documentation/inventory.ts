import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { parseMarkdownDocument } from './frontmatter';
import { normalizeCanonicalDocument } from './schema';
import type {
  CanonicalDocument,
  DocumentationInventory,
  DocumentationIssue,
} from './types';
import { DocumentationCommandError } from './types';

const SKIPPED_DIRECTORIES = new Set(['.git', '.obsidian', '_assets', '_templates', '_system', '90-generated']);

function projectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

async function collectMarkdownFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files.sort();
}

function parseIssue(error: unknown, file: string): DocumentationIssue {
  if (error instanceof DocumentationCommandError) {
    return { code: error.code, severity: 'error', file, message: error.message };
  }
  return {
    code: 'DOC_PARSE_FAILED',
    severity: 'error',
    file,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function buildDocumentationInventory(
  root: string,
  projectPrefix: string,
): Promise<DocumentationInventory> {
  const documentationRoot = path.join(root, 'docs');
  const documents: CanonicalDocument[] = [];
  const issues: DocumentationIssue[] = [];

  for (const filePath of await collectMarkdownFiles(documentationRoot)) {
    const relative = projectPath(root, filePath);
    if (relative.startsWith('docs/80-winzard/manifest/')) continue;
    try {
      const parsed = parseMarkdownDocument(await readFile(filePath, 'utf8'), filePath, relative);
      const normalized = normalizeCanonicalDocument(parsed, projectPrefix);
      issues.push(...normalized.issues);
      if (normalized.document) documents.push(normalized.document);
    } catch (error) {
      issues.push(parseIssue(error, relative));
    }
  }

  const byId = new Map<string, CanonicalDocument>();
  for (const document of documents) {
    const previous = byId.get(document.id);
    if (previous) {
      issues.push({
        code: 'DOC_ID_DUPLICATE',
        severity: 'error',
        file: document.projectPath,
        documentId: document.id,
        message: `A dokumentumazonosító már használatban van: ${previous.projectPath}.`,
      });
      continue;
    }
    byId.set(document.id, document);
  }

  return {
    root,
    documentationRoot,
    projectPrefix,
    documents: Object.freeze([...documents].sort((left, right) => left.id.localeCompare(right.id))),
    byId,
    issues: Object.freeze(issues),
  };
}


export function assertDocumentationInventoryValid(
  inventory: DocumentationInventory,
  operation: string,
): void {
  const firstError = inventory.issues.find(({ severity }) => severity === 'error');
  if (!firstError) return;
  throw new DocumentationCommandError(
    firstError.code,
    `${operation} nem folytatható érvénytelen dokumentációs vaulttal: ${firstError.message}`,
    firstError.file,
  );
}
