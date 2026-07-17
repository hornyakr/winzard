import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  enableDocumentationCapabilities,
  loadProjectManifest,
  type WinzardManifest,
} from '../manifest';
import { generateAiAdapters } from './adapters';
import { assertDocumentationInventoryValid, buildDocumentationInventory } from './inventory';
import { syncConsumerDocumentationPack } from './consumer-pack';
import { writeJsonFile } from './generated';
import { generateDocumentationProjections } from './projections';
import { documentationScaffold } from './templates';
import { DocumentationCommandError } from './types';

const logicalDirectories = [
  'docs/00-home',
  'docs/10-product/capabilities',
  'docs/20-domain/glossary',
  'docs/20-domain/contexts',
  'docs/20-domain/models',
  'docs/20-domain/workflows',
  'docs/20-domain/rules',
  'docs/30-architecture/principles',
  'docs/30-architecture/adr',
  'docs/30-architecture/specifications',
  'docs/30-architecture/integrations',
  'docs/30-architecture/security',
  'docs/40-delivery/initiatives',
  'docs/40-delivery/tasks',
  'docs/40-delivery/handoffs',
  'docs/40-delivery/reviews',
  'docs/40-delivery/evidence',
  'docs/50-user-documentation/tutorials',
  'docs/50-user-documentation/how-to',
  'docs/50-user-documentation/reference',
  'docs/50-user-documentation/explanation',
  'docs/60-operations/environments',
  'docs/60-operations/runbooks',
  'docs/60-operations/releases',
  'docs/60-operations/incidents',
  'docs/70-ai/policies',
  'docs/70-ai/context-contracts',
  'docs/70-ai/adapters',
  'docs/70-ai/evals',
  'docs/80-winzard/manifest',
  'docs/80-winzard/platform-contracts',
  'docs/80-winzard/compatibility',
  'docs/80-winzard/upgrade-guides',
  'docs/90-generated/indexes',
  'docs/90-generated/traceability',
  'docs/90-generated/status',
  'docs/90-generated/ai-context',
  'docs/_templates',
  'docs/_assets',
  'docs/_system',
] as const;

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

export async function inferProjectPrefix(root: string): Promise<string> {
  const manifest = await loadProjectManifest(root);
  if (manifest.manifest?.documentation) return manifest.manifest.documentation.projectPrefix;
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { name?: unknown };
    if (typeof packageJson.name === 'string') {
      const inferred = packageJson.name
        .replace(/^@[^/]+\//u, '')
        .replace(/[^A-Za-z0-9]+/gu, ' ')
        .trim()
        .split(/\s+/u)[0]
        ?.toUpperCase()
        .slice(0, 12) ?? '';
      if (/^[A-Z][A-Z0-9]{1,11}$/u.test(inferred)) return inferred;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  throw new DocumentationCommandError(
    'DOCUMENTATION_PROJECT_PREFIX',
    'A projektprefix nem következtethető ki. Add meg a --prefix=ATLAS opciót.',
  );
}

export type DocumentationInitOptions = Readonly<{
  projectPrefix: string;
  includeAiDelivery: boolean;
  force?: boolean;
  date: string;
  consumerContractVersion?: string;
  consumerSourceDirectory?: string;
}>;

export type DocumentationInitResult = Readonly<{
  manifest: WinzardManifest;
  created: readonly string[];
  skipped: readonly string[];
  generated: readonly string[];
}>;

export async function initializeProjectDocumentation(
  root: string,
  options: DocumentationInitOptions,
): Promise<DocumentationInitResult> {
  const existing = await loadProjectManifest(root);
  if (!existing.manifest) {
    throw new DocumentationCommandError(
      'MANIFEST_INVALID',
      existing.failures.map(({ message }) => message).join(' '),
      existing.sourceFile ?? 'winzard manifest',
    );
  }
  if (!existing.manifest.capabilities.includes('forge')) {
    throw new DocumentationCommandError(
      'CAPABILITY_DEPENDENCY_MISSING',
      'A project-documentation capability megköveteli a forge capability-t.',
      existing.sourceFile ?? 'winzard manifest',
    );
  }
  if (existing.manifest.documentation) {
    const inventory = await buildDocumentationInventory(
      root,
      existing.manifest.documentation.projectPrefix,
    );
    assertDocumentationInventoryValid(inventory, 'A dokumentáció újrainicializálása');
  }

  const projectPrefix = options.projectPrefix.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,11}$/u.test(projectPrefix)) {
    throw new DocumentationCommandError(
      'DOCUMENTATION_PROJECT_PREFIX',
      'A project prefix 2–12 karakteres, nagybetűs, alfanumerikus érték legyen.',
    );
  }
  if (
    existing.manifest.documentation &&
    existing.manifest.documentation.projectPrefix !== projectPrefix
  ) {
    throw new DocumentationCommandError(
      'DOCUMENTATION_PROJECT_PREFIX_IMMUTABLE',
      `A projektprefix már rögzített: ${existing.manifest.documentation.projectPrefix}. Az azonosítóteret nem lehet átnevezni.`,
      existing.sourceFile ?? 'winzard manifest',
    );
  }

  await enableDocumentationCapabilities(root, {
    projectPrefix,
    includeAiDelivery: options.includeAiDelivery,
    consumerContractVersion: options.consumerContractVersion,
  });
  const loaded = await loadProjectManifest(root);
  if (!loaded.manifest) {
    throw new DocumentationCommandError(
      'MANIFEST_INVALID',
      loaded.failures.map(({ message }) => message).join(' '),
      loaded.sourceFile ?? 'winzard manifest',
    );
  }

  for (const directory of logicalDirectories) {
    await mkdir(path.join(root, directory), { recursive: true });
  }

  const created: string[] = [];
  const skipped: string[] = [];
  for (const descriptor of documentationScaffold(projectPrefix, options.date, options.includeAiDelivery)) {
    const target = path.join(root, descriptor.path);
    if (!options.force && await exists(target)) {
      skipped.push(descriptor.path);
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, descriptor.content, 'utf8');
    created.push(descriptor.path);
  }

  await writeJsonFile(path.join(root, 'docs/_system/documentation.json'), {
    schemaVersion: 1,
    contractVersion: loaded.manifest.documentation?.contractVersion,
    projectPrefix,
    capabilities: loaded.manifest.capabilities.filter((capability) =>
      capability === 'project-documentation' || capability === 'ai-delivery'),
    generatedBy: 'winzard-forge',
  });

  const generated: string[] = [];
  generated.push(...(await syncConsumerDocumentationPack(root, loaded.manifest, {
    ...(options.consumerSourceDirectory ? { sourceDirectory: options.consumerSourceDirectory } : {}),
  })));
  generated.push(...(await generateDocumentationProjections(root, loaded.manifest)));
  if (options.includeAiDelivery) generated.push(...(await generateAiAdapters(root, loaded.manifest)));

  return {
    manifest: loaded.manifest,
    created,
    skipped,
    generated,
  };
}
