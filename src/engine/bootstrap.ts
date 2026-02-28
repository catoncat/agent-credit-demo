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

  const quota = Math.max(400, Math.min(900, Math.round(medianQuota * 0.7)));
  const capacity = Math.max(2, Math.min(4, Math.round(medianCapacity * 0.6)));
  const f = Math.max(1.2, Math.min(6, medianF * 0.8 + 1.0));
  const sHat = Math.max(0.45, Math.min(0.9, medianS * 0.9));

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
