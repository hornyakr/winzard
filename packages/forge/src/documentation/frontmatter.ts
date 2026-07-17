import type {
  FrontmatterObject,
  FrontmatterRecord,
  FrontmatterValue,
  ParsedMarkdownDocument,
} from './types';
import { DocumentationCommandError } from './types';

type SignificantLine = Readonly<{
  number: number;
  indent: number;
  text: string;
}>;

type ParseResult = Readonly<{
  value: FrontmatterValue;
  next: number;
}>;

function indentation(raw: string, lineNumber: number): number {
  if (raw.includes('\t')) {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_TAB_INDENT',
      `A YAML frontmatter nem használhat tabulátoros behúzást (sor: ${lineNumber}).`,
    );
  }

  return raw.length - raw.trimStart().length;
}

function significantLines(source: string): readonly SignificantLine[] {
  const result: SignificantLine[] = [];
  const rawLines = source.replaceAll('\r\n', '\n').split('\n');

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    result.push({ number: index + 1, indent: indentation(raw, index + 1), text: raw.trimStart() });
  }

  return result;
}

function splitInlineList(source: string): readonly string[] {
  const values: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let nested = 0;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (quote === '"' && character === '\\') {
      current += character;
      escaped = true;
      continue;
    }

    if (quote !== null) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (character === '[' || character === '{') nested += 1;
    if (character === ']' || character === '}') nested -= 1;

    if (character === ',' && nested === 0) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (quote !== null || nested !== 0) {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_INLINE_INVALID',
      `Érvénytelen inline YAML érték: ${source}`,
    );
  }

  if (current.trim() !== '') values.push(current.trim());
  return values;
}

function parseSingleQuoted(value: string): string {
  if (!value.endsWith("'")) {
    throw new DocumentationCommandError('DOC_FRONTMATTER_QUOTE_INVALID', `Lezáratlan idézőjel: ${value}`);
  }
  return value.slice(1, -1).replaceAll("''", "'");
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as FrontmatterValue;
    } catch {
      throw new DocumentationCommandError('DOC_FRONTMATTER_QUOTE_INVALID', `Érvénytelen idézett string: ${trimmed}`);
    }
  }

  if (trimmed.startsWith("'")) return parseSingleQuoted(trimmed);

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const content = trimmed.slice(1, -1).trim();
    if (content === '') return [];
    return splitInlineList(content).map(parseScalar);
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const content = trimmed.slice(1, -1).trim();
    if (content === '') return {};
    const record: Record<string, FrontmatterValue> = {};
    for (const entry of splitInlineList(content)) {
      const pair = splitKeyValue(entry);
      if (pair === null) {
        throw new DocumentationCommandError('DOC_FRONTMATTER_INLINE_INVALID', `Érvénytelen inline objektum: ${trimmed}`);
      }
      record[pair.key] = parseScalar(pair.value);
    }
    return record;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }

  if (trimmed === '|' || trimmed === '>') {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_BLOCK_SCALAR_UNSUPPORTED',
      'A dokumentációs frontmatter nem használhat YAML block scalart; használj idézett stringet.',
    );
  }

  return trimmed;
}

function splitKeyValue(source: string): Readonly<{ key: string; value: string }> | null {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let nested = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') nested += 1;
    if (character === ']' || character === '}') nested -= 1;
    if (character === ':' && nested === 0) {
      const following = source[index + 1];
      if (following !== undefined && !/\s/u.test(following)) continue;
      const key = source.slice(0, index).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key)) return null;
      return { key, value: source.slice(index + 1).trim() };
    }
  }

  return null;
}

function parseMapping(
  lines: readonly SignificantLine[],
  start: number,
  indent: number,
  initial: Record<string, FrontmatterValue> = {},
): ParseResult {
  const record = initial;
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) {
      throw new DocumentationCommandError(
        'DOC_FRONTMATTER_INDENT_INVALID',
        `Váratlan behúzás a YAML frontmatter ${line.number}. sorában.`,
      );
    }
    if (line.text.startsWith('- ' ) || line.text === '-') break;

    const pair = splitKeyValue(line.text);
    if (pair === null) {
      throw new DocumentationCommandError(
        'DOC_FRONTMATTER_MAPPING_INVALID',
        `Érvénytelen YAML kulcs-érték pár a ${line.number}. sorban: ${line.text}`,
      );
    }
    if (Object.hasOwn(record, pair.key)) {
      throw new DocumentationCommandError(
        'DOC_FRONTMATTER_KEY_DUPLICATE',
        `Duplikált YAML kulcs a ${line.number}. sorban: ${pair.key}`,
      );
    }

    index += 1;
    if (pair.value !== '') {
      record[pair.key] = parseScalar(pair.value);
      continue;
    }

    const next = lines[index];
    if (!next || next.indent <= indent) {
      record[pair.key] = null;
      continue;
    }

    const child = parseBlock(lines, index, next.indent);
    record[pair.key] = child.value;
    index = child.next;
  }

  return { value: record, next: index };
}

function parseSequence(lines: readonly SignificantLine[], start: number, indent: number): ParseResult {
  const values: FrontmatterValue[] = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (!line || line.indent < indent) break;
    if (line.indent > indent) {
      throw new DocumentationCommandError(
        'DOC_FRONTMATTER_INDENT_INVALID',
        `Váratlan behúzás a YAML frontmatter ${line.number}. sorában.`,
      );
    }
    if (!(line.text.startsWith('- ') || line.text === '-')) break;

    const item = line.text === '-' ? '' : line.text.slice(2).trim();
    index += 1;

    if (item === '') {
      const next = lines[index];
      if (!next || next.indent <= indent) {
        values.push(null);
        continue;
      }
      const child = parseBlock(lines, index, next.indent);
      values.push(child.value);
      index = child.next;
      continue;
    }

    const pair = splitKeyValue(item);
    if (pair === null) {
      values.push(parseScalar(item));
      continue;
    }

    const record: Record<string, FrontmatterValue> = {};
    record[pair.key] = pair.value === '' ? null : parseScalar(pair.value);

    const next = lines[index];
    if (next && next.indent > indent) {
      const continuation = parseMapping(lines, index, next.indent, record);
      values.push(continuation.value);
      index = continuation.next;
    } else {
      values.push(record);
    }
  }

  return { value: values, next: index };
}

function parseBlock(lines: readonly SignificantLine[], start: number, indent: number): ParseResult {
  const first = lines[start];
  if (!first) return { value: {}, next: start };
  if (first.indent !== indent) {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_INDENT_INVALID',
      `Érvénytelen kezdő behúzás a YAML frontmatter ${first.number}. sorában.`,
    );
  }
  return first.text.startsWith('- ') || first.text === '-'
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
}

export function parseYamlFrontmatter(source: string): FrontmatterRecord {
  const lines = significantLines(source);
  if (lines.length === 0) return {};
  const result = parseBlock(lines, 0, lines[0]?.indent ?? 0);
  if (result.next !== lines.length || Array.isArray(result.value) || typeof result.value !== 'object' || result.value === null) {
    throw new DocumentationCommandError('DOC_FRONTMATTER_ROOT_INVALID', 'A YAML frontmatter gyökere objektum legyen.');
  }
  return { ...(result.value as Record<string, FrontmatterValue>) };
}

export function parseMarkdownDocument(
  source: string,
  filePath: string,
  projectPath = filePath,
): ParsedMarkdownDocument {
  const normalized = source.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_MISSING',
      'A kanonikus dokumentumnak YAML frontmatterrel kell kezdődnie.',
      projectPath,
    );
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) {
    throw new DocumentationCommandError(
      'DOC_FRONTMATTER_UNCLOSED',
      'A YAML frontmatter lezáró --- sora hiányzik.',
      projectPath,
    );
  }

  const frontmatterSource = normalized.slice(4, closing);
  const body = normalized.slice(closing + 5);

  return {
    filePath,
    projectPath,
    source: normalized,
    body,
    metadata: parseYamlFrontmatter(frontmatterSource),
    frontmatterSource,
  };
}

function simpleString(value: string): boolean {
  return /^[A-Za-z0-9_./@*+-]+$/u.test(value) && !['true', 'false', 'null', '~'].includes(value);
}

function serializeScalar(value: FrontmatterValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return simpleString(value) ? value : JSON.stringify(value);
  throw new DocumentationCommandError('DOC_FRONTMATTER_SERIALIZE_INVALID', 'Komplex érték nem írható skalárként.');
}

function serializeNode(value: FrontmatterValue, indent: number): readonly string[] {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    const lines: string[] = [];
    for (const item of value) {
      if (Array.isArray(item) || (typeof item === 'object' && item !== null)) {
        if (!Array.isArray(item)) {
          const entries = Object.entries(item as FrontmatterObject);
          if (entries.length === 0) {
            lines.push(`${prefix}- {}`);
            continue;
          }
          const [[firstKey, firstValue], ...rest] = entries;
          if (Array.isArray(firstValue) || (typeof firstValue === 'object' && firstValue !== null)) {
            lines.push(`${prefix}- ${firstKey}:`);
            lines.push(...serializeNode(firstValue, indent + 4));
          } else {
            lines.push(`${prefix}- ${firstKey}: ${serializeScalar(firstValue)}`);
          }
          for (const [key, child] of rest) {
            if (Array.isArray(child) || (typeof child === 'object' && child !== null)) {
              lines.push(`${prefix}  ${key}:`);
              lines.push(...serializeNode(child, indent + 4));
            } else {
              lines.push(`${prefix}  ${key}: ${serializeScalar(child)}`);
            }
          }
        } else {
          lines.push(`${prefix}-`);
          lines.push(...serializeNode(item, indent + 2));
        }
      } else if (item === null) {
        lines.push(`${prefix}-`);
      } else {
        lines.push(`${prefix}- ${serializeScalar(item)}`);
      }
    }
    return lines;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${prefix}{}`];
    const lines: string[] = [];
    for (const [key, child] of entries) {
      if (Array.isArray(child) || (typeof child === 'object' && child !== null)) {
        if (Array.isArray(child) && child.length === 0) {
          lines.push(`${prefix}${key}: []`);
        } else if (!Array.isArray(child) && Object.keys(child).length === 0) {
          lines.push(`${prefix}${key}: {}`);
        } else {
          lines.push(`${prefix}${key}:`);
          lines.push(...serializeNode(child, indent + 2));
        }
      } else if (child === null) {
        lines.push(`${prefix}${key}:`);
      } else {
        lines.push(`${prefix}${key}: ${serializeScalar(child)}`);
      }
    }
    return lines;
  }

  return [`${prefix}${serializeScalar(value)}`];
}

export function serializeYamlFrontmatter(metadata: Readonly<Record<string, FrontmatterValue>>): string {
  return `${serializeNode(metadata, 0).join('\n')}\n`;
}

export function renderMarkdownDocument(
  metadata: Readonly<Record<string, FrontmatterValue>>,
  body: string,
): string {
  const normalizedBody = body.replaceAll('\r\n', '\n').trimStart();
  return `---\n${serializeYamlFrontmatter(metadata)}---\n\n${normalizedBody.endsWith('\n') ? normalizedBody : `${normalizedBody}\n`}`;
}
