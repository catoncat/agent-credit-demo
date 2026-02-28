# 当前算法与参数总览（2026-02-28）

## 1. 自动模式流程

每个 tick 的执行顺序：

1. 先处理 in-flight 任务（`RESERVE/DISPATCH/VALIDATE`）。
2. 到达 `readyTick` 的任务进入输出判定器。
3. 判定通过：`VALIDATE -> COMMIT`。
4. 判定失败：`FAIL -> ABORT -> COMPENSATE`。
5. 注入本 tick 新任务（并发 + 突发）。
6. tick 末做摩擦衰减；周期到达时做清算与预算补给。

实现入口：`src/engine/simulation.ts#executeAutoTick`。

## 2. 并发到达与时延

- 到达计划：`sampleArrivalPlan`
- 基础并发：2~3 个任务 / tick
- 突发：18% 概率额外 +2~4 个任务

- 处理时延：`sampleProcessingDelay`
- 基础时延：1~3 tick
- 摩擦惩罚：`f>3` 加 1 tick，`f>5` 加 2 tick

## 3. 输出判定器（替代纯随机成功）

判定器：`evaluateTaskOutput`

输出字段：
- `schema: boolean`
- `score: number`
- `toolError: boolean`
- `timeout: boolean`
- `passed: boolean`
- `reason: pass/timeout/tool_error/schema_mismatch/low_score`

判定逻辑：
- `timeout=true` -> fail
- `toolError=true` -> fail
- `schema=false` -> fail
- `score < 60` -> fail
- 其余 -> pass

概率模型（由 `s_hat`、`f` 驱动）：
- `schemaProb = clamp(0.58 + s_hat*0.36 - f*0.05, 0.18, 0.98)`
- `timeoutProb = clamp(0.02 + f*0.045 + (1-s_hat)*0.12, 0.01, 0.88)`
- `toolErrorProb = clamp(0.015 + f*0.035, 0.01, 0.72)`
- `scoreRaw = s_hat*100 - f*4.2 + noise[-10,+10]`

## 4. 路由与预算

- 路由核心：最小有效价格 `P_eff`，near-best + soft sampling。
- 反锁死：dominant share 过高时触发去 dominant 探索。
- 预算门：`payment <= min(clientBalance*maxPaymentRatio, epochPacingCap)`
- `epochPacingCap = clientBalance / ticksUntilClear`

默认（UI/AutoDiag）：
- `clearEvery=8`
- `routeNearBestRatio=0.75`
- `routeTemperature=0.35`
- `adaptiveDeltaFloor=8`
- `maxPaymentRatio=0.08`
- `budgetRefillThreshold=9000`

## 5. 清算（Bancor）

文件：`src/engine/bancor.ts`

- 税率：`surplusTaxRate=0.008`
- 费率：`deficitFeeRate=0.01`
- 基础阈值：`threshold=220`
- 动态阈值：`dynamicThreshold = max(threshold, avgAbsDeviation*0.45)`
- 逆差宽限：样本少时阈值放宽（2.5x / 1.5x / 1.0x）

## 6. 收敛策略（防 in-flight 残留）

在诊断/自测末尾进入 drain：
- `suspendArrivals=true`（停注入）
- 继续推进直到 in-flight 清空或超出 `maxDrainTicks`
- `maxDrainTicks = max(24, ceil(steps*0.4))`

实现：
- `src/scripts/sim-autodiag.ts`
- `src/scripts/sim-selftest.ts`

## 7. 当前门禁状态

- 统一入口：`sim:gates`（Gate1 -> Gate2 -> Gate3）。
- Gate1：`sim-selftest`（并发语义硬门：`commitRate/failureRate/routesPerStep`）。
- Gate2/3：`sim-autodiag`（结构 + 异常门；Judge 可选）。
- 运行状态不在文档静态声明，以最新 `reports/gate*.json` 实测为准。
