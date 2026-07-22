import ts from 'typescript';

export interface EventJsonObject { readonly [key: string]: EventJsonLiteral; }
export type EventJsonLiteral = null | boolean | number | string | readonly EventJsonLiteral[] | EventJsonObject;
export type ParsedEventDefinition = Readonly<{ exportName: string; value: EventJsonObject }>;

export function isEventJsonObject(value: EventJsonLiteral): value is EventJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function modifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}
function exported(node: ts.Node): boolean {
  return modifiers(node).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}
function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}
function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}
function literal(expression: ts.Expression): EventJsonLiteral {
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
      if (ts.isSpreadElement(item)) throw new TypeError('Spread is not supported in event definitions.');
      return literal(item);
    }));
  }
  if (ts.isObjectLiteralExpression(value)) {
    const output: Record<string, EventJsonLiteral> = {};
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) throw new TypeError('Only explicit property assignments are supported in event definitions.');
      const name = propertyName(property.name);
      if (name === null) throw new TypeError('Computed event-definition keys are not supported.');
      output[name] = literal(property.initializer);
    }
    return Object.freeze(output);
  }
  throw new TypeError(`Unsupported event-definition expression: ${ts.SyntaxKind[value.kind]}`);
}
export function parseEventDefinitions(fileName: string, source: string): readonly ParsedEventDefinition[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const definitions: ParsedEventDefinition[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !exported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isCallExpression(initializer)) continue;
      const factory = unwrap(initializer.expression);
      if (!ts.isIdentifier(factory) || factory.text !== 'defineEvents') continue;
      const [argument] = initializer.arguments;
      if (!argument) throw new TypeError('defineEvents requires an object argument.');
      const parsed = literal(argument);
      if (!isEventJsonObject(parsed)) throw new TypeError('defineEvents requires an object literal.');
      definitions.push(Object.freeze({ exportName: declaration.name.text, value: parsed }));
    }
  }
  return Object.freeze(definitions);
}
