import { supportedLocales, type SupportedLocale } from '@/platform/kernel-config/locale-config';

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

export const applicationLocales = supportedLocales;

export type ApplicationLocale = SupportedLocale;

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
