# Sim AutoDiag Report

## Summary
- mode: ui
- trials: 10
- failed trials: 9
- anomaly trials: 0

## Averages
- committed: 58.30
- failed: 1.70
- routes: 60.00
- budget skip ratio: 0.000
- max budget skip streak: 0.00
- top1 share: 0.728
- hhi: 0.630
- active route nodes: 2.40
- clearing/commit ratio: 0.129

## Root Causes
- 未发现显著结构性异常，当前配置在给定阈值内稳定。

## Issue Counts
- committed_low: 9
- failed_high: 0
- no_route: 0
- inflight_not_drained: 0
- all_isolated: 0
- invalid_state: 0
- node_absorption: 0
- budget_starvation: 0
- budget_stall: 0
- low_route_diversity: 0

## LLM Verdict
- status: ok
- cmd: node -e "let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const i=JSON.parse(s);const ok=i.report.totals.failedTrials===0&&i.report.totals.anomalyTrials===0;process.stdout.write(JSON.stringify({verdict:ok?\"pass\":\"fail\",reason:ok?\"deterministic clean\":\"deterministic blockers found\",confidence:0.6}));});"
- required: false
- verdict: fail
- reason: deterministic blockers found
- confidence: 0.600

## Sample Failed Trials
- trial=1, committed=58, failed=2, top1=0.817, hhi=0.695, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=-, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
- trial=2, committed=58, failed=2, top1=0.850, hhi=0.745, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=-, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
- trial=3, committed=57, failed=3, top1=0.783, hhi=0.638, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=38, firstFailedExceed=-
  - committed_low: committed too low: 57 < 60
- trial=4, committed=59, failed=1, top1=0.817, hhi=0.701, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=8, firstFailedExceed=-
  - committed_low: committed too low: 59 < 60
- trial=5, committed=58, failed=2, top1=0.583, hhi=0.514, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=8, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
- trial=7, committed=58, failed=2, top1=0.733, hhi=0.601, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=43, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
- trial=8, committed=59, failed=1, top1=0.550, hhi=0.505, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=-, firstFailedExceed=-
  - committed_low: committed too low: 59 < 60
- trial=9, committed=58, failed=2, top1=0.517, hhi=0.501, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=8, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
- trial=10, committed=58, failed=2, top1=0.783, hhi=0.654, skipRatio=0.000, maxSkipStreak=0, firstBudgetSkip=-, firstDominant=-, firstFailedExceed=-
  - committed_low: committed too low: 58 < 60
