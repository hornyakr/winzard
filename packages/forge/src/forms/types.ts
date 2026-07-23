export type FormExecutionMode = 'get' | 'server-action' | 'route-handler';
export type FormIssueSeverity = 'error' | 'warning';
export type FormUnknownFieldPolicy = 'reject' | 'ignore-explicit';
export type FormProgressiveEnhancementPolicy = 'required' | 'supported' | 'not-supported';
export type FormFieldMultiplicity = 'single' | 'multiple';
export type FormFieldKind =
  | 'text'
  | 'search'
  | 'email'
  | 'password'
  | 'url'
  | 'tel'
  | 'number'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'textarea'
  | 'select'
  | 'radio-group'
  | 'checkbox'
  | 'checkbox-group'
  | 'file'
  | 'hidden'
  | 'custom';

export type FormFieldRecord = Readonly<{
  name: string;
  id: string;
  kind: FormFieldKind;
  multiplicity: FormFieldMultiplicity;
  required: boolean;
  presentationOnly: boolean;
  authority: boolean;
  errorCodes: readonly string[];
}>;

export type FormIntentRecord = Readonly<{
  value: string;
  label: string;
  operation: string | null;
}>;

export type FormFilePolicy = Readonly<{
  maxBytes: number;
  mimeTypes: readonly string[];
}>;

export type FormRecord = Readonly<{
  schemaVersion: 1;
  id: string;
  file: string;
  execution: FormExecutionMode;
  mutation: boolean;
  component: string;
  deliveryContractId: string | null;
  extractor: string;
  schema: string;
  actionState: string;
  errorMapper: string;
  unknownFields: FormUnknownFieldPolicy;
  progressiveEnhancement: FormProgressiveEnhancementPolicy;
  authentication: 'public' | 'optional' | 'required' | null;
  tenant: 'none' | 'optional' | 'required' | null;
  idempotency: 'none' | 'optional' | 'required' | null;
  idempotencyRequired: boolean;
  fields: readonly FormFieldRecord[];
  intents: readonly FormIntentRecord[];
  filePolicy: FormFilePolicy | null;
  sourceFiles: readonly string[];
  tests: readonly string[];
}>;

export type FormIssue = Readonly<{
  severity: FormIssueSeverity;
  code: string;
  file: string;
  message: string;
  formId?: string;
}>;

export type FormInventory = Readonly<{
  schemaVersion: 1;
  sourceRoot: string;
  records: readonly FormRecord[];
  issues: readonly FormIssue[];
  fingerprint: string;
}>;

export type FormGenerationKind = 'form' | 'server-action' | 'form-handler';

export type FormGenerationResult = Readonly<{
  kind: FormGenerationKind;
  target: string;
  dryRun: boolean;
  created: readonly string[];
  skipped: readonly string[];
  overwritten: readonly string[];
}>;
