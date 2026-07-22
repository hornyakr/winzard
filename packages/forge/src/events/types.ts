export const EVENT_CATEGORIES = [
  'domain',
  'application',
  'integration',
  'process-signal',
  'telemetry',
  'ui',
  'lifecycle',
] as const;

export const EVENT_PHASES = [
  'transactional',
  'integration-map',
  'after-commit',
  'observe',
  'cleanup',
] as const;

export const EVENT_FAILURE_POLICIES = [
  'fail-fast',
  'collect-and-fail',
  'log-and-continue',
  'retry-durable',
  'dead-letter',
] as const;

export const EVENT_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventPhase = (typeof EVENT_PHASES)[number];
export type EventFailurePolicy = (typeof EVENT_FAILURE_POLICIES)[number];
export type EventClassification = (typeof EVENT_CLASSIFICATIONS)[number];

export type EventHandlerDefinitionRecord = Readonly<{
  id: string;
  source: string;
  exportName: string;
  phase: EventPhase;
  failurePolicy: EventFailurePolicy;
  before: readonly string[];
  after: readonly string[];
  consumerId: string | null;
  idempotent: boolean;
  maximumAttempts: number | null;
}>;

export type EventRecord = Readonly<{
  definitionId: string;
  definitionFile: string;
  id: string;
  type: string;
  category: EventCategory;
  version: number;
  source: string;
  exportName: string;
  producer: string;
  payloadSchema: string | null;
  classification: EventClassification;
  tenantScoped: boolean;
  aliases: readonly string[];
  handlers: readonly EventHandlerDefinitionRecord[];
}>;

export type EventIssueSeverity = 'error' | 'warning';
export type EventIssueArea = 'contract' | 'registry' | 'delivery' | 'security' | 'generation';
export type EventIssue = Readonly<{
  severity: EventIssueSeverity;
  area: EventIssueArea;
  code: string;
  file: string;
  message: string;
  eventType?: string;
  handlerId?: string;
}>;

export type EventDefinitionRecord = Readonly<{
  id: string;
  file: string;
  exportName: string;
  events: readonly string[];
}>;

export type EventInventory = Readonly<{
  schemaVersion: 1;
  projectRoot: '.';
  definitions: readonly EventDefinitionRecord[];
  events: readonly EventRecord[];
  issues: readonly EventIssue[];
  fingerprint: string;
}>;
