# 理论-实现落地跟踪（Agent Credit Demo）

## 1. 文档目标

- 区分白皮书理论与工程实现，不混写、不偷换概念。
- 跟踪参数/算法改动的动机、影响和验证结果。
- 作为自动诊断与回归的单一事实来源。

> 说明：白皮书主张不改；本文件只记录实现层变化。

## 2. 理论主张与实现映射

| 白皮书主张（不变） | 当前实现映射 |
|---|---|
| Price as Credit：以有效价格分配任务 | `src/engine/router.ts` 的 `routeTask` 基于 `P_eff` 选路 |
| 非原子流程需 Saga 闭环 | `src/engine/simulation.ts` 的 `RESERVE -> DISPATCH -> VALIDATE -> COMMIT` / `FAIL -> ABORT -> COMPENSATE` |
| 质量判定驱动结算 | `simulation.ts` 的 `evaluateTaskOutput`（schema/score/tool-error/timeout） |
| 宏观清算抑制长期失衡 | `src/engine/bancor.ts` 动态阈值清算（TAX/FEE） |
| 可观测、可审计、可复验 | `src/scripts/sim-selftest.ts` + `src/scripts/sim-autodiag.ts` + `src/scripts/codex-judge.ts` |

## 3. 当前实现基线（2026-02-28）

### 3.1 UI / AutoDiag 默认策略

- `clearEvery=8`
- `routeNearBestRatio=0.75`
- `routeTemperature=0.35`
- `adaptiveDeltaFloor=8`
- `maxPaymentRatio=0.08`
- `budgetRefillThreshold=9000`

### 3.2 自动模式核心行为

- 每 tick 并发到达（基础 2~3，18% 概率突发 +2~4）。
- DISPATCH 后按处理时延延迟判定（1~3 tick + 摩擦惩罚）。
- 输出判定器通过后才 COMMIT，否则 FAIL/ABORT/COMPENSATE。
- 诊断/自测结束后进入 drain（`suspendArrivals=true`）排空 in-flight。

## 4. 关键实现变更日志

| 日期 | 模块 | 改动 | 目的 |
|---|---|---|---|
| 2026-02-28 | `sim-selftest.ts` | trial seed 按轮次派生 | 避免“多 trial 同轨迹”假稳定 |
| 2026-02-28 | `simulation.ts` | 失败路径去重复降分 | 修复失败雪崩 |
| 2026-02-28 | `router.ts` | near-best + 温度采样 + 反锁死探索 | 降低节点吸附 |
| 2026-02-28 | `simulation.ts` | 去掉 `maxPaymentAbsolute` 与即时补给倍率 | 去掉拍脑袋常数 |
| 2026-02-28 | `simulation.ts` | 周期补给改为“补到阈值” | 降低预算空转 |
| 2026-02-28 | `bancor.ts` | `dynamicThreshold=max(base, avgAbsDeviation*0.45)` | 降低清算过载 |
| 2026-02-28 | `sim-autodiag.ts` | Judge 主判单路径（`--judge-cmd` 必填） | 去兼容分支、统一判定 |
| 2026-02-28 | `task.ts` + `simulation.ts` | 并发到达 + 突发 + 处理时延 + 输出判定器 | 从理想串行转向近现实模型 |
| 2026-02-28 | `sim-autodiag.ts` + `sim-selftest.ts` | drain 排空（`suspendArrivals`） | 修复 `inflight_not_drained` |

## 5. 验收与观测

### 5.1 Judge 观测门（当前主门）

- 路由集中：`top1Share`、`hhi`
- 预算空转：`budgetSkipRatio`、`maxBudgetSkipStreak`
- 有效参与：`activeRouteNodes`
- 清算负担：`clearingToCommitRatio`
- 结构不变量：`invalid_state/no_route/inflight_not_drained/all_isolated`

### 5.2 Selftest 并发门（当前）

1. `bun run sim:selftest --steps 100 --trials 50 --min-commit-rate 0.80 --max-failure-rate 0.20 --min-routes-per-step 1.8`
2. `bun run sim:selftest --steps 200 --trials 50 --client-balance 1000000 --min-commit-rate 0.84 --max-failure-rate 0.16 --min-routes-per-step 2.2`
3. `bun run sim:selftest --steps 400 --trials 20 --client-balance 2000000 --min-commit-rate 0.86 --max-failure-rate 0.15 --min-routes-per-step 2.4`

### 5.3 近期结果快照（2026-02-28）

- Selftest Gate 1：`failed trials=0/50`（pass）
- Selftest Gate 2：`failed trials=0/50`（pass）
- Selftest Gate 3：`failed trials=0/20`（pass）
- `status-now-200-v2.json`：`failedTrials=0/20`，Judge=`pass`
- `status-now-400-v2.json`：`failedTrials=0/20`，Judge=`pass`

## 6. 后续记录规范（每次改动都填）

| 字段 | 必填内容 |
|---|---|
| 变更编号 | 日期 + 简短标识 |
| 理论映射 | 对应白皮书主张（不允许新增未声明主张） |
| 改动文件 | 文件路径 + 函数名 |
| 参数变化 | 旧值 -> 新值 |
| 预期收益 | 解决什么问题 |
| 风险 | 可能引入什么副作用 |
| 验证命令 | 至少一条 autodiag（含 judge） |
| 结果摘要 | 是否通过，关键指标前后对比 |
