import { createHash } from 'node:crypto';

import type {
  PrismaEnumRecord,
  PrismaFieldRecord,
  PrismaModelRecord,
  PrismaSchemaInventory,
} from './types';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function block(source: string, kind: string, name: string): string | null {
  const expression = new RegExp(`\\b${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u');
  return expression.exec(source)?.[1] ?? null;
}

function namesFromDirective(value: string): readonly string[] {
  const content = /\[([^\]]*)\]/u.exec(value)?.[1] ?? '';
  return content
    .split(',')
    .map((item) => item.trim().replace(/\(.+\)$/u, ''))
    .filter(Boolean);
}

function parseField(line: string): PrismaFieldRecord | null {
  const match = /^(\w+)\s+([\w.]+)(\?|\[\])?\s*(.*)$/u.exec(line.trim());
  if (!match || line.trim().startsWith('@@')) return null;
  const [, name = '', type = '', suffix = '', attributes = ''] = match;
  return Object.freeze({
    name,
    type,
    optional: suffix === '?',
    list: suffix === '[]',
    id: /(?:^|\s)@id(?:\s|$|\()/u.test(attributes),
    unique: /(?:^|\s)@unique(?:\s|$|\()/u.test(attributes),
    relation: /@relation(?:\s|\()/u.test(attributes),
    nativeType: /@db\.([\w]+(?:\([^)]*\))?)/u.exec(attributes)?.[1] ?? null,
    mappedName: /@map\(\s*"([^"]+)"\s*\)/u.exec(attributes)?.[1] ?? null,
    defaultValue: /@default\(([^)]*(?:\([^)]*\)[^)]*)*)\)/u.exec(attributes)?.[1] ?? null,
  });
}

function parseModel(name: string, body: string): PrismaModelRecord {
  const lines = body
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/u, '').trim())
    .filter(Boolean);
  const fields = lines.map(parseField).filter((value): value is PrismaFieldRecord => value !== null);
  const ids = fields.filter(({ id }) => id).map(({ name: fieldName }) => fieldName);
  const uniqueConstraints: string[][] = fields
    .filter(({ unique }) => unique)
    .map(({ name: fieldName }) => [fieldName]);
  const indexes: string[][] = [];
  let mappedName: string | null = null;

  for (const line of lines) {
    if (line.startsWith('@@id')) ids.push(...namesFromDirective(line));
    if (line.startsWith('@@unique')) uniqueConstraints.push([...namesFromDirective(line)]);
    if (line.startsWith('@@index')) indexes.push([...namesFromDirective(line)]);
    if (line.startsWith('@@map')) mappedName = /@@map\(\s*"([^"]+)"\s*\)/u.exec(line)?.[1] ?? null;
  }

  return Object.freeze({
    name,
    mappedName,
    fields: Object.freeze(fields),
    ids: Object.freeze([...new Set(ids)]),
    uniqueConstraints: Object.freeze(uniqueConstraints.map((constraint) => Object.freeze(constraint))),
    indexes: Object.freeze(indexes.map((index) => Object.freeze(index))),
  });
}

export function parsePrismaSchema(source: string, file = 'prisma/schema.prisma'): PrismaSchemaInventory {
  const models: PrismaModelRecord[] = [];
  const enums: PrismaEnumRecord[] = [];
  for (const match of source.matchAll(/\bmodel\s+(\w+)\s*\{/gu)) {
    const name = match[1] ?? '';
    const body = block(source, 'model', name);
    if (body !== null) models.push(parseModel(name, body));
  }
  for (const match of source.matchAll(/\benum\s+(\w+)\s*\{/gu)) {
    const name = match[1] ?? '';
    const body = block(source, 'enum', name);
    if (body !== null) {
      enums.push(Object.freeze({
        name,
        values: Object.freeze(body.split('\n')
          .map((line) => line.replace(/\/\/.*$/u, '').trim())
          .filter((line) => /^\w+$/u.test(line))),
      }));
    }
  }
  const provider = /datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/u.exec(source)?.[1] ?? null;
  const generatorProvider = /generator\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/u.exec(source)?.[1] ?? null;
  return Object.freeze({
    file,
    provider,
    generatorProvider,
    models: Object.freeze(models.sort((left, right) => left.name.localeCompare(right.name))),
    enums: Object.freeze(enums.sort((left, right) => left.name.localeCompare(right.name))),
    fingerprint: sha256(source.replace(/\r\n/gu, '\n')),
  });
}
