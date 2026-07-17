import type { LuckyNumberActor } from '../application/policies/lucky-number.policy';

export function luckyNumberActorFromRequest(request: Request): LuckyNumberActor {
  const roleHeader = request.headers.get('x-demo-role') ?? '';
  const roles = roleHeader.split(',').map((role) => role.trim()).filter(Boolean);
  return Object.freeze({
    subject: request.headers.get('x-demo-subject'),
    roles: Object.freeze(roles),
  });
}
