import type { LuckyNumberActor } from '../application/policies/lucky-number.policy';

function actorFromHeaders(headers: Headers): LuckyNumberActor {
  const roleHeader = headers.get('x-demo-role') ?? '';
  return Object.freeze({
    subject: headers.get('x-demo-subject'),
    roles: Object.freeze(roleHeader.split(',').map((role) => role.trim()).filter(Boolean)),
  });
}

export function luckyNumberActorFromRequest(request: Request): LuckyNumberActor {
  return actorFromHeaders(request.headers);
}
