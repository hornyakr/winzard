import { loadProjectManifest } from '../manifest';
import { loadExtensionState } from './state';
import type { CapabilityGraph, CapabilityNode, ExtensionIssue, ExtensionManifest } from './types';

function findCycles(edges: ReadonlyMap<string, readonly string[]>): readonly string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const keys = [...edges.keys()].sort();
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      if (index >= 0) cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const dependency of edges.get(node) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const key of keys) visit(key);
  const unique = new Map<string, string[]>();
  for (const cycle of cycles) unique.set(cycle.join(' -> '), cycle);
  return Object.freeze([...unique.values()].sort((left, right) => left.join().localeCompare(right.join())));
}

export async function buildCapabilityGraph(
  projectRoot: string,
  candidates: readonly ExtensionManifest[] = [],
): Promise<CapabilityGraph> {
  const manifestResult = await loadProjectManifest(projectRoot);
  const state = await loadExtensionState(projectRoot);
  const issues: ExtensionIssue[] = manifestResult.failures.map(({ code, file, message }) => ({
    severity: 'error',
    area: 'capability',
    code,
    file,
    message,
  }));
  const installed = new Set([
    ...(manifestResult.manifest?.capabilities ?? []),
    ...state.extensions.flatMap((extension) => extension.capabilities),
  ]);
  const providers = new Map<string, Set<string>>();
  const requiredBy = new Map<string, Set<string>>();
  const conflicts = new Map<string, Set<string>>();
  const edges = new Map<string, string[]>();
  const addProvider = (capability: string, provider: string): void => {
    const values = providers.get(capability) ?? new Set<string>();
    values.add(provider);
    providers.set(capability, values);
  };
  const addRequired = (capability: string, consumer: string): void => {
    const values = requiredBy.get(capability) ?? new Set<string>();
    values.add(consumer);
    requiredBy.set(capability, values);
  };
  for (const capability of manifestResult.manifest?.capabilities ?? []) addProvider(capability, 'project-manifest');
  for (const extension of state.extensions) {
    for (const capability of extension.capabilities) addProvider(capability, extension.name);
  }
  for (const extension of candidates) {
    edges.set(extension.name, [...extension.requires]);
    for (const capability of extension.provides) addProvider(capability, extension.name);
    for (const capability of extension.requires) addRequired(capability, extension.name);
    for (const capability of extension.conflicts) {
      const values = conflicts.get(capability) ?? new Set<string>();
      values.add(extension.name);
      conflicts.set(capability, values);
      if (installed.has(capability)) {
        issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_CONFLICT', file: extension.sourceFile, message: `${extension.name} ütközik ezzel a telepített capability-vel: ${capability}.` });
      }
    }
    for (const capability of extension.requires) {
      if (!installed.has(capability) && !candidates.some(({ provides: provided }) => provided.includes(capability))) {
        issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_UNKNOWN', file: extension.sourceFile, message: `${extension.name} hiányzó capability-t követel: ${capability}.` });
      }
    }
  }
  const cycles = findCycles(edges);
  for (const cycle of cycles) {
    issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_DEPENDENCY_CYCLE', file: 'extension graph', message: cycle.join(' -> ') });
  }
  const ids = new Set<string>([
    ...installed,
    ...providers.keys(),
    ...requiredBy.keys(),
    ...conflicts.keys(),
  ]);
  const nodes: CapabilityNode[] = [...ids].sort().map((id) => Object.freeze({
    id,
    providers: Object.freeze([...(providers.get(id) ?? [])].sort()),
    requiredBy: Object.freeze([...(requiredBy.get(id) ?? [])].sort()),
    conflicts: Object.freeze([...(conflicts.get(id) ?? [])].sort()),
    installed: installed.has(id),
  }));
  return Object.freeze({
    nodes: Object.freeze(nodes),
    cycles,
    issues: Object.freeze(issues.sort((left, right) => left.code.localeCompare(right.code) || left.file.localeCompare(right.file))),
  });
}

export function capabilityWhy(graph: CapabilityGraph, capability: string): readonly string[] {
  const node = graph.nodes.find(({ id }) => id === capability);
  if (!node) return [];
  return Object.freeze([
    `${node.id}${node.installed ? ' [installed]' : ''}`,
    ...node.providers.map((provider) => `provided by ${provider}`),
    ...node.requiredBy.map((consumer) => `required by ${consumer}`),
    ...node.conflicts.map((consumer) => `conflicts with ${consumer}`),
  ]);
}
