import type { HttpMethod, RouteRuntime } from '../routing/types';

export type KernelContractKind = 'page' | 'route-handler' | 'server-action';
export type KernelIssueSeverity = 'error' | 'warning';
export type KernelIssueArea =
  | 'architecture'
  | 'contract'
  | 'instrumentation'
  | 'request-context'
  | 'response-policy';

export type KernelRecord = Readonly<{
  kind: KernelContractKind;
  id: string;
  contractFile: string;
  contractExport: string;
  entrypoint: string | null;
  route: string | null;
  methods: readonly HttpMethod[];
  actions: readonly string[];
  runtime: RouteRuntime;
  requestContext: string;
  authentication: string;
  tenant: string;
  authorization: Readonly<Record<string, string>>;
  cache: string | null;
  responsePolicy: string | null;
  csrf: string | null;
  idempotency: string | null;
  rateLimit: string | null;
  bodyLimitBytes: number | null;
  streaming: boolean;
  operations: Readonly<Record<string, string>>;
  presenters: Readonly<Record<string, string>>;
  responseSchemas: Readonly<Record<string, string>>;
  errors: readonly string[];
  revalidation: readonly string[];
  enforcement: readonly string[];
  requestContextFactories: readonly string[];
  afterHooks: readonly string[];
  errorMappers: readonly string[];
  instrumentation: readonly string[];
  tests: readonly string[];
}>;

export type KernelIssue = Readonly<{
  severity: KernelIssueSeverity;
  area: KernelIssueArea;
  code: string;
  file: string;
  message: string;
  contractId?: string;
}>;

export type KernelInventory = Readonly<{
  schemaVersion: 1;
  sourceRoot: string;
  changedFrom: string | null;
  changedFiles: readonly string[];
  records: readonly KernelRecord[];
  issues: readonly KernelIssue[];
}>;

export type KernelInventoryOptions = Readonly<{
  changedFrom?: string;
}>;
