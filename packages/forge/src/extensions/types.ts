export type ExtensionIssue = Readonly<{
  severity: 'error' | 'warning';
  area: 'manifest' | 'capability' | 'recipe' | 'package' | 'state' | 'security';
  code: string;
  file: string;
  message: string;
}>;

export type RecipeOwnership =
  | 'generated-read-only'
  | 'generated-with-regions'
  | 'consumer-owned-after-create';

export type DependencyDeclaration = Readonly<{
  name: string;
  version: string | null;
}>;

export type RecipeFileDeclaration = Readonly<{
  path: string;
  source: string;
  ownership: RecipeOwnership;
}>;

export type RecipeMigration = Readonly<{
  id: string;
  from: string;
  to: string;
  destructive: boolean;
  files: readonly RecipeFileDeclaration[];
}>;

export type RecipeManifest = Readonly<{
  schemaVersion: 1;
  name: string;
  version: string;
  provides: readonly string[];
  requires: readonly string[];
  conflicts: readonly string[];
  dependencies: Readonly<{
    runtime: readonly DependencyDeclaration[];
    development: readonly DependencyDeclaration[];
  }>;
  environment: readonly string[];
  configuration: readonly Readonly<Record<string, unknown>>[];
  files: readonly RecipeFileDeclaration[];
  generated: readonly string[];
  migrations: readonly RecipeMigration[];
}>;

export type ExtensionProvider = Readonly<{
  id: string;
  contract: string;
  package: string;
  required: boolean;
  default: boolean;
}>;

export type ExtensionManifest = Readonly<{
  schemaVersion: 1;
  name: string;
  displayName: string;
  version: string;
  stability: 'experimental' | 'stable' | 'deprecated';
  provides: readonly string[];
  requires: readonly string[];
  conflicts: readonly string[];
  packages: Readonly<{
    runtime: readonly DependencyDeclaration[];
    development: readonly DependencyDeclaration[];
    peer: readonly DependencyDeclaration[];
  }>;
  providers: readonly ExtensionProvider[];
  recipe: Readonly<{
    name: string;
    version: string;
    path: string;
  }> | null;
  documentation: Readonly<{
    entry: string;
    consumerPack: string | null;
  }> | null;
  compatibility: Readonly<{
    node: string | null;
    pnpm: string | null;
    next: string | null;
    react: string | null;
  }>;
  sourceRoot: string;
  sourceFile: string;
}>;

export type InstalledFileState = Readonly<{
  path: string;
  ownership: RecipeOwnership;
  sourceHash: string;
  outputHash: string;
}>;

export type InstalledExtensionState = Readonly<{
  name: string;
  version: string;
  source: string;
  recipe: string | null;
  recipeVersion: string | null;
  capabilities: readonly string[];
  requires: readonly string[];
  conflicts: readonly string[];
  runtimeDependencies: readonly string[];
  developmentDependencies: readonly string[];
  files: readonly InstalledFileState[];
  appliedMigrations: readonly string[];
  installedAt: string;
  updatedAt: string;
}>;

export type ExtensionStateFile = Readonly<{
  schemaVersion: 1;
  extensions: readonly InstalledExtensionState[];
}>;

export type RecipePlanOperation =
  | Readonly<{
    kind: 'create-file' | 'update-file';
    path: string;
    source: string;
    ownership: RecipeOwnership;
    sourceHash: string;
    previousHash: string | null;
  }>
  | Readonly<{
    kind: 'delete-file';
    path: string;
    previousHash: string;
  }>
  | Readonly<{
    kind: 'add-runtime-dependency' | 'add-development-dependency';
    name: string;
    version: string;
  }>
  | Readonly<{
    kind: 'remove-runtime-dependency' | 'remove-development-dependency';
    name: string;
  }>
  | Readonly<{
    kind: 'add-capability' | 'remove-capability';
    capability: string;
  }>;

export type RecipePlan = Readonly<{
  extension: ExtensionManifest | null;
  recipe: RecipeManifest;
  projectRoot: string;
  sourceRoot: string;
  operations: readonly RecipePlanOperation[];
  issues: readonly ExtensionIssue[];
  unchanged: readonly string[];
  migrations: readonly string[];
}>;

export type CapabilityNode = Readonly<{
  id: string;
  providers: readonly string[];
  requiredBy: readonly string[];
  conflicts: readonly string[];
  installed: boolean;
}>;

export type CapabilityGraph = Readonly<{
  nodes: readonly CapabilityNode[];
  cycles: readonly string[][];
  issues: readonly ExtensionIssue[];
}>;

export type PackageInspection = Readonly<{
  root: string;
  name: string | null;
  version: string | null;
  exports: readonly string[];
  files: readonly string[];
  issues: readonly ExtensionIssue[];
}>;
