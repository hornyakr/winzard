from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    content = path.read_text(encoding='utf-8')
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{relative}: expected one match, found {count}')
    path.write_text(content.replace(old, new), encoding='utf-8')


def main() -> None:
    replace_once(
        'packages/forge/src/checks/project.ts',
        "  if (projectFile.startsWith('src/composition/') && !importsServerOnly) {\n    add('COMPOSITION_MISSING_SERVER_ONLY', 'A composition root fájlnak explicit server-only határt kell deklarálnia.');\n  }",
        "  const compositionDefinition = projectFile.endsWith('.composition.definition.ts');\n  if (projectFile.startsWith('src/composition/') && !compositionDefinition && !importsServerOnly) {\n    add('COMPOSITION_MISSING_SERVER_ONLY', 'A composition root fájlnak explicit server-only határt kell deklarálnia.');\n  }",
    )
    replace_once(
        'packages/forge/tests/project.test.ts',
        "  it('server-only határt kér a composition roothoz és a Node adapterhez', () => {\n    expect(inspect('src/composition/demo.ts', 'export const demo = {};')).toContainEqual(expect.objectContaining({ code: 'COMPOSITION_MISSING_SERVER_ONLY' }));\n    expect(inspect('src/modules/demo/infrastructure/node.ts', \"import { randomInt } from 'node:crypto';\")).toContainEqual(expect.objectContaining({ code: 'NODE_ADAPTER_MISSING_SERVER_ONLY' }));\n  });",
        "  it('server-only határt kér a runtime composition roothoz, de nem a statikus definition contracthoz', () => {\n    expect(inspect('src/composition/demo.ts', 'export const demo = {};')).toContainEqual(expect.objectContaining({ code: 'COMPOSITION_MISSING_SERVER_ONLY' }));\n    expect(inspect('src/composition/demo.composition.definition.ts', 'export const demo = defineComposition({});')).not.toContainEqual(expect.objectContaining({ code: 'COMPOSITION_MISSING_SERVER_ONLY' }));\n    expect(inspect('src/modules/demo/infrastructure/node.ts', \"import { randomInt } from 'node:crypto';\")).toContainEqual(expect.objectContaining({ code: 'NODE_ADAPTER_MISSING_SERVER_ONLY' }));\n  });",
    )
    replace_once(
        'packages/forge/assets/consumer-contract/platform-contracts/WZ-CONTRACT-COMPOSITION-001.md',
        "evidence:\n  - command:pnpm forge composition:check --project .\n  - command:pnpm forge composition:generate --check --project .",
        "evidence: []",
    )
    temporary = ROOT / '.github/workflows/stage3-service-composition-verification.yml'
    if temporary.exists():
        temporary.unlink()


if __name__ == '__main__':
    main()
