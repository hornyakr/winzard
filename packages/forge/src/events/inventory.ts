import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { isEventJsonObject, parseEventDefinitions, type EventJsonLiteral, type EventJsonObject } from './ast';
import {
  EVENT_CATEGORIES,
  EVENT_CLASSIFICATIONS,
  EVENT_FAILURE_POLICIES,
  EVENT_PHASES,
  type EventCategory,
  type EventClassification,
  type EventDefinitionRecord,
  type EventFailurePolicy,
  type EventHandlerDefinitionRecord,
  type EventInventory,
  type EventIssue,
  type EventPhase,
  type EventRecord,
} from './types';

const IGNORED = new Set(['node_modules', '.next', 'generated']);
const PHASE_INDEX = new Map(EVENT_PHASES.map((phase, index) => [phase, index]));
const DEFINITION_FIELDS = new Set(['schemaVersion', 'id', 'events']);
const EVENT_FIELDS = new Set(['id', 'type', 'category', 'version', 'source', 'export', 'producer', 'payloadSchema', 'classification', 'tenantScoped', 'aliases', 'handlers']);
const HANDLER_FIELDS = new Set(['id', 'source', 'export', 'phase', 'failurePolicy', 'before', 'after', 'consumerId', 'idempotent', 'maximumAttempts']);

function text(value: EventJsonLiteral | undefined): string | null { return typeof value === 'string' && value.trim() !== '' ? value.trim() : null; }
function integer(value: EventJsonLiteral | undefined): number | null { return typeof value === 'number' && Number.isInteger(value) ? value : null; }
function bool(value: EventJsonLiteral | undefined, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback; }
function strings(value: EventJsonLiteral | undefined): readonly string[] {
  return Array.isArray(value) ? Object.freeze(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)) : Object.freeze([]);
}
function enumValue<T extends string>(value: EventJsonLiteral | undefined, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}
function issue(issues: EventIssue[], value: EventIssue): void { issues.push(Object.freeze(value)); }
function unknownFields(value: EventJsonObject, allowed: ReadonlySet<string>, file: string, issues: EventIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_UNKNOWN_FIELD', file, message: `Ismeretlen event definition mező: ${key}.` });
}
async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }
async function files(directory: string): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const output: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !IGNORED.has(entry.name)) output.push(...await files(target));
    else if (entry.isFile() && entry.name.endsWith('.event.definition.ts')) output.push(target);
  }
  return output.sort();
}
function handlerRecord(value: EventJsonObject, file: string, issues: EventIssue[]): EventHandlerDefinitionRecord | null {
  unknownFields(value, HANDLER_FIELDS, file, issues);
  const id = text(value.id); const source = text(value.source); const exportName = text(value.export);
  const phase = enumValue(value.phase, EVENT_PHASES); const failurePolicy = enumValue(value.failurePolicy, EVENT_FAILURE_POLICIES);
  if (!id || !source || !exportName || !phase || !failurePolicy) {
    issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_HANDLER_CONTRACT_INVALID', file, message: 'A handler id/source/export/phase/failurePolicy mezői kötelezők és érvényesek legyenek.' });
    return null;
  }
  const maximumAttempts = integer(value.maximumAttempts);
  if ((failurePolicy === 'retry-durable' || failurePolicy === 'dead-letter') && (!bool(value.idempotent) || maximumAttempts === null || maximumAttempts < 1)) {
    issue(issues, { severity: 'error', area: 'delivery', code: 'EVENT_HANDLER_DURABLE_POLICY_INVALID', file, handlerId: id, message: 'Durable retry/dead-letter handlerhez idempotent=true és pozitív maximumAttempts szükséges.' });
  }
  return Object.freeze({ id, source, exportName, phase, failurePolicy, before: strings(value.before), after: strings(value.after), consumerId: text(value.consumerId), idempotent: bool(value.idempotent), maximumAttempts });
}
function parseEvent(value: EventJsonObject, definitionId: string, definitionFile: string, issues: EventIssue[]): EventRecord | null {
  unknownFields(value, EVENT_FIELDS, definitionFile, issues);
  const id = text(value.id); const type = text(value.type); const category = enumValue(value.category, EVENT_CATEGORIES);
  const version = integer(value.version); const source = text(value.source); const exportName = text(value.export); const producer = text(value.producer);
  const classification = enumValue(value.classification, EVENT_CLASSIFICATIONS);
  if (!id || !type || !category || version === null || version < 1 || !source || !exportName || !producer || !classification) {
    issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_CONTRACT_INVALID', file: definitionFile, message: 'Az event id/type/category/version/source/export/producer/classification mezői kötelezők és érvényesek.' });
    return null;
  }
  const payloadSchema = text(value.payloadSchema);
  if (category === 'integration' && payloadSchema === null) issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_INTEGRATION_SCHEMA_MISSING', file: definitionFile, eventType: type, message: 'Integration eventhez payloadSchema kötelező.' });
  const handlers: EventHandlerDefinitionRecord[] = [];
  if (Array.isArray(value.handlers)) for (const raw of value.handlers) {
    if (!isEventJsonObject(raw)) issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_HANDLER_CONTRACT_INVALID', file: definitionFile, eventType: type, message: 'A handler definition objektum legyen.' });
    else { const parsed = handlerRecord(raw, definitionFile, issues); if (parsed) handlers.push(parsed); }
  }
  return Object.freeze({ definitionId, definitionFile, id, type, category, version, source, exportName, producer, payloadSchema, classification, tenantScoped: bool(value.tenantScoped), aliases: strings(value.aliases), handlers: Object.freeze(handlers) });
}
function orderedHandlers(event: EventRecord, issues: EventIssue[]): readonly EventHandlerDefinitionRecord[] {
  const byId = new Map(event.handlers.map((handler) => [handler.id, handler]));
  const edges = new Map<string, Set<string>>(event.handlers.map(({ id }) => [id, new Set()]));
  const indegree = new Map(event.handlers.map(({ id }) => [id, 0]));
  for (const handler of event.handlers) {
    for (const dependency of handler.after) {
      if (!byId.has(dependency)) { issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_HANDLER_UNKNOWN_DEPENDENCY', file: event.definitionFile, eventType: event.type, handlerId: handler.id, message: `Ismeretlen after dependency: ${dependency}.` }); continue; }
      if (!edges.get(dependency)?.has(handler.id)) { edges.get(dependency)?.add(handler.id); indegree.set(handler.id, (indegree.get(handler.id) ?? 0) + 1); }
    }
    for (const dependent of handler.before) {
      if (!byId.has(dependent)) { issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_HANDLER_UNKNOWN_DEPENDENCY', file: event.definitionFile, eventType: event.type, handlerId: handler.id, message: `Ismeretlen before dependency: ${dependent}.` }); continue; }
      if (!edges.get(handler.id)?.has(dependent)) { edges.get(handler.id)?.add(dependent); indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1); }
    }
  }
  const sort = (items: EventHandlerDefinitionRecord[]) => items.sort((left, right) => (PHASE_INDEX.get(left.phase) ?? 99) - (PHASE_INDEX.get(right.phase) ?? 99) || left.id.localeCompare(right.id));
  const ready = sort(event.handlers.filter(({ id }) => (indegree.get(id) ?? 0) === 0));
  const result: EventHandlerDefinitionRecord[] = [];
  while (ready.length > 0) {
    const current = ready.shift(); if (!current) break; result.push(current);
    for (const next of [...(edges.get(current.id) ?? [])].sort()) { indegree.set(next, (indegree.get(next) ?? 1) - 1); if ((indegree.get(next) ?? 0) === 0) { const value = byId.get(next); if (value) { ready.push(value); sort(ready); } } }
  }
  if (result.length !== event.handlers.length) issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_HANDLER_DEPENDENCY_CYCLE', file: event.definitionFile, eventType: event.type, message: 'A handler dependency graph ciklust tartalmaz.' });
  return Object.freeze(result.length === event.handlers.length ? result : [...event.handlers].sort((a, b) => a.id.localeCompare(b.id)));
}
export async function buildEventInventory(root: string): Promise<EventInventory> {
  const issues: EventIssue[] = []; const definitions: EventDefinitionRecord[] = []; const events: EventRecord[] = [];
  for (const file of await files(path.join(root, 'src'))) {
    const projectFile = path.relative(root, file).split(path.sep).join('/');
    let parsed;
    try { parsed = parseEventDefinitions(projectFile, await readFile(file, 'utf8')); } catch (error) { issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_DEFINITION_PARSE', file: projectFile, message: error instanceof Error ? error.message : String(error) }); continue; }
    for (const definition of parsed) {
      unknownFields(definition.value, DEFINITION_FIELDS, projectFile, issues);
      const id = text(definition.value.id);
      if (definition.value.schemaVersion !== 1 || !id || !Array.isArray(definition.value.events)) { issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_DEFINITION_INVALID', file: projectFile, message: 'A definition schemaVersion=1, id és events tömb mezőket igényel.' }); continue; }
      const definitionEvents: string[] = [];
      for (const raw of definition.value.events) {
        if (!isEventJsonObject(raw)) { issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_CONTRACT_INVALID', file: projectFile, message: 'Az events elemei objektumok legyenek.' }); continue; }
        const event = parseEvent(raw, id, projectFile, issues); if (event) { events.push(event); definitionEvents.push(event.type); }
      }
      definitions.push(Object.freeze({ id, file: projectFile, exportName: definition.exportName, events: Object.freeze(definitionEvents) }));
    }
  }
  const eventIds = new Set<string>();
  const eventTypes = new Set<string>();
  const handlerIds = new Set<string>();
  const aliases = new Set<string>();
  for (const event of events) {
    if (eventIds.has(event.id)) issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_DUPLICATE_ID', file: event.definitionFile, eventType: event.type, message: `Duplikált event ID: ${event.id}.` });
    if (eventTypes.has(event.type)) issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_DUPLICATE_TYPE', file: event.definitionFile, eventType: event.type, message: `Duplikált event type: ${event.type}.` });
    eventIds.add(event.id);
    eventTypes.add(event.type);
    for (const alias of event.aliases) {
      if (eventIds.has(alias) || eventTypes.has(alias) || aliases.has(alias)) issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_ALIAS_DUPLICATE', file: event.definitionFile, eventType: event.type, message: `Duplikált event alias: ${alias}.` });
      aliases.add(alias);
    }
    for (const handler of event.handlers) { if (handlerIds.has(handler.id)) issue(issues, { severity: 'error', area: 'registry', code: 'EVENT_HANDLER_DUPLICATE_ID', file: event.definitionFile, eventType: event.type, handlerId: handler.id, message: `Duplikált handler ID: ${handler.id}.` }); handlerIds.add(handler.id); }
    for (const target of [event.source, event.producer, ...event.handlers.map(({ source }) => source)]) if (!await exists(path.join(root, target))) issue(issues, { severity: 'error', area: 'contract', code: 'EVENT_SOURCE_MISSING', file: event.definitionFile, eventType: event.type, message: `Hiányzó source: ${target}.` });
  }
  const sortedEvents = events.map((event) => Object.freeze({ ...event, handlers: orderedHandlers(event, issues) })).sort((a, b) => a.type.localeCompare(b.type));
  const canonical = { definitions: [...definitions].sort((a, b) => a.id.localeCompare(b.id)), events: sortedEvents };
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return Object.freeze({ schemaVersion: 1, projectRoot: '.', definitions: Object.freeze(canonical.definitions), events: Object.freeze(sortedEvents), issues: Object.freeze(issues.sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code))), fingerprint });
}
export function inspectEvents(inventory: EventInventory, query: string): readonly EventRecord[] {
  const normalized = query.trim().toLowerCase();
  return inventory.events.filter((event) => [event.id, event.type, event.source, event.producer, ...event.aliases, ...event.handlers.flatMap((handler) => [handler.id, handler.consumerId ?? ''])].some((value) => value.toLowerCase().includes(normalized)));
}
