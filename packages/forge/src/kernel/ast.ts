import ts from 'typescript';

export interface JsonObject {
  readonly [key: string]: JsonLiteral;
}

export type JsonLiteral =
  | null
  | boolean
  | number
  | string
  | readonly JsonLiteral[]
  | JsonObject;

export function isJsonObject(value: JsonLiteral): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ParsedContractDefinition = Readonly<{
  defineFunction: 'definePageContract' | 'defineRouteContract' | 'defineActionContract';
  exportName: string;
  value: JsonObject;
}>;

function modifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function exported(node: ts.Node): boolean {
  return modifiers(node).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function literal(expression: ts.Expression): JsonLiteral {
  const value = unwrap(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) {
    const number = Number(value.operand.text);
    if (value.operator === ts.SyntaxKind.MinusToken) return -number;
    if (value.operator === ts.SyntaxKind.PlusToken) return number;
  }
  if (ts.isArrayLiteralExpression(value)) {
    return Object.freeze(value.elements.map((item) => {
      if (ts.isSpreadElement(item)) throw new TypeError('Spread is not supported in delivery contracts.');
      return literal(item);
    }));
  }
  if (ts.isObjectLiteralExpression(value)) {
    const output: Record<string, JsonLiteral> = {};
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new TypeError('Only explicit property assignments are supported in delivery contracts.');
      }
      const name = propertyName(property.name);
      if (name === null) throw new TypeError('Computed delivery-contract keys are not supported.');
      output[name] = literal(property.initializer);
    }
    return Object.freeze(output);
  }
  throw new TypeError(`Unsupported delivery-contract expression: ${ts.SyntaxKind[value.kind]}`);
}

function defineFunction(expression: ts.Expression): ParsedContractDefinition['defineFunction'] | null {
  const target = unwrap(expression);
  if (!ts.isIdentifier(target)) return null;
  if (
    target.text === 'definePageContract' ||
    target.text === 'defineRouteContract' ||
    target.text === 'defineActionContract'
  ) {
    return target.text;
  }
  return null;
}

export function parseContractDefinitions(
  fileName: string,
  source: string,
): readonly ParsedContractDefinition[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const definitions: ParsedContractDefinition[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !exported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;
      const factory = defineFunction(initializer.expression);
      if (!factory) continue;
      const [argument] = initializer.arguments;
      if (!argument) throw new TypeError(`${factory} requires an object argument.`);
      const parsed = literal(argument);
      if (!isJsonObject(parsed)) {
        throw new TypeError(`${factory} requires an object literal.`);
      }
      definitions.push(Object.freeze({
        defineFunction: factory,
        exportName: declaration.name.text,
        value: parsed,
      }));
    }
  }

  return definitions;
}
