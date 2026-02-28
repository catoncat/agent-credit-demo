import type { AgentState } from '../types/agent';
import type { Task, TaskStatus } from '../types/task';
import { release } from './amm';

export interface SagaResult {
  agent: AgentState;
  task: Task;
  compensated: boolean;
  refundAmount: number;
}

/** Transition task to next state */
export function transitionTask(task: Task, newStatus: TaskStatus): Task {
  return { ...task, status: newStatus };
}

/**
 * ABORT/COMPENSATE semantics:
 * - rollback frozen capacity
 * - increase friction and failure counters
 * - refund already charged payment (if any)
 */
export function sagaAbort(agent: AgentState, task: Task, frictionPenalty: number = 2.0): SagaResult {
  const released = release(
    {
      ...agent,
      totalFailed: agent.totalFailed + 1,
      status: 'failed',
    },
    task.delta,
    'idle',
  );

  const nextF = Math.min(released.f + frictionPenalty, 10);
  const nextScore = Math.max(released.s_hat - 0.08, 0.1);
  const healthRatio = released.balance / Math.max(released.quota, 1);
  const severeFinancialStress = healthRatio < released.liquidationRatio;
  const isolated = severeFinancialStress;

  const newAgent: AgentState = {
    ...released,
    f: nextF,
    s_hat: nextScore,
    status: isolated ? 'isolated' : released.status,
  };

  const newTask = transitionTask(task, 'ABORTED');

  return {
    agent: newAgent,
    task: newTask,
    compensated: true,
    refundAmount: Math.max(0, task.payment),
  };
}

/** Get the state machine flow */
export function getStateMachineStates(): { id: TaskStatus; label: string; isTerminal: boolean }[] {
  return [
    { id: 'INIT', label: '初始化', isTerminal: false },
    { id: 'RESERVE', label: '资源冻结', isTerminal: false },
    { id: 'DISPATCH', label: '分派执行', isTerminal: false },
    { id: 'VALIDATE', label: '验证', isTerminal: false },
    { id: 'COMMIT', label: '提交', isTerminal: false },
    { id: 'COMMITTED', label: '已提交', isTerminal: true },
    { id: 'ABORT', label: '中止', isTerminal: false },
    { id: 'COMPENSATE', label: '补偿', isTerminal: false },
    { id: 'ABORTED', label: '已中止', isTerminal: true },
  ];
}

export function getValidTransitions(): Record<TaskStatus, TaskStatus[]> {
  return {
    INIT: ['RESERVE'],
    RESERVE: ['DISPATCH', 'ABORT'],
    DISPATCH: ['VALIDATE', 'ABORT'],
    VALIDATE: ['COMMIT', 'ABORT'],
    COMMIT: ['COMMITTED'],
    COMMITTED: [],
    ABORT: ['COMPENSATE'],
    COMPENSATE: ['ABORTED'],
    ABORTED: [],
  };
}
