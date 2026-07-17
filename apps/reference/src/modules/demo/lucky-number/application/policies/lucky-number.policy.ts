export type LuckyNumberActor = Readonly<{
  subject: string | null;
  roles: readonly string[];
}>;

export class LuckyNumberPolicy {
  canGenerateCustomRange(actor: LuckyNumberActor): boolean {
    return actor.roles.includes('operator');
  }
}
