# Stress Grid Report

- runId: 20260228T121151Z
- generatedAt: 2026-02-28T12:21:50.925Z
- steps: 100, 200, 400
- trialsShort: 50
- trialsLong: 20
- judgeCmd: bun run src/scripts/codex-judge.ts --model gpt-5.3-codex --timeout-ms 180000
- judgeTimeoutMs: 180000

| scenario | steps | trials | failed | anomaly | commitRate | failureRate | routes/step | top1 | hhi | skipRatio | clear/commit | judge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | 100 | 50 | 0 | 0 | 0.925 | 0.075 | 3.020 | 0.406 | 0.357 | 0.000 | 0.026 | pass |
| baseline | 200 | 50 | 0 | 1 | 0.927 | 0.073 | 2.999 | 0.389 | 0.349 | 0.000 | 0.058 | pass |
| baseline | 400 | 20 | 0 | 1 | 0.924 | 0.076 | 2.940 | 0.384 | 0.346 | 0.000 | 0.116 | pass |
| burst_heavy | 100 | 50 | 0 | 33 | 0.804 | 0.196 | 3.084 | 0.522 | 0.414 | 0.000 | 0.025 | fail |
| burst_heavy | 200 | 50 | 0 | 36 | 0.836 | 0.164 | 2.776 | 0.494 | 0.369 | 0.000 | 0.064 | fail |
| burst_heavy | 400 | 20 | 0 | 17 | 0.861 | 0.139 | 2.278 | 0.491 | 0.380 | 0.000 | 0.120 | fail |
| delay_heavy | 100 | 50 | 0 | 5 | 0.826 | 0.174 | 2.233 | 0.439 | 0.354 | 0.000 | 0.028 | pass |
| delay_heavy | 200 | 50 | 0 | 8 | 0.877 | 0.123 | 2.313 | 0.416 | 0.321 | 0.000 | 0.071 | pass |
| delay_heavy | 400 | 20 | 0 | 3 | 0.913 | 0.087 | 2.503 | 0.418 | 0.329 | 0.000 | 0.152 | pass |
| combined_stress | 100 | 50 | 0 | 2 | 0.913 | 0.087 | 3.219 | 0.363 | 0.329 | 0.000 | 0.025 | pass |
| combined_stress | 200 | 50 | 0 | 3 | 0.914 | 0.086 | 3.153 | 0.370 | 0.331 | 0.000 | 0.049 | pass |
| combined_stress | 400 | 20 | 0 | 4 | 0.920 | 0.080 | 2.874 | 0.404 | 0.362 | 0.000 | 0.091 | fail |
| no_diversify_burst | 100 | 50 | 0 | 34 | 0.811 | 0.189 | 3.249 | 0.515 | 0.404 | 0.000 | 0.025 | fail |
| no_diversify_burst | 200 | 50 | 0 | 37 | 0.845 | 0.155 | 3.063 | 0.457 | 0.341 | 0.000 | 0.065 | fail |
| no_diversify_burst | 400 | 20 | 0 | 13 | 0.875 | 0.125 | 3.057 | 0.387 | 0.283 | 0.000 | 0.129 | fail |

## Notes
- baseline@100: 关键失败阈值均未触发，且未见结构性不变量破坏。
- baseline@200: 核心指标均在失败阈值内且无结构性不变量破坏
- baseline@400: 均值未触发任何硬性失败阈值且无结构性不变式破坏；仅有单次吸收异常
- burst_heavy@100: avg maxRouteStreak 超阈值且节点吸附持续出现
- burst_heavy@200: 平均 maxRouteStreak=28.68（阈值>=10）触发硬性失败，存在持续节点吸附。
- burst_heavy@400: avg maxRouteStreak=59.8(>=10) 且 node_absorption 在 17/20 试验出现，存在结构性路由吸附
- delay_heavy@100: 均值未触发失败阈值且无结构性不变量破坏，但存在间歇性节点吸收异常。
- delay_heavy@200: 均值未触发任何FAIL阈值且无结构性不变量破坏，已识别并记录局部吸附异常。
- delay_heavy@400: 均值指标未触发FAIL阈值且未见结构不变式破坏，但有间歇性节点吸附异常。
- combined_stress@100: 均值未触发任一FAIL阈值且无结构性不变量破坏，但存在少量节点吸收异常需持续治理
- combined_stress@200: 均值指标未触发硬性失败阈值，当前异常表现为局部吸附尖峰而非结构性失稳。
- combined_stress@400: 平均maxRouteStreak=16.1超过阈值10，存在持续路由吸附。
- no_diversify_burst@100: avg maxRouteStreak=17.48 超过 10 的硬性失败阈值，且 node_absorption 异常高发。
- no_diversify_burst@200: avg maxRouteStreak=21.82>=10，已触发硬性失败条件。
- no_diversify_burst@400: avg maxRouteStreak=14.6 超过 10 的硬性失败阈值
