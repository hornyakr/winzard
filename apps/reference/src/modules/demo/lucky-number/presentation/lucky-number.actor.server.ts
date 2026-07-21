import 'server-only';

import type { ApplicationActor } from '@/application/application-context';
import type { ActorResolver, RequestContextSource } from '@/platform/http/request-context.server';

const SUBJECT = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROLE = /^[a-z][a-z0-9:_-]{0,63}$/u;

function validSubject(source: RequestContextSource): string | undefined {
  const value = source.headers.get('x-demo-subject')?.trim();
  return value && SUBJECT.test(value) ? value : undefined;
}

function roles(source: RequestContextSource): readonly string[] {
  return Object.freeze([...new Set(
    (source.headers.get('x-demo-role') ?? '')
      .split(',')
      .map((role) => role.trim().toLowerCase())
      .filter((role) => ROLE.test(role)),
  )]);
}

export const demoActorResolver: ActorResolver = Object.freeze({
  resolve(source: RequestContextSource): ApplicationActor {
    const subject = validSubject(source);
    const resolvedRoles = roles(source);
    if (!subject && resolvedRoles.length === 0) return Object.freeze({ kind: 'anonymous' });
    return Object.freeze({
      kind: 'user',
      userId: subject ?? 'demo-user',
      roles: resolvedRoles,
    });
  },
});
