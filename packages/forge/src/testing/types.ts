export type TestingIssueSeverity = 'error' | 'warning' | 'info';
export type TestLayer =
  | 'unit'
  | 'contract'
  | 'integration'
  | 'application-http'
  | 'browser-e2e'
  | 'accessibility'
  | 'visual';
export type TestRuntime = 'node' | 'jsdom' | 'postgresql' | 'browser';
export type TestNetworkPolicy = 'blocked' | 'allowlisted' | 'uncontrolled';
export type TestDurationClass = 'fast' | 'medium' | 'slow';

export type TestSuiteRecord = Readonly<{
  id: string;
  owner: string;
  layer: TestLayer;
  runtime: TestRuntime;
  command: string;
  include: readonly string[];
  sources: readonly string[];
  fixtures: readonly string[];
  capabilities: readonly string[];
  services: readonly string[];
  ciJob: string;
  duration: TestDurationClass;
  serial: boolean;
  productionBuild: boolean;
  healthcheck: string | null;
  network: TestNetworkPolicy;
  coverage: boolean;
  discoveredFiles: readonly string[];
}>;

export type TestQuarantineRecord = Readonly<{
  testId: string;
  owner: string;
  issue: string;
  reason: string;
  expires: string;
}>;

export type TestingIssue = Readonly<{
  severity: TestingIssueSeverity;
  code: string;
  file: string;
  message: string;
  suiteId?: string;
}>;

export type TestingInventory = Readonly<{
  schemaVersion: 1;
  sourceRoot: string;
  definitionFile: string | null;
  suites: readonly TestSuiteRecord[];
  quarantine: readonly TestQuarantineRecord[];
  unregisteredTestFiles: readonly string[];
  issues: readonly TestingIssue[];
  fingerprint: string;
}>;

export type TestingDefinition = Readonly<{
  schemaVersion: 1;
  suites: readonly Omit<TestSuiteRecord, 'discoveredFiles'>[];
  quarantine: readonly TestQuarantineRecord[];
}>;
