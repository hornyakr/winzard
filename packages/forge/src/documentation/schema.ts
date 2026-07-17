import path from 'node:path';

import type {
  CanonicalDocument,
  DocumentationIssue,
  FrontmatterRecord,
  FrontmatterValue,
  ParsedMarkdownDocument,
} from './types';

export const DOCUMENTATION_CONTRACT_VERSION = 1 as const;
export const FORGE_DOCUMENTATION_GENERATOR_VERSION = '0.1.0';
export const DEFAULT_CONTEXT_BUDGET_BYTES = 256 * 1024;

export const documentStatuses = ['draft', 'proposed', 'accepted', 'superseded', 'deprecated', 'archived'] as const;
export const implementationStatuses = ['not_started', 'in_progress', 'partial', 'implemented', 'not_applicable'] as const;
export const verificationStatuses = ['unverified', 'verified', 'failed', 'stale', 'not_applicable'] as const;
export const authorities = ['normative', 'informative', 'evidence', 'generated'] as const;
export const classifications = ['public', 'internal', 'confidential', 'restricted'] as const;
export const aiAccessValues = ['allowed', 'restricted', 'denied'] as const;
export const contextPriorities = ['required', 'relevant', 'optional', 'never'] as const;
export const scopes = ['generated-project', 'winzard-consumer-contract'] as const;

export const subtypeKinds = Object.freeze({
  vision: 'product',
  capability: 'product',
  roadmap: 'product',
  'stakeholder-map': 'product',
  adr: 'decision',
  waiver: 'decision',
  specification: 'contract',
  policy: 'contract',
  'api-contract': 'contract',
  'data-contract': 'contract',
  'security-contract': 'contract',
  initiative: 'delivery',
  'task-brief': 'delivery',
  handoff: 'delivery',
  review: 'delivery',
  'test-result': 'evidence',
  'build-result': 'evidence',
  measurement: 'evidence',
  'migration-evidence': 'evidence',
  'release-evidence': 'evidence',
  runbook: 'operation',
  release: 'operation',
  incident: 'operation',
  postmortem: 'operation',
  tutorial: 'guidance',
  'how-to': 'guidance',
  reference: 'guidance',
  explanation: 'guidance',
} as const);

export type DocumentSubtype = keyof typeof subtypeKinds;
export type DocumentKind = (typeof subtypeKinds)[DocumentSubtype];

export const relationFields = [
  'depends_on',
  'supersedes',
  'superseded_by',
  'evidence',
  'related_capabilities',
  'related_decisions',
  'related_specifications',
  'related_task',
  'related_release',
  'allowed_context_documents',
] as const;

const commonRequiredFields = [
  'schema_version',
  'id',
  'title',
  'scope',
  'kind',
  'subtype',
  'authority',
  'document_status',
  'implementation_status',
  'verification_status',
  'owner',
  'classification',
  'ai_access',
  'context_priority',
  'created',
  'updated',
] as const;

const taskRequiredFields = [
  'base_commit',
  'allowed_paths',
  'forbidden_paths',
  'required_checks',
  'risk',
  'human_approval',
] as const;

const requiredTaskHeadings = [
  'Outcome',
  'Non-goals',
  'Context',
  'Contract',
  'Allowed changes',
  'Forbidden changes',
  'Acceptance criteria',
  'Negative cases',
  'Required checks',
  'Stop conditions',
  'Expected handoff',
] as const;

function stringValue(metadata: FrontmatterRecord, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function stringArray(metadata: FrontmatterRecord, key: string): readonly string[] {
  const value = metadata[key];
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

export function optionalString(metadata: FrontmatterRecord, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function hasMetadataValue(metadata: FrontmatterRecord, key: string): boolean {
  const value = metadata[key];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function dateValue(value: FrontmatterValue | undefined): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function stringListValue(value: FrontmatterValue | undefined): boolean {
  return Array.isArray(value) && value.every((item) =>
    typeof item === 'string' && item.trim() !== '');
}

const listMetadataFields = [
  'aliases',
  'approvers',
  'applies_to',
  'depends_on',
  'supersedes',
  'superseded_by',
  'evidence',
  'tags',
  'related_capabilities',
  'related_decisions',
  'related_specifications',
  'allowed_context_documents',
  'approval_refs',
  'allowed_paths',
  'forbidden_paths',
  'required_checks',
  'allowed_tools',
  'denied_tools',
  'modified_paths',
  'implementation_paths',
  'generated_paths',
] as const;

function issue(
  code: string,
  file: string,
  message: string,
  documentId?: string,
  severity: 'error' | 'warning' = 'error',
): DocumentationIssue {
  return { code, severity, file, message, ...(documentId ? { documentId } : {}) };
}

function enumIssue(
  metadata: FrontmatterRecord,
  key: string,
  allowed: readonly string[],
  file: string,
  documentId: string,
): DocumentationIssue | null {
  const value = stringValue(metadata, key);
  return allowed.includes(value)
    ? null
    : issue('DOC_SCHEMA_INVALID', file, `${key} érvénytelen. Engedélyezett értékek: ${allowed.join(', ')}.`, documentId);
}

function headings(body: string): ReadonlySet<string> {
  return new Set(
    body
      .replaceAll('\r\n', '\n')
      .split('\n')
      .map((line) => /^##\s+(.+?)\s*$/u.exec(line)?.[1]?.trim())
      .filter((value): value is string => value !== undefined),
  );
}

function expectedFileName(documentId: string): string {
  return `${documentId}.md`;
}

function validateIdentifier(documentId: string, projectPrefix: string): boolean {
  if (documentId.startsWith('WZ-')) return true;
  const escaped = projectPrefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^${escaped}-[A-Z][A-Z0-9-]{1,30}-\\d{3,4}$`, 'u').test(documentId);
}

function relationships(metadata: FrontmatterRecord): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, readonly string[]> = {};
  for (const field of relationFields) {
    result[field] = stringArray(metadata, field);
  }
  return Object.freeze(result);
}

export function normalizeCanonicalDocument(
  parsed: ParsedMarkdownDocument,
  projectPrefix: string,
): Readonly<{ document: CanonicalDocument | null; issues: readonly DocumentationIssue[] }> {
  const metadata = parsed.metadata;
  const id = stringValue(metadata, 'id');
  const file = parsed.projectPath;
  const issues: DocumentationIssue[] = [];

  for (const field of commonRequiredFields) {
    if (!hasMetadataValue(metadata, field)) {
      issues.push(issue('DOC_SCHEMA_INVALID', file, `Kötelező metadata hiányzik: ${field}.`, id || undefined));
    }
  }

  if (metadata.schema_version !== DOCUMENTATION_CONTRACT_VERSION) {
    issues.push(issue('DOC_SCHEMA_INVALID', file, `Csak a ${DOCUMENTATION_CONTRACT_VERSION}-es dokumentációs schema támogatott.`, id || undefined));
  }

  for (const field of listMetadataFields) {
    if (Object.hasOwn(metadata, field) && !stringListValue(metadata[field])) {
      issues.push(issue(
        'DOC_SCHEMA_INVALID',
        file,
        `${field} stringekből álló YAML lista legyen.`,
        id || undefined,
      ));
    }
  }

  const subtype = stringValue(metadata, 'subtype');
  const expectedKind = subtypeKinds[subtype as DocumentSubtype];
  if (!expectedKind) {
    issues.push(issue('DOC_SCHEMA_INVALID', file, `Ismeretlen dokumentum subtype: ${subtype || '<üres>'}.`, id || undefined));
  } else if (stringValue(metadata, 'kind') !== expectedKind) {
    issues.push(issue('DOC_SCHEMA_INVALID', file, `A(z) ${subtype} subtype kind értéke ${expectedKind} legyen.`, id || undefined));
  }

  for (const candidate of [
    enumIssue(metadata, 'document_status', documentStatuses, file, id),
    enumIssue(metadata, 'implementation_status', implementationStatuses, file, id),
    enumIssue(metadata, 'verification_status', verificationStatuses, file, id),
    enumIssue(metadata, 'authority', authorities, file, id),
    enumIssue(metadata, 'classification', classifications, file, id),
    enumIssue(metadata, 'ai_access', aiAccessValues, file, id),
    enumIssue(metadata, 'context_priority', contextPriorities, file, id),
    enumIssue(metadata, 'scope', scopes, file, id),
  ]) {
    if (candidate) issues.push(candidate);
  }

  if (!validateIdentifier(id, projectPrefix)) {
    issues.push(issue('DOC_ID_INVALID', file, `Az ID nem felel meg a(z) ${projectPrefix} projektprefixnek: ${id || '<üres>'}.`, id || undefined));
  }

  if (id && path.basename(file) !== expectedFileName(id)) {
    issues.push(issue('DOC_ID_FILENAME_MISMATCH', file, `A fájlnév legyen ${expectedFileName(id)}.`, id));
  }

  const inConsumerPack = file.startsWith('docs/80-winzard/');
  const scope = stringValue(metadata, 'scope');
  if (inConsumerPack && scope !== 'winzard-consumer-contract') {
    issues.push(issue(
      'DOC_SCOPE_INVALID',
      file,
      'A docs/80-winzard alatt kizárólag winzard-consumer-contract scope használható.',
      id || undefined,
    ));
  }
  if (!inConsumerPack && scope === 'winzard-consumer-contract') {
    issues.push(issue(
      'DOC_SCOPE_INVALID',
      file,
      'Winzard consumer contract kizárólag a generált docs/80-winzard könyvtárban lehet.',
      id || undefined,
    ));
  }
  if (id.startsWith('WZ-') && !inConsumerPack) {
    issues.push(issue(
      'DOC_INTERNAL_PLATFORM_REFERENCE',
      file,
      'Projektlokális dokumentum nem használhat WZ- azonosítót a consumer packen kívül.',
      id,
    ));
  }
  if (!id.startsWith('WZ-') && inConsumerPack) {
    issues.push(issue(
      'DOC_SCOPE_INVALID',
      file,
      'A consumer pack kanonikus dokumentumainak WZ- azonosítót kell használniuk.',
      id || undefined,
    ));
  }

  for (const field of ['created', 'updated']) {
    if (!dateValue(metadata[field])) {
      issues.push(issue('DOC_SCHEMA_INVALID', file, `${field} YYYY-MM-DD formátumú dátum legyen.`, id || undefined));
    }
  }
  for (const field of ['last_verified', 'review_due']) {
    const value = metadata[field];
    if (value !== undefined && value !== null && value !== '' && !dateValue(value)) {
      issues.push(issue('DOC_SCHEMA_INVALID', file, `${field} üres vagy YYYY-MM-DD formátumú dátum legyen.`, id || undefined));
    }
  }

  const documentStatus = stringValue(metadata, 'document_status');
  if (documentStatus === 'accepted' && /\bTODO\b|REPLACE_WITH_[A-Z0-9_]+/u.test(parsed.body)) {
    issues.push(issue(
      'DOC_PLACEHOLDER_UNRESOLVED',
      file,
      'Accepted dokumentum nem tartalmazhat feloldatlan TODO vagy REPLACE_WITH placeholdert.',
      id || undefined,
    ));
  }
  const authority = stringValue(metadata, 'authority');
  const approvers = stringArray(metadata, 'approvers');
  if (documentStatus === 'accepted' && authority === 'normative' && approvers.length === 0) {
    issues.push(issue('DOC_APPROVER_MISSING', file, 'Elfogadott normatív dokumentumnak legalább egy approvere legyen.', id));
  }

  const verificationStatus = stringValue(metadata, 'verification_status');
  if (verificationStatus === 'verified' && stringArray(metadata, 'evidence').length === 0) {
    issues.push(issue('DOC_EVIDENCE_MISSING', file, 'Verified dokumentumnak evidence-hivatkozással kell rendelkeznie.', id));
  }

  if (documentStatus === 'superseded' && stringArray(metadata, 'superseded_by').length === 0) {
    issues.push(issue('DOC_SUPERSESSION_INVALID', file, 'Superseded dokumentumnak superseded_by hivatkozást kell megadnia.', id));
  }

  const aiAccess = stringValue(metadata, 'ai_access');
  const contextPriority = stringValue(metadata, 'context_priority');
  if (aiAccess === 'denied' && contextPriority !== 'never') {
    issues.push(issue('DOC_AI_ACCESS_DENIED', file, 'ai_access: denied mellett context_priority: never szükséges.', id));
  }

  for (const field of ['applies_to', 'allowed_paths', 'forbidden_paths'] as const) {
    for (const pattern of stringArray(metadata, field)) {
      if (
        pattern.startsWith('/') ||
        pattern.includes('\\') ||
        pattern.split('/').includes('..') ||
        pattern.includes('\0')
      ) {
        issues.push(issue(
          'DOC_PATH_PATTERN_INVALID',
          file,
          `${field} csak repository-relatív POSIX globot tartalmazhat: ${pattern}.`,
          id || undefined,
        ));
      }
    }
  }

  if (subtype === 'task-brief') {
    for (const field of taskRequiredFields) {
      if (!Object.hasOwn(metadata, field)) {
        issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, `A task brief kötelező mezője hiányzik: ${field}.`, id));
      }
    }
    if (documentStatus === 'accepted' && stringArray(metadata, 'allowed_paths').length === 0) {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'Accepted task briefhez legalább egy allowed_paths bejegyzés szükséges.', id));
    }
    if (documentStatus === 'accepted' && stringArray(metadata, 'required_checks').length === 0) {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'Accepted task briefhez legalább egy required_checks bejegyzés szükséges.', id));
    }
    const baseCommit = stringValue(metadata, 'base_commit');
    if (!/^[0-9a-f]{7,64}$/u.test(baseCommit)) {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'A task base_commit mezője 7–64 karakteres Git commit hash legyen.', id));
    }
    const risk = stringValue(metadata, 'risk');
    if (!['low', 'medium', 'high', 'critical'].includes(risk)) {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'A task risk értéke low, medium, high vagy critical legyen.', id));
    }
    const approval = stringValue(metadata, 'human_approval');
    if (!['none', 'before_execute', 'before_merge', 'before_release'].includes(approval)) {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'A human_approval értéke nem támogatott.', id));
    }
    if (['high', 'critical'].includes(risk) && approval === 'none') {
      issues.push(issue('DOC_TASK_CONTRACT_INVALID', file, 'High vagy critical task nem használhat human_approval: none értéket.', id));
    }
    if (
      documentStatus === 'accepted' &&
      approval === 'before_execute' &&
      stringArray(metadata, 'approval_refs').length === 0
    ) {
      issues.push(issue('DOC_TASK_APPROVAL_MISSING', file, 'before_execute taskhoz legalább egy approval_refs hivatkozás szükséges.', id));
    }
    const bodyHeadings = headings(parsed.body);
    for (const heading of requiredTaskHeadings) {
      if (!bodyHeadings.has(heading)) {
        issues.push(issue('DOC_TASK_SECTION_MISSING', file, `A task briefből hiányzik ez a fejezet: ${heading}.`, id));
      }
    }
  }

  if (authority === 'normative' && documentStatus === 'accepted') {
    const bodyHeadings = headings(parsed.body);
    if (!bodyHeadings.has('Contract')) {
      issues.push(issue('DOC_NORMATIVE_SECTION_MISSING', file, 'Elfogadott normatív dokumentumból hiányzik a Contract fejezet.', id));
    }
    if (!bodyHeadings.has('Acceptance criteria') && !bodyHeadings.has('Elfogadási kritériumok')) {
      issues.push(issue('DOC_NORMATIVE_SECTION_MISSING', file, 'Elfogadott normatív dokumentumból hiányzik az Acceptance criteria fejezet.', id));
    }
  }

  if (issues.some(({ severity }) => severity === 'error') || !id) return { document: null, issues };

  return {
    document: {
      ...parsed,
      id,
      title: stringValue(metadata, 'title'),
      scope: stringValue(metadata, 'scope'),
      kind: stringValue(metadata, 'kind'),
      subtype,
      authority,
      documentStatus,
      implementationStatus: stringValue(metadata, 'implementation_status'),
      verificationStatus,
      classification: stringValue(metadata, 'classification'),
      aiAccess,
      contextPriority,
      owner: stringValue(metadata, 'owner'),
      relations: relationships(metadata),
    },
    issues,
  };
}

export function metadataRecord(value: FrontmatterValue | undefined): Readonly<Record<string, FrontmatterValue>> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, FrontmatterValue>>
    : null;
}
