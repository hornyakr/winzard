import type { EventDispatchTrace, HandlerExecution } from './contract';
export class RecordingEventDispatchTrace implements EventDispatchTrace { readonly executions: HandlerExecution[] = []; record(execution: HandlerExecution): void { this.executions.push(Object.freeze({ ...execution })); } }
