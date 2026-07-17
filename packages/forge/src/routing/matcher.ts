import type { DynamicSegment, HttpMethod, RouteInventory, RouteMatch, RouteRecord } from './types';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function routeSegments(pattern: string): readonly string[] {
  return pattern === '/' ? [] : pattern.slice(1).split('/');
}

function compileRoute(route: RouteRecord): Readonly<{
  regex: RegExp;
  segments: readonly DynamicSegment[];
  score: number;
}> {
  const dynamicSegments: DynamicSegment[] = [];
  let score = 0;
  const pieces = routeSegments(route.pattern).map((segment) => {
    const optional = segment.match(/^\[\[\.\.\.([A-Za-z0-9_]+)\]\]$/u);
    if (optional) {
      dynamicSegments.push({ name: optional[1] ?? '', kind: 'optional-catch-all' });
      score += 1;
      return '(?:/(.*))?';
    }
    const catchAll = segment.match(/^\[\.\.\.([A-Za-z0-9_]+)\]$/u);
    if (catchAll) {
      dynamicSegments.push({ name: catchAll[1] ?? '', kind: 'catch-all' });
      score += 2;
      return '/(.+)';
    }
    const dynamic = segment.match(/^\[([A-Za-z0-9_]+)\]$/u);
    if (dynamic) {
      dynamicSegments.push({ name: dynamic[1] ?? '', kind: 'dynamic' });
      score += 5;
      return '/([^/]+)';
    }
    score += 10;
    return `/${escapeRegex(segment)}`;
  });
  return { regex: new RegExp(`^${pieces.join('') || '/'}$`, 'u'), segments: dynamicSegments, score };
}

function pathname(value: string): string {
  try {
    return new URL(value, 'http://winzard.invalid').pathname;
  } catch {
    return value.split('?')[0] ?? value;
  }
}

function decodePathValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function matchRecord(route: RouteRecord, input: string): RouteMatch | null {
  const compiled = compileRoute(route);
  const match = compiled.regex.exec(pathname(input));
  if (!match) return null;
  const params: Record<string, string | readonly string[]> = {};
  compiled.segments.forEach((segment, index) => {
    const raw = match[index + 1];
    if (raw === undefined) return;
    if (segment.kind === 'dynamic') {
      params[segment.name] = decodePathValue(raw);
    } else {
      params[segment.name] = raw === '' ? [] : raw.split('/').map(decodePathValue);
    }
  });
  return { route, params, score: compiled.score };
}

export function matchRoutePath(
  inventory: RouteInventory,
  input: string,
  method?: HttpMethod,
): readonly RouteMatch[] {
  return inventory.routes
    .filter((route) => method === undefined || route.methods.includes(method))
    .map((route) => matchRecord(route, input))
    .filter((value): value is RouteMatch => value !== null)
    .sort((left, right) => right.score - left.score || left.route.pattern.localeCompare(right.route.pattern));
}
