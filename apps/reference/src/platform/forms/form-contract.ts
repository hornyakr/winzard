export type FormExecutionMode = 'get' | 'server-action' | 'route-handler';
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

export type FormFieldContract = Readonly<{
  name: string;
  id: string;
  kind: FormFieldKind;
  multiplicity: FormFieldMultiplicity;
  required: boolean;
  presentationOnly: boolean;
  authority: boolean;
  errorCodes: readonly string[];
}>;

export type FormIntentContract = Readonly<{
  value: string;
  label: string;
  operation: string | null;
}>;

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
  fields: readonly FormFieldContract[];
  intents: readonly FormIntentContract[];
  filePolicy: Readonly<{ maxBytes: number; mimeTypes: readonly string[] }> | null;
}>;

const FORM_ID = /^[a-z][a-z0-9.-]{2,127}$/u;
const FIELD_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,127}$/u;

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export function defineFormContract<const T extends FormContract>(contract: T): T {
  if (contract.schemaVersion !== 1) throw new TypeError('Only form contract schema version 1 is supported.');
  if (!FORM_ID.test(contract.id)) throw new TypeError(`Invalid form contract id: ${contract.id}`);
  if (contract.execution === 'get' && contract.mutation) throw new TypeError('GET forms cannot declare mutation=true.');
  if (contract.execution !== 'get' && !contract.deliveryContractId) throw new TypeError('Mutation forms require a delivery contract id.');
  if (contract.idempotencyRequired && contract.idempotency !== 'required') throw new TypeError('Critical forms require idempotency=required.');
  if (contract.unknownFields !== 'reject') throw new TypeError('Winzard form contracts must fail closed on unknown fields.');

  const names = new Set<string>();
  const ids = new Set<string>();
  for (const field of contract.fields) {
    if (names.has(field.name)) throw new TypeError(`Duplicate form field name: ${field.name}`);
    if (ids.has(field.id)) throw new TypeError(`Duplicate form field id: ${field.id}`);
    if (!FIELD_ID.test(field.id)) throw new TypeError(`Invalid form field id: ${field.id}`);
    for (const code of field.errorCodes) if (!ERROR_CODE.test(code)) throw new TypeError(`Invalid form error code: ${code}`);
    names.add(field.name);
    ids.add(field.id);
  }
  const intents = new Set<string>();
  for (const intent of contract.intents) {
    if (intents.has(intent.value)) throw new TypeError(`Duplicate form intent: ${intent.value}`);
    intents.add(intent.value);
  }
  if (contract.fields.some(({ kind }) => kind === 'file') && contract.filePolicy === null) {
    throw new TypeError('File forms require a file policy.');
  }
  return deepFreeze(contract);
}
