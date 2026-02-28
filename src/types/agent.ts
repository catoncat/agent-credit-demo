export type AgentId = string;

export type AgentStatus = 'idle' | 'executing' | 'failed' | 'overloaded' | 'isolated';

export interface AgentState {
  id: AgentId;
  label: string;
  y: number; // effective available quota for pricing: y = quota - reservedQuota
  quota: number; // total executable quota
  reservedQuota: number; // quota locked by RESERVE
  k: number; // AMM constant
  f: number; // friction factor
  s_hat: number; // normalized score ŝ
  capacity: number; // max concurrent tasks
  activeTasks: number; // current active tasks
  totalCompleted: number;
  totalFailed: number;
  status: AgentStatus;
  tradeBalance: number; // net settled flow used by clearing
  balance: number; // agent settlement balance (R)
  liquidationRatio: number; // threshold for liquidation trigger
}
