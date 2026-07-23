import type { TestSuiteRecord, TestingInventory, TestingIssue } from './types';

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escape = (value: string): string => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

export function renderTestingList(inventory: TestingInventory): string {
  return [
    '# Testing suites',
    '',
    `Fingerprint: ${inventory.fingerprint}`,
    '',
    table(
      ['ID', 'Layer', 'Runtime', 'Owner', 'Files', 'Command', 'CI job'],
      inventory.suites.map((suite) => [
        suite.id,
        suite.layer,
        suite.runtime,
        suite.owner,
        String(suite.discoveredFiles.length),
        `\`${suite.command}\``,
        suite.ciJob,
      ]),
    ),
  ].join('\n');
}

export function renderTestingInspection(records: readonly TestSuiteRecord[]): string {
  if (records.length === 0) return 'No testing suite matched.';
  return records.map((suite) => [
    `# ${suite.id}`,
    '',
    `- Owner: ${suite.owner}`,
    `- Layer/runtime: ${suite.layer} / ${suite.runtime}`,
    `- Command: \`${suite.command}\``,
    `- CI job: ${suite.ciJob}`,
    `- Network: ${suite.network}`,
    `- Production build: ${suite.productionBuild ? 'yes' : 'no'}`,
    `- Healthcheck: ${suite.healthcheck ?? '-'}`,
    `- Serial: ${suite.serial ? 'yes' : 'no'}`,
    `- Coverage: ${suite.coverage ? 'yes' : 'no'}`,
    `- Services: ${suite.services.join(', ') || '-'}`,
    `- Capabilities: ${suite.capabilities.join(', ') || '-'}`,
    `- Includes: ${suite.include.join(', ') || '-'}`,
    `- Sources: ${suite.sources.join(', ') || '-'}`,
    `- Fixtures: ${suite.fixtures.join(', ') || '-'}`,
    `- Discovered files: ${suite.discoveredFiles.join(', ') || '-'}`,
  ].join('\n')).join('\n\n');
}

export function renderTestingIssues(issues: readonly TestingIssue[], label: string): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [
    ...issues.map((issue) => `[${issue.severity.toUpperCase()}] [${issue.code}] ${issue.file}: ${issue.message}`),
    '',
    `${issues.some(({ severity }) => severity === 'error') ? 'FAIL' : 'PASS WITH WARNINGS'}: ${label} (${issues.length} issue)`,
  ].join('\n');
}

export function renderTestingMatrix(inventory: TestingInventory): string {
  return table(
    ['Suite', 'Layer', 'Runtime', 'Duration', 'Serial', 'Network', 'Production', 'Services'],
    inventory.suites.map((suite) => [
      suite.id,
      suite.layer,
      suite.runtime,
      suite.duration,
      suite.serial ? 'yes' : 'no',
      suite.network,
      suite.productionBuild ? 'yes' : 'no',
      suite.services.join(', ') || '-',
    ]),
  );
}

export function renderTestingQuarantine(inventory: TestingInventory): string {
  if (inventory.quarantine.length === 0) return 'No quarantined tests.';
  return table(
    ['Test', 'Owner', 'Issue', 'Expires', 'Reason'],
    inventory.quarantine.map((record) => [record.testId, record.owner, record.issue, record.expires, record.reason]),
  );
}
