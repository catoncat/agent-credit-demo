# Stress Grid Report

- runId: 20260228T133151Z
- generatedAt: 2026-02-28T13:34:58.540Z
- steps: 400
- trialsShort: 40
- trialsLong: 40
- judgeCmd: (disabled)
- judgeTimeoutMs: 180000

| scenario | steps | trials | failed | anomaly | commitRate | failureRate | routes/step | top1 | hhi | skipRatio | clear/commit | judge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | 400 | 40 | 0 | 0 | 0.907 | 0.093 | 3.038 | 0.321 | 0.264 | 0.000 | 0.134 | not_run |
| burst_heavy | 400 | 40 | 0 | 4 | 0.903 | 0.097 | 5.126 | 0.285 | 0.223 | 0.320 | 0.146 | not_run |
| delay_heavy | 400 | 40 | 0 | 0 | 0.910 | 0.090 | 2.867 | 0.310 | 0.251 | 0.059 | 0.134 | not_run |
| combined_stress | 400 | 40 | 0 | 8 | 0.916 | 0.084 | 4.166 | 0.241 | 0.198 | 0.447 | 0.112 | not_run |
| no_diversify_burst | 400 | 40 | 0 | 14 | 0.894 | 0.106 | 4.386 | 0.345 | 0.256 | 0.422 | 0.142 | not_run |

## Notes
- baseline@400: judge not enabled
- burst_heavy@400: judge not enabled
- delay_heavy@400: judge not enabled
- combined_stress@400: judge not enabled
- no_diversify_burst@400: judge not enabled
