import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { TaskStatus } from '../../types/task';

const TRACKED: TaskStatus[] = ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE', 'COMMITTED', 'ABORTED'];

export function TaskConcurrencyPanel() {
  const tasks = useSimulationStore((s) => s.tasks);
  const agents = useSimulationStore((s) => s.agents);

  const counts = useMemo(() => {
    const base: Record<TaskStatus, number> = {
      INIT: 0,
      RESERVE: 0,
      DISPATCH: 0,
      VALIDATE: 0,
      COMMIT: 0,
      COMMITTED: 0,
      ABORT: 0,
      COMPENSATE: 0,
      ABORTED: 0,
    };
    for (const task of tasks) {
      base[task.status] += 1;
    }
    return base;
  }, [tasks]);

  const activeTasks = tasks
    .filter((task) => ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE'].includes(task.status))
    .reverse();

  const totalCompleted = Object.values(agents).reduce((sum, agent) => sum + agent.totalCompleted, 0);
  const totalFailed = Object.values(agents).reduce((sum, agent) => sum + agent.totalFailed, 0);
  const recentFinalized = tasks.filter((task) => task.status === 'COMMITTED' || task.status === 'ABORTED');
  const recentCommitted = recentFinalized.filter((task) => task.status === 'COMMITTED').length;
  const recentFailed = recentFinalized.filter((task) => task.status === 'ABORTED').length;

  return (
    <section className="h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">任务并发看板</div>
      </div>

      <div className="px-3 py-2 grid grid-cols-3 gap-2 text-[10px] font-mono">
        {TRACKED.map((status) => (
          <div key={status} className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
            {status}: {counts[status]}
          </div>
        ))}
      </div>

      <div className="px-3 pb-2 grid grid-cols-2 gap-2 text-[10px] font-mono text-[color:var(--sys-text-secondary)]">
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-status-success-soft)]">
          total committed: {totalCompleted}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-status-fail-soft)]">
          total failed: {totalFailed}
        </span>
      </div>

      <div className="px-3 pb-2 grid grid-cols-2 gap-2 text-[10px] font-mono text-[color:var(--sys-text-secondary)]">
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          all committed: {recentCommitted}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          all failed: {recentFailed}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--sys-border-muted)]">
        {activeTasks.length === 0 ? (
          <div className="px-3 py-4 text-[10px] text-[color:var(--sys-text-muted)]">当前无在途任务</div>
        ) : (
          activeTasks.map((task) => (
            <div key={task.id} className="px-3 py-2 border-b border-[var(--sys-border-muted)] text-[10px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-[color:var(--sys-text-primary)]">{task.id}</span>
                <span className="px-1 py-0.5 rounded bg-[var(--sys-bg-soft)] border border-[var(--sys-border-default)] text-[color:var(--sys-text-secondary)]">
                  {task.status}
                </span>
                <span className="ml-auto text-[color:var(--sys-text-secondary)]">{task.assignedTo ?? '-'}</span>
              </div>
              <div className="mt-1 text-[9px] text-[color:var(--sys-text-muted)]">
                Δy={task.delta} · payment={task.payment.toFixed(2)} · P_eff={Number.isFinite(task.effectivePrice) ? task.effectivePrice.toFixed(2) : '∞'}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
