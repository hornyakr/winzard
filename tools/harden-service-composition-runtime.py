from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


def insert_before(path: str, marker: str, value: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    if source.count(marker) != 1:
        raise RuntimeError(f'{path}: insertion marker count is {source.count(marker)}')
    file.write_text(source.replace(marker, value + marker, 1), encoding='utf-8')


def update_generator() -> None:
    replace_once(
        'packages/forge/src/composition/generator.ts',
        "function registry(inventory: CompositionInventory): string {\n  const imports = inventory.roots\n    .map((root, index) =>\n      `import { ${root.exportName} as ${rootBinding(index)} } from ${JSON.stringify(rootImportSpecifier(root.source))};`)\n    .join('\\n');\n  const instances = inventory.roots\n    .map((root, index) =>\n      `  Object.freeze({ id: ${JSON.stringify(root.id)}, value: ${rootBinding(index)} }),`)\n    .join('\\n');",
        "function registry(inventory: CompositionInventory): string {\n  const startupRoots = inventory.roots.filter(({ runtime }) => runtime !== 'edge');\n  const imports = startupRoots\n    .map((root, index) =>\n      `import { ${root.exportName} as ${rootBinding(index)} } from ${JSON.stringify(rootImportSpecifier(root.source))};`)\n    .join('\\n');\n  const instances = startupRoots\n    .map((root, index) =>\n      `  Object.freeze({ id: ${JSON.stringify(root.id)}, value: ${rootBinding(index)} }),`)\n    .join('\\n');",
    )


def update_validators() -> None:
    paths = [
        'apps/reference/src/platform/composition/validate-composition.server.ts',
        'templates/minimal/src/platform/composition/validate-composition.server.ts',
        'templates/webapp/src/platform/composition/validate-composition.server.ts',
        'recipes/service-composition/files/src/platform/composition/validate-composition.server.ts',
    ]
    for path in paths:
        replace_once(
            path,
            "  const fingerprint = compositionFingerprint(value.roots, value.services);\n",
            "  const startupRoots = value.roots.filter(({ runtime }) => runtime !== 'edge');\n  const fingerprint = compositionFingerprint(value.roots, value.services);\n",
        )
        replace_once(
            path,
            "    generatedCompositionRegistry.length !== value.services.length ||\n    generatedCompositionRoots.length !== value.roots.length ||\n    generatedCompositionRootInstances.length !== value.roots.length\n",
            "    generatedCompositionRegistry.length !== value.services.length ||\n    generatedCompositionRoots.length !== value.roots.length ||\n    generatedCompositionRootInstances.length !== startupRoots.length\n",
        )
        replace_once(
            path,
            "  for (const [index, root] of value.roots.entries()) {\n    if (generatedCompositionRootInstances[index]?.id !== root.id) {\n      throw new CompositionValidationError('COMPOSITION_ROOT_SMOKE_FAILED', `A generated composition root binding eltér: ${root.id}.`);\n    }\n  }\n",
            "  for (const [index, root] of startupRoots.entries()) {\n    const binding = generatedCompositionRootInstances[index];\n    const validValue = binding && (\n      typeof binding.value === 'function' ||\n      (typeof binding.value === 'object' && binding.value !== null)\n    );\n    if (binding?.id !== root.id || !validValue) {\n      throw new CompositionValidationError('COMPOSITION_ROOT_SMOKE_FAILED', `A generated runtime-kompatibilis composition root binding érvénytelen: ${root.id}.`);\n    }\n  }\n",
        )


def update_tests_and_docs() -> None:
    marker = "  it('generated artifactot és dokumentációt drift-checkel', async () => {"
    test = r'''  it('a Node startup registry nem importál Edge-only composition rootot', async () => {
    const root = await fixture();
    await file(root, 'src/composition/edge.server.ts', "import 'server-only'; export const edgeApplication = Object.freeze({});\n");
    await file(root, 'src/modules/catalog/application/edge-query.ts', 'export class EdgeQuery {}\n');
    await file(root, 'src/composition/edge.composition.definition.ts', `
export const edge = defineComposition({
  schemaVersion: 1,
  id: 'edge',
  capability: 'service-composition',
  roots: [{ id: 'edge.root', source: 'src/composition/edge.server.ts', export: 'edgeApplication', runtime: 'edge', services: ['edge.query'] }],
  services: [
    { id: 'edge.query', kind: 'application', implementation: 'EdgeQuery', source: 'src/modules/catalog/application/edge-query.ts', export: 'EdgeQuery', lifetime: 'process', runtime: 'edge', visibility: 'public', dependencies: [] },
  ],
});
`);
    await generateComposition(root);
    const registry = await readFile(path.join(root, 'src/generated/composition/registry.ts'), 'utf8');
    expect(registry).toContain('"runtime": "edge"');
    expect(registry).not.toContain('edgeApplication as compositionRoot');
  });

'''
    insert_before('packages/forge/tests/composition.test.ts', marker, test)
    replace_once(
        'docs/development/service-composition-platform-implementation.md',
        '- startup validation and concrete composition-root import smoke through `instrumentation.ts`;',
        '- startup validation and runtime-compatible concrete composition-root import smoke through `instrumentation.ts`; Edge-only roots remain build- and contract-validated without entering the Node startup graph;',
    )
    replace_once(
        'docs/public_documentation/winzard-service-container.md',
        '- required external SDK construction;\n- health contract konfiguráció.',
        '- required external SDK construction;\n- health contract konfiguráció.\n\nA Node `instrumentation.ts` startup smoke csak `nodejs` és `universal` rootokat importálhat. Az Edge-only rootok a statikus graph-, runtime- és production build-ellenőrzésben validálódnak, de nem kerülhetnek be a Node startup module graphba.',
    )


def cleanup() -> None:
    for relative in [
        '.github/workflows/apply-service-composition-runtime-hardening.yml',
        'tools/harden-service-composition-runtime.py',
    ]:
        file = ROOT / relative
        if file.exists():
            file.unlink()


def main() -> None:
    update_generator()
    update_validators()
    update_tests_and_docs()
    cleanup()


if __name__ == '__main__':
    main()
