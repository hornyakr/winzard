import type { ApplicationContext } from '@/application/application-context';

export const anonymousApplicationContext: ApplicationContext = Object.freeze({
  actor: Object.freeze({ kind: 'anonymous' }),
  requestId: 'test-request-anonymous',
  locale: 'hu',
});

export const operatorApplicationContext: ApplicationContext = Object.freeze({
  actor: Object.freeze({
    kind: 'user',
    userId: 'test-operator',
    roles: Object.freeze(['operator']),
  }),
  requestId: 'test-request-operator',
  locale: 'hu',
});
