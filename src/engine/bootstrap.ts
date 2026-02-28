import type { AgentId, AgentState } from '../types/agent';
import { createAgentState } from '../constants/initialState';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function createBootstrappedAgentState(
  id: AgentId,
  label: string,
  peers: Record<AgentId, AgentState>,
): AgentState {
  const base = createAgentState(id, label);
  const peerList = Object.values(peers);
  if (peerList.length === 0) return base;

  const medianF = median(peerList.map((agent) => agent.f));
  const medianS = median(peerList.map((agent) => agent.s_hat));
  const medianQuota = median(peerList.map((agent) => agent.quota));
  const medianCapacity = median(peerList.map((agent) => agent.capacity));
  const avgOutcomes = peerList.reduce(
    (sum, agent) => sum + agent.totalCompleted + agent.totalFailed,
    0,
  ) / Math.max(1, peerList.length);

  // Fair cold-start:
  // If the network itself is still cold (you add nodes before real traffic),
  // avoid giving new nodes an artificial disadvantage.
  const networkCold = avgOutcomes < 2;
  const quota = networkCold
    ? Math.max(850, Math.min(1000, Math.round(medianQuota * 0.95)))
    : Math.max(500, Math.min(950, Math.round(medianQuota * 0.85)));
  const capacity = networkCold
    ? Math.max(4, Math.min(5, Math.round(medianCapacity * 0.95)))
    : Math.max(3, Math.min(5, Math.round(medianCapacity * 0.85)));
  const f = networkCold
    ? Math.max(0, Math.min(0.4, medianF * 1.02 + 0.02))
    : Math.max(0.1, Math.min(3.5, medianF * 0.9 + 0.2));
  const sHat = networkCold
    ? Math.max(0.9, Math.min(1.0, medianS * 0.98))
    : Math.max(0.7, Math.min(1.0, medianS * 0.95));

  return {
    ...base,
    quota,
    y: quota,
    capacity,
    f,
    s_hat: sHat,
    balance: Math.max(2_000, base.balance * 0.6),
  };
}
