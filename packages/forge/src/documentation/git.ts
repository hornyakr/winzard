import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function currentGitCommit(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const commit = stdout.trim();
    return /^[0-9a-f]{7,64}$/u.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

export async function gitChangedFiles(
  root: string,
  base: string,
  head = 'HEAD',
): Promise<readonly string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-status', '-z', '--diff-filter=ACMRD', `${base}...${head}`],
      { cwd: root, encoding: 'utf8' },
    );
    const tokens = stdout.split('\0');
    const files = new Set<string>();
    let index = 0;
    while (index < tokens.length) {
      const status = tokens[index++]?.trim();
      if (!status) continue;
      const firstPath = tokens[index++];
      if (!firstPath) return null;
      files.add(firstPath);
      if (status.startsWith('R') || status.startsWith('C')) {
        const secondPath = tokens[index++];
        if (!secondPath) return null;
        files.add(secondPath);
      }
    }
    return [...files].sort();
  } catch {
    return null;
  }
}

export async function gitWorkingTreeFiles(root: string): Promise<readonly string[] | null> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    });
    return stdout
      .replaceAll('\r\n', '\n')
      .split('\n')
      .map((line) => line.length >= 4 ? line.slice(3).trim() : '')
      .filter(Boolean)
      .sort();
  } catch {
    return null;
  }
}

export async function gitCommitIsAncestor(
  root: string,
  ancestor: string,
  head = 'HEAD',
): Promise<boolean | null> {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', ancestor, head], {
      cwd: root,
      encoding: 'utf8',
    });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 1) return false;
    return null;
  }
}
