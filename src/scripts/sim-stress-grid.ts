/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface Scenario {
  id: string;
  description: string;
  flags: Record<string, string | number>;
}

interface CliOptions {
  steps: number[];
  trialsShort: number;
  trialsLong: number;
  longStepThreshold: number;
  judgeCmd?: string;
  judgeTimeoutMs: number;
  whitepaperPath: string;
  outDir: string;
  runId: string;
  jsonOut: string;
  mdOut: string;
  llmSummary: boolean;
  llmSummaryOut: string;
  scenarios: string[];
}

interface AutoDiagJudgeVerdict {
  verdict: 'pass' | 'fail';
  reason: string;
  confidence?: number;
}

interface AutoDiagReport {
  totals: {
    failedTrials: number;
    anomalyTrials: number;
    totalTrials: number;
  };
  averages: {
    committed: number;
    failed: number;
    routes: number;
    budgetSkipRatio: number;
    maxBudgetSkipStreak: number;
    top1Share: number;
    hhi: number;
    activeRouteNodes: number;
    clearingToCommitRatio: number;
    clientBalance: number;
  };
  judge?: {
    status: 'not_run' | 'ok' | 'error';
    verdict?: AutoDiagJudgeVerdict;
    error?: string;
  };
}

interface StressRow {
  scenario: string;
  description: string;
  steps: number;
  trials: number;
  failedTrials: number;
  anomalyTrials: number;
  commitRate: number;
  failureRate: number;
  routesPerStep: number;
  top1Share: number;
  hhi: number;
  budgetSkipRatio: number;
  maxBudgetSkipStreak: number;
  activeRouteNodes: number;
  clearingToCommitRatio: number;
  judgeVerdict: 'pass' | 'fail' | 'error' | 'not_run';
  judgeReason: string;
  runJsonPath: string;
  commandExitCode: number | null;
}

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: 'baseline',
    description: '默认并发基线',
    flags: {},
  },
  {
    id: 'burst_heavy',
    description: '高突发到达压力',
    flags: {
      'arrival-base-min': 3,
      'arrival-base-max': 5,
      'arrival-burst-prob': 0.55,
      'arrival-burst-min': 4,
      'arrival-burst-max': 9,
    },
  },
  {
    id: 'delay_heavy',
    description: '重尾处理时延压力',
    flags: {
      'processing-delay-min': 1,
      'processing-delay-max': 7,
    },
  },
  {
    id: 'combined_stress',
    description: '突发+重尾+低预算复合压力',
    flags: {
      'client-balance': 300000,
      'max-payment-ratio': 0.06,
      'arrival-base-min': 3,
      'arrival-base-max': 5,
      'arrival-burst-prob': 0.55,
      'arrival-burst-min': 4,
      'arrival-burst-max': 9,
      'processing-delay-min': 1,
      'processing-delay-max': 7,
    },
  },
  {
    id: 'no_diversify_burst',
    description: '禁用近优分散 + 高突发',
    flags: {
      'route-near-best-ratio': 0,
      'route-temperature': 0.08,
      'arrival-base-min': 3,
      'arrival-base-max': 5,
      'arrival-burst-prob': 0.55,
      'arrival-burst-min': 4,
      'arrival-burst-max': 9,
    },
  },
];

function parseStringFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function parseNumberFlag(name: string, fallback: number): number {
  const raw = parseStringFlag(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvNumbers(raw: string, fallback: number[]): number[] {
  const values = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (values.length === 0) return fallback;
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function parseCsvStrings(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function createRunId(): string {
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return iso;
}

function parseOptions(): CliOptions {
  const runId = parseStringFlag('--run-id') ?? createRunId();
  const steps = parseCsvNumbers(parseStringFlag('--steps-grid') ?? '100,200,400', [100, 200, 400]);
  const outDir = resolve(parseStringFlag('--out-dir') ?? `reports/stress-grid/${runId}`);
  const jsonOut = resolve(parseStringFlag('--json-out') ?? 'reports/stress-grid-summary.json');
  const mdOut = resolve(parseStringFlag('--md-out') ?? 'reports/stress-grid-summary.md');
  const llmSummaryOut = resolve(parseStringFlag('--llm-summary-out') ?? 'reports/stress-grid-llm-summary.md');
  const scenarioFilter = parseStringFlag('--scenarios');

  return {
    steps,
    trialsShort: Math.max(1, Math.floor(parseNumberFlag('--trials-short', 50))),
    trialsLong: Math.max(1, Math.floor(parseNumberFlag('--trials-long', 20))),
    longStepThreshold: Math.max(1, Math.floor(parseNumberFlag('--long-step-threshold', 400))),
    judgeCmd: parseStringFlag('--judge-cmd'),
    judgeTimeoutMs: Math.max(1000, Math.floor(parseNumberFlag('--judge-timeout-ms', 180000))),
    whitepaperPath: parseStringFlag('--whitepaper-path') ?? '../whitepaper.md',
    outDir,
    runId,
    jsonOut,
    mdOut,
    llmSummary: process.argv.includes('--llm-summary'),
    llmSummaryOut,
    scenarios: scenarioFilter ? parseCsvStrings(scenarioFilter) : [],
  };
}

function resolveScenarios(filters: string[]): Scenario[] {
  if (filters.length === 0) return DEFAULT_SCENARIOS;
  const set = new Set(filters);
  return DEFAULT_SCENARIOS.filter((scenario) => set.has(scenario.id));
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function renderFlagArgs(flags: Record<string, string | number>): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(flags)) {
    args.push(`--${key}`, String(value));
  }
  return args;
}

function buildErrorRow(
  scenario: Scenario,
  steps: number,
  trials: number,
  runJsonPath: string,
  message: string,
  commandExitCode: number | null,
): StressRow {
  return {
    scenario: scenario.id,
    description: scenario.description,
    steps,
    trials,
    failedTrials: trials,
    anomalyTrials: trials,
    commitRate: 0,
    failureRate: 1,
    routesPerStep: 0,
    top1Share: 1,
    hhi: 1,
    budgetSkipRatio: 1,
    maxBudgetSkipStreak: steps,
    activeRouteNodes: 0,
    clearingToCommitRatio: 1,
    judgeVerdict: 'error',
    judgeReason: message,
    runJsonPath,
    commandExitCode,
  };
}

function runAutoDiag(
  scenario: Scenario,
  steps: number,
  trials: number,
  options: CliOptions,
): StressRow {
  const runJsonPath = resolve(options.outDir, `${scenario.id}-${steps}.json`);
  ensureParentDir(runJsonPath);
  if (existsSync(runJsonPath)) unlinkSync(runJsonPath);

  const args = [
    'run',
    'src/scripts/sim-autodiag.ts',
    '--steps',
    String(steps),
    '--trials',
    String(trials),
    '--mode',
    'ui',
    '--allow-failures',
    '--json-out',
    runJsonPath,
    ...renderFlagArgs(scenario.flags),
  ];
  if (options.judgeCmd) {
    args.push(
      '--judge-cmd',
      options.judgeCmd,
      '--judge-timeout-ms',
      String(options.judgeTimeoutMs),
      '--whitepaper-path',
      options.whitepaperPath,
    );
  }

  const run = spawnSync('bun', args, {
    encoding: 'utf8',
    timeout: options.judgeTimeoutMs + 60_000,
    maxBuffer: 1024 * 1024 * 32,
  });
  if (run.error) {
    return buildErrorRow(
      scenario,
      steps,
      trials,
      runJsonPath,
      `autodiag spawn error: ${run.error.message}`,
      run.status,
    );
  }
  if (typeof run.status === 'number' && run.status !== 0) {
    const stderr = (run.stderr ?? '').trim();
    return buildErrorRow(
      scenario,
      steps,
      trials,
      runJsonPath,
      `autodiag exit=${run.status}${stderr ? `, stderr=${stderr}` : ''}`,
      run.status,
    );
  }

  let report: AutoDiagReport | null = null;
  try {
    report = JSON.parse(readFileSync(runJsonPath, 'utf8')) as AutoDiagReport;
  } catch {
    report = null;
  }

  if (!report) {
    const stderr = (run.stderr ?? '').trim();
    return buildErrorRow(
      scenario,
      steps,
      trials,
      runJsonPath,
      `report missing, exit=${run.status ?? 'null'}${stderr ? `, stderr=${stderr}` : ''}`,
      run.status,
    );
  }

  const avg = report.averages;
  const totals = report.totals;
  const judgeStatus = report.judge?.status;
  const judgeVerdict = judgeStatus === 'ok'
    ? (report.judge?.verdict?.verdict ?? 'fail')
    : judgeStatus === 'error'
      ? 'error'
      : 'not_run';
  const judgeReason = judgeStatus === 'ok'
    ? (report.judge?.verdict?.reason ?? 'judge missing reason')
    : (report.judge?.error ?? 'judge not enabled');

  const routesSafe = Math.max(1, avg.routes);
  return {
    scenario: scenario.id,
    description: scenario.description,
    steps,
    trials,
    failedTrials: totals.failedTrials,
    anomalyTrials: totals.anomalyTrials,
    commitRate: avg.committed / routesSafe,
    failureRate: avg.failed / routesSafe,
    routesPerStep: avg.routes / Math.max(1, steps),
    top1Share: avg.top1Share,
    hhi: avg.hhi,
    budgetSkipRatio: avg.budgetSkipRatio,
    maxBudgetSkipStreak: avg.maxBudgetSkipStreak,
    activeRouteNodes: avg.activeRouteNodes,
    clearingToCommitRatio: avg.clearingToCommitRatio,
    judgeVerdict,
    judgeReason,
    runJsonPath,
    commandExitCode: run.status,
  };
}

function toMarkdown(options: CliOptions, rows: StressRow[], llmSummary?: string): string {
  const lines: string[] = [];
  lines.push('# Stress Grid Report');
  lines.push('');
  lines.push(`- runId: ${options.runId}`);
  lines.push(`- generatedAt: ${new Date().toISOString()}`);
  lines.push(`- steps: ${options.steps.join(', ')}`);
  lines.push(`- trialsShort: ${options.trialsShort}`);
  lines.push(`- trialsLong: ${options.trialsLong}`);
  lines.push(`- judgeCmd: ${options.judgeCmd ?? '(disabled)'}`);
  lines.push(`- judgeTimeoutMs: ${options.judgeTimeoutMs}`);
  lines.push('');
  lines.push('| scenario | steps | trials | failed | anomaly | commitRate | failureRate | routes/step | top1 | hhi | skipRatio | clear/commit | judge |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const row of rows) {
    lines.push(`| ${row.scenario} | ${row.steps} | ${row.trials} | ${row.failedTrials} | ${row.anomalyTrials} | ${row.commitRate.toFixed(3)} | ${row.failureRate.toFixed(3)} | ${row.routesPerStep.toFixed(3)} | ${row.top1Share.toFixed(3)} | ${row.hhi.toFixed(3)} | ${row.budgetSkipRatio.toFixed(3)} | ${row.clearingToCommitRatio.toFixed(3)} | ${row.judgeVerdict} |`);
  }

  lines.push('');
  lines.push('## Notes');
  for (const row of rows) {
    lines.push(`- ${row.scenario}@${row.steps}: ${row.judgeReason}`);
  }

  if (llmSummary) {
    lines.push('');
    lines.push('## LLM Summary');
    lines.push(llmSummary.trim());
  }

  lines.push('');
  return lines.join('\n');
}

function buildLlmPrompt(rows: StressRow[]): string {
  const payload = rows.map((row) => ({
    scenario: row.scenario,
    steps: row.steps,
    trials: row.trials,
    failedTrials: row.failedTrials,
    anomalyTrials: row.anomalyTrials,
    commitRate: Number(row.commitRate.toFixed(4)),
    failureRate: Number(row.failureRate.toFixed(4)),
    routesPerStep: Number(row.routesPerStep.toFixed(4)),
    top1Share: Number(row.top1Share.toFixed(4)),
    hhi: Number(row.hhi.toFixed(4)),
    budgetSkipRatio: Number(row.budgetSkipRatio.toFixed(4)),
    maxBudgetSkipStreak: Number(row.maxBudgetSkipStreak.toFixed(2)),
    activeRouteNodes: Number(row.activeRouteNodes.toFixed(2)),
    clearingToCommitRatio: Number(row.clearingToCommitRatio.toFixed(4)),
    judgeVerdict: row.judgeVerdict,
    judgeReason: row.judgeReason,
  }));

  return [
    '你是仿真评审专家。请基于输入数据输出中文总结。',
    '输出格式严格为：',
    '1) 一段不超过220字的总体结论',
    '2) 一个最多6条的要点列表（每条一行，以"- "开头）',
    '必须回答：A. 落地成熟度（高/中/低+一句理由）；B. 当前测试还能否找出问题；C. 最关键3个盲区。',
    '不要输出JSON。',
    '',
    `数据: ${JSON.stringify(payload)}`,
  ].join('\n');
}

function runLlmSummary(rows: StressRow[]): string {
  const prompt = buildLlmPrompt(rows);
  const run = spawnSync('codex', [
    'exec',
    '-C',
    process.cwd(),
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    prompt,
  ], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
  });

  if (run.error) {
    return `LLM summary failed: ${run.error.message}`;
  }
  if (typeof run.status === 'number' && run.status !== 0) {
    return `LLM summary failed: exit=${run.status}, stderr=${(run.stderr ?? '').trim()}`;
  }

  const text = (run.stdout ?? '').trim();
  return text.length > 0 ? text : 'LLM summary failed: empty output';
}

function main(): void {
  const options = parseOptions();
  const scenarios = resolveScenarios(options.scenarios);
  if (scenarios.length === 0) {
    throw new Error('no scenarios selected');
  }

  ensureParentDir(options.jsonOut);
  ensureParentDir(options.mdOut);
  mkdirSync(options.outDir, { recursive: true });

  const rows: StressRow[] = [];
  for (const scenario of scenarios) {
    for (const steps of options.steps) {
      const trials = steps >= options.longStepThreshold ? options.trialsLong : options.trialsShort;
      const row = runAutoDiag(scenario, steps, trials, options);
      rows.push(row);
      console.log(`[stress-grid] ${scenario.id}@${steps}: judge=${row.judgeVerdict}, failed=${row.failedTrials}/${row.trials}, anomaly=${row.anomalyTrials}/${row.trials}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    runId: options.runId,
    options,
    rows,
  };
  const jsonArchiveOut = resolve(dirname(options.jsonOut), `stress-grid-summary-${options.runId}.json`);
  const mdArchiveOut = resolve(dirname(options.mdOut), `stress-grid-summary-${options.runId}.md`);
  const llmArchiveOut = resolve(dirname(options.llmSummaryOut), `stress-grid-llm-summary-${options.runId}.md`);

  let llmSummary: string | undefined;
  if (options.llmSummary) {
    llmSummary = runLlmSummary(rows);
    ensureParentDir(options.llmSummaryOut);
    writeFileSync(options.llmSummaryOut, `${llmSummary}\n`, 'utf8');
    writeFileSync(llmArchiveOut, `${llmSummary}\n`, 'utf8');
    console.log(`[stress-grid] llm summary written: ${options.llmSummaryOut}`);
    console.log(`[stress-grid] llm summary archive written: ${llmArchiveOut}`);
  }

  writeFileSync(options.jsonOut, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(options.mdOut, toMarkdown(options, rows, llmSummary), 'utf8');
  writeFileSync(jsonArchiveOut, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(mdArchiveOut, toMarkdown(options, rows, llmSummary), 'utf8');
  console.log(`[stress-grid] json written: ${options.jsonOut}`);
  console.log(`[stress-grid] markdown written: ${options.mdOut}`);
  console.log(`[stress-grid] json archive written: ${jsonArchiveOut}`);
  console.log(`[stress-grid] markdown archive written: ${mdArchiveOut}`);
}

main();
