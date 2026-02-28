/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface JudgeVerdict {
  verdict: 'pass' | 'fail';
  reason: string;
  confidence?: number;
  findings?: string[];
  suggestedActions?: string[];
}

interface CliOptions {
  model?: string;
  timeoutMs: number;
  maxWhitepaperChars: number;
  workdir: string;
}

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function parseOptions(): CliOptions {
  const timeoutRaw = Number(parseArg('--timeout-ms') ?? '180000');
  const maxWhitepaperCharsRaw = Number(parseArg('--max-whitepaper-chars') ?? '3500');
  return {
    model: parseArg('--model'),
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 1000 ? Math.floor(timeoutRaw) : 180000,
    maxWhitepaperChars: Number.isFinite(maxWhitepaperCharsRaw) && maxWhitepaperCharsRaw > 200
      ? Math.floor(maxWhitepaperCharsRaw)
      : 3500,
    workdir: resolve(parseArg('--workdir') ?? process.cwd()),
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolveRead, rejectRead) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolveRead(data));
    process.stdin.on('error', rejectRead);
  });
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
  throw new Error('codex output does not contain JSON object');
}

function parseVerdict(raw: string): JudgeVerdict {
  const candidate = extractJsonCandidate(raw);
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  if (parsed.verdict !== 'pass' && parsed.verdict !== 'fail') {
    throw new Error(`invalid verdict: ${String(parsed.verdict)}`);
  }
  if (typeof parsed.reason !== 'string' || parsed.reason.trim().length === 0) {
    throw new Error('invalid reason');
  }
  const toStringArray = (value: unknown): string[] | undefined => (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value as string[]
      : undefined
  );
  return {
    verdict: parsed.verdict,
    reason: parsed.reason,
    confidence: typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? parsed.confidence
      : undefined,
    findings: toStringArray(parsed.findings),
    suggestedActions: toStringArray(parsed.suggestedActions),
  };
}

function buildPrompt(input: Record<string, unknown>, maxWhitepaperChars: number): string {
  const report = (input.report ?? {}) as Record<string, unknown>;
  const context = (input.context ?? {}) as Record<string, unknown>;
  const whitepaper = (context.whitepaper ?? {}) as Record<string, unknown>;
  const whitepaperExcerptRaw = typeof whitepaper.excerpt === 'string' ? whitepaper.excerpt : '';
  const whitepaperExcerpt = whitepaperExcerptRaw.slice(0, maxWhitepaperChars);

  const payload = {
    deterministicBlocking: context.deterministicBlocking ?? null,
    totals: report.totals ?? null,
    averages: report.averages ?? null,
    issueCounts: report.issueCounts ?? null,
    rootCauses: report.rootCauses ?? null,
    sampleCount: Array.isArray(report.samples) ? report.samples.length : null,
    sampleHead: Array.isArray(report.samples) ? report.samples.slice(0, 4) : null,
    whitepaperMeta: {
      included: whitepaper.included ?? null,
      mode: whitepaper.mode ?? null,
      sourceChars: whitepaper.sourceChars ?? null,
      excerptChars: whitepaper.excerptChars ?? null,
      truncated: whitepaper.truncated ?? null,
    },
    whitepaperExcerpt,
  };

  return [
    'You are a strict simulation evaluator for a multi-agent credit routing demo.',
    'Return ONLY one JSON object with this exact shape:',
    '{"verdict":"pass|fail","reason":"short","confidence":0.0,"findings":["..."],"suggestedActions":["..."]}',
    'Decision policy:',
    '- Focus on anomaly discovery quality, not only static selftest thresholds.',
    '- Use this rubric first:',
    '  FAIL if avg top1Share >= 0.72 OR avg hhi >= 0.60.',
    '  FAIL if avg budgetSkipRatio >= 0.03 OR avg maxBudgetSkipStreak >= 3.',
    '  FAIL if avg maxRouteStreak >= 10.',
    '  FAIL if avg singleFiniteQuoteRatio >= 0.55 (price surface长期单候选).',
    '  FAIL if avg clearingToCommitRatio >= 0.30.',
    '  FAIL if activeRouteNodes is persistently too low with clear monopoly evidence.',
    '  PASS when all above fail-conditions are not met and there is no structural invariant break.',
    '- deterministicBlocking is a signal, not an automatic decision. You must reason from metrics and samples.',
    '- Use provided metrics/issues as primary evidence; use whitepaper excerpt as intent context.',
    '- Do not invent data.',
    '',
    'Input JSON:',
    JSON.stringify(payload),
  ].join('\n');
}

function runCodexJudge(prompt: string, options: CliOptions): JudgeVerdict {
  const outputPath = join(tmpdir(), `codex-judge-${Date.now()}-${process.pid}.txt`);
  const args = [
    'exec',
    '-C',
    options.workdir,
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-o',
    outputPath,
  ];
  if (options.model) {
    args.push('--model', options.model);
  }
  args.push(prompt);

  const run = spawnSync('codex', args, {
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 12,
  });

  if (run.error) {
    throw new Error(`codex exec error: ${run.error.message}`);
  }
  if (typeof run.status === 'number' && run.status !== 0) {
    throw new Error(`codex exec exit=${run.status}, stderr=${(run.stderr ?? '').trim()}`);
  }

  const text = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : (run.stdout ?? '');
  if (existsSync(outputPath)) {
    rmSync(outputPath, { force: true });
  }
  return parseVerdict(text);
}

async function main(): Promise<void> {
  const options = parseOptions();
  const raw = await readStdin();
  if (!raw.trim()) {
    throw new Error('stdin is empty');
  }

  const input = JSON.parse(raw) as Record<string, unknown>;
  const prompt = buildPrompt(input, options.maxWhitepaperChars);
  const verdict = runCodexJudge(prompt, options);
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`codex-judge failed: ${message}\n`);
  process.exit(1);
});
