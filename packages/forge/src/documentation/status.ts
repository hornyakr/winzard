import type { WinzardManifest } from '../manifest';
import { runDocumentationChecks } from './checks';
import type { DocumentationStatus } from './types';

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export async function documentationStatus(
  root: string,
  manifest: WinzardManifest,
  today?: string,
): Promise<DocumentationStatus> {
  const result = await runDocumentationChecks(root, manifest, { today });
  const byKind: Record<string, number> = {};
  const byDocumentStatus: Record<string, number> = {};
  const byImplementationStatus: Record<string, number> = {};
  const byVerificationStatus: Record<string, number> = {};
  let generated = 0;

  for (const document of result.inventory.documents) {
    increment(byKind, document.kind);
    increment(byDocumentStatus, document.documentStatus);
    increment(byImplementationStatus, document.implementationStatus);
    increment(byVerificationStatus, document.verificationStatus);
    if (document.authority === 'generated') generated += 1;
  }

  return {
    total: result.inventory.documents.length,
    canonical: result.inventory.documents.length - generated,
    generated,
    byKind,
    byDocumentStatus,
    byImplementationStatus,
    byVerificationStatus,
    errors: result.errors.length,
    warnings: result.warnings.length,
    overdueReviews: result.warnings.filter(({ code }) => code === 'DOC_REVIEW_OVERDUE').length,
  };
}
