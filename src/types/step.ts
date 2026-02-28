import type { AgentState, AgentId } from './agent';
import type { Task } from './task';
import type { LedgerEntry } from './ledger';

export interface StepSnapshot {
  agents: Record<string, AgentState>;
  tasks: Task[];
  ledger: LedgerEntry[];
  currentStep: number;
  phase: number;
  tick: number;
  rngState: number;
  clientBalance: number;
  priceComparison: Record<AgentId, number> | null;
  lastNarrative: string;
}

export interface StepDefinition {
  id: number;
  title: string;
  subtitle: string;
  narrative: string;
  formula?: string;
  actions: StepAction[];
}

export type StepAction =
  | {
      type: 'ROUTE';
      taskId: string;
      delta: number;
      target?: AgentId;
      candidates?: AgentId[];
      routeNearBestRatio?: number;
      routeTemperature?: number;
    }
  | { type: 'RESERVE'; taskId: string; agentId: AgentId; delta: number }
  | { type: 'DISPATCH'; taskId: string; agentId: AgentId }
  | { type: 'FAIL'; taskId: string; agentId: AgentId }
  | { type: 'ABORT'; taskId: string; agentId: AgentId }
  | { type: 'COMPENSATE'; taskId: string; agentId: AgentId; delta: number }
  | { type: 'VALIDATE'; taskId: string; agentId: AgentId }
  | { type: 'COMMIT'; taskId: string; agentId: AgentId; burnRate?: number }
  | { type: 'COMPARE_PRICES'; candidates?: AgentId[]; delta: number }
  | { type: 'BACKPRESSURE'; agentId: AgentId; count: number; delta?: number }
  | { type: 'OVERFLOW'; fromAgent: AgentId; toAgent: AgentId; taskId: string; delta: number }
  | { type: 'BANCOR_SETTLE'; agentId: AgentId; amount: number; actionType: 'TAX' | 'FEE' };

export interface AnimationEvent {
  type: string;
  target?: string;
  duration: number;
  delay?: number;
  data?: Record<string, unknown>;
}
