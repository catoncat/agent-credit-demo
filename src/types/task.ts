import type { AgentId } from './agent';

export type TaskStatus = 'INIT' | 'RESERVE' | 'DISPATCH' | 'VALIDATE' | 'COMMIT' | 'COMMITTED' | 'ABORT' | 'COMPENSATE' | 'ABORTED';

export interface TaskValidatorOutput {
  schema: boolean;
  score: number;
  toolError: boolean;
  timeout: boolean;
}

export interface TaskValidationResult extends TaskValidatorOutput {
  passed: boolean;
  reason: 'pass' | 'schema_mismatch' | 'tool_error' | 'timeout' | 'low_score';
  evaluatedTick: number;
}

export interface Task {
  id: string;
  assignedTo: AgentId | null;
  status: TaskStatus;
  delta: number; // reserved/consumed quota amount
  fee: number; // legacy display field (effective payment)
  quotedPrice: number; // Δx = k/(y-Δy)-k/y
  effectivePrice: number; // P_eff = Δx * (1+f) / ŝ
  payment: number; // actual client payment
  burn: number; // burned from payment (not from y)
  timestamp: number;
  dispatchTick?: number;
  readyTick?: number;
  validator?: TaskValidationResult;
}
