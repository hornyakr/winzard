export const HTTP_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type AuthenticationPolicy = 'public' | 'optional' | 'required';
export type TenantPolicy = 'none' | 'optional' | 'required';
export type RequestContextPolicy = 'none' | 'required';
export type CachePolicy = 'public-static' | 'private-no-store' | 'no-store';
export type ResponsePolicy = 'api-private' | 'api-public' | 'health' | 'sse';
export type CsrfPolicy = 'none' | 'same-origin' | 'framework-origin-plus-session';
export type IdempotencyPolicy = 'none' | 'optional' | 'required';
export type RouteRuntime = 'nodejs' | 'edge';
export type MethodContractMap = Readonly<Partial<Record<HttpMethod, string>>>;

export type PageDeliveryContract = Readonly<{
  kind: 'page';
  id: string;
  route: string;
  methods: readonly ['GET'];
  runtime: RouteRuntime;
  requestContext: RequestContextPolicy;
  authentication: AuthenticationPolicy;
  tenant: TenantPolicy;
  authorization: string;
  cache: CachePolicy;
  operation?: string;
  presenter?: string;
}>;

export type RouteDeliveryContract = Readonly<{
  kind: 'route-handler';
  id: string;
  route: string;
  methods: readonly HttpMethod[];
  runtime: RouteRuntime;
  requestContext: 'required';
  authentication: AuthenticationPolicy;
  tenant: TenantPolicy;
  authorization: MethodContractMap;
  cache: CachePolicy;
  responsePolicy: ResponsePolicy;
  csrf: CsrfPolicy;
  idempotency: IdempotencyPolicy;
  rateLimit: string;
  bodyLimitBytes?: number;
  streaming: boolean;
  operations?: MethodContractMap;
  presenters?: MethodContractMap;
  responseSchemas?: MethodContractMap;
  errors: readonly string[];
}>;

export type ActionDeliveryContract = Readonly<{
  kind: 'server-action';
  id: string;
  actions: readonly string[];
  runtime: 'nodejs';
  requestContext: 'required';
  authentication: AuthenticationPolicy;
  tenant: TenantPolicy;
  authorization: string;
  csrf: 'framework-origin-plus-session';
  idempotency: IdempotencyPolicy;
  rateLimit: string;
  operation: string;
  revalidation: readonly string[];
}>;

const MUTATION_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);
const CONTRACT_ID = /^[a-z][a-z0-9.-]{2,127}$/u;
const ROUTE = /^\/(?!\/)(?:[^\s?#]*)$/u;
const CONTRACT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:@/|-]{0,255}$/u;

function assertContractId(id: string): void {
  if (!CONTRACT_ID.test(id)) throw new TypeError(`Invalid delivery contract id: ${id}`);
}

function assertRoute(route: string): void {
  if (!ROUTE.test(route)) throw new TypeError(`Invalid delivery contract route: ${route}`);
}

function assertReference(value: string, label: string): void {
  if (!CONTRACT_REFERENCE.test(value)) throw new TypeError(`Invalid ${label}: ${value}`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`Duplicate ${label} in delivery contract.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertCommon(contract: Readonly<{ id: string; route: string }>): void {
  assertContractId(contract.id);
  assertRoute(contract.route);
}

function assertMethodMap(
  map: MethodContractMap | undefined,
  methods: readonly HttpMethod[],
  label: string,
  required: boolean,
): void {
  if (!map) {
    if (required) throw new TypeError(`A ${label} map is required.`);
    return;
  }
  const declared = new Set(methods);
  for (const [method, value] of Object.entries(map)) {
    if (!HTTP_METHODS.includes(method as HttpMethod) || !declared.has(method as HttpMethod)) {
      throw new TypeError(`${label} references an undeclared HTTP method: ${method}`);
    }
    assertReference(value, `${label} reference`);
  }
  if (required) {
    for (const method of methods) {
      if (!map[method]) throw new TypeError(`${label} is missing for ${method}.`);
    }
  }
}

export function definePageContract<const T extends PageDeliveryContract>(contract: T): T {
  assertCommon(contract);
  if (contract.methods.length !== 1 || contract.methods[0] !== 'GET') {
    throw new TypeError('A Page delivery contract may declare only GET.');
  }
  assertReference(contract.authorization, 'authorization policy');
  if (contract.operation) assertReference(contract.operation, 'application operation');
  if (contract.presenter) assertReference(contract.presenter, 'presenter');
  if (
    (contract.authentication === 'required' || contract.tenant === 'required') &&
    contract.requestContext === 'none'
  ) {
    throw new TypeError('An authenticated or tenant-aware Page requires a request context.');
  }
  if (contract.authentication === 'required' && contract.cache === 'public-static') {
    throw new TypeError('An authenticated Page cannot use public-static cache.');
  }
  return deepFreeze(contract);
}

export function defineRouteContract<const T extends RouteDeliveryContract>(contract: T): T {
  assertCommon(contract);
  if (contract.methods.length === 0) {
    throw new TypeError('A Route Handler contract needs at least one method.');
  }
  assertUnique(contract.methods, 'HTTP method');
  for (const method of contract.methods) {
    if (!HTTP_METHODS.includes(method)) throw new TypeError(`Unsupported HTTP method: ${method}`);
  }
  assertMethodMap(contract.authorization, contract.methods, 'authorization', true);
  assertMethodMap(contract.operations, contract.methods, 'operation', false);
  assertMethodMap(contract.presenters, contract.methods, 'presenter', false);
  assertMethodMap(contract.responseSchemas, contract.methods, 'response schema', false);
  assertReference(contract.rateLimit, 'rate-limit policy');

  if (
    contract.bodyLimitBytes !== undefined &&
    (!Number.isSafeInteger(contract.bodyLimitBytes) ||
      contract.bodyLimitBytes < 1 ||
      contract.bodyLimitBytes > 10 * 1024 * 1024)
  ) {
    throw new RangeError('bodyLimitBytes must be an integer between 1 and 10485760.');
  }

  if (contract.authentication === 'required' && contract.cache === 'public-static') {
    throw new TypeError('An authenticated Route Handler cannot use public-static cache.');
  }
  if (contract.responsePolicy === 'api-private' && contract.cache !== 'private-no-store') {
    throw new TypeError('api-private response policy requires private-no-store cache.');
  }
  if ((contract.responsePolicy === 'health' || contract.responsePolicy === 'sse') && contract.cache !== 'no-store') {
    throw new TypeError(`${contract.responsePolicy} response policy requires no-store cache.`);
  }
  if (contract.responsePolicy === 'api-public' && contract.cache === 'private-no-store') {
    throw new TypeError('api-public response policy cannot use private-no-store cache.');
  }
  if (contract.csrf === 'framework-origin-plus-session') {
    throw new TypeError('framework-origin-plus-session is reserved for Server Action contracts.');
  }

  const hasMutation = contract.methods.some((method) => MUTATION_METHODS.has(method));
  if (contract.bodyLimitBytes !== undefined && !hasMutation) {
    throw new TypeError('A request body limit requires a mutation method.');
  }
  if (contract.csrf === 'same-origin' && !hasMutation) {
    throw new TypeError('same-origin CSRF policy requires a mutation method.');
  }
  if (contract.idempotency !== 'none' && !hasMutation) {
    throw new TypeError('Idempotency is only valid for mutation methods.');
  }
  if (contract.streaming && contract.responsePolicy !== 'sse') {
    throw new TypeError('A streaming route must use the sse response policy.');
  }
  if (!contract.streaming && contract.responsePolicy === 'sse') {
    throw new TypeError('The sse response policy requires streaming=true.');
  }
  assertUnique(contract.errors, 'error code');
  for (const code of contract.errors) assertReference(code, 'error code');
  return deepFreeze(contract);
}

export function defineActionContract<const T extends ActionDeliveryContract>(contract: T): T {
  assertContractId(contract.id);
  if (contract.actions.length === 0) {
    throw new TypeError('A Server Action contract needs at least one action.');
  }
  assertUnique(contract.actions, 'Server Action');
  assertUnique(contract.revalidation, 'revalidation target');
  for (const action of contract.actions) assertReference(action, 'Server Action');
  assertReference(contract.authorization, 'authorization policy');
  assertReference(contract.rateLimit, 'rate-limit policy');
  assertReference(contract.operation, 'application operation');
  return deepFreeze(contract);
}

export function enforcePageContract(contract: PageDeliveryContract): void {
  if (contract.kind !== 'page') throw new TypeError('Expected a Page delivery contract.');
}

export function enforceServerActionContract(
  contract: ActionDeliveryContract,
  actionName: string,
): void {
  if (!contract.actions.includes(actionName)) {
    throw new TypeError(`Server Action is not declared by its contract: ${actionName}`);
  }
}

export function assertRouteMethod(
  contract: RouteDeliveryContract,
  method: HttpMethod,
): void {
  if (!contract.methods.includes(method)) {
    throw new TypeError(`${method} is not declared by ${contract.id}.`);
  }
}
