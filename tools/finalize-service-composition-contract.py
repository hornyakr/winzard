from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


def insert_before(path: str, marker: str, value: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    if source.count(marker) != 1:
        raise RuntimeError(f'{path}: insertion marker count is {source.count(marker)}')
    file.write_text(source.replace(marker, value + marker, 1), encoding='utf-8')


def contract_source() -> str:
    return '''export const COMPOSITION_LIFETIMES = [
  'static',
  'process',
  'request',
  'operation',
  'external',
] as const;

export const COMPOSITION_RUNTIMES = ['nodejs', 'edge', 'universal'] as const;

export const COMPOSITION_KINDS = [
  'application',
  'infrastructure',
  'platform',
  'factory',
  'provider',
  'registry',
  'decorator',
] as const;

export const COMPOSITION_VISIBILITIES = ['public', 'private'] as const;

export type RuntimeCompositionLifetime = (typeof COMPOSITION_LIFETIMES)[number];
export type RuntimeCompositionRuntime = (typeof COMPOSITION_RUNTIMES)[number];
export type RuntimeCompositionKind = (typeof COMPOSITION_KINDS)[number];
export type RuntimeCompositionVisibility = (typeof COMPOSITION_VISIBILITIES)[number];

export type RuntimeCompositionRoot = Readonly<{
  id: string;
  source: string;
  exportName: string;
  runtime: RuntimeCompositionRuntime;
  services: readonly string[];
}>;

export type RuntimeCompositionService = Readonly<{
  id: string;
  capability: string;
  kind: RuntimeCompositionKind;
  implementation: string;
  port: string | null;
  source: string;
  exportName: string | null;
  lifetime: RuntimeCompositionLifetime;
  runtime: RuntimeCompositionRuntime;
  visibility: RuntimeCompositionVisibility;
  dependencies: readonly string[];
  decorators: readonly string[];
  aliases: readonly string[];
  tags: readonly string[];
  priority: number;
  configKeys: readonly string[];
  secretKeys: readonly string[];
  disposable: boolean;
  requestState: boolean;
}>;

export type RuntimeCompositionManifest = Readonly<{
  schemaVersion: 1;
  fingerprint: string;
  roots: readonly RuntimeCompositionRoot[];
  services: readonly RuntimeCompositionService[];
}>;

export type CompositionRootDefinition = Readonly<{
  id: string;
  source: string;
  export: string;
  runtime: RuntimeCompositionRuntime;
  services: readonly string[];
}>;

export type CompositionServiceDefinition = Readonly<{
  id: string;
  kind: RuntimeCompositionKind;
  implementation: string;
  port?: string | null;
  source: string;
  export?: string | null;
  lifetime: RuntimeCompositionLifetime;
  runtime: RuntimeCompositionRuntime;
  visibility: RuntimeCompositionVisibility;
  dependencies?: readonly string[];
  decorators?: readonly string[];
  aliases?: readonly string[];
  tags?: readonly string[];
  priority?: number;
  configKeys?: readonly string[];
  secretKeys?: readonly string[];
  disposable?: boolean;
  requestState?: boolean;
}>;

export type CompositionDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  capability: string;
  roots: readonly CompositionRootDefinition[];
  services: readonly CompositionServiceDefinition[];
}>;

export function defineComposition(definition: CompositionDefinition): CompositionDefinition {
  return definition;
}
'''


def update_contracts() -> None:
    content = contract_source()
    for relative in [
        'apps/reference/src/platform/composition/contract.ts',
        'templates/minimal/src/platform/composition/contract.ts',
        'templates/webapp/src/platform/composition/contract.ts',
        'recipes/service-composition/files/src/platform/composition/contract.ts',
    ]:
        (ROOT / relative).write_text(content, encoding='utf-8')


def update_inventory_schema_validation() -> None:
    path = 'packages/forge/src/composition/inventory.ts'
    replace_once(
        path,
        "const CONFIG_KEY = /^[A-Z][A-Z0-9_]*$/u;\n",
        "const CONFIG_KEY = /^[A-Z][A-Z0-9_]*$/u;\nconst DEFINITION_FIELDS = new Set(['schemaVersion', 'id', 'capability', 'roots', 'services']);\nconst ROOT_FIELDS = new Set(['id', 'source', 'export', 'runtime', 'services']);\nconst SERVICE_FIELDS = new Set([\n  'id', 'kind', 'implementation', 'port', 'source', 'export', 'lifetime', 'runtime',\n  'visibility', 'dependencies', 'decorators', 'aliases', 'tags', 'priority', 'configKeys',\n  'secretKeys', 'disposable', 'requestState',\n]);\n",
    )
    validation = r'''function validateUnknownFields(
  value: CompositionJsonObject,
  allowed: ReadonlySet<string>,
  file: string,
  context: string,
  issues: CompositionIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue('contract', 'COMPOSITION_UNKNOWN_FIELD', file, `${context}: ismeretlen mező: ${key}.`));
    }
  }
}

function validateStringField(
  value: CompositionJsonObject,
  key: string,
  file: string,
  context: string,
  issues: CompositionIssue[],
  optional = false,
): void {
  const item = value[key];
  if (item === undefined && optional) return;
  if (typeof item !== 'string' || item.trim() === '') {
    issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `${context}.${key} nem üres string legyen.`));
  }
}

function validateOptionalNullableString(
  value: CompositionJsonObject,
  key: string,
  file: string,
  context: string,
  issues: CompositionIssue[],
): void {
  const item = value[key];
  if (item === undefined || item === null) return;
  if (typeof item !== 'string' || item.trim() === '') {
    issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `${context}.${key} string vagy null legyen.`));
  }
}

function validateEnumField(
  value: CompositionJsonObject,
  key: string,
  allowed: readonly string[],
  file: string,
  context: string,
  issues: CompositionIssue[],
): void {
  const item = value[key];
  if (typeof item !== 'string' || !allowed.includes(item)) {
    issues.push(issue('contract', 'COMPOSITION_ENUM_INVALID', file, `${context}.${key} csak ${allowed.join(', ')} lehet.`));
  }
}

function validateStringArrayField(
  value: CompositionJsonObject,
  key: string,
  file: string,
  context: string,
  issues: CompositionIssue[],
  optional = true,
): void {
  const item = value[key];
  if (item === undefined && optional) return;
  if (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `${context}.${key} nem üres stringek tömbje legyen.`));
    return;
  }
  if (new Set(item).size !== item.length) {
    issues.push(issue('contract', 'COMPOSITION_ARRAY_DUPLICATE', file, `${context}.${key} duplikált elemet tartalmaz.`));
  }
}

function validateOptionalBoolean(
  value: CompositionJsonObject,
  key: string,
  file: string,
  context: string,
  issues: CompositionIssue[],
): void {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') {
    issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `${context}.${key} boolean legyen.`));
  }
}

function validateOptionalInteger(
  value: CompositionJsonObject,
  key: string,
  file: string,
  context: string,
  issues: CompositionIssue[],
): void {
  if (value[key] !== undefined && !Number.isInteger(value[key])) {
    issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `${context}.${key} egész szám legyen.`));
  }
}

function validateDefinitionShape(
  file: string,
  value: CompositionJsonObject,
  issues: CompositionIssue[],
): void {
  validateUnknownFields(value, DEFINITION_FIELDS, file, 'definition', issues);
  validateStringField(value, 'id', file, 'definition', issues);
  validateStringField(value, 'capability', file, 'definition', issues);

  for (const key of ['roots', 'services'] as const) {
    const entries = value[key];
    if (!Array.isArray(entries)) {
      issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `definition.${key} objektumtömb legyen.`));
      continue;
    }
    entries.forEach((entry, index) => {
      if (!isCompositionJsonObject(entry as CompositionJsonLiteral)) {
        issues.push(issue('contract', 'COMPOSITION_FIELD_INVALID', file, `definition.${key}[${index}] objektum legyen.`));
      }
    });
  }

  objectArray(value, 'roots').forEach((root, index) => {
    const context = `root[${index}]`;
    validateUnknownFields(root, ROOT_FIELDS, file, context, issues);
    validateStringField(root, 'id', file, context, issues);
    validateStringField(root, 'source', file, context, issues);
    validateStringField(root, 'export', file, context, issues);
    validateEnumField(root, 'runtime', COMPOSITION_RUNTIMES, file, context, issues);
    validateStringArrayField(root, 'services', file, context, issues, false);
  });

  objectArray(value, 'services').forEach((service, index) => {
    const context = `service[${index}]`;
    validateUnknownFields(service, SERVICE_FIELDS, file, context, issues);
    validateStringField(service, 'id', file, context, issues);
    validateEnumField(service, 'kind', COMPOSITION_KINDS, file, context, issues);
    validateStringField(service, 'implementation', file, context, issues);
    validateOptionalNullableString(service, 'port', file, context, issues);
    validateStringField(service, 'source', file, context, issues);
    validateOptionalNullableString(service, 'export', file, context, issues);
    validateEnumField(service, 'lifetime', COMPOSITION_LIFETIMES, file, context, issues);
    validateEnumField(service, 'runtime', COMPOSITION_RUNTIMES, file, context, issues);
    validateEnumField(service, 'visibility', COMPOSITION_VISIBILITIES, file, context, issues);
    for (const key of ['dependencies', 'decorators', 'aliases', 'tags', 'configKeys', 'secretKeys'] as const) {
      validateStringArrayField(service, key, file, context, issues);
    }
    validateOptionalInteger(service, 'priority', file, context, issues);
    validateOptionalBoolean(service, 'disposable', file, context, issues);
    validateOptionalBoolean(service, 'requestState', file, context, issues);
  });
}

'''
    insert_before(path, 'function decodeDefinition(', validation)
    replace_once(
        path,
        "  const value = parsed.value;\n  const issues: CompositionIssue[] = [];\n",
        "  const value = parsed.value;\n  const issues: CompositionIssue[] = [];\n  validateDefinitionShape(file, value, issues);\n",
    )
    replace_once(
        path,
        "  for (const absolute of sourceFiles) {\n",
        "  const instrumentation = await source('instrumentation.ts');\n  if (!instrumentation || !/\\bvalidateComposition\\s*\\(/u.test(instrumentation)) {\n    issues.push(issue('runtime', 'COMPOSITION_STARTUP_VALIDATOR_MISSING', 'instrumentation.ts', 'A service-composition capability Node startup hookja nem hívja a validateComposition validátort.'));\n  }\n\n  for (const absolute of sourceFiles) {\n",
    )


def update_cli() -> None:
    replace_once(
        'packages/forge/src/composition/cli.ts',
        "const COMMANDS = new Set([\n  'composition:list',\n  'composition:inspect',\n  'composition:graph',\n  'composition:check',\n  'composition:why',\n  'composition:docs',\n  'composition:generate',\n  'service:aliases',\n  'service:lifetimes',\n]);",
        "export const COMPOSITION_COMMANDS = Object.freeze([\n  'composition:list',\n  'composition:inspect',\n  'composition:graph',\n  'composition:check',\n  'composition:why',\n  'composition:docs',\n  'composition:generate',\n  'service:aliases',\n  'service:lifetimes',\n] as const);\n\nconst COMMANDS = new Set<string>(COMPOSITION_COMMANDS);",
    )
    replace_once(
        'packages/forge/src/composition/cli.ts',
        "    const query = parsed.positionals[0];\n    if (!query) throw Object.assign(new Error('A composition:why parancshoz service ID szükséges.'), { exitCode: 2 });\n    const chain = compositionWhy(inventory, query);\n    console.log(json ? JSON.stringify({ chain }, null, 2) : chain.length > 0 ? chain.join(' → ') : `No path to ${query}.`);\n    if (chain.length === 0) process.exitCode = 1;",
        "    const query = parsed.positionals[0];\n    if (!query) throw Object.assign(new Error('A composition:why parancshoz service ID, port vagy implementáció szükséges.'), { exitCode: 2 });\n    const exact = inventory.services.find(({ id }) => id === query);\n    const matches = exact ? [exact] : inspectComposition(inventory, query);\n    if (matches.length !== 1) {\n      const code = matches.length === 0 ? 'COMPOSITION_SERVICE_UNKNOWN' : 'COMPOSITION_SERVICE_AMBIGUOUS';\n      console.error(`[${code}] ${query}`);\n      process.exitCode = 1;\n    } else {\n      const target = matches[0]?.id ?? query;\n      const chain = compositionWhy(inventory, target);\n      console.log(json ? JSON.stringify({ target, chain }, null, 2) : chain.length > 0 ? chain.join(' → ') : `No path to ${target}.`);\n      if (chain.length === 0) process.exitCode = 1;\n    }",
    )
    replace_once(
        'packages/forge/src/cli-router-base.ts',
        "import { runProjectChecks } from './checks/project';\n",
        "import { runProjectChecks } from './checks/project';\nimport { COMPOSITION_COMMANDS } from './composition/cli';\n",
    )
    replace_once(
        'packages/forge/src/cli-router-base.ts',
        "      'kernel-config:list',\n",
        "      ...COMPOSITION_COMMANDS,\n      'kernel-config:list',\n",
    )


def update_tests_and_status() -> None:
    replace_once(
        'packages/forge/tests/composition.test.ts',
        "import { checkCompositionDocumentation, generateCompositionDocumentation } from '../src/composition/docs';\n",
        "import { COMPOSITION_COMMANDS } from '../src/composition/cli';\nimport { checkCompositionDocumentation, generateCompositionDocumentation } from '../src/composition/docs';\n",
    )
    replace_once(
        'packages/forge/tests/composition.test.ts',
        "  await file(root, 'src/composition/app.server.ts', \"import 'server-only'; export const application = {};\\n\");\n",
        "  await file(root, 'instrumentation.ts', \"export async function register() { const composition = await import('./src/platform/composition/validate-composition.server'); await composition.validateComposition(); }\\n\");\n  await file(root, 'src/composition/app.server.ts', \"import 'server-only'; export const application = {};\\n\");\n",
    )
    marker = "  it('async function composition exportot is felismer', async () => {"
    tests = r'''  it('a globális Forge command-lista számára publikálja a composition parancsokat', () => {
    expect(COMPOSITION_COMMANDS).toEqual([
      'composition:list',
      'composition:inspect',
      'composition:graph',
      'composition:check',
      'composition:why',
      'composition:docs',
      'composition:generate',
      'service:aliases',
      'service:lifetimes',
    ]);
  });

  it('ismeretlen mezőt, hibás enumot és hiányzó startup validátort fail-closed jelez', async () => {
    const root = await fixture();
    await file(root, 'instrumentation.ts', 'export async function register() {}\n');
    await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'browser', services: ['catalog.query'], unexpected: true }],
  services: [
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'proces', runtime: 'nodejs', visibility: 'public', dependencies: [] },
  ],
});
`);
    const codes = (await buildCompositionInventory(root)).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'COMPOSITION_UNKNOWN_FIELD',
      'COMPOSITION_ENUM_INVALID',
      'COMPOSITION_STARTUP_VALIDATOR_MISSING',
    ]));
  });

'''
    insert_before('packages/forge/tests/composition.test.ts', marker, tests)
    replace_once(
        'docs/public_documentation/winzard-service-container.md',
        'status: "implemented-specification"',
        'status: "implemented-unverified"',
    )
    replace_once(
        'docs/development/service-composition-platform-implementation.md',
        '- nine Forge composition/service commands;',
        '- nine Forge composition/service commands, all published through the global `forge list` surface;',
    )


def cleanup() -> None:
    for relative in [
        '.github/workflows/apply-service-composition-contract-finalization.yml',
        'tools/finalize-service-composition-contract.py',
    ]:
        file = ROOT / relative
        if file.exists():
            file.unlink()


def main() -> None:
    update_contracts()
    update_inventory_schema_validation()
    update_cli()
    update_tests_and_status()
    cleanup()


if __name__ == '__main__':
    main()
