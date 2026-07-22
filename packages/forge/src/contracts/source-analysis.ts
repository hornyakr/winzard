import ts from 'typescript';

import type { ContractIssue } from './types';

function modifiers(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : [];
}

function exported(node: ts.Node): boolean {
  return modifiers(node).some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
}

function declarationName(node: ts.Node): string | null {
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text ?? null;
  }
  return null;
}

function containsAny(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (current.kind === ts.SyntaxKind.AnyKeyword) found = true;
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function exportedVariableNames(statement: ts.VariableStatement): readonly string[] {
  const names: string[] = [];
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
  }
  return names;
}

function importSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const values = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      values.add(statement.moduleSpecifier.text);
    }
  }
  return [...values].sort();
}

export function inspectContractSource(
  file: string,
  source: string,
  exportName: string,
  contractId: string,
): readonly ContractIssue[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const issues: ContractIssue[] = [];
  let exportFound = false;

  const push = (code: string, message: string, area: ContractIssue['area'] = 'source'): void => {
    issues.push(Object.freeze({ severity: 'error', area, code, file, contractId, message }));
  };

  for (const statement of sourceFile.statements) {
    if (exported(statement)) {
      const name = declarationName(statement);
      if (name === exportName) exportFound = true;
      if (ts.isVariableStatement(statement) && exportedVariableNames(statement).includes(exportName)) exportFound = true;
      if (containsAny(statement)) {
        push('CONTRACT_ANY_EXPORTED', `A publikus contract exportált any típust tartalmaz: ${exportName}.`);
      }
      if (ts.isInterfaceDeclaration(statement) && statement.members.length === 0) {
        push('CONTRACT_MARKER_INTERFACE_EMPTY', `Az üres marker interface strukturálisan nem biztonságos: ${statement.name.text}.`);
      }
    }
  }

  if (!exportFound) {
    push('CONTRACT_EXPORT_MISSING', `A deklarált export nem található: ${exportName}.`);
  }

  const sourceText = sourceFile.getFullText();
  if (/\b(?:ContainerProvider|ServiceContainer)\b|\bgetContainer\s*\(/u.test(sourceText)) {
    push('CONTRACT_CONTAINER_EXPOSED', 'A contract nem tehet elérhetővé általános service containert.', 'security');
  }

  for (const specifier of importSpecifiers(sourceFile)) {
    if (/^@winzard\/.+\/(?:dist|src|internal)(?:\/|$)/u.test(specifier)) {
      push('CONTRACT_DEEP_IMPORT', `Nem támogatott deep import: ${specifier}.`);
    }
    if (/^(?:next(?:\/|$)|react(?:\/|$)|@prisma\/|pg$|node:)/u.test(specifier)) {
      push('CONTRACT_FRAMEWORK_DEPENDENCY', `A contract source framework- vagy providerfüggő importot tartalmaz: ${specifier}.`);
    }
  }

  return Object.freeze(issues);
}


export function inspectProviderSource(
  file: string,
  source: string,
  exportName: string,
  providerId: string,
): readonly ContractIssue[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let exportFound = false;
  for (const statement of sourceFile.statements) {
    if (!exported(statement)) continue;
    const name = declarationName(statement);
    if (name === exportName) exportFound = true;
    if (ts.isVariableStatement(statement) && exportedVariableNames(statement).includes(exportName)) exportFound = true;
  }
  return exportFound
    ? Object.freeze([])
    : Object.freeze([Object.freeze({
        severity: 'error' as const,
        area: 'provider' as const,
        code: 'CONTRACT_PROVIDER_EXPORT_MISSING',
        file,
        providerId,
        message: `A deklarált provider export nem található: ${exportName}.`,
      })]);
}
