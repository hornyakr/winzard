import type { EventDispatchTrace, HandlerExecution } from './contract';

export class RecordingEventDispatchTrace implements EventDispatchTrace {
  readonly #executions: HandlerExecution[] = [];

  record(execution: HandlerExecution): void {
    this.#executions.push(Object.freeze({ ...execution }));
  }

  snapshot(): readonly HandlerExecution[] {
    return Object.freeze(this.#executions.map((execution) => Object.freeze({ ...execution })));
  }

  clear(): void {
    this.#executions.length = 0;
  }
}
