from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / 'tools/finalize-service-composition-contract.py'
source = target.read_text(encoding='utf-8')
old = """    replace_once(
        'docs/development/service-composition-platform-implementation.md',
        '- nine Forge composition/service commands;',
        '- nine Forge composition/service commands, all published through the global `forge list` surface;',
    )
"""
new = """    replace_once(
        'docs/development/service-composition-platform-implementation.md',
        '- human and JSON Forge diagnostics.',
        '- human and JSON Forge diagnostics;\\n- all nine composition/service commands published through the global `forge list` surface.',
    )
"""
if source.count(old) != 1:
    raise RuntimeError(f'finalizer repair target count is {source.count(old)}')
target.write_text(source.replace(old, new, 1), encoding='utf-8')
