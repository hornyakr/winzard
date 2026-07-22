import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { pathContained } from './project-paths';
import type {
  ArtifactComparison,
  ArtifactFileRecord,
  ArtifactManifest,
} from './types';

const IGNORED_DIRECTORIES = new Set(['cache', '.git', 'node_modules']);
const IGNORED_FILES = new Set(['trace', 'trace-build']);
const VOLATILE_PREVIEW_FIELDS = new Set([
  'previewModeId',
  'previewModeSigningKey',
  'previewModeEncryptionKey',
]);

async function collectFiles(root: string, directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...await collectFiles(root, target));
    } else if (entry.isSymbolicLink()) {
      throw new Error(`A reproducibility manifest nem követ symlinket: ${path.relative(root, target)}`);
    } else if (entry.isFile()) {
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (!IGNORED_FILES.has(relative)) files.push(target);
    }
  }
  return files.sort();
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJsonValue(value: unknown, parentKey = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalJsonValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        parentKey === 'preview' && VOLATILE_PREVIEW_FIELDS.has(key)
          ? '[volatile-preview-secret]'
          : canonicalJsonValue(item, key),
      ]),
  );
}

function canonicalArtifactContent(relative: string, content: Uint8Array): Uint8Array {
  if (relative !== 'prerender-manifest.json') return content;
  const parsed = JSON.parse(Buffer.from(content).toString('utf8')) as unknown;
  return Buffer.from(`${JSON.stringify(canonicalJsonValue(parsed))}
`, 'utf8');
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function createArtifactManifest(
  projectRoot: string,
  artifactInput = '.next',
): Promise<ArtifactManifest> {
  const root = await realpath(projectRoot);
  const artifact = path.resolve(root, artifactInput);
  const realArtifact = await realpath(artifact);
  if (!pathContained(root, realArtifact)) {
    throw new Error('Az artifact path a projektgyökéren kívülre mutat.');
  }
  const files: ArtifactFileRecord[] = [];
  for (const filePath of await collectFiles(realArtifact, realArtifact)) {
    await lstat(filePath);
    const relative = path.relative(realArtifact, filePath).split(path.sep).join('/');
    const content = canonicalArtifactContent(relative, await readFile(filePath));
    files.push({
      path: relative,
      bytes: content.byteLength,
      sha256: sha256(content),
    });
  }
  const canonical = JSON.stringify(files);
  return Object.freeze({
    schemaVersion: 1,
    artifact: path.relative(root, realArtifact).split(path.sep).join('/'),
    files: Object.freeze(files),
    sha256: sha256(canonical),
  });
}

export function compareArtifactManifests(
  left: ArtifactManifest,
  right: ArtifactManifest,
): ArtifactComparison {
  const leftFiles = new Map(left.files.map((file) => [file.path, file]));
  const rightFiles = new Map(right.files.map((file) => [file.path, file]));
  const added = [...rightFiles.keys()].filter((file) => !leftFiles.has(file)).sort();
  const removed = [...leftFiles.keys()].filter((file) => !rightFiles.has(file)).sort();
  const changed = [...leftFiles.keys()].filter((file) => {
    const rightFile = rightFiles.get(file);
    const leftFile = leftFiles.get(file);
    return rightFile && leftFile && (
      leftFile.bytes !== rightFile.bytes || leftFile.sha256 !== rightFile.sha256
    );
  }).sort();
  return Object.freeze({
    equal: added.length === 0 && removed.length === 0 && changed.length === 0,
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
  });
}
