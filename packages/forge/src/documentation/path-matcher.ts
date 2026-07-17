function escapeRegex(character: string): string {
  return /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character;
}

export function globToRegExp(glob: string): RegExp {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index] ?? '';
    if (character === '*') {
      const next = glob[index + 1];
      if (next === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          pattern += '(?:.*/)?';
        } else {
          pattern += '.*';
        }
      } else {
        pattern += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      pattern += '[^/]';
      continue;
    }
    pattern += escapeRegex(character);
  }
  return new RegExp(`${pattern}$`, 'u');
}

export function matchesAnyPath(projectPath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(projectPath));
}
