import type { AgentState } from '../types/agent';
import { clamp } from '../utils/math';

/** Increase friction after failure/rollback */
export function applyFrictionPenalty(agent: AgentState, penalty: number = 0.8, alpha: number = 1.0): AgentState {
  return {
    ...agent,
    f: clamp(agent.f + alpha * penalty, 0, 10),
  };
}

/** Natural friction decay per tick */
export function decayFriction(agent: AgentState, decayRate: number = 0.05): AgentState {
  return {
    ...agent,
    f: clamp(agent.f * (1 - decayRate), 0, 10),
  };
}

/** Score update after success/failure */
export function updateScore(agent: AgentState, success: boolean): AgentState {
  const delta = success ? 0.035 : -0.06;
  return {
    ...agent,
    s_hat: clamp(agent.s_hat + delta, 0.1, 1.5),
  };
}

/** QoS multiplier in P_eff */
export function getQoSMultiplier(agent: AgentState): number {
  return (1 + agent.f) / Math.max(agent.s_hat, 0.01);
}
