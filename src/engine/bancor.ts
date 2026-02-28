import type { AgentState, AgentId } from '../types/agent';
import { syncAgentY } from './amm';

export interface BancorParams {
  surplusTaxRate?: number;
  deficitFeeRate?: number;
  threshold?: number;
  liquidationBalanceFloor?: number;
  liquidationRatioFloor?: number;
}

export interface BancorResult {
  agent: AgentState;
  adjustment: number;
  type: 'TAX' | 'FEE' | 'LIQUIDATE' | 'NONE';
  reason: string;
}

/** Threshold-based clearing close to whitepaper style tax/fee + liquidation */
export function bancorSettle(
  agents: Record<AgentId, AgentState>,
  params: BancorParams = {},
): Record<AgentId, BancorResult> {
  const {
    surplusTaxRate = 0.008,
    deficitFeeRate = 0.01,
    threshold = 220,
    liquidationBalanceFloor = -3000,
    liquidationRatioFloor = -0.1,
  } = params;

  const ids = Object.keys(agents);
  const results: Record<AgentId, BancorResult> = {};
  if (ids.length === 0) return results;

  const avgBalance = ids.reduce((sum, id) => sum + agents[id].tradeBalance, 0) / ids.length;
  const avgAbsDeviation = ids.reduce(
    (sum, id) => sum + Math.abs(agents[id].tradeBalance - avgBalance),
    0,
  ) / ids.length;
  const dynamicThreshold = Math.max(threshold, avgAbsDeviation * 0.45);

  for (const id of ids) {
    const agent = agents[id];
    const deviation = agent.tradeBalance - avgBalance;
    const outcomes = agent.totalCompleted + agent.totalFailed;
    const deficitThreshold = outcomes < 4
      ? dynamicThreshold * 2.5
      : outcomes < 10
        ? dynamicThreshold * 1.5
        : dynamicThreshold;
    let settlementType: BancorResult['type'] = 'NONE';
    let charge = 0;
    let reason = 'within threshold';

    if (deviation > dynamicThreshold) {
      charge = (deviation - dynamicThreshold) * surplusTaxRate;
      settlementType = 'TAX';
      reason = 'surplus over threshold';
    } else if (deviation < -deficitThreshold) {
      charge = (Math.abs(deviation) - deficitThreshold) * deficitFeeRate;
      settlementType = 'FEE';
      reason = 'deficit over threshold (with startup grace)';
    }

    let nextAgent: AgentState = syncAgentY({
      ...agent,
      balance: agent.balance - charge,
      tradeBalance: settlementType === 'TAX'
        ? agent.tradeBalance - charge
        : settlementType === 'FEE'
          ? agent.tradeBalance + charge
          : agent.tradeBalance,
    });

    const healthRatio = nextAgent.balance / Math.max(nextAgent.quota, 1);
    const hasEnoughHistory = outcomes >= 6;
    const shouldLiquidate = nextAgent.status !== 'isolated'
      && hasEnoughHistory
      && (nextAgent.balance < liquidationBalanceFloor || healthRatio < liquidationRatioFloor);

    if (shouldLiquidate) {
      const liquidatedQuota = Math.max(10, Math.floor(nextAgent.quota * 0.1));
      const quotaAfter = Math.max(100, nextAgent.quota - liquidatedQuota);
      const reservedAfter = Math.min(nextAgent.reservedQuota, quotaAfter);
      nextAgent = syncAgentY({
        ...nextAgent,
        quota: quotaAfter,
        reservedQuota: reservedAfter,
        status: 'isolated',
        f: Math.min(nextAgent.f + 1.5, 10),
      });
      settlementType = 'LIQUIDATE';
      reason = 'liquidation threshold breached';
    }

    results[id] = {
      agent: nextAgent,
      adjustment: -charge,
      type: settlementType,
      reason,
    };
  }

  return results;
}
