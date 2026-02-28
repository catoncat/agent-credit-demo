/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  INITIAL_AGENTS,
  STEP_DEFINITIONS,
} from '../constants/initialState';
import { createBootstrappedAgentState } from '../engine/bootstrap';
import { DEFAULT_SIM_SEED, executeAutoTick, type AutoTickOptions, type SimulationState } from '../engine/simulation';
import type { AgentId } from '../types/agent';
import type { TaskStatus } from '../types/task';
import { normalizeSeed } from '../utils/rng';

interface CliOptions {
  steps: number;
  trials: number;
  clearEvery: number;
  addNodesAt: number[];
  mode: 'baseline' | 'ui';
  clientBalance: number;
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
  anomalyTop1Share: number;
  anomalyHhi: number;
  anomalyBudgetSkipRatio: number;
  anomalyBudgetSkipStreak: number;
  anomalyMinActiveRouteNodes: number;
  maxSampleFailures: number;
  judgeCmd?: string;
  judgeTimeoutMs: number;
  whitepaperPath?: string;
  whitepaperMaxChars: number;
  whitepaperRuleOnly: boolean;
  allowFailures: boolean;
  jsonOut?: string;
  mdOut?: string;
}

interface BunRuntime {
  argv: string[];
}

const bunRuntime = (globalThis as { Bun?: BunRuntime }).Bun;
const argv = bunRuntime ? bunRuntime.argv.slice(2) : [];

type IssueCode =
  | 'no_route'
  | 'inflight_not_drained'
  | 'all_isolated'
  | 'invalid_state'
  | 'node_absorption'
  | 'budget_starvation'
  | 'budget_stall'
  | 'low_route_diversity';

interface Issue {
  code: IssueCode;
  message: string;
  step?: number;
}

interface TrialResult {
  trial: number;
  committed: number;
  failed: number;
  inflight: number;
  routes: number;
  budgetSkips: number;
  budgetSkipRatio: number;
  maxBudgetSkipStreak: number;
  maxRawRouteStreak: number;
  maxRouteStreak: number;
  singleFiniteQuoteRatio: number;
  isolated: number;
  top1Share: number;
  hhi: number;
  activeRouteNodes: number;
  clearingOutflow: number;
  commitGross: number;
  clearingToCommitRatio: number;
  clientBalance: number;
  firstBudgetSkipStep: number | null;
  firstDominantStep: number | null;
  issues: Issue[];
}

interface AggregateReport {
  options: CliOptions;
  autoTickPolicy: AutoTickOptions;
  totals: {
    failedTrials: number;
    anomalyTrials: number;
    totalTrials: number;
  };
  averages: {
    committed: number;
    failed: number;
    routes: number;
    budgetSkips: number;
    budgetSkipRatio: number;
    maxBudgetSkipStreak: number;
    maxRawRouteStreak: number;
    maxRouteStreak: number;
    singleFiniteQuoteRatio: number;
    top1Share: number;
    hhi: number;
    activeRouteNodes: number;
    clearingOutflow: number;
    commitGross: number;
    clearingToCommitRatio: number;
    clientBalance: number;
  };
  issueCounts: Record<IssueCode, number>;
  routeShares: Record<AgentId, number>;
  rootCauses: string[];
  samples: TrialResult[];
  judge?: JudgeRunResult;
}

interface JudgeVerdict {
  verdict: 'pass' | 'fail';
  reason: string;
  confidence?: number;
  findings?: string[];
  suggestedActions?: string[];
}

interface JudgeWhitepaperContext {
  path: string;
  included: boolean;
  mode: 'rule_only' | 'full';
  sourceChars?: number;
  excerptChars?: number;
  truncated?: boolean;
  excerpt?: string;
  error?: string;
}

interface JudgeInputContext {
  schema: 'sim-autodiag-judge-v1';
  generatedAt: string;
  argv: string[];
  deterministicBlocking: boolean;
  whitepaper?: JudgeWhitepaperContext;
}

interface JudgeInput {
  report: AggregateReport;
  context: JudgeInputContext;
}

interface JudgeRunResult {
  status: 'not_run' | 'ok' | 'error';
  required: boolean;
  timeoutMs: number;
  cmd?: string;
  whitepaper?: Omit<JudgeWhitepaperContext, 'excerpt'>;
  verdict?: JudgeVerdict;
  stderr?: string;
  error?: string;
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

// Fixed heuristics for blind-spot diagnostics (no CLI surface change by design).
const ROUTE_STREAK_ABSORPTION_THRESHOLD = 12;
const SINGLE_FINITE_QUOTE_RATIO_THRESHOLD = 0.7;
const MIN_PRICE_COMPARISON_OBS_TICKS = 8;

function hasFlag(name: string): boolean {
  return argv.includes(name);
}

function parseStringFlag(name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function parseNumberFlag(name: string, fallback: number): number {
  const idx = argv.indexOf(name);
  if (idx < 0) return fallback;
  const raw = argv[idx + 1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalNumberFlag(name: string): number | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  const raw = argv[idx + 1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseAutoTickSummary(narrative: string): { arrivals: number; budgetSkipped: number } {
  const extract = (key: string): number => {
    const match = narrative.match(new RegExp(`\\b${key}=(\\d+)\\b`));
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const arrivals = extract('arrivals');
  const budgetSkipped = extract('budgetSkipped');
  if (budgetSkipped > 0) {
    return { arrivals, budgetSkipped };
  }
  if (narrative.includes('预算不足')) {
    return { arrivals, budgetSkipped: 1 };
  }
  return { arrivals, budgetSkipped: 0 };
}

function parseAddNodesAt(): number[] {
  const raw = parseStringFlag('--add-nodes-at') ?? '20,40,60';
  const parsed = raw
    .split(',')
    .map((v: string) => Number(v.trim()))
    .filter((n: number) => Number.isInteger(n) && n > 0) as number[];
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function parseMode(): 'baseline' | 'ui' {
  const raw = (parseStringFlag('--mode') ?? 'ui').toLowerCase();
  if (raw === 'baseline') return 'baseline';
  return 'ui';
}

function parseOptions(): CliOptions {
  const judgeCmd = parseStringFlag('--judge-cmd');
  const judgeTimeoutFlag = parseOptionalNumberFlag('--judge-timeout-ms');
  return {
    steps: Math.max(1, Math.floor(parseNumberFlag('--steps', 200))),
    trials: Math.max(1, Math.floor(parseNumberFlag('--trials', 100))),
    clearEvery: Math.max(1, Math.floor(parseNumberFlag('--clear-every', 8))),
    addNodesAt: parseAddNodesAt(),
    mode: parseMode(),
    clientBalance: Math.max(1, parseNumberFlag('--client-balance', 1_000_000)),
    routeNearBestRatio: parseOptionalNumberFlag('--route-near-best-ratio'),
    routeTemperature: parseOptionalNumberFlag('--route-temperature'),
    adaptiveDeltaFloor: parseOptionalNumberFlag('--adaptive-delta-floor'),
    maxPaymentRatio: parseOptionalNumberFlag('--max-payment-ratio'),
    budgetRefillThreshold: parseOptionalNumberFlag('--budget-refill-threshold'),
    arrivalBaseMin: parseOptionalNumberFlag('--arrival-base-min'),
    arrivalBaseMax: parseOptionalNumberFlag('--arrival-base-max'),
    arrivalBurstProb: parseOptionalNumberFlag('--arrival-burst-prob'),
    arrivalBurstMin: parseOptionalNumberFlag('--arrival-burst-min'),
    arrivalBurstMax: parseOptionalNumberFlag('--arrival-burst-max'),
    processingDelayMin: parseOptionalNumberFlag('--processing-delay-min'),
    processingDelayMax: parseOptionalNumberFlag('--processing-delay-max'),
    anomalyTop1Share: parseNumberFlag('--anomaly-top1-share', 0.95),
    anomalyHhi: parseNumberFlag('--anomaly-hhi', 0.93),
    anomalyBudgetSkipRatio: parseNumberFlag('--anomaly-budget-skip-ratio', 0.55),
    anomalyBudgetSkipStreak: parseNumberFlag('--anomaly-budget-skip-streak', 20),
    anomalyMinActiveRouteNodes: parseNumberFlag('--anomaly-min-active-route-nodes', 2),
    maxSampleFailures: Math.max(1, Math.floor(parseNumberFlag('--max-sample-failures', 12))),
    judgeCmd,
    judgeTimeoutMs: Math.max(1000, Math.floor(judgeTimeoutFlag ?? 90_000)),
    whitepaperPath: hasFlag('--no-whitepaper')
      ? undefined
      : (parseStringFlag('--whitepaper-path') ?? '../whitepaper.md'),
    whitepaperMaxChars: Math.max(1000, Math.floor(parseNumberFlag('--whitepaper-max-chars', 12_000))),
    whitepaperRuleOnly: !hasFlag('--full-whitepaper'),
    allowFailures: hasFlag('--allow-failures'),
    jsonOut: parseStringFlag('--json-out'),
    mdOut: parseStringFlag('--md-out'),
  };
}

function resolveAutoTickPolicy(options: CliOptions): AutoTickOptions {
  const base: AutoTickOptions = options.mode === 'ui'
    ? {
        clearEvery: options.clearEvery,
        routeNearBestRatio: 0.75,
        routeTemperature: 0.35,
        adaptiveDeltaFloor: 8,
        maxPaymentRatio: 0.08,
        budgetRefillThreshold: 9000,
        arrivalBaseMin: 2,
        arrivalBaseMax: 3,
        arrivalBurstProb: 0.18,
        arrivalBurstMin: 2,
        arrivalBurstMax: 4,
        processingDelayMin: 1,
        processingDelayMax: 3,
      }
    : {
        clearEvery: options.clearEvery,
      };

  if (options.routeNearBestRatio !== undefined) base.routeNearBestRatio = options.routeNearBestRatio;
  if (options.routeTemperature !== undefined) base.routeTemperature = options.routeTemperature;
  if (options.adaptiveDeltaFloor !== undefined) base.adaptiveDeltaFloor = options.adaptiveDeltaFloor;
  if (options.maxPaymentRatio !== undefined) base.maxPaymentRatio = options.maxPaymentRatio;
  if (options.budgetRefillThreshold !== undefined) base.budgetRefillThreshold = options.budgetRefillThreshold;
  if (options.arrivalBaseMin !== undefined) base.arrivalBaseMin = options.arrivalBaseMin;
  if (options.arrivalBaseMax !== undefined) base.arrivalBaseMax = options.arrivalBaseMax;
  if (options.arrivalBurstProb !== undefined) base.arrivalBurstProb = options.arrivalBurstProb;
  if (options.arrivalBurstMin !== undefined) base.arrivalBurstMin = options.arrivalBurstMin;
  if (options.arrivalBurstMax !== undefined) base.arrivalBurstMax = options.arrivalBurstMax;
  if (options.processingDelayMin !== undefined) base.processingDelayMin = options.processingDelayMin;
  if (options.processingDelayMax !== undefined) base.processingDelayMax = options.processingDelayMax;
  return base;
}

function truncateByChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n...(truncated)...`,
    truncated: true,
  };
}

function buildRuleOnlyWhitepaper(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sectionPriority = /(摘要|2[\s.)、]|3[\s.)、]|4[\s.)、]|5[\s.)、]|6[\s.)、]|7[\s.)、]|8[\s.)、]|11[\s.)、]|附录\s*A)/i;
  const ruleLine = /(=|>=|<=|argmin|P_eff|b\(i\)|y_i|必须|约束|阈值|RESERVE|ABORT|COMMIT|Penalty|burn|Merkle)/i;
  const kept: string[] = [];
  let sectionBoost = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      sectionBoost = sectionPriority.test(trimmed);
      if (sectionBoost) kept.push(trimmed);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      kept.push(trimmed);
      continue;
    }
    if (sectionBoost && ruleLine.test(trimmed)) {
      kept.push(line);
    }
  }

  if (kept.length < 12) {
    for (const line of lines) {
      if (ruleLine.test(line)) kept.push(line);
      if (kept.length >= 160) break;
    }
  }
  return kept.join('\n').trim();
}

function loadWhitepaperContext(options: CliOptions): JudgeWhitepaperContext | undefined {
  if (!options.whitepaperPath) return undefined;
  const absPath = resolve(options.whitepaperPath);
  try {
    const source = readFileSync(absPath, 'utf8');
    const excerptSource = options.whitepaperRuleOnly ? buildRuleOnlyWhitepaper(source) : source;
    const { text: excerpt, truncated } = truncateByChars(
      excerptSource.length > 0 ? excerptSource : source,
      options.whitepaperMaxChars,
    );
    return {
      path: absPath,
      included: true,
      mode: options.whitepaperRuleOnly ? 'rule_only' : 'full',
      sourceChars: source.length,
      excerptChars: excerpt.length,
      truncated,
      excerpt,
    };
  } catch (error) {
    return {
      path: absPath,
      included: false,
      mode: options.whitepaperRuleOnly ? 'rule_only' : 'full',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error('judge stdout does not contain JSON object');
}

function parseJudgeVerdict(rawOutput: string): JudgeVerdict {
  const candidate = extractJsonCandidate(rawOutput);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`failed to parse judge verdict JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('judge verdict JSON is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj.verdict;
  const reason = obj.reason;
  if (verdict !== 'pass' && verdict !== 'fail') {
    throw new Error(`invalid verdict value: ${String(verdict)}`);
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error('invalid reason in judge verdict');
  }

  const confidence = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
    ? obj.confidence
    : undefined;
  const toStringArray = (value: unknown): string[] | undefined => (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value as string[]
      : undefined
  );

  return {
    verdict,
    reason,
    confidence,
    findings: toStringArray(obj.findings),
    suggestedActions: toStringArray(obj.suggestedActions),
  };
}

function buildJudgeInput(
  report: AggregateReport,
  deterministicBlocking: boolean,
  whitepaper: JudgeWhitepaperContext | undefined,
): JudgeInput {
  return {
    report,
    context: {
      schema: 'sim-autodiag-judge-v1',
      generatedAt: new Date().toISOString(),
      argv: [...argv],
      deterministicBlocking,
      whitepaper,
    },
  };
}

function runJudgeCmd(judgeCmd: string, input: JudgeInput, timeoutMs: number): {
  verdict: JudgeVerdict;
  stderr: string;
} {
  const proc = spawnSync('/bin/sh', ['-lc', judgeCmd], {
    encoding: 'utf8',
    input: `${JSON.stringify(input)}\n`,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (proc.error) {
    throw new Error(`judge command failed: ${proc.error.message}`);
  }
  if (typeof proc.status === 'number' && proc.status !== 0) {
    const stderr = (proc.stderr ?? '').trim();
    throw new Error(`judge command exit=${proc.status}${stderr ? `, stderr=${stderr}` : ''}`);
  }

  const stdout = proc.stdout ?? '';
  const verdict = parseJudgeVerdict(stdout);
  return {
    verdict,
    stderr: (proc.stderr ?? '').trim(),
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
    lastNarrative: 'autodiag',
  };
}

function validateState(state: SimulationState): Issue[] {
  const issues: Issue[] = [];

  const taskIds = new Set<string>();
  for (const task of state.tasks) {
    if (taskIds.has(task.id)) {
      issues.push({ code: 'invalid_state', message: `duplicate task id: ${task.id}` });
    }
    taskIds.add(task.id);

    if (!KNOWN_STATUSES.has(task.status)) {
      issues.push({ code: 'invalid_state', message: `invalid task status: ${task.id}/${task.status}` });
    }

    if (!Number.isFinite(task.delta) || task.delta < 0) {
      issues.push({ code: 'invalid_state', message: `invalid task delta: ${task.id}/${task.delta}` });
    }

    if (['RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status) && !task.assignedTo) {
      issues.push({ code: 'invalid_state', message: `inflight task without assignee: ${task.id}/${task.status}` });
    }
  }

  for (const [id, agent] of Object.entries(state.agents)) {
    const values: Array<[string, number]> = [
      ['quota', agent.quota],
      ['reservedQuota', agent.reservedQuota],
      ['y', agent.y],
      ['capacity', agent.capacity],
      ['activeTasks', agent.activeTasks],
      ['f', agent.f],
      ['s_hat', agent.s_hat],
      ['balance', agent.balance],
      ['tradeBalance', agent.tradeBalance],
    ];
    for (const [field, value] of values) {
      if (!Number.isFinite(value)) {
        issues.push({ code: 'invalid_state', message: `non-finite agent ${id}.${field}: ${value}` });
      }
    }

    if (agent.reservedQuota < 0 || agent.reservedQuota > agent.quota + 1e-9) {
      issues.push({
        code: 'invalid_state',
        message: `invalid reservedQuota: ${id} reserved=${agent.reservedQuota} quota=${agent.quota}`,
      });
    }
    if (agent.activeTasks < 0 || agent.activeTasks > agent.capacity + 1e-9) {
      issues.push({
        code: 'invalid_state',
        message: `invalid activeTasks: ${id} active=${agent.activeTasks} cap=${agent.capacity}`,
      });
    }

    const expectedY = Math.max(1, agent.quota - agent.reservedQuota);
    if (Math.abs(agent.y - expectedY) > 1e-9) {
      issues.push({
        code: 'invalid_state',
        message: `y out of sync: ${id} y=${agent.y} expected=${expectedY}`,
      });
    }
  }

  return issues;
}

function runTrial(trial: number, options: CliOptions, policy: AutoTickOptions): TrialResult {
  const seed = deriveTrialSeed(DEFAULT_SIM_SEED, trial);
  let state = makeInitialState(options.clientBalance, seed);
  const issues: Issue[] = [];
  let simulatedTicks = 0;

  let budgetSkips = 0;
  let totalArrivals = 0;
  let budgetSkipStreak = 0;
  let maxBudgetSkipStreak = 0;
  let maxRawRouteStreak = 0;
  let maxRouteStreak = 0;
  let firstBudgetSkipStep: number | null = null;
  let firstDominantStep: number | null = null;
  let firstLongRouteStreakStep: number | null = null;
  let firstSingleFiniteQuoteStep: number | null = null;

  let lastRouteAgent: AgentId | null = null;
  let currentRouteStreak = 0;
  let lastCompetitiveRouteAgent: AgentId | null = null;
  let currentCompetitiveRouteStreak = 0;
  let finiteCandidateObsTicks = 0;
  let singleFiniteQuoteTicks = 0;

  const recentRouteWindow: AgentId[] = [];
  const observeNewRoutes = (ledgerStartIndex: number, step: number, competitiveStep: boolean): void => {
    if (!competitiveStep) {
      lastCompetitiveRouteAgent = null;
      currentCompetitiveRouteStreak = 0;
    }
    for (let index = ledgerStartIndex; index < state.ledger.length; index++) {
      const entry = state.ledger[index];
      if (entry.action !== 'ROUTE') continue;

      recentRouteWindow.push(entry.agentId);
      if (recentRouteWindow.length > 24) recentRouteWindow.shift();

      if (lastRouteAgent === entry.agentId) {
        currentRouteStreak += 1;
      } else {
        lastRouteAgent = entry.agentId;
        currentRouteStreak = 1;
      }
      if (currentRouteStreak > maxRawRouteStreak) {
        maxRawRouteStreak = currentRouteStreak;
      }

      if (!competitiveStep) continue;

      if (lastCompetitiveRouteAgent === entry.agentId) {
        currentCompetitiveRouteStreak += 1;
      } else {
        lastCompetitiveRouteAgent = entry.agentId;
        currentCompetitiveRouteStreak = 1;
      }

      if (currentCompetitiveRouteStreak > maxRouteStreak) {
        maxRouteStreak = currentCompetitiveRouteStreak;
        if (maxRouteStreak >= ROUTE_STREAK_ABSORPTION_THRESHOLD && firstLongRouteStreakStep === null) {
          firstLongRouteStreakStep = step;
        }
      }
    }
  };
  const observePriceSurface = (step: number): number => {
    if (!state.priceComparison) return 0;

    const finiteCandidates = Object.values(state.priceComparison)
      .filter((price) => Number.isFinite(price))
      .length;
    if (finiteCandidates > 0) {
      finiteCandidateObsTicks += 1;
    }
    if (finiteCandidates === 1) {
      singleFiniteQuoteTicks += 1;
      if (firstSingleFiniteQuoteStep === null) firstSingleFiniteQuoteStep = step;
    }
    return finiteCandidates;
  };

  for (let step = 1; step <= options.steps; step++) {
    if (options.addNodesAt.includes(step)) {
      const id = `N${Object.keys(state.agents).length + 1}` as AgentId;
      state.agents[id] = createBootstrappedAgentState(id, `Agent-${id}`, state.agents);
    }

    const ledgerLenBefore = state.ledger.length;
    state = executeAutoTick(state, STEP_DEFINITIONS.length + step, policy);
    state = {
      ...state,
      tick: step,
      phase: STEP_DEFINITIONS.length + step,
    };
    simulatedTicks = step;

    const summary = parseAutoTickSummary(state.lastNarrative);
    totalArrivals += summary.arrivals;
    if (summary.budgetSkipped > 0) {
      budgetSkips += summary.budgetSkipped;
      budgetSkipStreak += 1;
      maxBudgetSkipStreak = Math.max(maxBudgetSkipStreak, budgetSkipStreak);
      if (firstBudgetSkipStep === null) firstBudgetSkipStep = step;
    } else {
      budgetSkipStreak = 0;
    }

    const finiteCandidates = observePriceSurface(step);
    observeNewRoutes(ledgerLenBefore, step, finiteCandidates > 1);

    if (recentRouteWindow.length >= 8 && firstDominantStep === null) {
      const counts = new Map<AgentId, number>();
      for (const id of recentRouteWindow) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const maxShare = Math.max(...Array.from(counts.values()).map((count) => count / recentRouteWindow.length));
      if (maxShare >= options.anomalyTop1Share) firstDominantStep = step;
    }

    const stateIssues = validateState(state);
    if (stateIssues.length > 0) {
      for (const issue of stateIssues) {
        issues.push({ ...issue, step });
      }
      break;
    }
  }

  const maxDrainTicks = Math.max(24, Math.ceil(options.steps * 0.4));
  for (let drain = 1; drain <= maxDrainTicks; drain++) {
    const inflightNow = state.tasks.filter((task) => ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status)).length;
    if (inflightNow <= 0) break;

    const nextTick = simulatedTicks + 1;
    const nextStepNum = STEP_DEFINITIONS.length + nextTick;
    const ledgerLenBefore = state.ledger.length;
    state = executeAutoTick(state, nextStepNum, { ...policy, suspendArrivals: true });
    state = {
      ...state,
      tick: nextTick,
      phase: nextStepNum,
    };
    simulatedTicks = nextTick;
    const finiteCandidates = observePriceSurface(simulatedTicks);
    observeNewRoutes(ledgerLenBefore, simulatedTicks, finiteCandidates > 1);

    const drainIssues = validateState(state);
    if (drainIssues.length > 0) {
      for (const issue of drainIssues) {
        issues.push({ ...issue, step: simulatedTicks });
      }
      break;
    }
  }

  const committedTasks = state.tasks.filter((task) => task.status === 'COMMITTED');
  const committed = committedTasks.length;
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
  const budgetSkipRatio = budgetSkips / Math.max(1, totalArrivals);
  const singleFiniteQuoteRatio = singleFiniteQuoteTicks / Math.max(1, finiteCandidateObsTicks);

  let clearingOutflow = 0;
  for (const entry of state.ledger) {
    if (entry.action === 'BANCOR_TAX' || entry.action === 'BANCOR_FEE') {
      clearingOutflow += Math.abs(entry.deltaBalance ?? 0);
    }
  }
  const commitGross = committedTasks.reduce((sum, task) => sum + Math.max(0, task.payment), 0);
  const clearingToCommitRatio = commitGross > 1e-9 ? clearingOutflow / commitGross : 0;

  if (routes <= 0) {
    issues.push({ code: 'no_route', message: 'no route event produced' });
  }
  if (inflight > 0) {
    issues.push({ code: 'inflight_not_drained', message: `inflight not drained: ${inflight}` });
  }
  if (isolated === Object.keys(state.agents).length) {
    issues.push({ code: 'all_isolated', message: 'all agents isolated' });
  }

  if (top1Share > options.anomalyTop1Share) {
    issues.push({ code: 'node_absorption', message: `top1Share too high: ${top1Share.toFixed(3)} > ${options.anomalyTop1Share}` });
  }
  if (hhi > options.anomalyHhi) {
    issues.push({ code: 'node_absorption', message: `hhi too high: ${hhi.toFixed(3)} > ${options.anomalyHhi}` });
  }
  if (maxRouteStreak >= ROUTE_STREAK_ABSORPTION_THRESHOLD) {
    issues.push({
      code: 'node_absorption',
      message: `maxRouteStreak too high: ${maxRouteStreak} >= ${ROUTE_STREAK_ABSORPTION_THRESHOLD}`,
      step: firstLongRouteStreakStep ?? undefined,
    });
  }
  if (budgetSkipRatio > options.anomalyBudgetSkipRatio) {
    issues.push({
      code: 'budget_starvation',
      message: `budgetSkipRatio too high: ${budgetSkipRatio.toFixed(3)} > ${options.anomalyBudgetSkipRatio}`,
      step: firstBudgetSkipStep ?? undefined,
    });
  }
  if (maxBudgetSkipStreak > options.anomalyBudgetSkipStreak) {
    issues.push({
      code: 'budget_stall',
      message: `maxBudgetSkipStreak too high: ${maxBudgetSkipStreak} > ${options.anomalyBudgetSkipStreak}`,
      step: firstBudgetSkipStep ?? undefined,
    });
  }
  if (activeRouteNodes < options.anomalyMinActiveRouteNodes) {
    issues.push({
      code: 'low_route_diversity',
      message: `activeRouteNodes too low: ${activeRouteNodes} < ${options.anomalyMinActiveRouteNodes}`,
      step: firstDominantStep ?? undefined,
    });
  }
  if (
    finiteCandidateObsTicks >= MIN_PRICE_COMPARISON_OBS_TICKS
    && singleFiniteQuoteRatio > SINGLE_FINITE_QUOTE_RATIO_THRESHOLD
  ) {
    issues.push({
      code: 'low_route_diversity',
      message: `singleFiniteQuoteRatio too high: ${singleFiniteQuoteRatio.toFixed(3)} > ${SINGLE_FINITE_QUOTE_RATIO_THRESHOLD} (observedTicks=${finiteCandidateObsTicks})`,
      step: firstSingleFiniteQuoteStep ?? undefined,
    });
  }

  return {
    trial,
    committed,
    failed,
    inflight,
    routes,
    budgetSkips,
    budgetSkipRatio,
    maxBudgetSkipStreak,
    maxRawRouteStreak,
    maxRouteStreak,
    singleFiniteQuoteRatio,
    isolated,
    top1Share,
    hhi,
    activeRouteNodes,
    clearingOutflow,
    commitGross,
    clearingToCommitRatio,
    clientBalance: state.clientBalance,
    firstBudgetSkipStep,
    firstDominantStep,
    issues,
  };
}

function avg(results: TrialResult[], pick: (result: TrialResult) => number): number {
  return results.reduce((sum, result) => sum + pick(result), 0) / Math.max(1, results.length);
}

function buildRootCauses(results: TrialResult[], options: CliOptions): string[] {
  const causes: string[] = [];
  const absorptionRate = results.filter((r) => r.issues.some((issue) => issue.code === 'node_absorption')).length / Math.max(1, results.length);
  const budgetRate = results.filter((r) => r.issues.some((issue) => issue.code === 'budget_starvation')).length / Math.max(1, results.length);
  const stallRate = results.filter((r) => r.issues.some((issue) => issue.code === 'budget_stall')).length / Math.max(1, results.length);
  const avgClearingRatio = avg(results, (r) => r.clearingToCommitRatio);
  const avgActiveNodes = avg(results, (r) => r.activeRouteNodes);
  const avgTop1 = avg(results, (r) => r.top1Share);

  if (absorptionRate > 0.2 || avgTop1 > options.anomalyTop1Share) {
    causes.push(`节点吸附：top1Share 均值=${avgTop1.toFixed(3)}，建议提高 routeNearBestRatio 或启用反锁死探索。`);
  }
  if (budgetRate > 0.2 || stallRate > 0.2) {
    causes.push(`预算空转：budgetSkipRatio 均值=${avg(results, (r) => r.budgetSkipRatio).toFixed(3)}，建议缩小任务粒度并按周期补给预算。`);
  }
  if (avgClearingRatio > 0.25) {
    causes.push(`清算负担偏高：clearing/commit=${avgClearingRatio.toFixed(3)}，建议放宽逆差阈值或拉长清算周期。`);
  }
  if (avgActiveNodes < options.anomalyMinActiveRouteNodes) {
    causes.push(`路由多样性不足：activeRouteNodes 均值=${avgActiveNodes.toFixed(2)}，建议开启 near-best 采样并增加新节点启动保护。`);
  }
  if (causes.length === 0) {
    causes.push('未发现显著结构性异常，当前配置在给定阈值内稳定。');
  }
  return causes;
}

function aggregate(results: TrialResult[], options: CliOptions, policy: AutoTickOptions): AggregateReport {
  const issueCounts: Record<IssueCode, number> = {
    no_route: 0,
    inflight_not_drained: 0,
    all_isolated: 0,
    invalid_state: 0,
    node_absorption: 0,
    budget_starvation: 0,
    budget_stall: 0,
    low_route_diversity: 0,
  };

  const routeTotals = new Map<AgentId, number>();
  for (const result of results) {
    for (const issue of result.issues) {
      issueCounts[issue.code] += 1;
    }
  }

  for (const result of results) {
    // Approximate route share reconstruction from top-level stats is impossible;
    // use coarse active node weight to keep aggregate lightweight.
    const dominantWeight = Math.round(result.top1Share * result.routes);
    if (dominantWeight > 0) {
      const key = 'DOMINANT' as AgentId;
      routeTotals.set(key, (routeTotals.get(key) ?? 0) + dominantWeight);
    }
  }

  const failedTrials = results.filter((result) => result.issues.some((issue) =>
    issue.code === 'no_route'
      || issue.code === 'inflight_not_drained'
      || issue.code === 'all_isolated'
      || issue.code === 'invalid_state',
  ));
  const anomalyTrials = results.filter((result) => result.issues.some((issue) =>
    issue.code === 'node_absorption'
      || issue.code === 'budget_starvation'
      || issue.code === 'budget_stall'
      || issue.code === 'low_route_diversity',
  ));

  const report: AggregateReport = {
    options,
    autoTickPolicy: policy,
    totals: {
      failedTrials: failedTrials.length,
      anomalyTrials: anomalyTrials.length,
      totalTrials: results.length,
    },
    averages: {
      committed: avg(results, (r) => r.committed),
      failed: avg(results, (r) => r.failed),
      routes: avg(results, (r) => r.routes),
      budgetSkips: avg(results, (r) => r.budgetSkips),
      budgetSkipRatio: avg(results, (r) => r.budgetSkipRatio),
      maxBudgetSkipStreak: avg(results, (r) => r.maxBudgetSkipStreak),
      maxRawRouteStreak: avg(results, (r) => r.maxRawRouteStreak),
      maxRouteStreak: avg(results, (r) => r.maxRouteStreak),
      singleFiniteQuoteRatio: avg(results, (r) => r.singleFiniteQuoteRatio),
      top1Share: avg(results, (r) => r.top1Share),
      hhi: avg(results, (r) => r.hhi),
      activeRouteNodes: avg(results, (r) => r.activeRouteNodes),
      clearingOutflow: avg(results, (r) => r.clearingOutflow),
      commitGross: avg(results, (r) => r.commitGross),
      clearingToCommitRatio: avg(results, (r) => r.clearingToCommitRatio),
      clientBalance: avg(results, (r) => r.clientBalance),
    },
    issueCounts,
    routeShares: Object.fromEntries(routeTotals.entries()) as Record<AgentId, number>,
    rootCauses: buildRootCauses(results, options),
    samples: results
      .filter((result) => result.issues.length > 0)
      .slice(0, options.maxSampleFailures),
  };
  return report;
}

function toMarkdown(report: AggregateReport): string {
  const lines: string[] = [];
  lines.push('# Sim AutoDiag Report');
  lines.push('');
  lines.push('## Summary');
  lines.push(`- mode: ${report.options.mode}`);
  lines.push(`- trials: ${report.totals.totalTrials}`);
  lines.push(`- failed trials: ${report.totals.failedTrials}`);
  lines.push(`- anomaly trials: ${report.totals.anomalyTrials}`);
  lines.push('');
  lines.push('## Averages');
  lines.push(`- committed: ${report.averages.committed.toFixed(2)}`);
  lines.push(`- failed: ${report.averages.failed.toFixed(2)}`);
  lines.push(`- routes: ${report.averages.routes.toFixed(2)}`);
  lines.push(`- budget skip ratio: ${report.averages.budgetSkipRatio.toFixed(3)}`);
  lines.push(`- max budget skip streak: ${report.averages.maxBudgetSkipStreak.toFixed(2)}`);
  lines.push(`- max competitive route streak: ${report.averages.maxRouteStreak.toFixed(2)}`);
  lines.push(`- max raw route streak: ${report.averages.maxRawRouteStreak.toFixed(2)}`);
  lines.push(`- single finite quote ratio: ${report.averages.singleFiniteQuoteRatio.toFixed(3)}`);
  lines.push(`- top1 share: ${report.averages.top1Share.toFixed(3)}`);
  lines.push(`- hhi: ${report.averages.hhi.toFixed(3)}`);
  lines.push(`- active route nodes: ${report.averages.activeRouteNodes.toFixed(2)}`);
  lines.push(`- clearing/commit ratio: ${report.averages.clearingToCommitRatio.toFixed(3)}`);
  lines.push('');
  lines.push('## Root Causes');
  for (const cause of report.rootCauses) {
    lines.push(`- ${cause}`);
  }
  lines.push('');
  lines.push('## Issue Counts');
  for (const [code, count] of Object.entries(report.issueCounts)) {
    lines.push(`- ${code}: ${count}`);
  }
  if (report.judge && report.judge.status !== 'not_run') {
    lines.push('');
    lines.push('## Judge Verdict');
    lines.push(`- status: ${report.judge.status}`);
    if (report.judge.cmd) lines.push(`- cmd: ${report.judge.cmd}`);
    lines.push(`- required: ${report.judge.required}`);
    if (report.judge.whitepaper) {
      lines.push(`- whitepaper: ${report.judge.whitepaper.path}`);
      lines.push(`- whitepaper included: ${report.judge.whitepaper.included}`);
      lines.push(`- whitepaper mode: ${report.judge.whitepaper.mode}`);
      if (report.judge.whitepaper.excerptChars !== undefined) {
        lines.push(`- whitepaper excerpt chars: ${report.judge.whitepaper.excerptChars}`);
      }
      if (report.judge.whitepaper.error) {
        lines.push(`- whitepaper error: ${report.judge.whitepaper.error}`);
      }
    }
    if (report.judge.status === 'ok' && report.judge.verdict) {
      lines.push(`- verdict: ${report.judge.verdict.verdict}`);
      lines.push(`- reason: ${report.judge.verdict.reason}`);
      if (report.judge.verdict.confidence !== undefined) {
        lines.push(`- confidence: ${report.judge.verdict.confidence.toFixed(3)}`);
      }
      if (report.judge.verdict.findings && report.judge.verdict.findings.length > 0) {
        lines.push('- findings:');
        for (const finding of report.judge.verdict.findings) {
          lines.push(`  - ${finding}`);
        }
      }
    }
    if (report.judge.status === 'error' && report.judge.error) {
      lines.push(`- error: ${report.judge.error}`);
    }
  }
  if (report.samples.length > 0) {
    lines.push('');
    lines.push('## Sample Failed Trials');
    for (const sample of report.samples) {
      lines.push(`- trial=${sample.trial}, committed=${sample.committed}, failed=${sample.failed}, top1=${sample.top1Share.toFixed(3)}, hhi=${sample.hhi.toFixed(3)}, skipRatio=${sample.budgetSkipRatio.toFixed(3)}, maxSkipStreak=${sample.maxBudgetSkipStreak}, maxRouteStreak=${sample.maxRouteStreak}, rawMaxRouteStreak=${sample.maxRawRouteStreak}, singleFiniteQuoteRatio=${sample.singleFiniteQuoteRatio.toFixed(3)}, firstBudgetSkip=${sample.firstBudgetSkipStep ?? '-'}, firstDominant=${sample.firstDominantStep ?? '-'}`);
      for (const issue of sample.issues) {
        lines.push(`  - ${issue.code}: ${issue.message}${issue.step ? ` (step=${issue.step})` : ''}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

function printReport(report: AggregateReport): void {
  console.log('--- Sim AutoDiag ---');
  console.log(`mode=${report.options.mode}, steps=${report.options.steps}, trials=${report.options.trials}, clearEvery=${report.options.clearEvery}, addNodesAt=${report.options.addNodesAt.join(',')}, clientBalance=${report.options.clientBalance}`);
  console.log(`policy routeNearBestRatio=${report.autoTickPolicy.routeNearBestRatio ?? 0}, routeTemperature=${report.autoTickPolicy.routeTemperature ?? 0.08}, adaptiveDeltaFloor=${report.autoTickPolicy.adaptiveDeltaFloor ?? 0}, maxPaymentRatio=${report.autoTickPolicy.maxPaymentRatio ?? 1}, budgetRefillThreshold=${report.autoTickPolicy.budgetRefillThreshold ?? 0}, arrivalBase=${report.autoTickPolicy.arrivalBaseMin ?? 2}-${report.autoTickPolicy.arrivalBaseMax ?? 3}, arrivalBurstProb=${report.autoTickPolicy.arrivalBurstProb ?? 0.18}, arrivalBurst=${report.autoTickPolicy.arrivalBurstMin ?? 2}-${report.autoTickPolicy.arrivalBurstMax ?? 4}, processingDelay=${report.autoTickPolicy.processingDelayMin ?? 1}-${report.autoTickPolicy.processingDelayMax ?? 3}`);
  console.log(`avg committed=${report.averages.committed.toFixed(2)}, avg failed=${report.averages.failed.toFixed(2)}, avg routes=${report.averages.routes.toFixed(2)}`);
  console.log(`avg top1Share=${report.averages.top1Share.toFixed(3)}, avg hhi=${report.averages.hhi.toFixed(3)}, avg activeRouteNodes=${report.averages.activeRouteNodes.toFixed(2)}`);
  console.log(`avg budgetSkipRatio=${report.averages.budgetSkipRatio.toFixed(3)}, avg maxBudgetSkipStreak=${report.averages.maxBudgetSkipStreak.toFixed(2)}, avg maxRouteStreak=${report.averages.maxRouteStreak.toFixed(2)}, avg rawMaxRouteStreak=${report.averages.maxRawRouteStreak.toFixed(2)}, avg singleFiniteQuoteRatio=${report.averages.singleFiniteQuoteRatio.toFixed(3)}, avg clearing/commit=${report.averages.clearingToCommitRatio.toFixed(3)}`);
  console.log(`failed trials=${report.totals.failedTrials}/${report.totals.totalTrials}, anomaly trials=${report.totals.anomalyTrials}/${report.totals.totalTrials}`);
  if (report.judge && report.judge.status !== 'not_run') {
    if (report.judge.whitepaper) {
      console.log(`judge whitepaper included=${report.judge.whitepaper.included}, mode=${report.judge.whitepaper.mode}, path=${report.judge.whitepaper.path}`);
      if (report.judge.whitepaper.error) {
        console.log(`judge whitepaper error=${report.judge.whitepaper.error}`);
      }
    }
    if (report.judge.status === 'ok' && report.judge.verdict) {
      console.log(`judge verdict=${report.judge.verdict.verdict}, reason=${report.judge.verdict.reason}`);
    } else if (report.judge.status === 'error') {
      console.log(`judge error=${report.judge.error ?? 'unknown error'}`);
    }
  }
  console.log('root causes:');
  for (const cause of report.rootCauses) {
    console.log(`  - ${cause}`);
  }

  if (report.samples.length > 0) {
    console.log('sample failed/anomalous trials:');
    for (const sample of report.samples) {
      console.log(
        `  [trial=${sample.trial}] committed=${sample.committed} failed=${sample.failed} routes=${sample.routes} top1=${sample.top1Share.toFixed(3)} hhi=${sample.hhi.toFixed(3)} skipRatio=${sample.budgetSkipRatio.toFixed(3)} maxSkipStreak=${sample.maxBudgetSkipStreak} maxRouteStreak=${sample.maxRouteStreak} rawMaxRouteStreak=${sample.maxRawRouteStreak} singleFiniteQuoteRatio=${sample.singleFiniteQuoteRatio.toFixed(3)} firstBudgetSkip=${sample.firstBudgetSkipStep ?? '-'} firstDominant=${sample.firstDominantStep ?? '-'}`,
      );
      for (const issue of sample.issues) {
        console.log(`    - ${issue.code}: ${issue.message}${issue.step ? ` (step=${issue.step})` : ''}`);
      }
    }
  }
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function main(): void {
  if (!bunRuntime) {
    throw new Error('sim-autodiag requires Bun runtime');
  }

  const options = parseOptions();
  const policy = resolveAutoTickPolicy(options);
  const results: TrialResult[] = [];
  for (let trial = 1; trial <= options.trials; trial++) {
    results.push(runTrial(trial, options, policy));
  }

  const report = aggregate(results, options, policy);
  const deterministicBlocking = report.totals.failedTrials > 0 || report.totals.anomalyTrials > 0;
  const judgeRun: JudgeRunResult = {
    status: 'not_run',
    required: Boolean(options.judgeCmd),
    timeoutMs: options.judgeTimeoutMs,
    cmd: options.judgeCmd,
  };
  if (options.judgeCmd) {
    const whitepaper = loadWhitepaperContext(options);
    if (whitepaper) {
      judgeRun.whitepaper = {
        path: whitepaper.path,
        included: whitepaper.included,
        mode: whitepaper.mode,
        sourceChars: whitepaper.sourceChars,
        excerptChars: whitepaper.excerptChars,
        truncated: whitepaper.truncated,
        error: whitepaper.error,
      };
    }
    const judgeInput = buildJudgeInput(report, deterministicBlocking, whitepaper);
    try {
      const judgeResult = runJudgeCmd(options.judgeCmd, judgeInput, options.judgeTimeoutMs);
      judgeRun.status = 'ok';
      judgeRun.verdict = judgeResult.verdict;
      judgeRun.stderr = judgeResult.stderr || undefined;
    } catch (error) {
      judgeRun.status = 'error';
      judgeRun.error = error instanceof Error ? error.message : String(error);
    }
  }
  report.judge = judgeRun;

  printReport(report);

  if (options.jsonOut) {
    ensureParentDir(options.jsonOut);
    writeFileSync(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`json report written: ${options.jsonOut}`);
  }
  if (options.mdOut) {
    ensureParentDir(options.mdOut);
    writeFileSync(options.mdOut, toMarkdown(report), 'utf8');
    console.log(`markdown report written: ${options.mdOut}`);
  }

  const judgeBlocking = report.judge?.status === 'ok' && report.judge.verdict?.verdict === 'fail';
  const judgeInfraBlocking = Boolean(options.judgeCmd) && report.judge?.status === 'error';
  const hasBlocking = deterministicBlocking || judgeBlocking || judgeInfraBlocking;
  if (hasBlocking && !options.allowFailures) {
    throw new Error('sim-autodiag found blocking issues (structural and/or judge)');
  }
}

main();
