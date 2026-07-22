import type {
  ContractCompatibilityResult,
  ContractDefinitionRecord,
  ContractInventory,
  ContractIssue,
  ContractProviderRecord,
} from './types';

function tableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function renderContractList(inventory: ContractInventory): string {
  if (inventory.contracts.length === 0) return 'No contracts.';
  return [
    '| Contract | Version | Stability | Owner | Visibility | Providers |',
    '| --- | --- | --- | --- | --- | --- |',
    ...inventory.contracts.map((contract) => {
      const providers = inventory.providers.filter(({ contractId }) => contractId === contract.id).map(({ id }) => id).join('<br>') || '-';
      return `| \`${tableCell(contract.id)}\` | ${contract.version} | ${contract.stability} | ${tableCell(contract.owner)} | ${contract.visibility} | ${tableCell(providers)} |`;
    }),
  ].join('\n');
}

export function renderContractInspection(
  contracts: readonly ContractDefinitionRecord[],
  providers: readonly ContractProviderRecord[],
): string {
  if (contracts.length === 0) return 'No matching contract.';
  return contracts.map((contract) => {
    const implementations = providers.filter(({ contractId }) => contractId === contract.id);
    return [
      `# ${contract.id}`,
      '',
      `- Version: \`${contract.version}\``,
      `- Stability: \`${contract.stability}\``,
      `- Owner: \`${contract.owner}\``,
      `- Source: \`${contract.source}#${contract.exportName}\``,
      `- Documentation: \`${contract.documentation}\``,
      `- Categories: ${contract.categories.map((value) => `\`${value}\``).join(', ')}`,
      `- Runtime validation: \`${contract.runtimeValidation}\`${contract.runtimeSchema ? ` — \`${contract.runtimeSchema}\`` : ''}`,
      `- Cancellation: \`${contract.cancellation}\``,
      `- Timeout: \`${contract.timeout}\``,
      `- Concurrency: \`${contract.concurrency}\``,
      `- Idempotency: \`${contract.idempotency}\``,
      `- Security: \`${contract.securityClassification}\` / \`${contract.tenantScope}\``,
      `- Reference suite: ${contract.referenceSuite ? `\`${contract.referenceSuite}\`` : '-'}`,
      `- Providers: ${implementations.length > 0 ? implementations.map(({ id }) => `\`${id}\``).join(', ') : '-'}`,
    ].join('\n');
  }).join('\n\n');
}

export function renderProviderMatrix(inventory: ContractInventory): string {
  if (inventory.providers.length === 0) return 'No contract providers.';
  return [
    '| Provider | Contract | Major | Kind | Runtime | Capabilities | Evidence |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...inventory.providers.map((provider) => `| \`${tableCell(provider.id)}\` | \`${tableCell(provider.contractId)}\` | ${provider.contractMajor} | ${provider.kind} | ${provider.runtime} | ${provider.capabilities.map((item) => `\`${tableCell(item)}\``).join('<br>')} | ${provider.referenceSuite ? `\`${tableCell(provider.referenceSuite)}\`` : '-'} |`),
  ].join('\n');
}

export function renderContractGraph(inventory: ContractInventory, format: 'text' | 'mermaid'): string {
  if (format === 'mermaid') {
    const lines = ['graph LR'];
    for (const contract of inventory.contracts) {
      const contractNode = `contract_${contract.id.replaceAll(/[^a-zA-Z0-9]/g, '_')}`;
      lines.push(`  ${contractNode}["${contract.id}"]`);
      for (const provider of inventory.providers.filter(({ contractId }) => contractId === contract.id)) {
        const providerNode = `provider_${provider.id.replaceAll(/[^a-zA-Z0-9]/g, '_')}`;
        lines.push(`  ${providerNode}["${provider.id}"] --> ${contractNode}`);
      }
    }
    return lines.join('\n');
  }
  return inventory.contracts.map((contract) => {
    const providers = inventory.providers.filter(({ contractId }) => contractId === contract.id).map(({ id }) => id);
    return `${contract.id} <- ${providers.join(', ') || '(no provider)'}`;
  }).join('\n') || 'No contracts.';
}

export function renderContractIssues(issues: readonly ContractIssue[], label: string): string {
  if (issues.length === 0) return `PASS: ${label}`;
  return [
    `# ${label}`,
    '',
    '| Severity | Area | Code | File | Contract/provider | Message |',
    '| --- | --- | --- | --- | --- | --- |',
    ...issues.map((issue) => `| ${issue.severity} | ${issue.area} | \`${issue.code}\` | \`${tableCell(issue.file)}\` | ${issue.contractId ? `\`${tableCell(issue.contractId)}\`` : issue.providerId ? `\`${tableCell(issue.providerId)}\`` : '-'} | ${tableCell(issue.message)} |`),
  ].join('\n');
}

export function renderCompatibility(result: ContractCompatibilityResult): string {
  return [
    `# Contract compatibility: ${result.base}`,
    '',
    `Compatible: **${result.compatible ? 'yes' : 'no'}**`,
    '',
    ...(result.changes.length === 0 ? ['No contract change.'] : [
      '| Severity | Code | Contract | Change |',
      '| --- | --- | --- | --- |',
      ...result.changes.map((change) => `| ${change.severity} | \`${change.code}\` | \`${tableCell(change.contractId)}\` | ${tableCell(change.message)} |`),
    ]),
    ...(result.issues.length > 0 ? ['', renderContractIssues(result.issues, 'contract compatibility issues')] : []),
  ].join('\n');
}
