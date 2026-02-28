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
| 可观测、可审计、可复验 | `src/scripts/sim-selftest.ts` + `src/scripts/sim-autodiag.ts`（`codex-judge.ts` 可选） |

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
| 2026-02-28 | `sim-autodiag.ts` | Judge 由主判改为可选解释层 | 减少“无 judge 无法跑诊断”的耦合 |
| 2026-02-28 | `task.ts` + `simulation.ts` | 并发到达 + 突发 + 处理时延 + 输出判定器 | 从理想串行转向近现实模型 |
| 2026-02-28 | `sim-autodiag.ts` + `sim-selftest.ts` | drain 排空（`suspendArrivals`） | 修复 `inflight_not_drained` |

## 5. 验收与观测

### 5.1 AutoDiag 观测门（硬门）

- 路由集中：`top1Share`、`hhi`
- 预算空转：`budgetSkipRatio`、`maxBudgetSkipStreak`
- 有效参与：`activeRouteNodes`
- 清算负担：`clearingToCommitRatio`
- 结构不变量：`invalid_state/no_route/inflight_not_drained/all_isolated`

### 5.2 Gate 顺序（当前）

1. `bun run sim:gate1`
2. `bun run sim:gate2`
3. `bun run sim:gate3`

可选解释层：

- `bun run sim:gate3:judge`

### 5.3 结果记录原则

- 不在文档里写“固定 pass 快照”。
- 以最新 `reports/gate*.json` 与命令输出为准。

## 6. 后续记录规范（每次改动都填）

| 字段 | 必填内容 |
|---|---|
| 变更编号 | 日期 + 简短标识 |
| 理论映射 | 对应白皮书主张（不允许新增未声明主张） |
| 改动文件 | 文件路径 + 函数名 |
| 参数变化 | 旧值 -> 新值 |
| 预期收益 | 解决什么问题 |
| 风险 | 可能引入什么副作用 |
| 验证命令 | 至少一条 `sim:gates`，Judge 作为可选补充 |
| 结果摘要 | 是否通过，关键指标前后对比 |
