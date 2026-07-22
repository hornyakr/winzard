from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    source = file.read_text(encoding='utf-8')
    if source.count(old) != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {source.count(old)}')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')


def main() -> None:
    inventory = ROOT / 'packages/forge/src/composition/inventory.ts'
    source = inventory.read_text(encoding='utf-8')
    root_pattern = '(?:const|let|var|class|function)'
    service_pattern = '(?:const|let|var|class|function|interface|type)'
    if source.count(root_pattern) != 1 or source.count(service_pattern) != 1:
        raise RuntimeError('Unexpected composition export detection source.')
    source = source.replace(
        root_pattern,
        '(?:const|let|var|class|(?:async\\\\s+)?function)',
        1,
    ).replace(
        service_pattern,
        '(?:const|let|var|class|(?:async\\\\s+)?function|interface|type)',
        1,
    )
    inventory.write_text(source, encoding='utf-8')

    generator = ROOT / 'packages/forge/src/composition/generator.ts'
    source = generator.read_text(encoding='utf-8')
    start = source.index('function registry(inventory: CompositionInventory): string {')
    end = source.index('\nfunction graphManifest', start)
    registry_block = r'''function rootImportSpecifier(source: string): string {
  const withoutExtension = source.replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/u, '');
  return withoutExtension.startsWith('src/')
    ? `@/${withoutExtension.slice('src/'.length)}`
    : withoutExtension;
}

function rootBinding(index: number): string {
  return `compositionRoot${index}`;
}

function registry(inventory: CompositionInventory): string {
  const imports = inventory.roots
    .map((root, index) =>
      `import { ${root.exportName} as ${rootBinding(index)} } from ${JSON.stringify(rootImportSpecifier(root.source))};`)
    .join('\n');
  const instances = inventory.roots
    .map((root, index) =>
      `  Object.freeze({ id: ${JSON.stringify(root.id)}, value: ${rootBinding(index)} }),`)
    .join('\n');
  return `${HEADER}\nimport 'server-only';\n${imports ? `${imports}\n` : ''}\nexport const generatedCompositionFingerprint = ${JSON.stringify(inventory.fingerprint)};\n\nexport const generatedCompositionRoots = ${JSON.stringify(inventory.roots, null, 2)} as const;\n\nexport const generatedCompositionRegistry = ${JSON.stringify(inventory.services, null, 2)} as const;\n\nexport const generatedCompositionRootInstances = Object.freeze([\n${instances}\n] as const);\n`;
}
'''
    generator.write_text(source[:start] + registry_block + source[end:], encoding='utf-8')

    validators = [
        'apps/reference/src/platform/composition/validate-composition.server.ts',
        'templates/minimal/src/platform/composition/validate-composition.server.ts',
        'templates/webapp/src/platform/composition/validate-composition.server.ts',
        'recipes/service-composition/files/src/platform/composition/validate-composition.server.ts',
    ]
    for relative in validators:
        replace_once(
            relative,
            "  generatedCompositionFingerprint,\n  generatedCompositionRegistry,\n  generatedCompositionRoots,\n",
            "  generatedCompositionFingerprint,\n  generatedCompositionRegistry,\n  generatedCompositionRootInstances,\n  generatedCompositionRoots,\n",
        )
        replace_once(
            relative,
            "  if (generatedCompositionRegistry.length !== value.services.length || generatedCompositionRoots.length !== value.roots.length) {\n    throw new CompositionValidationError('COMPOSITION_REGISTRY_DRIFT', 'A generated registry és graph manifest elemszáma eltér.');\n  }\n",
            "  if (\n    generatedCompositionRegistry.length !== value.services.length ||\n    generatedCompositionRoots.length !== value.roots.length ||\n    generatedCompositionRootInstances.length !== value.roots.length\n  ) {\n    throw new CompositionValidationError('COMPOSITION_REGISTRY_DRIFT', 'A generated registry és graph manifest elemszáma eltér.');\n  }\n  for (const [index, root] of value.roots.entries()) {\n    if (generatedCompositionRootInstances[index]?.id !== root.id) {\n      throw new CompositionValidationError('COMPOSITION_ROOT_SMOKE_FAILED', `A generated composition root binding eltér: ${root.id}.`);\n    }\n  }\n",
        )

    tests = ROOT / 'packages/forge/tests/composition.test.ts'
    source = tests.read_text(encoding='utf-8')
    marker = "  it('hiányzó bindingot, ciklust és lifetime mismatch-et jelez', async () => {"
    test = """  it('async function composition exportot is felismer', async () => {\n    const root = await fixture();\n    await file(root, 'src/composition/app.server.ts', \"import 'server-only'; export async function application() {}\\n\");\n    expect((await buildCompositionInventory(root)).issues).not.toContainEqual(expect.objectContaining({\n      code: 'COMPOSITION_ROOT_EXPORT_MISSING',\n    }));\n  });\n\n"""
    if marker not in source:
        raise RuntimeError('Composition test insertion point missing.')
    tests.write_text(source.replace(marker, test + marker, 1), encoding='utf-8')

    for relative in [
        '.github/workflows/apply-service-composition-fix.yml',
        'tools/fix-service-composition.py',
    ]:
        file = ROOT / relative
        if file.exists():
            file.unlink()


if __name__ == '__main__':
    main()
