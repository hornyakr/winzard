from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:80]!r}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


def insert_before(path: str, marker: str, value: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    if source.count(marker) != 1:
        raise RuntimeError(f'{path}: insertion marker count is {source.count(marker)}')
    file.write_text(source.replace(marker, value + marker, 1), encoding='utf-8')


def update_inventory() -> None:
    path = 'packages/forge/src/composition/inventory.ts'
    replace_once(
        path,
        "import path from 'node:path';\n\n",
        "import path from 'node:path';\n\nimport { configurationDefinitionsForManifest } from '../configuration/catalog';\nimport { loadProjectManifest } from '../manifest';\n\n",
    )
    replace_once(
        path,
        '  type CompositionInventory,\n',
        '  type CompositionInventory,\n  type CompositionInventoryOptions,\n',
    )
    function = r'''async function configurationReferenceIssues(
  root: string,
  services: readonly CompositionServiceRecord[],
): Promise<readonly CompositionIssue[]> {
  const referencedKeys = new Set(
    services.flatMap((service) => [...service.configKeys, ...service.secretKeys]),
  );
  if (referencedKeys.size === 0) return Object.freeze([]);

  const manifestResult = await loadProjectManifest(root);
  if (!manifestResult.manifest) {
    return Object.freeze(manifestResult.failures.map(({ file, message }) =>
      issue('security', 'COMPOSITION_CONFIG_MANIFEST_INVALID', file, message)));
  }

  const definitions = new Map(
    configurationDefinitionsForManifest(manifestResult.manifest)
      .map((definition) => [definition.key, definition] as const),
  );
  const issues: CompositionIssue[] = [];
  for (const service of services) {
    const configSet = new Set(service.configKeys);
    for (const key of service.configKeys) {
      const definition = definitions.get(key);
      if (!definition) {
        issues.push(issue('security', 'COMPOSITION_CONFIG_MISSING', service.definitionFile, `A ${service.id} nem deklarált konfigurációs kulcsot használ: ${key}.`, service.id));
      } else if (definition.classification === 'secret') {
        issues.push(issue('security', 'COMPOSITION_SECRET_EXPOSED', service.definitionFile, `A ${service.id} secret kulcsot configKeys mezőben deklarál: ${key}.`, service.id));
      }
    }
    for (const key of service.secretKeys) {
      const definition = definitions.get(key);
      if (!definition) {
        issues.push(issue('security', 'COMPOSITION_CONFIG_MISSING', service.definitionFile, `A ${service.id} nem deklarált secret kulcsot használ: ${key}.`, service.id));
      } else if (definition.classification !== 'secret') {
        issues.push(issue('security', 'COMPOSITION_SECRET_CLASSIFICATION_INVALID', service.definitionFile, `A ${service.id} nem secret konfigurációt secretKeys mezőben deklarál: ${key}.`, service.id));
      }
      if (configSet.has(key)) {
        issues.push(issue('security', 'COMPOSITION_SECRET_EXPOSED', service.definitionFile, `A ${service.id} ugyanazt a kulcsot config- és secret-dependencyként is deklarálja: ${key}.`, service.id));
      }
    }
  }
  return Object.freeze(issues);
}

'''
    insert_before(path, 'export async function buildCompositionInventory(', function)
    replace_once(
        path,
        "export async function buildCompositionInventory(\n  root = process.cwd(),\n): Promise<CompositionInventory> {",
        "export async function buildCompositionInventory(\n  root = process.cwd(),\n  options: CompositionInventoryOptions = {},\n): Promise<CompositionInventory> {",
    )
    replace_once(
        path,
        "  issues.push(...graphIssues(roots, services));\n  issues.push(...await sourceIssues(absoluteRoot, roots, services, files));\n",
        "  issues.push(...graphIssues(roots, services));\n  issues.push(...await sourceIssues(absoluteRoot, roots, services, files));\n  if (options.resolveConfig) {\n    issues.push(...await configurationReferenceIssues(absoluteRoot, services));\n  }\n",
    )


def update_types_and_callers() -> None:
    replace_once(
        'packages/forge/src/composition/types.ts',
        'export type CompositionInventory = Readonly<{\n',
        "export type CompositionInventoryOptions = Readonly<{\n  resolveConfig?: boolean;\n}>;\n\nexport type CompositionInventory = Readonly<{\n",
    )
    replace_once(
        'packages/forge/src/composition/cli.ts',
        '  const inventory = await buildCompositionInventory(root);\n',
        "  const inventory = await buildCompositionInventory(root, {\n    resolveConfig: flag('--resolve-config'),\n  });\n",
    )
    for path in [
        'packages/forge/src/composition/docs.ts',
    ]:
        file = ROOT / path
        source = file.read_text(encoding='utf-8')
        count = source.count('buildCompositionInventory(absoluteRoot)')
        if count != 2:
            raise RuntimeError(f'{path}: expected two documentation inventory calls, found {count}')
        file.write_text(
            source.replace(
                'buildCompositionInventory(absoluteRoot)',
                'buildCompositionInventory(absoluteRoot, { resolveConfig: true })',
            ),
            encoding='utf-8',
        )
    replace_once(
        'packages/forge/src/checks/project.ts',
        '    const composition = await buildCompositionInventory(root);\n',
        '    const composition = await buildCompositionInventory(root, { resolveConfig: true });\n',
    )
    package = ROOT / 'package.json'
    source = package.read_text(encoding='utf-8')
    count = source.count('composition:check --project')
    if count != 3:
        raise RuntimeError(f'package.json: expected three composition check scripts, found {count}')
    package.write_text(
        source.replace('composition:check --project', 'composition:check --resolve-config --project'),
        encoding='utf-8',
    )


def update_tests() -> None:
    path = 'packages/forge/tests/composition.test.ts'
    marker = "  it('generated artifactot és dokumentációt drift-checkel', async () => {"
    test = r'''  it('resolve-config módban ellenőrzi a config- és secret-tulajdonlást', async () => {
    const root = await fixture();
    await file(root, 'package.json', `${JSON.stringify({
      name: 'composition-fixture',
      private: true,
      winzard: {
        schemaVersion: 1,
        profile: 'minimal',
        capabilities: ['next-app', 'forge', 'kernel-configuration', 'service-composition'],
      },
    }, null, 2)}\n`);
    await file(root, 'src/composition/catalog.composition.definition.ts', `
export const catalog = defineComposition({
  schemaVersion: 1,
  id: 'catalog',
  capability: 'service-composition',
  roots: [{ id: 'catalog.root', source: 'src/composition/app.server.ts', export: 'application', runtime: 'nodejs', services: ['catalog.query'] }],
  services: [
    { id: 'catalog.query', kind: 'application', implementation: 'Query', source: 'src/modules/catalog/application/query.ts', export: 'Query', lifetime: 'process', runtime: 'nodejs', visibility: 'public', dependencies: [], configKeys: ['UNKNOWN_CONFIG', 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'] },
  ],
});
`);
    const codes = (await buildCompositionInventory(root, { resolveConfig: true })).issues.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      'COMPOSITION_CONFIG_MISSING',
      'COMPOSITION_SECRET_EXPOSED',
    ]));
  });

'''
    insert_before(path, marker, test)


def update_public_documentation() -> None:
    path = 'docs/public_documentation/winzard-service-container.md'
    replace_once(
        path,
        '> A dokumentumban szereplő `forge composition:*`, `forge service:*` és `forge graph:*` parancsok egy része **cél-CLI szerződés**. Egy parancs csak akkor tekinthető implementáltnak, ha a repository Forge CLI-je ténylegesen listázza és teszteli. A jelenleg használható alapellenőrzések a `pnpm typecheck`, `pnpm test`, `pnpm forge check --project ...` és `pnpm build`.',
        '> A dokumentumban szereplő `forge composition:*` és `forge service:*` parancsok ebben a repository-verzióban implementált CLI-felületek. A későbbi `forge graph:*` bővítések továbbra is cél-CLI szerződések. Az implementált composition parancsokat a Forge ténylegesen listázza, teszteli, és a `verify:composition` kapuban ellenőrzi.',
    )
    replace_once(path, '71. [Forge célparancsok](#section-71)', '71. [Forge composition- és service-parancsok](#section-71)')
    replace_once(
        path,
        '### 60.1. Jelenlegi alap\n\n```bash\npnpm typecheck\npnpm lint\npnpm test\npnpm forge check --project .\npnpm build\n```',
        '### 60.1. Alap repository-ellenőrzések\n\n```bash\npnpm typecheck\npnpm lint\npnpm test\npnpm forge check --project .\npnpm verify:composition\npnpm build\n```',
    )
    replace_once(path, '### 60.2. Célparancsok', '### 60.2. Implementált composition-diagnosztika')
    replace_once(path, '## 71. Forge célparancsok', '## 71. Forge composition- és service-parancsok')
    replace_once(
        path,
        'Ezek célparancsok. A jelenlegi stabil ellenőrzési minimum:\n\n```bash\npnpm typecheck\npnpm lint\npnpm test\npnpm forge check --project .\npnpm build\n```',
        'A 71.1–71.9 alatt felsorolt composition- és service-parancsok implementáltak. A repository és a template-ek stabil composition kapuja:\n\n```bash\npnpm verify:composition\npnpm forge composition:generate --check --project apps/reference\npnpm forge composition:check --resolve-config --project apps/reference\npnpm forge composition:docs --check --project apps/reference\n```\n\nA teljes release-ellenőrzés ezek mellett továbbra is futtatja a typecheck, lint, unit, build, E2E és template kapukat.',
    )
    replace_once(path, '`composition:list/inspect/why` célparancs', '`composition:list/inspect/why` implementált parancs')
    replace_once(
        path,
        '### 75.6. Ellenőrzési dátum\n\n```text\n2026-07-19\n```',
        '### 75.6. Ellenőrzési dátum\n\n```text\n2026-07-22\n```',
    )
    replace_once(
        'docs/development/service-composition-platform-implementation.md',
        '- startup validation through `instrumentation.ts`;',
        '- startup validation and concrete composition-root import smoke through `instrumentation.ts`;',
    )


def cleanup() -> None:
    for relative in [
        '.github/workflows/apply-service-composition-completion.yml',
        'tools/complete-service-composition.py',
    ]:
        file = ROOT / relative
        if file.exists():
            file.unlink()


def main() -> None:
    update_inventory()
    update_types_and_callers()
    update_tests()
    update_public_documentation()
    cleanup()


if __name__ == '__main__':
    main()
