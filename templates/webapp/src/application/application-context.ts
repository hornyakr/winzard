export type ApplicationActor =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{
      kind: 'user';
      userId: string;
      roles: readonly string[];
    }>
  | Readonly<{
      kind: 'service';
      serviceId: string;
      scopes: readonly string[];
    }>;

export type ApplicationLocale = 'hu' | 'en';

export type ApplicationContext = Readonly<{
  actor: ApplicationActor;
  tenantId?: string;
  requestId: string;
  locale: ApplicationLocale;
}>;

export type OperationControl = Readonly<{
  signal?: AbortSignal;
  deadlineAt?: string;
}>;
