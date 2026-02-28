import type { AgentState, AgentId } from '../types/agent';
import type { Task, TaskValidationResult } from '../types/task';
import type { LedgerEntry } from '../types/ledger';
import type { StepAction } from '../types/step';
import { DEFAULT_BURN_RATE } from '../constants/initialState';
import { reserve, commit, getBasePrice, getDeltaX, getEffectivePrice, syncAgentY } from './amm';
import { routeTask, comparePrices, shouldOverflow } from './router';
import { sagaAbort } from './saga';
import { updateScore, decayFriction } from './hooks';
import { bancorSettle } from './bancor';
import { clamp } from '../utils/math';
import { normalizeSeed, nextRandomUnit, randomIntFromUnit } from '../utils/rng';

export const DEFAULT_SIM_SEED = 20260228;

export interface SimulationState {
  agents: Record<AgentId, AgentState>;
  tasks: Task[];
  ledger: LedgerEntry[];
  priceComparison: Record<AgentId, number> | null;
  clientBalance: number;
  tick: number;
  phase: number;
  rngState: number;
  lastNarrative: string;
}

export interface AutoTickOptions {
  clearEvery?: number;
  burnRate?: number;
  minDelta?: number;
  maxDelta?: number;
  routeNearBestRatio?: number;
  routeTemperature?: number;
  adaptiveDeltaFloor?: number;
  maxPaymentRatio?: number;
  budgetRefillThreshold?: number;
  arrivalBaseMin?: number;
  arrivalBaseMax?: number;
  arrivalBurstProb?: number;
  arrivalBurstMin?: number;
  arrivalBurstMax?: number;
  processingDelayMin?: number;
  processingDelayMax?: number;
  suspendArrivals?: boolean;
}

let taskCounter = 0;

function createTask(
  id: string,
  agentId: AgentId | null,
  delta: number,
  quotedPrice: number,
  effectivePrice: number,
): Task {
  return {
    id,
    assignedTo: agentId,
    status: 'INIT',
    delta,
    fee: Number.isFinite(effectivePrice) ? effectivePrice : 0,
    quotedPrice,
    effectivePrice,
    payment: 0,
    burn: 0,
    timestamp: Date.now(),
  };
}

function upsertTask(tasks: Task[], nextTask: Task): Task[] {
  const existingIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingIndex < 0) return [...tasks, nextTask];
  return tasks.map((task, index) => (index === existingIndex ? nextTask : task));
}

function updateTaskStatus(tasks: Task[], taskId: string, status: Task['status']): Task[] {
  return tasks.map((task) => (task.id === taskId ? { ...task, status } : task));
}

function patchTask(tasks: Task[], taskId: string, patch: Partial<Task>): Task[] {
  return tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));
}

function sampleProcessingDelay(
  agent: AgentState,
  nextRandom: () => number,
  minDelay: number,
  maxDelay: number,
): number {
  const baseDelay = randomIntFromUnit(minDelay, maxDelay, nextRandom());
  const frictionPenalty = agent.f > 5 ? 2 : agent.f > 3 ? 1 : 0;
  return Math.max(1, baseDelay + frictionPenalty);
}

function evaluateTaskOutput(
  agent: AgentState,
  nextRandom: () => number,
  tickNum: number,
): TaskValidationResult {
  const schemaProb = clamp(0.58 + agent.s_hat * 0.36 - agent.f * 0.05, 0.18, 0.98);
  const timeoutProb = clamp(0.02 + agent.f * 0.045 + (1 - agent.s_hat) * 0.12, 0.01, 0.88);
  const toolErrorProb = clamp(0.015 + agent.f * 0.035, 0.01, 0.72);
  const scoreRaw = agent.s_hat * 100 - agent.f * 4.2 + (nextRandom() - 0.5) * 20;
  const score = Math.round(clamp(scoreRaw, 0, 100) * 10) / 10;
  const schema = nextRandom() < schemaProb;
  const timeout = nextRandom() < timeoutProb;
  const toolError = !timeout && nextRandom() < toolErrorProb;

  let reason: TaskValidationResult['reason'] = 'pass';
  if (timeout) {
    reason = 'timeout';
  } else if (toolError) {
    reason = 'tool_error';
  } else if (!schema) {
    reason = 'schema_mismatch';
  } else if (score < 60) {
    reason = 'low_score';
  }

  return {
    schema,
    score,
    toolError,
    timeout,
    passed: reason === 'pass',
    reason,
    evaluatedTick: tickNum,
  };
}

function sampleArrivalPlan(
  nextRandom: () => number,
  baseMin: number,
  baseMax: number,
  burstProb: number,
  burstMin: number,
  burstMax: number,
): { count: number; burst: number } {
  const baseConcurrent = randomIntFromUnit(baseMin, baseMax, nextRandom());
  const burst = nextRandom() < burstProb ? randomIntFromUnit(burstMin, burstMax, nextRandom()) : 0;
  return {
    count: baseConcurrent + burst,
    burst,
  };
}

function getTaskPaymentEstimate(agent: AgentState, task: Pick<Task, 'effectivePrice' | 'delta'>): number {
  return Number.isFinite(task.effectivePrice)
    ? task.effectivePrice
    : getEffectivePrice(agent, task.delta);
}

function isAffordable(clientBalance: number, payment: number): boolean {
  return Number.isFinite(payment) && payment > 0 && clientBalance >= payment;
}

function applyDiversificationGuard(
  state: SimulationState,
  candidates: AgentId[],
  routeNearBestRatio: number,
  nextRandom: () => number,
): AgentId[] {
  if (candidates.length <= 1) return candidates;

  const candidateSet = new Set(candidates);
  const recentRoutes = state.ledger
    .filter((entry) => entry.action === 'ROUTE' && candidateSet.has(entry.agentId))
    .slice(-24);
  const minSamples = Math.max(6, candidates.length * 2);
  if (recentRoutes.length < minSamples) return candidates;

  const counts = new Map<AgentId, number>();
  for (const route of recentRoutes) {
    counts.set(route.agentId, (counts.get(route.agentId) ?? 0) + 1);
  }

  let dominantId: AgentId | null = null;
  let dominantCount = 0;
  for (const [id, count] of counts) {
    if (count > dominantCount) {
      dominantId = id;
      dominantCount = count;
    }
  }

  if (!dominantId || !candidateSet.has(dominantId)) return candidates;
  const diversified = candidates.filter((id) => id !== dominantId);
  if (diversified.length === 0) return candidates;

  const expectedShare = 1 / candidates.length;
  const dominantShare = dominantCount / recentRoutes.length;
  if (dominantShare <= expectedShare + 1e-9) return candidates;

  const relativeShare = dominantShare / expectedShare;
  const overshoot = (relativeShare - 1) / relativeShare;
  if (routeNearBestRatio <= 0 && dominantShare >= 0.6 && diversified.length > 0) {
    return diversified;
  }
  const diversificationWeight = Math.max(routeNearBestRatio, 0.2);
  const diversifyProb = clamp(overshoot * (1 + diversificationWeight), 0, 0.98);
  if (nextRandom() >= diversifyProb) return candidates;

  return diversified;
}

/** Execute a single action and return new state + ledger entries */
export function executeAction(
  state: SimulationState,
  action: StepAction,
  stepNum: number,
): { state: SimulationState; entries: LedgerEntry[] } {
  const entries: LedgerEntry[] = [];
  const agents = { ...state.agents };
  let tasks = [...state.tasks];
  const ledger = [...state.ledger];
  let priceComparison = state.priceComparison;
  let clientBalance = state.clientBalance;
  let rngState = normalizeSeed(state.rngState);
  let lastNarrative = state.lastNarrative;

  switch (action.type) {
    case 'COMPARE_PRICES': {
      const prices = comparePrices(agents, action.delta, action.candidates);
      priceComparison = prices;
      const finite = Object.values(prices).filter((price) => Number.isFinite(price));
      lastNarrative = finite.length > 0
        ? `COMPARE_PRICES: 最低报价 ${Math.min(...finite).toFixed(2)}`
        : 'COMPARE_PRICES: 无可用报价';
      break;
    }

    case 'ROUTE': {
      const result = routeTask(agents, action.delta, action.candidates, () => {
        const next = nextRandomUnit(rngState);
        rngState = next.seed;
        return next.value;
      }, (action.routeNearBestRatio ?? action.routeTemperature) !== undefined
        ? {
            nearBestRatio: action.routeNearBestRatio,
            temperature: action.routeTemperature,
          }
        : undefined);
      const selected = result.selectedAgent ?? action.target ?? null;
      const quotedPrice = selected && agents[selected] ? getDeltaX(agents[selected], action.delta) : Infinity;
      const effectivePrice = selected ? (result.prices[selected] ?? Infinity) : Infinity;
      const task = createTask(action.taskId, selected, action.delta, quotedPrice, effectivePrice);
      tasks = upsertTask(tasks, task);
      priceComparison = result.prices;
      lastNarrative = selected
        ? `ROUTE: ${action.taskId} -> ${selected}，${result.reason}`
        : `ROUTE: ${action.taskId} 失败，${result.reason}`;

      if (selected && agents[selected]) {
        const agent = agents[selected];
        const p = getBasePrice(agent);
        entries.push({
          step: stepNum,
          agentId: selected,
          action: 'ROUTE',
          deltaY: 0,
          deltaBalance: 0,
          deltaQuota: 0,
          yBefore: agent.y,
          yAfter: agent.y,
          priceBefore: p,
          priceAfter: p,
          fBefore: agent.f,
          fAfter: agent.f,
          description: `ROUTE ${action.taskId} -> ${selected}, P_eff=${effectivePrice.toFixed(2)} | ${result.reason}`,
        });
      }
      break;
    }

    case 'RESERVE': {
      const task = tasks.find((currentTask) => currentTask.id === action.taskId);
      const targetId = task?.assignedTo ?? action.agentId;
      const agent = targetId ? agents[targetId] : undefined;

      if (!task || !targetId || !agent) {
        lastNarrative = `RESERVE失败: task=${action.taskId} 或 agent 不存在`;
        break;
      }

      const pBefore = getBasePrice(agent);
      const result = reserve(agent, action.delta);
      const pAfter = getBasePrice(result.agent);
      agents[targetId] = result.agent;

      if (result.ok) {
        tasks = tasks.map((currentTask) => (
          currentTask.id === action.taskId
            ? {
                ...currentTask,
                assignedTo: targetId,
                status: 'RESERVE',
                delta: action.delta,
                quotedPrice: Number.isFinite(currentTask.quotedPrice)
                  ? currentTask.quotedPrice
                  : getDeltaX(agent, action.delta),
                effectivePrice: Number.isFinite(currentTask.effectivePrice)
                  ? currentTask.effectivePrice
                  : getEffectivePrice(agent, action.delta),
              }
            : currentTask
        ));

        entries.push({
          step: stepNum,
          agentId: targetId,
          action: 'RESERVE',
          deltaY: result.agent.y - agent.y,
          deltaBalance: 0,
          deltaQuota: 0,
          yBefore: agent.y,
          yAfter: result.agent.y,
          priceBefore: pBefore,
          priceAfter: pAfter,
          fBefore: agent.f,
          fAfter: result.agent.f,
          description: `RESERVE ${action.taskId}: 冻结容量 ${action.delta}`,
        });
        lastNarrative = `RESERVE成功: ${targetId} 冻结 ${action.delta}`;
      } else {
        tasks = updateTaskStatus(tasks, action.taskId, 'ABORT');
        lastNarrative = `RESERVE失败: ${targetId} ${result.reason ?? ''}`.trim();
      }
      break;
    }

    case 'DISPATCH': {
      tasks = updateTaskStatus(tasks, action.taskId, 'DISPATCH');
      lastNarrative = `DISPATCH: ${action.taskId} 进入执行`;
      break;
    }

    case 'FAIL': {
      const agent = agents[action.agentId];
      if (agent) {
        agents[action.agentId] = {
          ...agent,
          status: 'failed',
        };
      }
      tasks = updateTaskStatus(tasks, action.taskId, 'ABORT');
      lastNarrative = `FAIL: ${action.taskId} 在 ${action.agentId} 失败`;
      break;
    }

    case 'ABORT': {
      tasks = updateTaskStatus(tasks, action.taskId, 'ABORT');
      lastNarrative = `ABORT: ${action.taskId} 标记回滚`;
      break;
    }

    case 'COMPENSATE': {
      const task = tasks.find((currentTask) => currentTask.id === action.taskId);
      const agent = agents[action.agentId];
      if (!task || !agent) break;

      const pBefore = getBasePrice(agent);
      const result = sagaAbort(agent, task, 0.8);
      const pAfter = getBasePrice(result.agent);
      agents[action.agentId] = result.agent;
      tasks = tasks.map((currentTask) => (currentTask.id === action.taskId ? result.task : currentTask));
      clientBalance += result.refundAmount;

      entries.push({
        step: stepNum,
        agentId: action.agentId,
        action: 'ABORT',
        deltaY: result.agent.y - agent.y,
        deltaBalance: result.refundAmount,
        deltaQuota: 0,
        yBefore: agent.y,
        yAfter: result.agent.y,
        priceBefore: pBefore,
        priceAfter: pAfter,
        fBefore: agent.f,
        fAfter: result.agent.f,
        description: `COMPENSATE ${action.taskId}: 回滚冻结容量`,
      });

      lastNarrative = `COMPENSATE: ${action.taskId} 已回滚，退款 ${result.refundAmount.toFixed(2)}`;
      break;
    }

    case 'VALIDATE': {
      tasks = updateTaskStatus(tasks, action.taskId, 'VALIDATE');
      lastNarrative = `VALIDATE: ${action.taskId} 校验通过`;
      break;
    }

    case 'COMMIT': {
      const task = tasks.find((currentTask) => currentTask.id === action.taskId);
      const agentId = task?.assignedTo ?? action.agentId;
      const agent = agentId ? agents[agentId] : undefined;
      if (!task || !agentId || !agent) break;

      const payment = Number.isFinite(task.effectivePrice)
        ? task.effectivePrice
        : getEffectivePrice(agent, task.delta);
      const burnRate = action.burnRate ?? DEFAULT_BURN_RATE;

      if (!Number.isFinite(payment) || payment <= 0 || clientBalance < payment) {
        tasks = updateTaskStatus(tasks, action.taskId, 'ABORT');
        lastNarrative = `COMMIT失败: 客户端余额不足或报价无效 (${payment.toFixed(2)})`;
        break;
      }

      const pBefore = getBasePrice(agent);
      const committed = commit(agent, task.delta, payment, burnRate);
      const scored = decayFriction(updateScore(committed.agent, true), 0.03);
      const nextAgent = syncAgentY(scored);
      agents[agentId] = nextAgent;
      clientBalance -= payment;
      const pAfter = getBasePrice(nextAgent);

      tasks = tasks.map((currentTask) => (
        currentTask.id === action.taskId
          ? {
              ...currentTask,
              status: 'COMMITTED',
              fee: payment,
              payment,
              burn: committed.burnAmount,
              effectivePrice: payment,
            }
          : currentTask
      ));

      entries.push({
        step: stepNum,
        agentId,
        action: 'COMMIT',
        deltaY: nextAgent.y - agent.y,
        deltaBalance: committed.netPayment,
        deltaQuota: 0,
        yBefore: agent.y,
        yAfter: nextAgent.y,
        priceBefore: pBefore,
        priceAfter: pAfter,
        fBefore: agent.f,
        fAfter: nextAgent.f,
        description: `COMMIT ${action.taskId}: payment=${payment.toFixed(2)}, burn=${committed.burnAmount.toFixed(2)}`,
      });

      if (committed.burnAmount > 0) {
        entries.push({
          step: stepNum,
          agentId,
          action: 'BURN',
          deltaY: 0,
          deltaBalance: -committed.burnAmount,
          deltaQuota: 0,
          yBefore: nextAgent.y,
          yAfter: nextAgent.y,
          priceBefore: pAfter,
          priceAfter: pAfter,
          fBefore: nextAgent.f,
          fAfter: nextAgent.f,
          description: `BURN from payment: ${committed.burnAmount.toFixed(2)}`,
        });
      }

      lastNarrative = `COMMIT成功: ${action.taskId}，客户端支付 ${payment.toFixed(2)}`;
      break;
    }

    case 'BACKPRESSURE': {
      const delta = action.delta ?? 100;
      const sourceAgent = agents[action.agentId];
      if (!sourceAgent) break;

      let currentAgent = sourceAgent;
      for (let i = 0; i < action.count; i++) {
        const taskId = `task-bp-${++taskCounter}`;
        const quote = getDeltaX(currentAgent, delta);
        const effective = getEffectivePrice(currentAgent, delta);
        tasks = upsertTask(tasks, createTask(taskId, action.agentId, delta, quote, effective));

        const yBefore = currentAgent.y;
        const fBefore = currentAgent.f;
        const pBefore = getBasePrice(currentAgent);
        const reserveResult = reserve(currentAgent, delta);
        const pAfter = getBasePrice(reserveResult.agent);
        currentAgent = reserveResult.agent;

        if (!reserveResult.ok) {
          tasks = updateTaskStatus(tasks, taskId, 'ABORT');
          break;
        }

        tasks = updateTaskStatus(tasks, taskId, 'DISPATCH');
        entries.push({
          step: stepNum,
          agentId: action.agentId,
          action: 'RESERVE',
          deltaY: currentAgent.y - yBefore,
          deltaBalance: 0,
          deltaQuota: 0,
          yBefore,
          yAfter: currentAgent.y,
          priceBefore: pBefore,
          priceAfter: pAfter,
          fBefore,
          fAfter: currentAgent.f,
          description: `BACKPRESSURE ${i + 1}/${action.count}`,
        });
      }

      if (shouldOverflow(currentAgent, delta)) {
        currentAgent = { ...currentAgent, status: 'overloaded' };
      }
      agents[action.agentId] = currentAgent;
      lastNarrative = `BACKPRESSURE: ${action.agentId} 并发 ${action.count}`;
      break;
    }

    case 'OVERFLOW': {
      const routeResult = routeTask(agents, action.delta, [action.toAgent], () => {
        const next = nextRandomUnit(rngState);
        rngState = next.seed;
        return next.value;
      });
      const selected = routeResult.selectedAgent ?? action.toAgent;
      const targetAgent = agents[selected];
      if (!targetAgent) break;

      const quote = getDeltaX(targetAgent, action.delta);
      const effective = getEffectivePrice(targetAgent, action.delta);
      const task = createTask(action.taskId, selected, action.delta, quote, effective);
      tasks = upsertTask(tasks, task);

      const pBefore = getBasePrice(targetAgent);
      const reserveResult = reserve(targetAgent, action.delta);
      agents[selected] = reserveResult.agent;
      const pAfter = getBasePrice(reserveResult.agent);
      if (reserveResult.ok) {
        tasks = updateTaskStatus(tasks, action.taskId, 'RESERVE');
      } else {
        tasks = updateTaskStatus(tasks, action.taskId, 'ABORT');
      }

      entries.push({
        step: stepNum,
        agentId: selected,
        action: 'RESERVE',
        deltaY: reserveResult.agent.y - targetAgent.y,
        deltaBalance: 0,
        deltaQuota: 0,
        yBefore: targetAgent.y,
        yAfter: reserveResult.agent.y,
        priceBefore: pBefore,
        priceAfter: pAfter,
        fBefore: targetAgent.f,
        fAfter: reserveResult.agent.f,
        description: `OVERFLOW ${action.fromAgent} -> ${selected}`,
      });

      priceComparison = routeResult.prices;
      lastNarrative = `OVERFLOW: ${action.taskId} 从 ${action.fromAgent} 溢出到 ${selected}`;
      break;
    }

    case 'BANCOR_SETTLE': {
      const agent = agents[action.agentId];
      if (!agent) break;

      const amount = Math.max(0, action.amount);
      const pBefore = getBasePrice(agent);
      const updated = syncAgentY({
        ...agent,
        balance: agent.balance - amount,
        tradeBalance: action.actionType === 'TAX'
          ? agent.tradeBalance - amount
          : agent.tradeBalance + amount,
      });
      const pAfter = getBasePrice(updated);
      agents[action.agentId] = updated;

      entries.push({
        step: stepNum,
        agentId: action.agentId,
        action: action.actionType === 'TAX' ? 'BANCOR_TAX' : 'BANCOR_FEE',
        deltaY: updated.y - agent.y,
        deltaBalance: -amount,
        deltaQuota: 0,
        yBefore: agent.y,
        yAfter: updated.y,
        priceBefore: pBefore,
        priceAfter: pAfter,
        fBefore: agent.f,
        fAfter: updated.f,
        description: `BANCOR ${action.actionType}: ${amount.toFixed(2)}`,
      });
      lastNarrative = `BANCOR_SETTLE: ${action.agentId} ${action.actionType} ${amount.toFixed(2)}`;
      break;
    }
  }

  return {
    state: {
      ...state,
      agents,
      tasks,
      ledger: [...ledger, ...entries],
      priceComparison,
      clientBalance,
      rngState,
      lastNarrative,
    },
    entries,
  };
}

/** Execute all actions for a step */
export function executeStep(
  state: SimulationState,
  actions: StepAction[],
  stepNum: number,
): SimulationState {
  let current = state;
  for (const action of actions) {
    const result = executeAction(current, action, stepNum);
    current = result.state;
  }
  return current;
}

/** Periodic multi-agent clearing + threshold liquidation */
export function applyPeriodicClearing(state: SimulationState, stepNum: number): SimulationState {
  const settled = bancorSettle(state.agents);
  const nextAgents: Record<AgentId, AgentState> = { ...state.agents };
  const entries: LedgerEntry[] = [];
  const narrativeParts: string[] = [];

  for (const id of Object.keys(settled)) {
    const result = settled[id];
    const before = state.agents[id];
    if (!before) continue;

    nextAgents[id] = result.agent;
    if (result.type === 'NONE' && Math.abs(result.adjustment) < 1e-9) {
      continue;
    }

    if (result.type === 'LIQUIDATE') {
      entries.push({
        step: stepNum,
        agentId: id,
        action: 'LIQUIDATE',
        deltaY: result.agent.y - before.y,
        deltaBalance: 0,
        deltaQuota: result.agent.quota - before.quota,
        yBefore: before.y,
        yAfter: result.agent.y,
        priceBefore: getBasePrice(before),
        priceAfter: getBasePrice(result.agent),
        fBefore: before.f,
        fAfter: result.agent.f,
        description: `LIQUIDATE: ${result.reason}`,
      });
      narrativeParts.push(`${id}:LIQUIDATE`);
      continue;
    }

    entries.push({
      step: stepNum,
      agentId: id,
      action: result.type === 'TAX' ? 'BANCOR_TAX' : 'BANCOR_FEE',
      deltaY: result.agent.y - before.y,
      deltaBalance: result.adjustment,
      deltaQuota: 0,
      yBefore: before.y,
      yAfter: result.agent.y,
      priceBefore: getBasePrice(before),
      priceAfter: getBasePrice(result.agent),
      fBefore: before.f,
      fAfter: result.agent.f,
      description: `CLEARING ${result.type}: ${Math.abs(result.adjustment).toFixed(2)}`,
    });
    narrativeParts.push(`${id}:${result.type}`);
  }

  return {
    ...state,
    agents: nextAgents,
    ledger: [...state.ledger, ...entries],
    lastNarrative: narrativeParts.length > 0
      ? `Periodic clearing -> ${narrativeParts.join(', ')}`
      : state.lastNarrative,
  };
}

/** One autonomous tick after guide phases */
export function executeAutoTick(
  state: SimulationState,
  stepNum: number,
  options: AutoTickOptions = {},
): SimulationState {
  const tickNum = state.tick + 1;
  const clearEvery = options.clearEvery ?? 5;
  const burnRate = options.burnRate ?? DEFAULT_BURN_RATE;
  const minDelta = options.minDelta ?? 40;
  const maxDelta = options.maxDelta ?? 160;
  const routeNearBestRatio = Math.min(Math.max(options.routeNearBestRatio ?? 0, 0), 1);
  const routeTemperature = Math.max(options.routeTemperature ?? 0.08, 1e-6);
  const adaptiveDeltaFloor = Math.max(0, Math.floor(options.adaptiveDeltaFloor ?? 0));
  const maxPaymentRatio = Math.min(Math.max(options.maxPaymentRatio ?? 1, 0.05), 1);
  const budgetRefillThreshold = Math.max(0, options.budgetRefillThreshold ?? 0);
  const arrivalBaseMin = Math.max(1, Math.floor(options.arrivalBaseMin ?? 2));
  const arrivalBaseMax = Math.max(arrivalBaseMin, Math.floor(options.arrivalBaseMax ?? 3));
  const arrivalBurstProb = Math.min(Math.max(options.arrivalBurstProb ?? 0.18, 0), 1);
  const arrivalBurstMin = Math.max(0, Math.floor(options.arrivalBurstMin ?? 2));
  const arrivalBurstMax = Math.max(arrivalBurstMin, Math.floor(options.arrivalBurstMax ?? 4));
  const processingDelayMin = Math.max(1, Math.floor(options.processingDelayMin ?? 1));
  const processingDelayMax = Math.max(processingDelayMin, Math.floor(options.processingDelayMax ?? 3));
  const suspendArrivals = options.suspendArrivals ?? false;
  const candidates = Object.keys(state.agents);
  if (candidates.length === 0) return state;

  let current: SimulationState = {
    ...state,
    rngState: normalizeSeed(state.rngState),
  };
  const nextRandom = (): number => {
    const next = nextRandomUnit(current.rngState);
    current = {
      ...current,
      rngState: next.seed,
    };
    return next.value;
  };
  const finalizeTick = (snapshot: SimulationState, narrative: string): SimulationState => {
    const decayedAgents: Record<AgentId, AgentState> = {};
    for (const id of Object.keys(snapshot.agents)) {
      const decayed = syncAgentY(decayFriction(snapshot.agents[id], 0.06));
      decayedAgents[id] = decayed.status === 'isolated' && decayed.f < 3.2
        ? { ...decayed, status: 'idle' }
        : decayed;
    }

    let finalized: SimulationState = {
      ...snapshot,
      agents: decayedAgents,
    };

    if (stepNum % clearEvery === 0) {
      finalized = applyPeriodicClearing(finalized, stepNum);
      if (budgetRefillThreshold > 0 && finalized.clientBalance < budgetRefillThreshold) {
        const refillAmount = budgetRefillThreshold - finalized.clientBalance;
        finalized = {
          ...finalized,
          clientBalance: finalized.clientBalance + refillAmount,
        };
        narrative = `${narrative} | BUDGET_REFILL +${refillAmount.toFixed(0)}`;
      }
    }

    return {
      ...finalized,
      lastNarrative: narrative,
    };
  };

  const abortAndCompensate = (taskId: string, agentId: AgentId, delta: number): void => {
    current = executeAction(
      current,
      { type: 'ABORT', taskId, agentId },
      stepNum,
    ).state;
    current = executeAction(
      current,
      { type: 'COMPENSATE', taskId, agentId, delta },
      stepNum,
    ).state;
  };

  const failAbortAndCompensate = (taskId: string, agentId: AgentId, delta: number): void => {
    current = executeAction(
      current,
      { type: 'FAIL', taskId, agentId },
      stepNum,
    ).state;
    abortAndCompensate(taskId, agentId, delta);
  };

  let settledCount = 0;
  let failedCount = 0;
  let waitingCount = 0;

  // First settle some in-flight tasks, but only those whose DISPATCH delay is ready.
  const inflight = current.tasks
    .filter((task) => ['RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status))
    .slice(0, 8);

  for (const task of inflight) {
    if (!task.assignedTo) continue;
    const agentId = task.assignedTo;
    const agent = current.agents[agentId];
    if (!agent) continue;

    if (task.status === 'RESERVE') {
      current = executeAction(
        current,
        { type: 'DISPATCH', taskId: task.id, agentId },
        stepNum,
      ).state;
      const readyTick = tickNum + sampleProcessingDelay(
        agent,
        nextRandom,
        processingDelayMin,
        processingDelayMax,
      );
      current = {
        ...current,
        tasks: patchTask(current.tasks, task.id, {
          dispatchTick: tickNum,
          readyTick,
          validator: undefined,
        }),
      };
      waitingCount += 1;
      continue;
    }

    if (task.status === 'VALIDATE') {
      const paymentEstimate = getTaskPaymentEstimate(agent, task);
      if (!isAffordable(current.clientBalance, paymentEstimate)) {
        abortAndCompensate(task.id, agentId, task.delta);
        failedCount += 1;
        continue;
      }

      current = executeAction(
        current,
        { type: 'COMMIT', taskId: task.id, agentId, burnRate },
        stepNum,
      ).state;

      const committedLegacyTask = current.tasks.find((currentTask) => currentTask.id === task.id);
      if (!committedLegacyTask || committedLegacyTask.status !== 'COMMITTED') {
        abortAndCompensate(task.id, agentId, task.delta);
        failedCount += 1;
      } else {
        settledCount += 1;
      }
      continue;
    }

    const dispatchTick = task.dispatchTick ?? Math.max(0, tickNum - 1);
    const readyTick = task.readyTick ?? (dispatchTick + 1);
    if (task.dispatchTick === undefined || task.readyTick === undefined) {
      current = {
        ...current,
        tasks: patchTask(current.tasks, task.id, { dispatchTick, readyTick }),
      };
    }

    if (tickNum < readyTick) {
      waitingCount += 1;
      continue;
    }

    const latestAgent = current.agents[agentId];
    if (!latestAgent) continue;
    const paymentEstimate = getTaskPaymentEstimate(latestAgent, task);
    if (!isAffordable(current.clientBalance, paymentEstimate)) {
      abortAndCompensate(task.id, agentId, task.delta);
      failedCount += 1;
      continue;
    }

    const validatorResult = evaluateTaskOutput(latestAgent, nextRandom, tickNum);
    current = {
      ...current,
      tasks: patchTask(current.tasks, task.id, { validator: validatorResult }),
    };

    if (!validatorResult.passed) {
      failAbortAndCompensate(task.id, agentId, task.delta);
      failedCount += 1;
      continue;
    }

    current = executeAction(
      current,
      { type: 'VALIDATE', taskId: task.id, agentId },
      stepNum,
    ).state;
    current = executeAction(
      current,
      { type: 'COMMIT', taskId: task.id, agentId, burnRate },
      stepNum,
    ).state;

    const committedInFlightTask = current.tasks.find((currentTask) => currentTask.id === task.id);
    if (!committedInFlightTask || committedInFlightTask.status !== 'COMMITTED') {
      abortAndCompensate(task.id, agentId, task.delta);
      failedCount += 1;
      continue;
    }
    settledCount += 1;
  }

  const arrivalPlan = suspendArrivals
    ? { count: 0, burst: 0 }
    : sampleArrivalPlan(
        nextRandom,
        arrivalBaseMin,
        arrivalBaseMax,
        arrivalBurstProb,
        arrivalBurstMin,
        arrivalBurstMax,
      );
  let dispatchedCount = 0;
  let budgetSkipped = 0;
  let capacitySkipped = 0;
  let routeFailed = 0;
  let reserveFailed = 0;
  const ticksUntilClear = (() => {
    const phaseInCycle = stepNum % clearEvery;
    if (phaseInCycle === 0) return clearEvery;
    return clearEvery - phaseInCycle;
  })();

  for (let i = 0; i < arrivalPlan.count; i++) {
    const taskId = `auto-${tickNum}-${++taskCounter}`;
    const baseDelta = randomIntFromUnit(minDelta, maxDelta, nextRandom());
    const adaptiveDeltas = adaptiveDeltaFloor > 0 && adaptiveDeltaFloor < baseDelta
      ? [
          baseDelta,
          Math.max(adaptiveDeltaFloor, Math.floor(baseDelta * 0.75)),
          Math.max(adaptiveDeltaFloor, Math.floor(baseDelta * 0.5)),
          adaptiveDeltaFloor,
        ].filter((delta, index, list) => list.indexOf(delta) === index)
      : [baseDelta];
    if (!adaptiveDeltas.includes(1)) {
      adaptiveDeltas.push(1);
    }

    let dispatchDelta = baseDelta;
    let affordableCandidates: AgentId[] = [];
    const epochPacingCap = current.clientBalance / Math.max(1, ticksUntilClear);
    const paymentCap = Math.max(0, Math.min(current.clientBalance * maxPaymentRatio, epochPacingCap));
    let bestAffordableCandidates: AgentId[] = [];
    let bestFiniteCandidates: AgentId[] = [];
    let bestDelta = baseDelta;
    for (const candidateDelta of adaptiveDeltas) {
      current = executeAction(
        current,
        { type: 'COMPARE_PRICES', candidates, delta: candidateDelta },
        stepNum,
      ).state;
      const finiteCandidates = candidates.filter((id) => {
        const price = current.priceComparison?.[id];
        return typeof price === 'number' && Number.isFinite(price);
      });
      const currentAffordable = candidates.filter((id) => {
        const price = current.priceComparison?.[id];
        return typeof price === 'number'
          && isAffordable(current.clientBalance, price)
          && price <= paymentCap + 1e-9;
      });
      if (finiteCandidates.length > bestFiniteCandidates.length) {
        bestFiniteCandidates = finiteCandidates;
      }
      if (currentAffordable.length > 0) {
        if (currentAffordable.length > bestAffordableCandidates.length) {
          bestDelta = candidateDelta;
          bestAffordableCandidates = currentAffordable;
        }
        if (currentAffordable.length >= 2) {
          dispatchDelta = candidateDelta;
          affordableCandidates = currentAffordable;
          break;
        }
      }
    }
    if (affordableCandidates.length === 0 && bestAffordableCandidates.length > 0) {
      dispatchDelta = bestDelta;
      affordableCandidates = bestAffordableCandidates;
    }
    affordableCandidates = applyDiversificationGuard(
      current,
      affordableCandidates,
      routeNearBestRatio,
      nextRandom,
    );

    if (affordableCandidates.length === 0) {
      if (bestFiniteCandidates.length > 0) {
        budgetSkipped += 1;
      } else {
        capacitySkipped += 1;
      }
      continue;
    }

    current = executeAction(
      current,
      {
        type: 'ROUTE',
        taskId,
        delta: dispatchDelta,
        candidates: affordableCandidates,
        routeNearBestRatio,
        routeTemperature,
      },
      stepNum,
    ).state;

    const routedTask = current.tasks.find((task) => task.id === taskId);
    if (!routedTask || !routedTask.assignedTo) {
      routeFailed += 1;
      continue;
    }

    const agentId = routedTask.assignedTo;
    current = executeAction(
      current,
      { type: 'RESERVE', taskId, agentId, delta: dispatchDelta },
      stepNum,
    ).state;

    const reservedTask = current.tasks.find((task) => task.id === taskId);
    if (!reservedTask || reservedTask.status !== 'RESERVE') {
      reserveFailed += 1;
      continue;
    }

    current = executeAction(
      current,
      { type: 'DISPATCH', taskId, agentId },
      stepNum,
    ).state;

    const dispatchAgent = current.agents[agentId];
    if (!dispatchAgent) {
      abortAndCompensate(taskId, agentId, dispatchDelta);
      reserveFailed += 1;
      continue;
    }

    const readyTick = tickNum + sampleProcessingDelay(
      dispatchAgent,
      nextRandom,
      processingDelayMin,
      processingDelayMax,
    );
    current = {
      ...current,
      tasks: patchTask(current.tasks, taskId, {
        dispatchTick: tickNum,
        readyTick,
        validator: undefined,
      }),
    };
    dispatchedCount += 1;
    waitingCount += 1;
  }

  const summary = `AUTO TICK ${tickNum}: arrivals=${arrivalPlan.count}, burst=${arrivalPlan.burst}, dispatched=${dispatchedCount}, settled=${settledCount}, failed=${failedCount}, waiting=${waitingCount}, budgetSkipped=${budgetSkipped}, capacitySkipped=${capacitySkipped}, routeFailed=${routeFailed}, reserveFailed=${reserveFailed}`;
  return finalizeTick(current, summary);
}
