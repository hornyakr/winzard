import type {
  ApplicationActor,
  ApplicationContext,
  ApplicationLocale,
} from '@/application/application-context';

export type RequestContext = Readonly<{
  requestId: string;
  traceId?: string;
  actor: ApplicationActor;
  tenantId?: string;
  locale: ApplicationLocale;
  receivedAt: string;
  clientIp?: string;
  userAgent?: string;
  origin?: string;
}>;

export type RequestContextSource = Readonly<{
  headers: Headers;
  url?: string;
  receivedAt?: Date;
}>;

export interface RequestIdResolver {
  resolve(source: RequestContextSource): string;
}

export interface ActorResolver {
  resolve(source: RequestContextSource): ApplicationActor | Promise<ApplicationActor>;
}

export interface TenantResolver {
  resolve(
    source: RequestContextSource,
    actor: ApplicationActor,
  ): string | undefined | Promise<string | undefined>;
}

export interface LocaleResolver {
  resolve(
    source: RequestContextSource,
    actor: ApplicationActor,
    tenantId: string | undefined,
  ): ApplicationLocale | Promise<ApplicationLocale>;
}

export interface OptionalRequestMetadataResolver {
  resolve(source: RequestContextSource): string | undefined;
}

export type RequestContextResolvers = Readonly<{
  requestId: RequestIdResolver;
  actor: ActorResolver;
  tenant: TenantResolver;
  locale: LocaleResolver;
  traceId: OptionalRequestMetadataResolver;
  clientIp: OptionalRequestMetadataResolver;
  userAgent: OptionalRequestMetadataResolver;
  origin: OptionalRequestMetadataResolver;
}>;

function immutableActor(actor: ApplicationActor): ApplicationActor {
  if (actor.kind === 'anonymous') return Object.freeze({ kind: 'anonymous' });
  if (actor.kind === 'user') {
    return Object.freeze({
      kind: 'user',
      userId: actor.userId,
      roles: Object.freeze([...new Set(actor.roles)]),
    });
  }
  return Object.freeze({
    kind: 'service',
    serviceId: actor.serviceId,
    scopes: Object.freeze([...new Set(actor.scopes)]),
  });
}

function receivedAt(source: RequestContextSource): string {
  const value = source.receivedAt ?? new Date();
  if (!Number.isFinite(value.getTime())) throw new RangeError('receivedAt must be a valid Date.');
  return value.toISOString();
}

export function createRequestContextFactory(
  resolvers: RequestContextResolvers,
): (source: RequestContextSource) => Promise<RequestContext> {
  return async (source): Promise<RequestContext> => {
    const requestId = resolvers.requestId.resolve(source);
    const actor = immutableActor(await resolvers.actor.resolve(source));
    const tenantId = await resolvers.tenant.resolve(source, actor);
    const locale = await resolvers.locale.resolve(source, actor, tenantId);
    const traceId = resolvers.traceId.resolve(source);
    const clientIp = resolvers.clientIp.resolve(source);
    const userAgent = resolvers.userAgent.resolve(source);
    const origin = resolvers.origin.resolve(source);

    return Object.freeze({
      requestId,
      ...(traceId ? { traceId } : {}),
      actor,
      ...(tenantId ? { tenantId } : {}),
      locale,
      receivedAt: receivedAt(source),
      ...(clientIp ? { clientIp } : {}),
      ...(userAgent ? { userAgent } : {}),
      ...(origin ? { origin } : {}),
    });
  };
}

export function toApplicationContext(context: RequestContext): ApplicationContext {
  return Object.freeze({
    actor: context.actor,
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    requestId: context.requestId,
    locale: context.locale,
  });
}
