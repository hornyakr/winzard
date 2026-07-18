import type { HttpMethod, RouteRuntime } from '../routing/types';

export type DeliveryKind = 'page' | 'route-handler' | 'server-action';
export type DeliveryOutputKind =
  | 'react-ui'
  | 'response'
  | 'action-state'
  | 'redirect'
  | 'not-found'
  | 'stream';

export type DeliveryRecord = Readonly<{
  kind: DeliveryKind;
  entrypoint: string;
  route: string | null;
  methods: readonly HttpMethod[];
  runtime: RouteRuntime;
  exportedActions: readonly string[];
  inputSchemas: readonly string[];
  actorResolvers: readonly string[];
  authorizationCalls: readonly string[];
  applicationOperations: readonly string[];
  outputKinds: readonly DeliveryOutputKind[];
  cachePolicy: string | null;
  streaming: boolean;
  tests: readonly string[];
}>;

export type DeliveryIssueSeverity = 'error' | 'warning';

export type DeliveryIssue = Readonly<{
  severity: DeliveryIssueSeverity;
  code: string;
  file: string;
  message: string;
}>;

export type DeliveryInventory = Readonly<{
  schemaVersion: 1;
  sourceRoot: string;
  records: readonly DeliveryRecord[];
  issues: readonly DeliveryIssue[];
}>;

export type DeliveryGenerationKind =
  | 'page'
  | 'route-handler'
  | 'action'
  | 'operation'
  | 'vertical-slice';

export type DeliveryGenerationResult = Readonly<{
  kind: DeliveryGenerationKind;
  target: string;
  dryRun: boolean;
  created: readonly string[];
  skipped: readonly string[];
  overwritten: readonly string[];
}>;
