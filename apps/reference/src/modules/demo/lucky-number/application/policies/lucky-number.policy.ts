import type { ApplicationActor } from '@/application/application-context';

export class LuckyNumberPolicy {
  canGenerateCustomRange(actor: ApplicationActor): boolean {
    if (actor.kind === 'user') return actor.roles.includes('operator');
    if (actor.kind === 'service') return actor.scopes.includes('demo:lucky-number:generate');
    return false;
  }
}
