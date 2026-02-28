import type { AgentId } from './agent';

export interface LedgerEntry {
  step: number;
  agentId: AgentId;
  action: 'ROUTE' | 'RESERVE' | 'COMMIT' | 'ABORT' | 'BURN' | 'BANCOR_TAX' | 'BANCOR_FEE' | 'LIQUIDATE';
  deltaY: number;
  deltaBalance?: number;
  deltaQuota?: number;
  yBefore: number;
  yAfter: number;
  priceBefore: number;
  priceAfter: number;
  fBefore: number;
  fAfter: number;
  description: string;
}
