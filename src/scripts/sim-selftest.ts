import {
  INITIAL_AGENTS,
  STEP_DEFINITIONS,
} from '../constants/initialState';
import { createBootstrappedAgentState } from '../engine/bootstrap';
import { DEFAULT_SIM_SEED, executeAutoTick, type SimulationState } from '../engine/simulation';
import type { AgentId } from '../types/agent';
import type { TaskStatus } from '../types/task';
import { normalizeSeed } from '../utils/rng';

interface CliOptions {
  steps: number;
  trials: number;
  clearEvery: number;
  addNodesAt: number[];
  routeNearBestRatio: number;
  routeTemperature: number;
  adaptiveDeltaFloor: number;
  maxPaymentRatio: number;
  budgetRefillThreshold: number;
  arrivalBaseMin: number;
  arrivalBaseMax: number;
  arrivalBurstProb: number;
  arrivalBurstMin: number;
  arrivalBurstMax: number;
  processingDelayMin: number;
  processingDelayMax: number;
  clientBalance: number;
  minCommitRate: number;
  maxFailureRate: number;
  minRoutesPerStep: number;
  maxFailedTrialRatio: number;
  verbose: boolean;
  obsGate: boolean;
  obsMaxTop1Share: number;
  obsMaxHhi: number;
  obsMaxBudgetSkipRatio: number;
  obsMaxBudgetSkipStreak: number;
  obsMinActiveRouteNodes: number;
}

interface BunRuntime {
  argv: string[];
}

const bunRuntime = (globalThis as { Bun?: BunRuntime }).Bun;
const argv = bunRuntime ? bunRuntime.argv.slice(2) : [];

interface TrialResult {
  trial: number;
  committed: number;
  failed: number;
  inflight: number;
  routes: number;
  commitRate: number;
  failureRate: number;
  routesPerStep: number;
  budgetSkips: number;
  budgetSkipRatio: number;
  maxBudgetSkipStreak: number;
  isolated: number;
  top1Share: number;
  hhi: number;
  activeRouteNodes: number;
  clientBalance: number;
  issues: string[];
}

const KNOWN_STATUSES = new Set<TaskStatus>([
  'INIT',
  'RESERVE',
  'DISPATCH',
  'VALIDATE',
  'COMMIT',
  'COMMITTED',
  'ABORT',
  'COMPENSATE',
  'ABORTED',
]);

function parseNumberFlag(name: string, fallback: number): number {
  const idx = argv.indexOf(name);
  if (idx < 0) return fallback;
  const raw = argv[idx + 1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseAddNodesAt(): number[] {
  const idx = argv.indexOf('--add-nodes-at');
  const raw = idx < 0 ? '20,40,60' : (argv[idx + 1] ?? '20,40,60');
  const parsed = raw
    .split(',')
    .map((v: string) => Number(v.trim()))
    .filter((n: number) => Number.isInteger(n) && n > 0) as number[];
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function parseOptions(): CliOptions {
  return {
    steps: Math.max(1, Math.floor(parseNumberFlag('--steps', 100))),
    trials: Math.max(1, Math.floor(parseNumberFlag('--trials', 30))),
    clearEvery: Math.max(1, Math.floor(parseNumberFlag('--clear-every', 8))),
    addNodesAt: parseAddNodesAt(),
    routeNearBestRatio: Math.max(0, parseNumberFlag('--route-near-best-ratio', 0.75)),
    routeTemperature: Math.max(0.001, parseNumberFlag('--route-temperature', 0.35)),
    adaptiveDeltaFloor: Math.max(0, Math.floor(parseNumberFlag('--adaptive-delta-floor', 8))),
    maxPaymentRatio: Math.min(Math.max(parseNumberFlag('--max-payment-ratio', 0.08), 0.05), 1),
    budgetRefillThreshold: Math.max(0, parseNumberFlag('--budget-refill-threshold', 9000)),
    arrivalBaseMin: Math.max(1, Math.floor(parseNumberFlag('--arrival-base-min', 2))),
    arrivalBaseMax: Math.max(1, Math.floor(parseNumberFlag('--arrival-base-max', 3))),
    arrivalBurstProb: Math.min(Math.max(parseNumberFlag('--arrival-burst-prob', 0.18), 0), 1),
    arrivalBurstMin: Math.max(0, Math.floor(parseNumberFlag('--arrival-burst-min', 2))),
    arrivalBurstMax: Math.max(0, Math.floor(parseNumberFlag('--arrival-burst-max', 4))),
    processingDelayMin: Math.max(1, Math.floor(parseNumberFlag('--processing-delay-min', 1))),
    processingDelayMax: Math.max(1, Math.floor(parseNumberFlag('--processing-delay-max', 3))),
    clientBalance: Math.max(1, parseNumberFlag('--client-balance', 1_000_000)),
    minCommitRate: Math.min(Math.max(parseNumberFlag('--min-commit-rate', 0.82), 0), 1),
    maxFailureRate: Math.min(Math.max(parseNumberFlag('--max-failure-rate', 0.18), 0), 1),
    minRoutesPerStep: Math.max(0, parseNumberFlag('--min-routes-per-step', 1.8)),
    maxFailedTrialRatio: Math.min(Math.max(parseNumberFlag('--max-failed-trial-ratio', 0.05), 0), 1),
    verbose: argv.includes('--verbose'),
    obsGate: argv.includes('--obs-gate'),
    obsMaxTop1Share: parseNumberFlag('--obs-max-top1-share', 1),
    obsMaxHhi: parseNumberFlag('--obs-max-hhi', 1),
    obsMaxBudgetSkipRatio: parseNumberFlag('--obs-max-budget-skip-ratio', 1),
    obsMaxBudgetSkipStreak: parseNumberFlag('--obs-max-budget-skip-streak', 1_000_000),
    obsMinActiveRouteNodes: parseNumberFlag('--obs-min-active-route-nodes', 0),
  };
}

function deriveTrialSeed(baseSeed: number, trial: number): number {
  const mixed = (baseSeed ^ Math.imul(trial, 0x9e3779b1)) >>> 0;
  return normalizeSeed(mixed);
}

function makeInitialState(clientBalance: number, rngSeed: number): SimulationState {
  return {
    agents: structuredClone(INITIAL_AGENTS),
    tasks: [],
    ledger: [],
    priceComparison: null,
    clientBalance,
    tick: 0,
    phase: STEP_DEFINITIONS.length,
    rngState: normalizeSeed(rngSeed),
    lastNarrative: 'selftest',
  };
}

function validateState(state: SimulationState): string[] {
  const issues: string[] = [];

  const taskIds = new Set<string>();
  for (const task of state.tasks) {
    if (taskIds.has(task.id)) issues.push(`duplicate task id: ${task.id}`);
    taskIds.add(task.id);

    if (!KNOWN_STATUSES.has(task.status)) {
      issues.push(`invalid task status: ${task.id}/${task.status}`);
    }

    if (!Number.isFinite(task.delta) || task.delta < 0) {
      issues.push(`invalid task delta: ${task.id}/${task.delta}`);
    }

    if (['RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status) && !task.assignedTo) {
      issues.push(`inflight task without assignee: ${task.id}/${task.status}`);
    }
  }

  for (const [id, agent] of Object.entries(state.agents)) {
    const fields = [
      ['quota', agent.quota],
      ['reservedQuota', agent.reservedQuota],
      ['y', agent.y],
      ['capacity', agent.capacity],
      ['activeTasks', agent.activeTasks],
      ['f', agent.f],
      ['s_hat', agent.s_hat],
      ['balance', agent.balance],
      ['tradeBalance', agent.tradeBalance],
    ] as const;
    for (const [field, value] of fields) {
      if (!Number.isFinite(value)) issues.push(`non-finite agent ${id}.${field}: ${value}`);
    }

    if (agent.reservedQuota < 0 || agent.reservedQuota > agent.quota + 1e-9) {
      issues.push(`invalid reservedQuota: ${id} reserved=${agent.reservedQuota} quota=${agent.quota}`);
    }
    if (agent.activeTasks < 0 || agent.activeTasks > agent.capacity + 1e-9) {
      issues.push(`invalid activeTasks: ${id} active=${agent.activeTasks} cap=${agent.capacity}`);
    }
    if (agent.f < -1e-9 || agent.f > 10 + 1e-9) {
      issues.push(`invalid friction range: ${id} f=${agent.f}`);
    }
    if (agent.s_hat < 0.1 - 1e-9 || agent.s_hat > 1.5 + 1e-9) {
      issues.push(`invalid score range: ${id} s_hat=${agent.s_hat}`);
    }

    const expectedY = Math.max(1, agent.quota - agent.reservedQuota);
    if (Math.abs(agent.y - expectedY) > 1e-6) {
      issues.push(`y mismatch: ${id} y=${agent.y} expected=${expectedY}`);
    }
  }

  return issues;
}

function runTrial(trial: number, options: CliOptions): TrialResult {
  const trialSeed = deriveTrialSeed(DEFAULT_SIM_SEED, trial);
  let state = makeInitialState(options.clientBalance, trialSeed);
  const issues: string[] = [];
  let simulatedTicks = 0;
  let budgetSkips = 0;
  let budgetSkipStreak = 0;
  let maxBudgetSkipStreak = 0;

  for (let step = 1; step <= options.steps; step++) {
    if (options.addNodesAt.includes(step)) {
      const id = `N${Object.keys(state.agents).length + 1}` as AgentId;
      state.agents[id] = createBootstrappedAgentState(id, `Agent-${id}`, state.agents);
    }

    state = executeAutoTick(state, STEP_DEFINITIONS.length + step, {
      clearEvery: options.clearEvery,
      routeNearBestRatio: options.routeNearBestRatio,
      routeTemperature: options.routeTemperature,
      adaptiveDeltaFloor: options.adaptiveDeltaFloor,
      maxPaymentRatio: options.maxPaymentRatio,
      budgetRefillThreshold: options.budgetRefillThreshold,
      arrivalBaseMin: options.arrivalBaseMin,
      arrivalBaseMax: options.arrivalBaseMax,
      arrivalBurstProb: options.arrivalBurstProb,
      arrivalBurstMin: options.arrivalBurstMin,
      arrivalBurstMax: options.arrivalBurstMax,
      processingDelayMin: options.processingDelayMin,
      processingDelayMax: options.processingDelayMax,
    });
    state = {
      ...state,
      tick: step,
      phase: STEP_DEFINITIONS.length + step,
    };
    simulatedTicks = step;

    if (state.lastNarrative.includes('预算不足')) {
      budgetSkips += 1;
      budgetSkipStreak += 1;
      maxBudgetSkipStreak = Math.max(maxBudgetSkipStreak, budgetSkipStreak);
    } else {
      budgetSkipStreak = 0;
    }
    const stepIssues = validateState(state);
    if (stepIssues.length > 0) {
      issues.push(`step ${step}: ${stepIssues.join(' | ')}`);
      break;
    }
  }

  const maxDrainTicks = Math.max(24, Math.ceil(options.steps * 0.4));
  for (let drain = 1; drain <= maxDrainTicks; drain++) {
    const inflightNow = state.tasks.filter((task) => ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status)).length;
    if (inflightNow <= 0) break;

    const nextTick = simulatedTicks + 1;
    const nextStepNum = STEP_DEFINITIONS.length + nextTick;
    state = executeAutoTick(state, nextStepNum, {
      clearEvery: options.clearEvery,
      routeNearBestRatio: options.routeNearBestRatio,
      routeTemperature: options.routeTemperature,
      adaptiveDeltaFloor: options.adaptiveDeltaFloor,
      maxPaymentRatio: options.maxPaymentRatio,
      budgetRefillThreshold: options.budgetRefillThreshold,
      arrivalBaseMin: options.arrivalBaseMin,
      arrivalBaseMax: options.arrivalBaseMax,
      arrivalBurstProb: options.arrivalBurstProb,
      arrivalBurstMin: options.arrivalBurstMin,
      arrivalBurstMax: options.arrivalBurstMax,
      processingDelayMin: options.processingDelayMin,
      processingDelayMax: options.processingDelayMax,
      suspendArrivals: true,
    });
    state = {
      ...state,
      tick: nextTick,
      phase: nextStepNum,
    };
    simulatedTicks = nextTick;

    const drainIssues = validateState(state);
    if (drainIssues.length > 0) {
      issues.push(`drain step ${nextTick}: ${drainIssues.join(' | ')}`);
      break;
    }
  }

  const committed = state.tasks.filter((task) => task.status === 'COMMITTED').length;
  const failed = state.tasks.filter((task) => task.status === 'ABORTED').length;
  const inflight = state.tasks.filter((task) => ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status)).length;
  const routes = state.ledger.filter((entry) => entry.action === 'ROUTE').length;
  const isolated = Object.values(state.agents).filter((agent) => agent.status === 'isolated').length;
  const routeCounts = new Map<AgentId, number>();
  for (const entry of state.ledger) {
    if (entry.action !== 'ROUTE') continue;
    routeCounts.set(entry.agentId, (routeCounts.get(entry.agentId) ?? 0) + 1);
  }
  const routeShares = Array.from(routeCounts.values()).map((count) => count / Math.max(1, routes));
  const top1Share = routeShares.length > 0 ? Math.max(...routeShares) : 0;
  const hhi = routeShares.reduce((sum, share) => sum + share * share, 0);
  const activeRouteNodes = routeCounts.size;
  const budgetSkipRatio = budgetSkips / Math.max(1, options.steps);
  const commitRate = committed / Math.max(1, routes);
  const failureRate = failed / Math.max(1, routes);
  const routesPerStep = routes / Math.max(1, options.steps);

  if (commitRate < options.minCommitRate) {
    issues.push(`commitRate too low: ${commitRate.toFixed(3)} < ${options.minCommitRate}`);
  }
  if (failureRate > options.maxFailureRate) {
    issues.push(`failureRate too high: ${failureRate.toFixed(3)} > ${options.maxFailureRate}`);
  }
  if (routesPerStep < options.minRoutesPerStep) {
    issues.push(`routesPerStep too low: ${routesPerStep.toFixed(3)} < ${options.minRoutesPerStep}`);
  }
  if (routes <= 0) {
    issues.push('no route event produced');
  }
  if (inflight > 0) {
    issues.push(`inflight not drained: ${inflight}`);
  }
  if (isolated === Object.keys(state.agents).length) {
    issues.push('all agents isolated');
  }

  return {
    trial,
    committed,
    failed,
    inflight,
    routes,
    commitRate,
    failureRate,
    routesPerStep,
    budgetSkips,
    budgetSkipRatio,
    maxBudgetSkipStreak,
    isolated,
    top1Share,
    hhi,
    activeRouteNodes,
    clientBalance: state.clientBalance,
    issues,
  };
}

function printSummary(results: TrialResult[], options: CliOptions): boolean {
  const failedTrials = results.filter((result) => result.issues.length > 0);
  const avg = (pick: (r: TrialResult) => number): number =>
    results.reduce((sum, result) => sum + pick(result), 0) / Math.max(1, results.length);

  console.log('--- Sim Selftest ---');
  console.log(`steps=${options.steps}, trials=${options.trials}, clearEvery=${options.clearEvery}, addNodesAt=${options.addNodesAt.join(',')}, clientBalance=${options.clientBalance}`);
  console.log(`routeNearBestRatio=${options.routeNearBestRatio}, routeTemperature=${options.routeTemperature}, adaptiveDeltaFloor=${options.adaptiveDeltaFloor}, maxPaymentRatio=${options.maxPaymentRatio}, budgetRefillThreshold=${options.budgetRefillThreshold}, arrivalBase=${options.arrivalBaseMin}-${options.arrivalBaseMax}, arrivalBurstProb=${options.arrivalBurstProb}, arrivalBurst=${options.arrivalBurstMin}-${options.arrivalBurstMax}, processingDelay=${options.processingDelayMin}-${options.processingDelayMax}`);
  console.log(`gate minCommitRate=${options.minCommitRate}, maxFailureRate=${options.maxFailureRate}, minRoutesPerStep=${options.minRoutesPerStep}, maxFailedTrialRatio=${options.maxFailedTrialRatio}`);
  console.log(`avg committed=${avg((r) => r.committed).toFixed(2)}, avg failed=${avg((r) => r.failed).toFixed(2)}, avg routes=${avg((r) => r.routes).toFixed(2)}`);
  console.log(`avg commitRate=${avg((r) => r.commitRate).toFixed(3)}, avg failureRate=${avg((r) => r.failureRate).toFixed(3)}, avg routesPerStep=${avg((r) => r.routesPerStep).toFixed(3)}`);
  console.log(`avg budgetSkips=${avg((r) => r.budgetSkips).toFixed(2)}, avg isolated=${avg((r) => r.isolated).toFixed(2)}, avg clientBalance=${avg((r) => r.clientBalance).toFixed(2)}`);
  console.log(`avg top1Share=${avg((r) => r.top1Share).toFixed(3)}, avg hhi=${avg((r) => r.hhi).toFixed(3)}, avg budgetSkipRatio=${avg((r) => r.budgetSkipRatio).toFixed(3)}, avg maxBudgetSkipStreak=${avg((r) => r.maxBudgetSkipStreak).toFixed(2)}, avg activeRouteNodes=${avg((r) => r.activeRouteNodes).toFixed(2)}`);
  const allowedFailedTrials = Math.floor(results.length * options.maxFailedTrialRatio);
  console.log(`failed trials=${failedTrials.length}/${results.length} (allowed=${allowedFailedTrials})`);

  const obsIssues: string[] = [];
  if (options.obsGate) {
    const avgTop1Share = avg((r) => r.top1Share);
    const avgHhi = avg((r) => r.hhi);
    const avgBudgetSkipRatio = avg((r) => r.budgetSkipRatio);
    const avgBudgetSkipStreak = avg((r) => r.maxBudgetSkipStreak);
    const avgActiveRouteNodes = avg((r) => r.activeRouteNodes);
    if (avgTop1Share > options.obsMaxTop1Share) {
      obsIssues.push(`avg top1Share too high: ${avgTop1Share.toFixed(3)} > ${options.obsMaxTop1Share}`);
    }
    if (avgHhi > options.obsMaxHhi) {
      obsIssues.push(`avg hhi too high: ${avgHhi.toFixed(3)} > ${options.obsMaxHhi}`);
    }
    if (avgBudgetSkipRatio > options.obsMaxBudgetSkipRatio) {
      obsIssues.push(`avg budgetSkipRatio too high: ${avgBudgetSkipRatio.toFixed(3)} > ${options.obsMaxBudgetSkipRatio}`);
    }
    if (avgBudgetSkipStreak > options.obsMaxBudgetSkipStreak) {
      obsIssues.push(`avg maxBudgetSkipStreak too high: ${avgBudgetSkipStreak.toFixed(2)} > ${options.obsMaxBudgetSkipStreak}`);
    }
    if (avgActiveRouteNodes < options.obsMinActiveRouteNodes) {
      obsIssues.push(`avg activeRouteNodes too low: ${avgActiveRouteNodes.toFixed(2)} < ${options.obsMinActiveRouteNodes}`);
    }
  }
  if (obsIssues.length > 0) {
    console.log('[OBS_FAIL] observable gates not satisfied');
    for (const issue of obsIssues) {
      console.log(`  - ${issue}`);
    }
  }

  for (const result of results) {
    if (!options.verbose && result.issues.length === 0) continue;
    const status = result.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(
      `[${status}] trial=${result.trial} committed=${result.committed} failed=${result.failed} routes=${result.routes} commitRate=${result.commitRate.toFixed(3)} failureRate=${result.failureRate.toFixed(3)} routesPerStep=${result.routesPerStep.toFixed(3)} budgetSkips=${result.budgetSkips} skipRatio=${result.budgetSkipRatio.toFixed(3)} maxSkipStreak=${result.maxBudgetSkipStreak} top1=${result.top1Share.toFixed(3)} hhi=${result.hhi.toFixed(3)} activeRouteNodes=${result.activeRouteNodes} isolated=${result.isolated} client=${result.clientBalance.toFixed(2)}`,
    );
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        console.log(`  - ${issue}`);
      }
    }
  }

  return failedTrials.length > allowedFailedTrials || obsIssues.length > 0;
}

function main(): void {
  if (!bunRuntime) {
    throw new Error('sim-selftest requires Bun runtime');
  }
  const options = parseOptions();
  const results: TrialResult[] = [];
  for (let trial = 1; trial <= options.trials; trial++) {
    results.push(runTrial(trial, options));
  }
  const hasFailure = printSummary(results, options);
  if (hasFailure) {
    throw new Error('sim-selftest failed');
  }
}

main();
