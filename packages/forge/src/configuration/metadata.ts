import type { ConfigurationValidation } from './types';

function boundedLabel(
  label: string,
  minimum: number | undefined,
  maximum: number | undefined,
): string {
  return minimum === undefined && maximum === undefined
    ? label
    : `${label}[${minimum ?? '-∞'},${maximum ?? '∞'}]`;
}

export function configurationValidationLabel(
  validation: ConfigurationValidation,
): string {
  switch (validation.kind) {
    case 'enum':
      return `enum(${validation.values.join('|')})`;
    case 'csv-enum':
      return `csv-enum(${validation.values.join('|')})`;
    case 'integer':
      return boundedLabel('integer', validation.minimum, validation.maximum);
    case 'secret':
      return `secret(min:${validation.minimumLength})`;
    case 'url': {
      const constraints = [
        ...(validation.protocols ?? []),
        ...(validation.originOnly ? ['origin-only'] : []),
      ];
      return constraints.length === 0 ? 'URL' : `URL(${constraints.join(',')})`;
    }
    case 'postgres-url':
      return 'PostgreSQL DSN';
    case 'boolean':
      return 'boolean(true|false)';
    case 'json':
      return validation.maximumBytes === undefined
        ? 'JSON'
        : `JSON(max:${validation.maximumBytes} bytes)`;
    case 'string':
      return boundedLabel('string', validation.minimumLength, validation.maximumLength);
  }
}
