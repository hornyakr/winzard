export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RouteKind = 'page' | 'handler';
export type DynamicSegmentKind = 'dynamic' | 'catch-all' | 'optional-catch-all';
export type RouteRuntime = 'nodejs' | 'edge' | 'unknown';

export type DynamicSegment = Readonly<{
  name: string;
  kind: DynamicSegmentKind;
}>;

export type RouteBoundaries = Readonly<{
  layouts: readonly string[];
  loading: readonly string[];
  error: readonly string[];
  notFound: readonly string[];
  defaults: readonly string[];
}>;

export type RouteRecord = Readonly<{
  kind: RouteKind;
  pattern: string;
  entrypoint: string;
  methods: readonly HttpMethod[];
  dynamicSegments: readonly DynamicSegment[];
  routeGroups: readonly string[];
  parallelSlots: readonly string[];
  interceptingSegments: readonly string[];
  runtime: RouteRuntime;
  dynamicMode: string | null;
  revalidate: string | null;
  dynamicParams: boolean | null;
  hasInputSchema: boolean;
  owner: string;
  boundaries: RouteBoundaries;
}>;

export type RouteAliasType = 'redirect' | 'rewrite';

export type RouteAlias = Readonly<{
  type: RouteAliasType;
  source: string;
  destination: string;
  permanent: boolean | null;
  configFile: string;
}>;

export type RoutingIssueSeverity = 'error' | 'warning';

export type RoutingIssue = Readonly<{
  severity: RoutingIssueSeverity;
  code: string;
  file: string;
  message: string;
}>;

export type RouteInventory = Readonly<{
  schemaVersion: 1;
  appRoot: string;
  routes: readonly RouteRecord[];
  aliases: readonly RouteAlias[];
  issues: readonly RoutingIssue[];
}>;

export type RouteMatch = Readonly<{
  route: RouteRecord;
  params: Readonly<Record<string, string | readonly string[]>>;
  score: number;
}>;
