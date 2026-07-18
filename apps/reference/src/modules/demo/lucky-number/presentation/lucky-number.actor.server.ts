import 'server-only';

import { headers } from 'next/headers';

import type { LuckyNumberActor } from '../application/policies/lucky-number.policy';

export async function getDemoActor(): Promise<LuckyNumberActor> {
  const incomingHeaders = await headers();
  const roleHeader = incomingHeaders.get('x-demo-role') ?? '';
  return Object.freeze({
    subject: incomingHeaders.get('x-demo-subject'),
    roles: Object.freeze(roleHeader.split(',').map((role) => role.trim()).filter(Boolean)),
  });
}
