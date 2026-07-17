import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import { contentMatches, GENERATED_HEADER, readOptional, sha256, writeJsonFile, writeTextFile } from './generated';
import { buildDocumentationInventory } from './inventory';
import { optionalString, stringArray } from './schema';
import type { CanonicalDocument, DocumentationIssue } from './types';
import { DocumentationCommandError } from './types';

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map((value) => value.replaceAll('|', '\\|')).join(' | ')} |`);
  return [header, separator, ...body].join('\n');
}

function documentLink(document: CanonicalDocument): string {
  const fromGenerated = path.posix.relative('docs/90-generated/indexes', document.projectPath);
  return `[${document.id}](${fromGenerated})`;
}

function sourceList(documents: readonly CanonicalDocument[]): string {
  return documents.map((document) => `- ${document.id}: \`${sha256(document.source)}\``).join('\n') || '- None.';
}

function generatedDocument(title: string, body: string, sources: readonly CanonicalDocument[]): string {
  return `${GENERATED_HEADER}\n\n# ${title}\n\n${body.trim()}\n\n## Source hashes\n\n${sourceList(sources)}\n`;
}

function countBy(documents: readonly CanonicalDocument[], selector: (document: CanonicalDocument) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const document of documents) {
    const key = selector(document);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function related(document: CanonicalDocument, field: string): string {
  return stringArray(document.metadata, field).join(', ') || '—';
}

export async function expectedDocumentationProjections(
  root: string,
  manifest: WinzardManifest,
): Promise<ReadonlyMap<string, string>> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError('DOCUMENTATION_MANIFEST_MISSING', 'A dokumentációs projekciókhoz documentation manifest szükséges.');
  }

  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  const documents = inventory.documents.filter((document) => document.authority !== 'generated');
  const output = new Map<string, string>();

  const indexRows = documents.map((document) => [
    documentLink(document),
    document.title,
    `${document.kind}/${document.subtype}`,
    document.documentStatus,
    document.implementationStatus,
    document.verificationStatus,
    document.owner,
  ]);
  output.set(
    'docs/90-generated/indexes/documentation-index.md',
    generatedDocument(
      'Documentation index',
      markdownTable(
        ['ID', 'Title', 'Kind', 'Document', 'Implementation', 'Verification', 'Owner'],
        indexRows,
      ),
      documents,
    ),
  );

  const deliveryDocuments = documents.filter((document) =>
    document.kind === 'product' ||
    document.kind === 'decision' ||
    document.kind === 'contract' ||
    document.kind === 'delivery' ||
    document.kind === 'evidence' ||
    document.subtype === 'release');
  output.set(
    'docs/90-generated/traceability/delivery-traceability.md',
    generatedDocument(
      'Delivery traceability',
      markdownTable(
        ['ID', 'Subtype', 'Capabilities', 'Decisions', 'Specifications', 'Task', 'Evidence'],
        deliveryDocuments.map((document) => [
          document.id,
          document.subtype,
          related(document, 'related_capabilities'),
          related(document, 'related_decisions'),
          related(document, 'related_specifications'),
          related(document, 'related_task'),
          related(document, 'evidence'),
        ]),
      ),
      deliveryDocuments,
    ),
  );

  const statusPayload = {
    total: documents.length,
    byKind: countBy(documents, ({ kind }) => kind),
    byDocumentStatus: countBy(documents, ({ documentStatus }) => documentStatus),
    byImplementationStatus: countBy(documents, ({ implementationStatus }) => implementationStatus),
    byVerificationStatus: countBy(documents, ({ verificationStatus }) => verificationStatus),
  };
  output.set(
    'docs/90-generated/status/documentation-status.md',
    generatedDocument(
      'Documentation status',
      `\`\`\`json\n${JSON.stringify(statusPayload, null, 2)}\n\`\`\``,
      documents,
    ),
  );

  const stale = documents.filter((document) =>
    document.verificationStatus === 'stale' || optionalString(document.metadata, 'review_due') !== null);
  output.set(
    'docs/90-generated/status/stale-documents.md',
    generatedDocument(
      'Documents requiring review',
      stale.length === 0
        ? 'No document declares a stale verification state or review deadline.'
        : markdownTable(
          ['ID', 'Verification', 'Review due', 'Owner'],
          stale.map((document) => [
            document.id,
            document.verificationStatus,
            optionalString(document.metadata, 'review_due') ?? '—',
            document.owner,
          ]),
        ),
      stale,
    ),
  );

  const missingEvidence = documents.filter((document) =>
    document.implementationStatus === 'implemented' &&
    document.verificationStatus !== 'verified' &&
    document.verificationStatus !== 'not_applicable');
  output.set(
    'docs/90-generated/status/missing-evidence.md',
    generatedDocument(
      'Implemented contracts without current verification',
      missingEvidence.length === 0
        ? 'Every implemented contract is verified or explicitly not applicable.'
        : markdownTable(
          ['ID', 'Verification', 'Evidence'],
          missingEvidence.map((document) => [
            document.id,
            document.verificationStatus,
            related(document, 'evidence'),
          ]),
        ),
      missingEvidence,
    ),
  );

  return output;
}

async function assertProjectionTarget(filePath: string, projectPath: string): Promise<void> {
  const existing = await readOptional(filePath);
  if (existing !== null && !existing.includes('Generated by Winzard Forge.')) {
    throw new DocumentationCommandError(
      'DOC_PROJECTION_MANUAL_CONTENT',
      `A generátor nem ír felül kézzel karbantartott projekciót: ${projectPath}.`,
      projectPath,
    );
  }
}

export async function generateDocumentationProjections(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly string[]> {
  const expected = await expectedDocumentationProjections(root, manifest);
  const written: string[] = [];
  for (const [relative, content] of expected) {
    await assertProjectionTarget(path.join(root, relative), relative);
    await writeTextFile(path.join(root, relative), content);
    written.push(relative);
  }
  await writeJsonFile(path.join(root, 'docs/_system/projection-state.json'), {
    schemaVersion: 1,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  });
  return written;
}

async function projectionFiles(root: string): Promise<readonly string[]> {
  const directories = [
    'docs/90-generated/indexes',
    'docs/90-generated/traceability',
    'docs/90-generated/status',
  ];
  const files: string[] = [];
  for (const relative of directories) {
    try {
      for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
        if (entry.isFile()) files.push(`${relative}/${entry.name}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files.sort();
}

export async function checkDocumentationProjections(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly DocumentationIssue[]> {
  const expected = await expectedDocumentationProjections(root, manifest);
  const issues: DocumentationIssue[] = [];
  const expectedNames = new Set(expected.keys());
  for (const [relative, content] of expected) {
    if (!(await contentMatches(path.join(root, relative), content))) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: relative,
        message: 'A dokumentációs projekció hiányzik vagy eltér a kanonikus forrásoktól.',
      });
    }
  }
  for (const relative of await projectionFiles(root)) {
    if (!expectedNames.has(relative)) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: relative,
        message: 'Elavult vagy ismeretlen fájl található a dokumentációs projekciók között.',
      });
    }
  }
  const state = `${JSON.stringify({
    schemaVersion: 1,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  }, null, 2)}
`;
  if (!(await contentMatches(path.join(root, 'docs/_system/projection-state.json'), state))) {
    issues.push({
      code: 'DOC_GENERATED_DRIFT',
      severity: 'error',
      file: 'docs/_system/projection-state.json',
      message: 'A dokumentációs projekció state fájlja hiányzik vagy elavult.',
    });
  }
  return issues;
}
