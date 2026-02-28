import type { AgentState, AgentId } from '../types/agent';
import { getEffectivePrice } from './amm';

export interface RouteResult {
  selectedAgent: AgentId | null;
  prices: Record<AgentId, number>;
  reason: string;
}

export interface RoutePolicyOptions {
  nearBestRatio?: number;
  temperature?: number;
}

function resolveCandidates(agents: Record<AgentId, AgentState>, candidates?: AgentId[]): AgentId[] {
  if (candidates && candidates.length > 0) return candidates;
  return Object.keys(agents);
}

export function comparePrices(
  agents: Record<AgentId, AgentState>,
  delta: number,
  candidates?: AgentId[],
): Record<AgentId, number> {
  const ids = resolveCandidates(agents, candidates);
  const prices: Record<AgentId, number> = {};

  for (const id of ids) {
    const agent = agents[id];
    if (!agent) {
      prices[id] = Infinity;
      continue;
    }

    const freeQuota = Math.max(0, agent.quota - agent.reservedQuota);
    const unavailable = agent.status === 'isolated' || agent.activeTasks >= agent.capacity || freeQuota <= delta;
    if (unavailable) {
      prices[id] = Infinity;
      continue;
    }

    const basePrice = getEffectivePrice(agent, delta);

    // Cold-start + load damping:
    // - cold-start has mild premium (avoid "new node always wins/losses")
    // - loaded nodes pay extra to discourage hotspots
    const outcomes = agent.totalCompleted + agent.totalFailed;
    const confidence = Math.min(1, outcomes / 12);
    const warmupMultiplier = 1 + (1 - confidence) * 1.4;

    const utilization = agent.capacity > 0 ? agent.activeTasks / agent.capacity : 1;
    const loadMultiplier = 1 + Math.max(0, utilization) * 0.35;

    prices[id] = basePrice * warmupMultiplier * loadMultiplier;
  }

  return prices;
}

function sampleWeightedCandidate(
  candidates: AgentId[],
  prices: Record<AgentId, number>,
  bestPrice: number,
  randomUnit: number,
  temperature: number,
): AgentId {
  const safeBestPrice = Math.max(bestPrice, 1e-9);
  const safeTemp = Math.max(temperature, 1e-6);
  const weights = candidates.map((id) => {
    const distance = Math.max(0, prices[id] - bestPrice);
    return Math.exp(-distance / (safeBestPrice * safeTemp));
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return candidates[Math.floor(randomUnit * candidates.length)];
  }

  const target = randomUnit * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (target <= cumulative) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Route task to the cheapest available node under real pricing formula */
export function routeTask(
  agents: Record<AgentId, AgentState>,
  delta: number,
  candidates?: AgentId[],
  nextRandom?: () => number,
  options?: RoutePolicyOptions,
): RouteResult {
  const ids = resolveCandidates(agents, candidates);
  const prices = comparePrices(agents, delta, ids);

  const finite = ids.filter((id) => Number.isFinite(prices[id]));
  if (finite.length === 0) {
    return {
      selectedAgent: null,
      prices,
      reason: '无可用节点：容量或配额不足',
    };
  }

  const bestPrice = Math.min(...finite.map((id) => prices[id]));
  const nearBestRatio = Math.min(Math.max(options?.nearBestRatio ?? 0, 0), 1);
  const nearBestThreshold = bestPrice * (1 + nearBestRatio);
  const nearBestCandidates = finite.filter((id) => prices[id] <= nearBestThreshold + 1e-9);
  const randomUnit = nextRandom ? nextRandom() : Math.random();
  const selectedPool = nearBestCandidates.length > 0 ? nearBestCandidates : finite;
  const selectedAgent = sampleWeightedCandidate(
    selectedPool,
    prices,
    bestPrice,
    randomUnit,
    options?.temperature ?? 0.08,
  );

  if (selectedPool.length > 1) {
    if (nearBestRatio > 0) {
      return {
        selectedAgent,
        prices,
        reason: `近优采样(${selectedPool.length}/${finite.length})，选中 ${selectedAgent}`,
      };
    }
    return {
      selectedAgent,
      prices,
      reason: `并列最低报价(${selectedPool.length})，随机选中 ${selectedAgent}`,
    };
  }

  return {
    selectedAgent,
    prices,
    reason: `最低有效价格(${finite.length}候选): ${selectedAgent} -> ${bestPrice.toFixed(2)}`,
  };
}

/** Overflow trigger based on quote or capacity */
export function shouldOverflow(agent: AgentState, delta: number = 100, priceThreshold: number = 30_000): boolean {
  const price = getEffectivePrice(agent, delta);
  return price > priceThreshold || agent.activeTasks >= agent.capacity;
}
