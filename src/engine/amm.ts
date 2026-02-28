import type { AgentState } from '../types/agent';

const MIN_SCORE = 0.01;
const MIN_Y = 1e-6;

/** Keep y aligned with quota bookkeeping */
export function syncAgentY(agent: AgentState): AgentState {
  const availableQuota = Math.max(0, agent.quota - agent.reservedQuota);
  return {
    ...agent,
    y: Math.max(1, availableQuota),
  };
}

/** Marginal base price P = k / y² */
export function getBasePrice(agent: AgentState): number {
  if (agent.y <= MIN_Y) return Infinity;
  return agent.k / (agent.y * agent.y);
}

/** Price for buying Δy capacity from AMM curve: Δx = k/(y-Δy) - k/y */
export function getDeltaX(agent: AgentState, deltaY: number): number {
  if (deltaY <= 0) return 0;
  const y = Math.max(agent.y, MIN_Y);
  const yAfter = y - deltaY;
  if (yAfter <= MIN_Y) return Infinity;
  return (agent.k / yAfter) - (agent.k / y);
}

/** Effective price: P_eff = Δx * (1 + f) / ŝ */
export function getEffectivePrice(agent: AgentState, deltaY: number = 1): number {
  const deltaX = getDeltaX(agent, deltaY);
  if (!Number.isFinite(deltaX)) return Infinity;
  return deltaX * (1 + agent.f) * (1 / Math.max(agent.s_hat, MIN_SCORE));
}

export interface ReserveResult {
  agent: AgentState;
  ok: boolean;
  reason?: string;
}

/** RESERVE only freezes capacity/quota, it does not settle payment */
export function reserve(agent: AgentState, delta: number): ReserveResult {
  const normalizedDelta = Math.max(0, delta);
  const availableQuota = Math.max(0, agent.quota - agent.reservedQuota);

  if (agent.activeTasks >= agent.capacity) {
    return {
      agent: { ...agent, status: 'overloaded' },
      ok: false,
      reason: 'capacity exhausted',
    };
  }

  if (availableQuota <= normalizedDelta) {
    return {
      agent: { ...agent, status: 'overloaded' },
      ok: false,
      reason: 'quota exhausted',
    };
  }

  const updated: AgentState = {
    ...agent,
    reservedQuota: agent.reservedQuota + normalizedDelta,
    activeTasks: agent.activeTasks + 1,
    status: 'executing',
  };

  return { agent: syncAgentY(updated), ok: true };
}

/** Release reserved quota (used by ABORT/COMPENSATE and post-COMMIT release) */
export function release(agent: AgentState, delta: number, preferredStatus: AgentState['status'] = 'idle'): AgentState {
  const normalizedDelta = Math.max(0, delta);
  const nextActive = Math.max(0, agent.activeTasks - 1);
  const nextReserved = Math.max(0, agent.reservedQuota - normalizedDelta);
  const nextStatus = nextActive === 0 ? preferredStatus : 'executing';

  return syncAgentY({
    ...agent,
    reservedQuota: nextReserved,
    activeTasks: nextActive,
    status: nextStatus,
  });
}

export interface CommitResult {
  agent: AgentState;
  burnAmount: number;
  netPayment: number;
}

/**
 * COMMIT:
 * 1) release frozen quota
 * 2) keep quota envelope unchanged (quota is not one-shot consumable stock)
 * 3) settle by payment, burn from payment only (not from y)
 */
export function commit(agent: AgentState, delta: number, payment: number, burnRate: number): CommitResult {
  const normalizedDelta = Math.max(0, delta);
  const normalizedPayment = Math.max(0, payment);
  const normalizedBurnRate = Math.min(Math.max(burnRate, 0), 1);
  const burnAmount = normalizedPayment * normalizedBurnRate;
  const netPayment = normalizedPayment - burnAmount;

  const nextActive = Math.max(0, agent.activeTasks - 1);
  const nextReserved = Math.max(0, agent.reservedQuota - normalizedDelta);

  const settled: AgentState = {
    ...agent,
    // Quota is capacity envelope, not one-shot consumable stock.
    // Execution consumes reserved slots, then releases them on commit.
    quota: agent.quota,
    reservedQuota: nextReserved,
    activeTasks: nextActive,
    totalCompleted: agent.totalCompleted + 1,
    status: nextActive === 0 ? 'idle' : 'executing',
    tradeBalance: agent.tradeBalance + netPayment,
    balance: agent.balance + netPayment,
  };

  return {
    agent: syncAgentY(settled),
    burnAmount,
    netPayment,
  };
}

/** Price curve points for charting */
export function getPriceCurvePoints(k: number, yMin: number, yMax: number, steps: number = 100): { y: number; p: number }[] {
  const points: { y: number; p: number }[] = [];
  const step = (yMax - yMin) / steps;
  for (let i = 0; i <= steps; i++) {
    const y = yMin + step * i;
    if (y > 0) {
      points.push({ y, p: k / (y * y) });
    }
  }
  return points;
}
