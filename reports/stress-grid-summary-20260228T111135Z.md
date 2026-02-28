# Stress Grid Report

- runId: 20260228T111135Z
- generatedAt: 2026-02-28T11:16:38.686Z
- steps: 100, 200
- trialsShort: 20
- trialsLong: 10
- judgeCmd: bun run src/scripts/codex-judge.ts --model gpt-5.3-codex --timeout-ms 180000
- judgeTimeoutMs: 180000

| scenario | steps | trials | failed | anomaly | commitRate | failureRate | routes/step | top1 | hhi | skipRatio | clear/commit | judge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | 100 | 20 | 0 | 2 | 0.920 | 0.080 | 3.006 | 0.415 | 0.366 | 0.000 | 0.027 | fail |
| baseline | 200 | 20 | 0 | 2 | 0.927 | 0.073 | 2.994 | 0.397 | 0.360 | 0.000 | 0.060 | fail |
| burst_heavy | 100 | 20 | 0 | 17 | 0.795 | 0.205 | 2.982 | 0.538 | 0.422 | 0.000 | 0.025 | fail |
| burst_heavy | 200 | 20 | 0 | 17 | 0.823 | 0.177 | 2.609 | 0.503 | 0.378 | 0.000 | 0.062 | fail |
| delay_heavy | 100 | 20 | 0 | 4 | 0.838 | 0.162 | 2.311 | 0.434 | 0.353 | 0.000 | 0.029 | fail |
| delay_heavy | 200 | 20 | 0 | 4 | 0.885 | 0.115 | 2.440 | 0.415 | 0.318 | 0.000 | 0.074 | fail |
| combined_stress | 100 | 20 | 0 | 1 | 0.918 | 0.082 | 3.165 | 0.376 | 0.342 | 0.000 | 0.025 | pass |
| combined_stress | 200 | 20 | 0 | 2 | 0.920 | 0.080 | 3.065 | 0.388 | 0.353 | 0.000 | 0.049 | fail |
| no_diversify_burst | 100 | 20 | 0 | 15 | 0.810 | 0.190 | 3.289 | 0.495 | 0.386 | 0.000 | 0.024 | fail |
| no_diversify_burst | 200 | 20 | 0 | 16 | 0.846 | 0.154 | 3.194 | 0.436 | 0.313 | 0.000 | 0.066 | fail |

## Notes
- baseline@100: avg maxRouteStreak 超阈值且出现吸收型垄断样本
- baseline@200: 平均路由连续命中超阈值并出现节点吸收型垄断样本
- burst_heavy@100: avg maxRouteStreak=28.25 超过阈值10，且17/20试验出现 node_absorption，存在持续路由锁死迹象
- burst_heavy@200: avg maxRouteStreak=44.25 严重超过 FAIL 阈值 10，存在持续节点吸附。
- delay_heavy@100: avg maxRouteStreak=14.8 >= 10，已触发硬性失败条件
- delay_heavy@200: 触发硬性失败条件：avg maxRouteStreak=28.3>=10，且存在明显节点吸附异常。
- combined_stress@100: 均值未触发任何硬性FAIL条件，且未见结构性不变式破坏；仅有单次吸收异常需持续监控。
- combined_stress@200: 平均maxRouteStreak超阈值（16.65>=10），存在路由吸附异常
- no_diversify_burst@100: maxRouteStreak 超阈值且节点吸附频发
- no_diversify_burst@200: avg maxRouteStreak=17.05 >= 10，触发硬性失败（持续路由吸附）

## LLM Summary
1) 总体结论：当前方案在压力与长时运行下稳定性不足。10组实验仅1组通过，9组因`maxRouteStreak`超阈值和节点吸附失败。尽管提交率多在0.82-0.93，但突发类场景异常达15-17/20，呈现“可提交但易锁死”的结构性风险，暂不宜直接生产落地。

2)
- A. 落地成熟度：低。核心失败模式在多数场景重复出现，且200步下仍会暴露或放大问题。
- B. 当前测试还能否找出问题：能。测试已检出迟发性退化（如`combined_stress`由100步通过到200步失败）。
- 盲区1：缺少抑制连续命中惯性的机制，`maxRouteStreak`跨场景反复越线。
- 盲区2：对突发负载与去多样化约束的联合鲁棒性不足，`node_absorption`高频出现。
- 盲区3：评估偏均值结论，缺少尾部与恢复性指标（吸附后解锁时间、p95/p99连续命中）。
