import 'server-only';

export type KernelCompletionEvent = Readonly<{
  contractId: string;
  route: string;
  method: string;
  operation?: string;
  requestId: string;
  status: number;
  outcome: 'success' | 'client-error' | 'server-error';
  durationMs: number;
}>;

export type KernelFailureEvent = Readonly<{
  contractId: string;
  route: string;
  method: string;
  operation?: string;
  requestId: string;
  errorName: string;
}>;

export interface KernelTelemetry {
  recordCompletion(event: KernelCompletionEvent): void | Promise<void>;
  recordFailure(event: KernelFailureEvent): void | Promise<void>;
}

export const noOpKernelTelemetry: KernelTelemetry = Object.freeze({
  recordCompletion: () => undefined,
  recordFailure: () => undefined,
});
