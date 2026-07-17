import type { RouteAlias, RouteInventory, RouteMatch, RouteRecord, RoutingIssue } from './types';

function methods(route: RouteRecord): string {
  return route.methods.length === 0 ? '-' : route.methods.join(',');
}

export function renderRouteList(inventory: RouteInventory): string {
  const rows = inventory.routes.map((route) => ({
    method: methods(route),
    kind: route.kind,
    pattern: route.pattern,
    entrypoint: route.entrypoint,
  }));
  const widths = {
    method: Math.max('METHOD'.length, ...rows.map(({ method }) => method.length)),
    kind: Math.max('KIND'.length, ...rows.map(({ kind }) => kind.length)),
    pattern: Math.max('PATTERN'.length, ...rows.map(({ pattern }) => pattern.length)),
  };
  return [
    `${'METHOD'.padEnd(widths.method)}  ${'KIND'.padEnd(widths.kind)}  ${'PATTERN'.padEnd(widths.pattern)}  ENTRYPOINT`,
    ...rows.map((row) => `${row.method.padEnd(widths.method)}  ${row.kind.padEnd(widths.kind)}  ${row.pattern.padEnd(widths.pattern)}  ${row.entrypoint}`),
  ].join('\n');
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(', ');
}

export function renderRouteInspection(routes: readonly RouteRecord[]): string {
  if (routes.length === 0) return 'No route found.';
  return routes.map((route) => [
    `Pattern:            ${route.pattern}`,
    `Kind:               ${route.kind}`,
    `Methods:            ${methods(route)}`,
    `Entrypoint:         ${route.entrypoint}`,
    `Owner:              ${route.owner}`,
    `Runtime:            ${route.runtime}`,
    `Dynamic mode:       ${route.dynamicMode ?? '-'}`,
    `Revalidate:         ${route.revalidate ?? '-'}`,
    `Dynamic params:     ${route.dynamicParams === null ? '-' : String(route.dynamicParams)}`,
    `Input schema:       ${route.hasInputSchema ? 'yes' : 'no'}`,
    `Dynamic segments:   ${formatList(route.dynamicSegments.map(({ name, kind }) => `${name}:${kind}`))}`,
    `Route groups:       ${formatList(route.routeGroups)}`,
    `Parallel slots:     ${formatList(route.parallelSlots)}`,
    `Intercepting:       ${formatList(route.interceptingSegments)}`,
    `Layouts:            ${formatList(route.boundaries.layouts)}`,
    `Loading boundaries: ${formatList(route.boundaries.loading)}`,
    `Error boundaries:   ${formatList(route.boundaries.error)}`,
    `Not-found:          ${formatList(route.boundaries.notFound)}`,
    `Default boundaries: ${formatList(route.boundaries.defaults)}`,
  ].join('\n')).join('\n\n');
}

export function renderRouteMatches(matches: readonly RouteMatch[]): string {
  if (matches.length === 0) return 'No diagnostic match. Next.js remains authoritative.';
  return [
    'Diagnostic approximation; Next.js remains authoritative.',
    ...matches.map((match) => `${match.route.pattern}  ${match.route.kind}  score=${match.score}  params=${JSON.stringify(match.params)}  ${match.route.entrypoint}`),
  ].join('\n');
}

export function renderAliases(aliases: readonly RouteAlias[]): string {
  if (aliases.length === 0) return 'No static redirects or rewrites found.';
  const rows = aliases.map((alias) => ({
    source: alias.source,
    destination: alias.destination,
    type: alias.type,
    permanent: alias.permanent === null ? '-' : String(alias.permanent),
  }));
  const widths = {
    source: Math.max('SOURCE'.length, ...rows.map(({ source }) => source.length)),
    destination: Math.max('DESTINATION'.length, ...rows.map(({ destination }) => destination.length)),
    type: Math.max('TYPE'.length, ...rows.map(({ type }) => type.length)),
  };
  return [
    `${'SOURCE'.padEnd(widths.source)}  ${'DESTINATION'.padEnd(widths.destination)}  ${'TYPE'.padEnd(widths.type)}  PERMANENT`,
    ...rows.map((row) => `${row.source.padEnd(widths.source)}  ${row.destination.padEnd(widths.destination)}  ${row.type.padEnd(widths.type)}  ${row.permanent}`),
  ].join('\n');
}

export function renderRoutingIssues(issues: readonly RoutingIssue[]): string {
  if (issues.length === 0) return 'PASS: route:check';
  return issues.map((issue) => `${issue.severity === 'error' ? 'ERROR' : 'WARN'} [${issue.code}] ${issue.file}: ${issue.message}`).join('\n');
}
