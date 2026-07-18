export type ViewKind =
  | 'page'
  | 'layout'
  | 'template'
  | 'loading'
  | 'error'
  | 'not-found'
  | 'default'
  | 'component'
  | 'email'
  | 'content';

export type ViewBoundary = 'server' | 'client' | 'static';
export type ViewIssueSeverity = 'error' | 'warning';
export type ViewImageKind = 'next-image' | 'html-image';

export type ViewImageAsset = Readonly<{
  kind: ViewImageKind;
  source: string | null;
  hasAlt: boolean;
}>;

export type ViewAssetContract = Readonly<{
  images: readonly ViewImageAsset[];
  stylesheets: readonly string[];
  fonts: readonly string[];
  scripts: readonly string[];
  staticAssets: readonly string[];
  publicUrls: readonly string[];
  externalUrls: readonly string[];
}>;

export type ViewRecord = Readonly<{
  kind: ViewKind;
  name: string;
  file: string;
  route: string | null;
  boundary: ViewBoundary;
  async: boolean;
  propsType: string | null;
  props: readonly string[];
  viewModels: readonly string[];
  imports: readonly string[];
  routeBuilders: readonly string[];
  hasDangerousHtml: boolean;
  assets: ViewAssetContract;
  tests: readonly string[];
}>;

export type ViewIssue = Readonly<{
  severity: ViewIssueSeverity;
  code: string;
  file: string;
  message: string;
}>;

export type ViewInventory = Readonly<{
  schemaVersion: 1;
  sourceRoot: string;
  records: readonly ViewRecord[];
  issues: readonly ViewIssue[];
}>;

export type ViewGenerationResult = Readonly<{
  target: string;
  dryRun: boolean;
  created: readonly string[];
  skipped: readonly string[];
  overwritten: readonly string[];
}>;

export type ViewSourceInspectionInput = Readonly<{
  root: string;
  filePath: string;
  source: string;
}>;
