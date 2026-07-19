import type { ViewInventory, ViewIssue, ViewRecord } from './types';

function format(values: readonly string[]): string {
  return values.length === 0 ? '-' : values.join(', ');
}

function route(record: ViewRecord): string {
  return record.route ?? '-';
}

export function renderViewList(inventory: ViewInventory): string {
  const rows = inventory.records.map((record) => ({
    kind: record.kind,
    boundary: record.boundary,
    name: record.name,
    route: route(record),
    file: record.file,
  }));
  const widths = {
    kind: Math.max('KIND'.length, ...rows.map(({ kind }) => kind.length)),
    boundary: Math.max('BOUNDARY'.length, ...rows.map(({ boundary }) => boundary.length)),
    name: Math.max('NAME'.length, ...rows.map(({ name }) => name.length)),
    route: Math.max('ROUTE'.length, ...rows.map(({ route: value }) => value.length)),
  };
  return [
    `${'KIND'.padEnd(widths.kind)}  ${'BOUNDARY'.padEnd(widths.boundary)}  ${'NAME'.padEnd(widths.name)}  ${'ROUTE'.padEnd(widths.route)}  FILE`,
    ...rows.map((row) =>
      `${row.kind.padEnd(widths.kind)}  ${row.boundary.padEnd(widths.boundary)}  ${row.name.padEnd(widths.name)}  ${row.route.padEnd(widths.route)}  ${row.file}`),
  ].join('\n');
}

function imageSummary(record: ViewRecord): string {
  return format(record.assets.images.map((image) =>
    `${image.kind}:${image.source ?? '<dynamic>'}:${image.hasAlt ? 'alt' : 'missing-alt'}`));
}

export function renderViewInspection(records: readonly ViewRecord[]): string {
  if (records.length === 0) return 'No view found.';
  return records.map((record) => [
    `Name:             ${record.name}`,
    `Kind:             ${record.kind}`,
    `File:             ${record.file}`,
    `Route:            ${record.route ?? '-'}`,
    `Boundary:         ${record.boundary}`,
    `Async:            ${record.async ? 'yes' : 'no'}`,
    `Props type:       ${record.propsType ?? '-'}`,
    `Props:            ${format(record.props)}`,
    `View models:      ${format(record.viewModels)}`,
    `Route builders:   ${format(record.routeBuilders)}`,
    `Dangerous HTML:   ${record.hasDangerousHtml ? 'yes' : 'no'}`,
    `Images:           ${imageSummary(record)}`,
    `Stylesheets:      ${format(record.assets.stylesheets)}`,
    `Fonts:            ${format(record.assets.fonts)}`,
    `Scripts:          ${format(record.assets.scripts)}`,
    `Static assets:    ${format(record.assets.staticAssets)}`,
    `Public URLs:      ${format(record.assets.publicUrls)}`,
    `External URLs:    ${format(record.assets.externalUrls)}`,
    `Tests:            ${format(record.tests)}`,
  ].join('\n')).join('\n\n');
}

export function renderViewIssues(
  issues: readonly ViewIssue[],
  passLabel = 'view:check',
): string {
  if (issues.length === 0) return `PASS: ${passLabel}`;
  return issues.map((entry) =>
    `${entry.severity === 'error' ? 'ERROR' : 'WARN'} [${entry.code}] ${entry.file}: ${entry.message}`,
  ).join('\n');
}

export function renderViewAssets(inventory: ViewInventory): string {
  const records = inventory.records.filter((record) =>
    record.assets.images.length > 0 ||
    record.assets.stylesheets.length > 0 ||
    record.assets.fonts.length > 0 ||
    record.assets.scripts.length > 0 ||
    record.assets.staticAssets.length > 0 ||
    record.assets.publicUrls.length > 0 ||
    record.assets.externalUrls.length > 0);
  if (records.length === 0) return 'No presentation assets found.';
  return records.map((record) => [
    `${record.name} (${record.file})`,
    `  Images:        ${imageSummary(record)}`,
    `  Stylesheets:   ${format(record.assets.stylesheets)}`,
    `  Fonts:         ${format(record.assets.fonts)}`,
    `  Scripts:       ${format(record.assets.scripts)}`,
    `  Static assets: ${format(record.assets.staticAssets)}`,
    `  Public URLs:   ${format(record.assets.publicUrls)}`,
    `  External URLs: ${format(record.assets.externalUrls)}`,
  ].join('\n')).join('\n\n');
}
