import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type {
  KernelConfigurationInventory,
  KernelConfigurationIssue,
} from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'node_modules', 'coverage', 'generated']);

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...await collectSourceFiles(target));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(target);
    }
  }
  return files.sort();
}

function issue(code: string, file: string, message: string): KernelConfigurationIssue {
  return { severity: 'error', area: 'security', code, file, message };
}

export async function scanKernelConfigurationSources(
  root: string,
): Promise<readonly KernelConfigurationIssue[]> {
  const issues: KernelConfigurationIssue[] = [];
  for (const filePath of await collectSourceFiles(path.join(root, 'src'))) {
    const file = path.relative(root, filePath).split(path.sep).join('/');
    const source = await readFile(filePath, 'utf8');
    if (/\b(?:process\.env\.)?APP_SECRET\b/u.test(source)) {
      issues.push(issue(
        'KERNEL_GLOBAL_SECRET_USED',
        file,
        'Globális APP_SECRET tiltott; használj capability-specifikus, rotálható keyringet.',
      ));
    }
    if (
      /headers\.get\(\s*['"](?:forwarded|x-forwarded-(?:for|host|proto|port|prefix))['"]\s*\)/iu.test(source) &&
      !file.endsWith('platform/kernel-config/proxy-trust.ts') &&
      file !== 'src/proxy.ts'
    ) {
      issues.push(issue(
        'KERNEL_TRUSTED_HEADER_UNSAFE',
        file,
        'Forwardolt header kizárólag a proxy trust adapteren keresztül olvasható.',
      ));
    }
    if (
      /['"]X-(?:Accel-Redirect|Sendfile)['"]/u.test(source) &&
      !file.endsWith('platform/kernel-config/file-offload.server.ts')
    ) {
      issues.push(issue(
        'KERNEL_X_SENDFILE_UNSAFE',
        file,
        'File-offload header csak az authorizált internal URI adapterben képezhető.',
      ));
    }
    if (
      /process\.stdout\.isTTY|Boolean\(process\.env\.PORT\)|process\.argv\.includes\(\s*['"]--worker['"]\s*\)/u.test(source)
    ) {
      issues.push(issue(
        'KERNEL_RUNTIME_MODE_AMBIGUOUS',
        file,
        'A runtime mode nem oldható fel TTY-, PORT- vagy ad hoc argv-heurisztikából.',
      ));
    }
  }
  return issues;
}

export function kernelRuntimeIssues(
  inventory: KernelConfigurationInventory,
): readonly KernelConfigurationIssue[] {
  return inventory.issues.filter(({ area }) => area === 'runtime' || area === 'build');
}

export function kernelProxyIssues(
  inventory: KernelConfigurationInventory,
): readonly KernelConfigurationIssue[] {
  return inventory.issues.filter(({ area }) => area === 'proxy' || area === 'host');
}

export function kernelLocaleIssues(
  inventory: KernelConfigurationInventory,
): readonly KernelConfigurationIssue[] {
  return inventory.issues.filter(({ area }) => area === 'locale');
}
