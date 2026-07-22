import type { IntegrationEventEnvelope } from '@/platform/events/contract';

export type OutboxMessage = Readonly<{
  id: string;
  source: string;
  type: string;
  subject: string | null;
  occurredAt: Date;
  aggregateId: string | null;
  aggregateSequence: bigint | null;
  payload: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
  attempts: number;
}>;

export interface OutboxWriter {
  append(events: readonly IntegrationEventEnvelope[], transaction: unknown): Promise<void>;
}

export interface OutboxRepository {
  claimBatch(input: Readonly<{ workerId: string; limit: number; now: Date; leaseMs: number }>): Promise<readonly OutboxMessage[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  markFailed(input: Readonly<{ message: OutboxMessage; errorCode: string; now: Date; nextAttemptAt: Date; maximumAttempts: number }>): Promise<void>;
}

export interface IntegrationPublisher {
  publish(message: OutboxMessage, options: Readonly<{ signal: AbortSignal }>): Promise<void>;
}

export interface InboxRepository {
  tryRecord(input: Readonly<{ consumerId: string; source: string; eventId: string; resultHash?: string }>, transaction: unknown): Promise<boolean>;
}

export type RetryPolicy = Readonly<{
  maximumAttempts: number;
  initialDelayMs: number;
  maximumDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}>;

export function retryDelayMs(policy: RetryPolicy, attempts: number, random = Math.random): number {
  const base = Math.min(policy.maximumDelayMs, policy.initialDelayMs * policy.multiplier ** Math.max(0, attempts));
  const jitter = base * policy.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

export class OutboxRelay {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: IntegrationPublisher,
    private readonly policy: RetryPolicy,
  ) {}

  async runOnce(input: Readonly<{ workerId: string; limit: number; leaseMs: number; now: Date; signal: AbortSignal }>): Promise<number> {
    const messages = await this.outbox.claimBatch({ workerId: input.workerId, limit: input.limit, now: input.now, leaseMs: input.leaseMs });
    let published = 0;
    for (const message of messages) {
      if (input.signal.aborted) throw input.signal.reason;
      try {
        await this.publisher.publish(message, { signal: input.signal });
        await this.outbox.markPublished(message.id, new Date());
        published += 1;
      } catch (error) {
        const errorCode = error instanceof Error ? error.name : 'UNKNOWN';
        const delay = retryDelayMs(this.policy, message.attempts);
        await this.outbox.markFailed({ message, errorCode, now: input.now, nextAttemptAt: new Date(input.now.getTime() + delay), maximumAttempts: this.policy.maximumAttempts });
      }
    }
    return published;
  }
}
