import 'server-only';

import { after } from 'next/server';

export type AfterResponseTask = () => void | Promise<void>;
export type AfterResponseScheduler = (task: AfterResponseTask) => void;

async function isolate(
  task: AfterResponseTask,
  onError: (error: unknown) => void | Promise<void>,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    try {
      await onError(error);
    } catch {
      // Best-effort observability must not escape the completed request lifecycle.
    }
  }
}

export function scheduleAfterResponse(
  task: AfterResponseTask,
  onError: (error: unknown) => void | Promise<void> = () => undefined,
): void {
  after(() => isolate(task, onError));
}
