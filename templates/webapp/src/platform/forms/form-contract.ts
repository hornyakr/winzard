export type FormExecutionMode = 'get' | 'server-action' | 'route-handler';
export type FormUnknownFieldPolicy = 'reject' | 'ignore-explicit';
export type FormProgressiveEnhancementPolicy = 'required' | 'supported' | 'not-supported';
export type FormFieldMultiplicity = 'single' | 'multiple';
export type FormFieldKind = 'text' | 'search' | 'email' | 'password' | 'url' | 'tel' | 'number' | 'date' | 'datetime-local' | 'time' | 'textarea' | 'select' | 'radio-group' | 'checkbox' | 'checkbox-group' | 'file' | 'hidden' | 'custom';

export type FormContract = Readonly<{
  schemaVersion: 1;
  id: string;
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
  fields: readonly Readonly<{
    name: string;
    id: string;
    kind: FormFieldKind;
    multiplicity: FormFieldMultiplicity;
    required: boolean;
    presentationOnly: boolean;
    authority: boolean;
    errorCodes: readonly string[];
  }>[];
  intents: readonly Readonly<{ value: string; label: string; operation: string | null }>[];
  filePolicy: Readonly<{ maxBytes: number; mimeTypes: readonly string[] }> | null;
}>;

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export function defineFormContract<const T extends FormContract>(contract: T): T {
  if (contract.schemaVersion !== 1) throw new TypeError('Only form contract schema version 1 is supported.');
  if (contract.execution === 'get' && contract.mutation) throw new TypeError('GET forms cannot mutate.');
  if (contract.execution !== 'get' && !contract.deliveryContractId) throw new TypeError('Mutation forms require a delivery contract.');
  if (contract.unknownFields !== 'reject') throw new TypeError('Form contracts must fail closed on unknown fields.');
  if (contract.idempotencyRequired && contract.idempotency !== 'required') throw new TypeError('Critical forms require idempotency.');
  if (contract.fields.some(({ kind }) => kind === 'file') && contract.filePolicy === null) throw new TypeError('File forms require a file policy.');
  return deepFreeze(contract);
}
