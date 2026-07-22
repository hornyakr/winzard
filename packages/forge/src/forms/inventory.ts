import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

import type {
  FormFieldKind,
  FormFieldMultiplicity,
  FormFieldRecord,
  FormFilePolicy,
  FormIntentRecord,
  FormInventory,
  FormIssue,
  FormRecord,
} from './types';

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u;
const TEST_EXTENSION = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/u;
const DEFINITION_EXTENSION = /\.form\.definition\.(?:ts|tsx|js|jsx)$/u;
const IGNORED_DIRECTORIES = new Set(['node_modules', '.next', 'coverage', 'generated']);
const STABLE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const CONTRACT_ID = /^[a-z][a-z0-9.-]{2,127}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,127}$/u;
const AUTHORITY_FIELD = /^(?:actorId|userId|tenantId|role|permission|isAdmin|allowed|ownerId|price|discount)$/u;
const SECRET_FIELD = /(?:password|secret|token|credential|apiKey|privateKey|session|cookie)/iu;

const FIELD_KINDS = new Set<FormFieldKind>([
  'text',
  'search',
  'email',
  'password',
  'url',
  'tel',
  'number',
  'date',
  'datetime-local',
  'time',
  'textarea',
  'select',
  'radio-group',
  'checkbox',
  'checkbox-group',
  'file',
  'hidden',
  'custom',
]);
const MULTIPLICITIES = new Set<FormFieldMultiplicity>(['single', 'multiple']);

 type SourceRecord = Readonly<{
  file: string;
  source: string;
  exports: readonly string[];
  sourceFile: ts.SourceFile;
}>;

type TestRecord = Readonly<{
  file: string;
  source: string;
}>;

function projectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collect(directory: string, predicate: (fileName: string) => boolean): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(current, predicate));
    else if (entry.isFile() && predicate(entry.name)) files.push(current);
  }
  return files.sort();
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/u.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind(filePath));
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function literalValue(expression: ts.Expression): unknown {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) return current.text;
  if (ts.isNumericLiteral(current)) return Number(current.text);
  if (current.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (current.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (current.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(current) && ts.isNumericLiteral(current.operand)) {
    const value = Number(current.operand.text);
    return current.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.map((element) => literalValue(element as ts.Expression));
  }
  if (ts.isObjectLiteralExpression(current)) {
    const output: Record<string, unknown> = {};
    for (const property of current.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyName(property.name);
      if (name !== null) output[name] = literalValue(property.initializer);
    }
    return output;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean));
}

function issue(
  code: string,
  file: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
  formId?: string,
): FormIssue {
  return Object.freeze({ severity, code, file, message, ...(formId ? { formId } : {}) });
}

function fieldRecord(
  value: unknown,
  file: string,
  formId: string,
  issues: FormIssue[],
): FormFieldRecord | null {
  if (!isRecord(value)) {
    issues.push(issue('FORM_FIELD_CONTRACT_INVALID', file, 'A form field definíció objektum legyen.', 'error', formId));
    return null;
  }

  const name = stringValue(value.name);
  const id = stringValue(value.id);
  const kind = stringValue(value.kind);
  const multiplicity = stringValue(value.multiplicity);
  if (
    !name ||
    !id ||
    !kind ||
    !FIELD_KINDS.has(kind as FormFieldKind) ||
    !multiplicity ||
    !MULTIPLICITIES.has(multiplicity as FormFieldMultiplicity)
  ) {
    issues.push(issue('FORM_FIELD_CONTRACT_INVALID', file, 'A form field name, id, támogatott kind és multiplicity mezője kötelező.', 'error', formId));
    return null;
  }

  const errorCodes = stringArray(value.errorCodes);
  for (const code of errorCodes) {
    if (!ERROR_CODE.test(code)) {
      issues.push(issue('FORM_ERROR_CODE_INVALID', file, `Érvénytelen form hibakód: ${code}.`, 'error', formId));
    }
  }

  return Object.freeze({
    name,
    id,
    kind: kind as FormFieldKind,
    multiplicity: multiplicity as FormFieldMultiplicity,
    required: booleanValue(value.required),
    presentationOnly: booleanValue(value.presentationOnly),
    authority: booleanValue(value.authority),
    errorCodes,
  });
}

function intentRecord(
  value: unknown,
  file: string,
  formId: string,
  issues: FormIssue[],
): FormIntentRecord | null {
  if (!isRecord(value)) {
    issues.push(issue('FORM_INTENT_CONTRACT_INVALID', file, 'A form intent definíció objektum legyen.', 'error', formId));
    return null;
  }
  const intentValue = stringValue(value.value);
  const label = stringValue(value.label);
  if (!intentValue || !label) {
    issues.push(issue('FORM_INTENT_CONTRACT_INVALID', file, 'A form intent value és label mezője kötelező.', 'error', formId));
    return null;
  }
  return Object.freeze({ value: intentValue, label, operation: stringValue(value.operation) });
}

function filePolicy(
  value: unknown,
  file: string,
  formId: string,
  issues: FormIssue[],
): FormFilePolicy | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Number.isSafeInteger(value.maxBytes) || Number(value.maxBytes) < 1) {
    issues.push(issue('FORM_FILE_LIMIT_MISSING', file, 'A file policy pozitív egész maxBytes értéket igényel.', 'error', formId));
    return null;
  }
  const mimeTypes = stringArray(value.mimeTypes);
  if (mimeTypes.length === 0) {
    issues.push(issue('FORM_FILE_LIMIT_MISSING', file, 'A file policy MIME allowlistet igényel.', 'error', formId));
  }
  return Object.freeze({ maxBytes: Number(value.maxBytes), mimeTypes });
}

function definitionObject(sourceFile: ts.SourceFile): Record<string, unknown> | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;
      if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'defineFormContract') continue;
      const argument = initializer.arguments[0];
      if (!argument) return null;
      const value = literalValue(argument);
      return isRecord(value) ? value : null;
    }
  }
  return null;
}

function parseDefinition(
  file: string,
  sourceFile: ts.SourceFile,
): Readonly<{ record: FormRecord | null; issues: readonly FormIssue[] }> {
  const issues: FormIssue[] = [];
  const raw = definitionObject(sourceFile);
  if (!raw) {
    return {
      record: null,
      issues: [issue('FORM_DEFINITION_INVALID', file, 'A fájl nem tartalmaz statikus defineFormContract({...}) definíciót.')],
    };
  }

  const formId = stringValue(raw.id) ?? '<unknown>';
  if (raw.schemaVersion !== 1) {
    issues.push(issue('FORM_SCHEMA_VERSION', file, 'Csak az 1-es form schema támogatott.', 'error', formId));
  }
  if (!CONTRACT_ID.test(formId)) {
    issues.push(issue('FORM_ID_INVALID', file, `Érvénytelen form ID: ${formId}.`, 'error', formId));
  }

  const fields = Array.isArray(raw.fields)
    ? raw.fields
      .map((value) => fieldRecord(value, file, formId, issues))
      .filter((value): value is FormFieldRecord => value !== null)
    : [];
  const intents = Array.isArray(raw.intents)
    ? raw.intents
      .map((value) => intentRecord(value, file, formId, issues))
      .filter((value): value is FormIntentRecord => value !== null)
    : [];

  const execution = stringValue(raw.execution);
  const component = stringValue(raw.component);
  const extractor = stringValue(raw.extractor);
  const schema = stringValue(raw.schema);
  const actionState = stringValue(raw.actionState);
  const errorMapper = stringValue(raw.errorMapper);
  const unknownFields = stringValue(raw.unknownFields);
  const progressiveEnhancement = stringValue(raw.progressiveEnhancement);
  if (!execution || !component || !extractor || !schema || !actionState || !errorMapper || !unknownFields || !progressiveEnhancement) {
    issues.push(issue('FORM_DEFINITION_INVALID', file, 'A form definícióból kötelező contractmező hiányzik.', 'error', formId));
    return { record: null, issues };
  }

  const names = new Set<string>();
  const ids = new Set<string>();
  for (const field of fields) {
    if (names.has(field.name)) {
      issues.push(issue('FORM_FIELD_DUPLICATE', file, `Duplikált form field név: ${field.name}.`, 'error', formId));
    }
    if (ids.has(field.id)) {
      issues.push(issue('FORM_FIELD_ID_DUPLICATE', file, `Duplikált form field ID: ${field.id}.`, 'error', formId));
    }
    names.add(field.name);
    ids.add(field.id);
    if (!STABLE_ID.test(field.id)) {
      issues.push(issue('FORM_UNSTABLE_FIELD_ID', file, `A field ID nem stabil kebab-case érték: ${field.id}.`, 'error', formId));
    }
    if ((field.authority || AUTHORITY_FIELD.test(field.name)) && field.kind === 'hidden') {
      issues.push(issue('FORM_HIDDEN_AUTHORITY_INPUT', file, `Autoritatív adat nem származhat hidden mezőből: ${field.name}.`, 'error', formId));
    }
  }

  const intentValues = new Set<string>();
  for (const intent of intents) {
    if (intentValues.has(intent.value)) {
      issues.push(issue('FORM_UNKNOWN_INTENT', file, `Duplikált form intent: ${intent.value}.`, 'error', formId));
    }
    intentValues.add(intent.value);
  }

  const policy = filePolicy(raw.filePolicy, file, formId, issues);
  if (fields.some(({ kind }) => kind === 'file') && !policy) {
    issues.push(issue('FORM_FILE_LIMIT_MISSING', file, 'File mezőhöz kötelező a maxBytes és MIME allowlist contract.', 'error', formId));
  }

  const record: FormRecord = Object.freeze({
    schemaVersion: 1,
    id: formId,
    file,
    execution: execution as FormRecord['execution'],
    mutation: booleanValue(raw.mutation),
    component,
    deliveryContractId: stringValue(raw.deliveryContractId),
    extractor,
    schema,
    actionState,
    errorMapper,
    unknownFields: unknownFields as FormRecord['unknownFields'],
    progressiveEnhancement: progressiveEnhancement as FormRecord['progressiveEnhancement'],
    authentication: stringValue(raw.authentication) as FormRecord['authentication'],
    tenant: stringValue(raw.tenant) as FormRecord['tenant'],
    idempotency: stringValue(raw.idempotency) as FormRecord['idempotency'],
    idempotencyRequired: booleanValue(raw.idempotencyRequired),
    fields: Object.freeze(fields),
    intents: Object.freeze(intents),
    filePolicy: policy,
    sourceFiles: Object.freeze([]),
    tests: Object.freeze([]),
  });
  return { record, issues };
}

function exportedNames(sourceFile: ts.SourceFile): readonly string[] {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    if (!modifiers.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return Object.freeze([...names].sort());
}

function sourceForSymbol(symbol: string, sources: readonly SourceRecord[]): SourceRecord | null {
  return sources.find(({ exports }) => exports.includes(symbol))
    ?? sources.find(({ source }) => source.includes(symbol))
    ?? null;
}

function deliveryContract(record: FormRecord, sources: readonly SourceRecord[]): SourceRecord | null {
  if (!record.deliveryContractId) return null;
  const escaped = record.deliveryContractId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`\\bid\\s*:\\s*['"]${escaped}['"]`, 'u');
  return sources.find(({ source }) => pattern.test(source)) ?? null;
}

function importsFrameworkInApplication(source: SourceRecord): boolean {
  if (!/(?:^|\/)application(?:\/|$)|(?:^|\/)domain(?:\/|$)/u.test(source.file)) return false;
  return /from\s+['"](?:next(?:\/|['"])|react(?:\/|['"])|server-only['"])/u.test(source.source);
}

function inspectRecord(record: FormRecord, sources: readonly SourceRecord[]): readonly FormIssue[] {
  const issues: FormIssue[] = [];
  const relatedSymbols = [record.component, record.extractor, record.schema, record.actionState, record.errorMapper];
  const related = relatedSymbols
    .map((symbol) => sourceForSymbol(symbol, sources))
    .filter((value): value is SourceRecord => value !== null);
  const component = sourceForSymbol(record.component, sources);
  const extractor = sourceForSymbol(record.extractor, sources);
  const schema = sourceForSymbol(record.schema, sources);
  const actionState = sourceForSymbol(record.actionState, sources);
  const contract = deliveryContract(record, sources);

  for (const symbol of relatedSymbols) {
    if (!sourceForSymbol(symbol, sources)) {
      issues.push(issue('FORM_CONTRACT_SYMBOL_MISSING', record.file, `A form contract hivatkozott szimbóluma nem található: ${symbol}.`, 'error', record.id));
    }
  }
  if (record.execution !== 'get' && !record.deliveryContractId) {
    issues.push(issue('FORM_DELIVERY_CONTRACT_MISSING', record.file, 'Mutation formhoz kötelező delivery contract ID.', 'error', record.id));
  }
  if (record.deliveryContractId && !contract) {
    issues.push(issue('FORM_DELIVERY_CONTRACT_MISSING', record.file, `A delivery contract nem található: ${record.deliveryContractId}.`, 'error', record.id));
  }
  if (record.execution === 'get' && record.mutation) {
    issues.push(issue('FORM_GET_MUTATION', record.file, 'GET form nem indíthat mutationt.', 'error', record.id));
  }
  if (record.mutation && record.authentication === null) {
    issues.push(issue('FORM_SERVER_ACTION_MISSING_AUTH', record.file, 'Mutation formnak explicit authentication policy szükséges.', 'error', record.id));
  }
  if (record.tenant === 'required' && (!contract || !/tenant\s*:\s*['"]required['"]/u.test(contract.source))) {
    issues.push(issue('FORM_TENANT_SCOPE_MISSING', contract?.file ?? record.file, 'A tenant-köteles form delivery contractja nem deklarál required tenant policyt.', 'error', record.id));
  }
  if (record.idempotencyRequired && record.idempotency !== 'required') {
    issues.push(issue('FORM_IDEMPOTENCY_REQUIRED', record.file, 'A kritikus form required idempotency contractot igényel.', 'error', record.id));
  }
  if (record.unknownFields !== 'reject') {
    issues.push(issue('FORM_EXTRA_FIELD_ACCEPTED', record.file, 'A form unknown-field policyja nem fail-closed.', 'warning', record.id));
  }

  if (schema && /\bz\.object\s*\(/u.test(schema.source) && !/\.strict\s*\(\s*\)/u.test(schema.source)) {
    issues.push(issue('FORM_SCHEMA_NOT_STRICT', schema.file, `A ${record.schema} operation schema nem strict.`, 'error', record.id));
  }

  if (extractor) {
    if (/Object\.fromEntries\s*\(\s*formData\s*\)/u.test(extractor.source)) {
      issues.push(issue('FORM_RAW_FORMDATA_TO_ORM', extractor.file, 'A teljes FormData nem alakítható automatikusan persistence inputtá.', 'error', record.id));
      issues.push(issue('FORM_MASS_ASSIGNMENT', extractor.file, 'A FormData teljes automatikus leképezése mass-assignment kockázat.', 'error', record.id));
    }
    if (/Boolean\s*\(\s*formData\.get\s*\(/u.test(extractor.source)) {
      issues.push(issue('FORM_CHECKBOX_TRUTHINESS', extractor.file, 'Checkbox nem parse-olható Boolean(FormData.get()) használatával.', 'error', record.id));
    }
    for (const field of record.fields.filter(({ multiplicity }) => multiplicity === 'multiple')) {
      const escaped = field.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (new RegExp(`formData\\.get\\s*\\(\\s*['"]${escaped}['"]\\s*\\)`, 'u').test(extractor.source)) {
        issues.push(issue('FORM_MULTI_VALUE_GET_USED', extractor.file, `A többértékű ${field.name} mező getAll() helyett get()-et használ.`, 'error', record.id));
      }
    }
  }

  if (component) {
    for (const field of record.fields.filter(({ kind }) => kind !== 'hidden')) {
      if (!component.source.includes(field.id)) {
        issues.push(issue('FORM_UNSTABLE_FIELD_ID', component.file, `A komponens nem használja a deklarált stabil field ID-t: ${field.id}.`, 'error', record.id));
      }
    }
    if (record.fields.some(({ kind }) => kind !== 'hidden') && !/(?:<label\b|FieldLabel\b|aria-label=)/u.test(component.source)) {
      issues.push(issue('FORM_FIELD_WITHOUT_LABEL', component.file, 'A form mezőihez nem található programmatikus label contract.', 'error', record.id));
    }
    if (/fieldErrors|errors/u.test(component.source) && !/(?:aria-describedby|FieldErrors|FormErrorSummary)/u.test(component.source)) {
      issues.push(issue('FORM_ERROR_NOT_DESCRIBED', component.file, 'A renderelt formhibák nincsenek accessibility leíráshoz kapcsolva.', 'error', record.id));
    }
    if (/['"]use client['"]/u.test(component.source) && /\b(?:role|permission|isAdmin|authorize|authorization)\b/iu.test(component.source)) {
      issues.push(issue('FORM_CLIENT_ONLY_AUTHORIZATION', component.file, 'A Client Component authorizációs döntést tartalmaz.', 'error', record.id));
    }
  }

  if (actionState && SECRET_FIELD.test(actionState.source)) {
    issues.push(issue('FORM_SECRET_IN_ACTION_STATE', actionState.file, 'Az action state secret vagy credential jellegű mezőt tartalmaz.', 'error', record.id));
  }

  for (const source of related) {
    if (/from\s+['"](?:@prisma\/client|@prisma\/adapter-|pg|postgres|drizzle-orm)/u.test(source.source) || /\/platform\/database\/client/u.test(source.source)) {
      issues.push(issue('FORM_DIRECT_ORM_IMPORT', source.file, 'A formréteg közvetlen ORM- vagy database client importot használ.', 'error', record.id));
    }
    if (importsFrameworkInApplication(source)) {
      issues.push(issue('FORM_APPLICATION_FRAMEWORK_IMPORT', source.file, 'Az application vagy domain réteg framework importot használ.', 'error', record.id));
    }
    if (/fetch\s*\(\s*['"](?:\/api\/|https?:\/\/(?:localhost|127\.0\.0\.1))/u.test(source.source)) {
      issues.push(issue('FORM_INTERNAL_HTTP_CALL', source.file, 'A form adapter saját belső HTTP API-t hív.', 'error', record.id));
    }
    if (/error\.(?:message|stack|cause)|String\s*\(\s*error\s*\)/u.test(source.source) && /return\s*\{/u.test(source.source)) {
      issues.push(issue('FORM_RAW_EXCEPTION_STATE', source.file, 'A form adapter nyers exception-adatot tehet az action state-be.', 'error', record.id));
    }
    if (/\b_method\b|x-http-method-override|methodOverride/iu.test(source.source)) {
      issues.push(issue('FORM_METHOD_OVERRIDE_UNSAFE', source.file, 'A form nem használhat nem auditált HTTP method override-ot.', 'error', record.id));
    }
  }

  const idFields = record.fields.filter(({ name }) => /Id$/u.test(name));
  if (idFields.length > 0 && schema && !idFields.every(({ name }) => schema.source.includes(name))) {
    issues.push(issue('FORM_UNVALIDATED_ID', schema.file, 'A form legalább egy ID mezőjéhez nem található explicit schema contract.', 'warning', record.id));
  }

  return Object.freeze(issues);
}

export function inspectForms(inventory: FormInventory, value: string): readonly FormRecord[] {
  const query = value.trim();
  return inventory.records.filter((record) =>
    record.id === query ||
    record.file === query ||
    record.component === query ||
    record.deliveryContractId === query ||
    record.file.endsWith(`/${query}`));
}

export function isFormAccessibilityIssue(value: FormIssue): boolean {
  return ['FORM_FIELD_WITHOUT_LABEL', 'FORM_ERROR_NOT_DESCRIBED', 'FORM_UNSTABLE_FIELD_ID'].includes(value.code);
}

export function isFormSecurityIssue(value: FormIssue): boolean {
  return [
    'FORM_DIRECT_ORM_IMPORT',
    'FORM_APPLICATION_FRAMEWORK_IMPORT',
    'FORM_RAW_FORMDATA_TO_ORM',
    'FORM_HIDDEN_AUTHORITY_INPUT',
    'FORM_CLIENT_ONLY_AUTHORIZATION',
    'FORM_INTERNAL_HTTP_CALL',
    'FORM_SERVER_ACTION_MISSING_AUTH',
    'FORM_RAW_EXCEPTION_STATE',
    'FORM_SECRET_IN_ACTION_STATE',
    'FORM_FILE_LIMIT_MISSING',
    'FORM_MASS_ASSIGNMENT',
    'FORM_GET_MUTATION',
    'FORM_METHOD_OVERRIDE_UNSAFE',
    'FORM_TENANT_SCOPE_MISSING',
    'FORM_IDEMPOTENCY_REQUIRED',
  ].includes(value.code);
}

function relatedTests(record: FormRecord, symbols: readonly string[], tests: readonly TestRecord[]): readonly string[] {
  return Object.freeze(tests
    .filter(({ file }) => file.includes('/unit/') || file.startsWith('tests/unit/') || file.includes('/forms'))
    .filter(({ source }) => [record.id, ...symbols].some((value) => source.includes(value)))
    .map(({ file }) => file)
    .sort());
}

export async function buildFormInventory(root = process.cwd()): Promise<FormInventory> {
  const sourceRoot = path.join(root, 'src');
  const absoluteFiles = await collect(sourceRoot, (name) => SOURCE_EXTENSION.test(name));
  const sources: readonly SourceRecord[] = Object.freeze(await Promise.all(absoluteFiles.map(async (absolute) => {
    const source = await readFile(absolute, 'utf8');
    const sourceFile = parse(absolute, source);
    return Object.freeze({
      file: projectPath(root, absolute),
      source,
      exports: exportedNames(sourceFile),
      sourceFile,
    });
  })));
  const testFiles = await collect(path.join(root, 'tests'), (name) => TEST_EXTENSION.test(name));
  const tests: readonly TestRecord[] = Object.freeze(await Promise.all(testFiles.map(async (absolute) => Object.freeze({
    file: projectPath(root, absolute),
    source: await readFile(absolute, 'utf8'),
  }))));

  const issues: FormIssue[] = [];
  const records: FormRecord[] = [];
  for (const source of sources.filter(({ file }) => DEFINITION_EXTENSION.test(file))) {
    const parsed = parseDefinition(source.file, source.sourceFile);
    issues.push(...parsed.issues);
    if (!parsed.record) continue;
    const symbols = [parsed.record.component, parsed.record.extractor, parsed.record.schema, parsed.record.actionState, parsed.record.errorMapper];
    const relatedFiles = symbols
      .map((symbol) => sourceForSymbol(symbol, sources)?.file ?? null)
      .filter((value): value is string => value !== null);
    records.push(Object.freeze({
      ...parsed.record,
      sourceFiles: Object.freeze([...new Set([source.file, ...relatedFiles])].sort()),
      tests: relatedTests(parsed.record, symbols, tests),
    }));
  }

  const duplicateIds = new Set<string>();
  const seenIds = new Set<string>();
  for (const record of records) {
    if (seenIds.has(record.id)) duplicateIds.add(record.id);
    seenIds.add(record.id);
    issues.push(...inspectRecord(record, sources));
  }
  for (const id of duplicateIds) {
    for (const record of records.filter((value) => value.id === id)) {
      issues.push(issue('FORM_ID_DUPLICATE', record.file, `Duplikált form ID: ${id}.`, 'error', id));
    }
  }

  const sortedRecords = [...records].sort((left, right) => left.id.localeCompare(right.id) || left.file.localeCompare(right.file));
  const uniqueIssues = new Map<string, FormIssue>();
  for (const value of issues) uniqueIssues.set(`${value.code}\0${value.file}\0${value.message}`, value);
  const sortedIssues = [...uniqueIssues.values()].sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  const canonical = { schemaVersion: 1, records: sortedRecords, issues: sortedIssues };

  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: await exists(sourceRoot) ? 'src' : '.',
    records: Object.freeze(sortedRecords),
    issues: Object.freeze(sortedIssues),
    fingerprint: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
  });
}
