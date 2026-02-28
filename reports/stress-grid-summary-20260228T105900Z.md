# Stress Grid Report

- runId: 20260228T105900Z
- generatedAt: 2026-02-28T11:03:20.829Z
- steps: 100, 200
- trialsShort: 20
- trialsLong: 10
- judgeCmd: bun run src/scripts/codex-judge.ts --model gpt-5.3-codex --timeout-ms 180000
- judgeTimeoutMs: 180000

| scenario | steps | trials | failed | anomaly | commitRate | failureRate | routes/step | top1 | hhi | skipRatio | clear/commit | judge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | 100 | 20 | 0 | 0 | 0.938 | 0.062 | 3.023 | 0.421 | 0.367 | 0.000 | 0.027 | pass |
| baseline | 200 | 20 | 0 | 0 | 0.934 | 0.066 | 3.016 | 0.406 | 0.352 | 0.000 | 0.058 | pass |
| burst_heavy | 100 | 20 | 0 | 0 | 0.831 | 0.169 | 3.501 | 0.542 | 0.431 | 0.000 | 0.027 | pass |
| burst_heavy | 200 | 20 | 0 | 0 | 0.857 | 0.143 | 3.350 | 0.500 | 0.379 | 0.000 | 0.070 | pass |
| delay_heavy | 100 | 20 | 0 | 0 | 0.846 | 0.154 | 2.399 | 0.421 | 0.352 | 0.000 | 0.025 | pass |
| delay_heavy | 200 | 20 | 0 | 0 | 0.889 | 0.111 | 2.503 | 0.391 | 0.308 | 0.000 | 0.065 | pass |
| combined_stress | 100 | 20 | 0 | 0 | 0.903 | 0.097 | 3.022 | 0.396 | 0.349 | 0.000 | 0.026 | pass |
| combined_stress | 200 | 20 | 0 | 0 | 0.911 | 0.089 | 2.927 | 0.406 | 0.364 | 0.000 | 0.052 | pass |
| no_diversify_burst | 100 | 20 | 0 | 0 | 0.810 | 0.190 | 3.289 | 0.495 | 0.386 | 0.000 | 0.024 | pass |
| no_diversify_burst | 200 | 20 | 0 | 0 | 0.846 | 0.154 | 3.194 | 0.436 | 0.313 | 0.000 | 0.066 | pass |

## Notes
- baseline@100: 关键风险指标均未触发失败条件，且未见结构性不变量破坏。
- baseline@200: 各项硬性失败阈值均未触发，未见结构性异常。
- burst_heavy@100: 关键失败阈值均未触发，且未见结构性异常。
- burst_heavy@200: 核心异常阈值均未触发，且未见结构性不变量破坏。
- delay_heavy@100: 未触发任一失败条件，且无结构性不变量破坏。
- delay_heavy@200: 关键失败阈值均未触发，且未见结构性不变量破坏或垄断迹象。
- combined_stress@100: 关键异常阈值均未触发，且未见结构性不变量破坏。
- combined_stress@200: 关键风险指标均低于失败阈值，且无结构性异常证据。
- no_diversify_burst@100: 核心风险指标均低于失败阈值，且未见结构性不变量破坏或垄断证据。
- no_diversify_burst@200: All rubric fail-conditions are comfortably unmet, with no structural invariant break evidence.

## LLM Summary
总体上，10组场景（100/200步）均判定pass且无failed/anomaly，系统已具备上线可用性；但在burst与no_diversify压力下，commit率降至0.8098~0.8571、failure率升至0.1429~0.1902，显示高负载与策略退化下韧性不足，仍需补充验证后再扩大落地。  
- A. 落地成熟度：中。理由：硬性失败阈值全部通过，但高压场景性能退化幅度较大，稳健性未达“高”。  
- B. 当前测试还能否找出问题：能，但现有检出力有限；更可能发现“性能退化”而非“硬失败”。  
- 基线最稳（commit约0.934~0.938，failure约0.062~0.066），可作为回归基准。  
- 压力敏感点在burst/no_diversify（top1Share最高0.5418、HHI最高0.431），存在路径集中风险。  
- C. 最关键3个盲区：①样本与时长不足（每组20次、最多200步）；②指标维度偏窄（缺P95/P99时延、恢复时间、抖动）；③资源约束未覆盖（budgetSkip恒0，未测预算/依赖故障冲击）。
