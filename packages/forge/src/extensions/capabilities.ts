import { loadProjectManifest } from '../manifest';
import { loadExtensionState } from './state';
import type { CapabilityGraph, CapabilityNode, ExtensionIssue, ExtensionManifest, InstalledExtensionState } from './types';

type ExtensionNode = Readonly<{
  name: string;
  file: string;
  provides: readonly string[];
  requires: readonly string[];
  conflicts: readonly string[];
  installed: boolean;
}>;

function installedNode(extension: InstalledExtensionState): ExtensionNode {
  return Object.freeze({
    name: extension.name,
    file: '.winzard/state/extensions.json',
    provides: extension.capabilities,
    requires: extension.requires ?? [],
    conflicts: extension.conflicts ?? [],
    installed: true,
  });
}

function candidateNode(extension: ExtensionManifest): ExtensionNode {
  return Object.freeze({
    name: extension.name,
    file: extension.sourceFile,
    provides: extension.provides,
    requires: extension.requires,
    conflicts: extension.conflicts,
    installed: false,
  });
}

function cycles(edges: ReadonlyMap<string, readonly string[]>): readonly string[][] {
  const found = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) {
        const cycle = [...stack.slice(start), node];
        const body = cycle.slice(0, -1);
        const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
        const canonical = rotations.map((item) => item.join(' -> ')).sort()[0] ?? body.join(' -> ');
        const selected = rotations.find((item) => item.join(' -> ') === canonical) ?? body;
        found.set(canonical, [...selected, selected[0] ?? node]);
      }
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
  for (const node of [...edges.keys()].sort()) visit(node);
  return Object.freeze([...found.values()].sort((left, right) => left.join().localeCompare(right.join())));
}

export async function buildCapabilityGraph(projectRoot: string, candidates: readonly ExtensionManifest[] = []): Promise<CapabilityGraph> {
  const project = await loadProjectManifest(projectRoot);
  const state = await loadExtensionState(projectRoot);
  const issues: ExtensionIssue[] = project.failures.map(({ code, file, message }) => ({ severity: 'error', area: 'capability', code, file, message }));
  const extensionMap = new Map<string, ExtensionNode>();
  for (const extension of state.extensions) extensionMap.set(extension.name, installedNode(extension));
  for (const extension of candidates) extensionMap.set(extension.name, candidateNode(extension));
  const extensions = [...extensionMap.values()].sort((left, right) => left.name.localeCompare(right.name));
  const projectCapabilities = new Set(project.manifest?.capabilities ?? []);
  const installedCapabilities = new Set([...projectCapabilities, ...state.extensions.flatMap((item) => item.capabilities)]);
  const providers = new Map<string, Set<string>>();
  const requiredBy = new Map<string, Set<string>>();
  const conflictMap = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, capability: string, value: string): void => {
    const values = map.get(capability) ?? new Set<string>();
    values.add(value);
    map.set(capability, values);
  };
  for (const capability of projectCapabilities) add(providers, capability, 'project-manifest');
  for (const extension of extensions) {
    for (const capability of extension.provides) add(providers, capability, extension.name);
    for (const capability of extension.requires) add(requiredBy, capability, extension.name);
    for (const capability of extension.conflicts) add(conflictMap, capability, extension.name);
  }
  for (const extension of extensions) {
    for (const required of extension.requires) {
      if ((providers.get(required)?.size ?? 0) === 0) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_UNKNOWN', file: extension.file, message: `${extension.name} hiányzó capability-t követel: ${required}.` });
    }
    for (const conflict of extension.conflicts) {
      const active = installedCapabilities.has(conflict) || extensions.some((item) => item.name !== extension.name && item.provides.includes(conflict));
      if (active) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_CAPABILITY_CONFLICT', file: extension.file, message: `${extension.name} ütközik ezzel a capability-vel: ${conflict}.` });
    }
  }
  const edges = new Map<string, readonly string[]>();
  for (const extension of extensions) {
    const dependencies = new Set<string>();
    for (const required of extension.requires) {
      if (projectCapabilities.has(required)) continue;
      const extensionProviders = [...(providers.get(required) ?? [])].filter((provider) => provider !== 'project-manifest' && provider !== extension.name);
      if (extensionProviders.length === 1) dependencies.add(extensionProviders[0] ?? '');
    }
    edges.set(extension.name, Object.freeze([...dependencies].filter(Boolean).sort()));
  }
  const dependencyCycles = cycles(edges);
  for (const cycle of dependencyCycles) issues.push({ severity: 'error', area: 'capability', code: 'EXTENSION_DEPENDENCY_CYCLE', file: 'extension graph', message: cycle.join(' -> ') });
  const ids = new Set([...installedCapabilities, ...providers.keys(), ...requiredBy.keys(), ...conflictMap.keys()]);
  const nodes: CapabilityNode[] = [...ids].sort().map((id) => Object.freeze({
    id,
    providers: Object.freeze([...(providers.get(id) ?? [])].sort()),
    requiredBy: Object.freeze([...(requiredBy.get(id) ?? [])].sort()),
    conflicts: Object.freeze([...(conflictMap.get(id) ?? [])].sort()),
    installed: installedCapabilities.has(id),
  }));
  return Object.freeze({ nodes: Object.freeze(nodes), cycles: dependencyCycles, issues: Object.freeze(issues.sort((left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code))) });
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
