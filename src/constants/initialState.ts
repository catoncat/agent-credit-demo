import type { AgentState, AgentId } from '../types/agent';
import type { StepDefinition } from '../types/step';

export const DEFAULT_CLIENT_BALANCE = 80_000;
export const AUTO_CLEAR_INTERVAL = 8;
export const DEFAULT_BURN_RATE = 0.01;

export function createAgentState(id: AgentId, label: string): AgentState {
  const quota = 1000;
  const reservedQuota = 0;
  return {
    id,
    label,
    y: quota - reservedQuota,
    quota,
    reservedQuota,
    k: 100_000_000,
    f: 0,
    s_hat: 1.0,
    capacity: 5,
    activeTasks: 0,
    totalCompleted: 0,
    totalFailed: 0,
    status: 'idle',
    tradeBalance: 0,
    balance: 10_000,
    liquidationRatio: -0.25,
  };
}

export const INITIAL_AGENTS: Record<AgentId, AgentState> = {
  A: createAgentState('A', 'Agent-A'),
  B: createAgentState('B', 'Agent-B'),
  C: createAgentState('C', 'Agent-C'),
};

export const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: 1,
    title: '冷启动路由',
    subtitle: '路由器实时比价后分配',
    narrative: '系统冷启动，路由器使用 Δx = k/(y-Δy)-k/y 计算三节点报价，并按 P_eff = Δx·(1+f)/ŝ 选择目标节点，然后执行容量冻结。',
    formula: '\\Delta x = \\frac{k}{y-\\Delta y} - \\frac{k}{y},\\quad P_{eff}=\\Delta x\\cdot\\frac{1+f}{\\hat{s}}',
    actions: [
      { type: 'COMPARE_PRICES', candidates: ['A', 'B', 'C'], delta: 100 },
      { type: 'ROUTE', taskId: 'task-1', delta: 100, candidates: ['B'] },
      { type: 'RESERVE', taskId: 'task-1', agentId: 'B', delta: 100 },
      { type: 'DISPATCH', taskId: 'task-1', agentId: 'B' },
    ],
  },
  {
    id: 2,
    title: '失败回滚',
    subtitle: 'ABORT + COMPENSATE 回滚冻结容量',
    narrative: '任务执行失败后触发 Saga：ABORT 标记终止，COMPENSATE 回滚已冻结容量并施加摩擦惩罚，避免故障节点被继续分配。',
    formula: 'f \\leftarrow \\text{clamp}(f+\\alpha\\cdot penalty,0,10),\\quad reservedQuota \\leftarrow reservedQuota-\\Delta y',
    actions: [
      { type: 'FAIL', taskId: 'task-1', agentId: 'B' },
      { type: 'ABORT', taskId: 'task-1', agentId: 'B' },
      { type: 'COMPENSATE', taskId: 'task-1', agentId: 'B', delta: 100 },
    ],
  },
  {
    id: 3,
    title: '二次路由隔离',
    subtitle: '高摩擦节点被动降权',
    narrative: '路由器重新比较三节点有效价格。高摩擦节点会抬升 P_eff，故障后节点自然被降权并被健康节点替代。',
    formula: 'P_{eff} \\propto (1+f)/\\hat{s}',
    actions: [
      { type: 'COMPARE_PRICES', candidates: ['A', 'B', 'C'], delta: 100 },
      { type: 'ROUTE', taskId: 'task-2', delta: 100, candidates: ['A'] },
      { type: 'RESERVE', taskId: 'task-2', agentId: 'A', delta: 100 },
      { type: 'DISPATCH', taskId: 'task-2', agentId: 'A' },
    ],
  },
  {
    id: 4,
    title: '提交结算',
    subtitle: 'COMMIT 按支付金额结算',
    narrative: '任务通过 VALIDATE 后 COMMIT：释放冻结容量、按支付金额结算到 agent balance，burn 从支付中扣除，不再直接扣减 y。',
    formula: 'payment= P_{eff},\\; burn=payment\\cdot r_{burn},\\; agent\\_income=payment-burn',
    actions: [
      { type: 'VALIDATE', taskId: 'task-2', agentId: 'A' },
      { type: 'COMMIT', taskId: 'task-2', agentId: 'A', burnRate: 0.01 },
    ],
  },
  {
    id: 5,
    title: '背压与溢出',
    subtitle: '容量阈值触发 overflow',
    narrative: '并发任务持续压入同一节点会推高报价并占满容量，系统触发溢出路由，把后续任务分配到可用且更便宜的节点。',
    formula: 'activeTasks \\ge capacity \\Rightarrow overflow',
    actions: [
      { type: 'BACKPRESSURE', agentId: 'A', count: 4, delta: 100 },
      { type: 'OVERFLOW', fromAgent: 'A', toAgent: 'C', taskId: 'task-7', delta: 100 },
    ],
  },
  {
    id: 6,
    title: '阈值清算',
    subtitle: 'Bancor 风格税费再平衡',
    narrative: '达到清算周期后，系统对超阈值顺差征税、对超阈值逆差收取再平衡费，并对低健康度节点执行阈值清算。',
    formula: '|tradeBalance-avg| > threshold \\Rightarrow tax/fee',
    actions: [
      { type: 'BANCOR_SETTLE', agentId: 'A', amount: 8, actionType: 'TAX' },
      { type: 'BANCOR_SETTLE', agentId: 'B', amount: 1.2, actionType: 'FEE' },
    ],
  },
];
