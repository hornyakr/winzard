export type DocumentationSeverity = 'error' | 'warning';

export type DocumentationIssue = Readonly<{
  code: string;
  severity: DocumentationSeverity;
  file: string;
  message: string;
  documentId?: string;
}>;

export type FrontmatterScalar = string | number | boolean | null;
export interface FrontmatterObject {
  readonly [key: string]: FrontmatterValue;
}
export type FrontmatterValue = FrontmatterScalar | readonly FrontmatterValue[] | FrontmatterObject;

export type FrontmatterRecord = Record<string, FrontmatterValue>;

export type ParsedMarkdownDocument = Readonly<{
  filePath: string;
  projectPath: string;
  source: string;
  body: string;
  metadata: FrontmatterRecord;
  frontmatterSource: string;
}>;

export type CanonicalDocument = ParsedMarkdownDocument & Readonly<{
  id: string;
  title: string;
  scope: string;
  kind: string;
  subtype: string;
  authority: string;
  documentStatus: string;
  implementationStatus: string;
  verificationStatus: string;
  classification: string;
  aiAccess: string;
  contextPriority: string;
  owner: string;
  relations: Readonly<Record<string, readonly string[]>>;
}>;

export type DocumentationInventory = Readonly<{
  root: string;
  documentationRoot: string;
  projectPrefix: string;
  documents: readonly CanonicalDocument[];
  byId: ReadonlyMap<string, CanonicalDocument>;
  issues: readonly DocumentationIssue[];
}>;

export type DocumentationCheckResult = Readonly<{
  inventory: DocumentationInventory;
  issues: readonly DocumentationIssue[];
  errors: readonly DocumentationIssue[];
  warnings: readonly DocumentationIssue[];
}>;

export type DocumentationStatus = Readonly<{
  total: number;
  canonical: number;
  generated: number;
  byKind: Readonly<Record<string, number>>;
  byDocumentStatus: Readonly<Record<string, number>>;
  byImplementationStatus: Readonly<Record<string, number>>;
  byVerificationStatus: Readonly<Record<string, number>>;
  errors: number;
  warnings: number;
  overdueReviews: number;
}>;

export class DocumentationCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly file = 'documentation',
  ) {
    super(message);
    this.name = 'DocumentationCommandError';
  }
}
