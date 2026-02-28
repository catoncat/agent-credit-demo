import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { AgentId } from '../../types/agent';

interface Check {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  severity: 'ok' | 'warn' | 'fail';
}

const EPS = 1e-6;

function styleFor(severity: Check['severity']): string {
  if (severity === 'ok') return 'bg-[var(--sys-status-success-soft)] text-[color:var(--sys-status-success)] border-[var(--sys-status-success)]';
  if (severity === 'warn') return 'bg-[var(--sys-status-executing-soft)] text-[color:var(--sys-status-executing)] border-[var(--sys-status-executing)]';
  return 'bg-[var(--sys-status-fail-soft)] text-[color:var(--sys-status-fail)] border-[var(--sys-status-fail)]';
}

export function InvariantMonitor() {
  const agents = useSimulationStore((s) => s.agents);
  const tasks = useSimulationStore((s) => s.tasks);
  const clientBalance = useSimulationStore((s) => s.clientBalance);

  const checks = useMemo<Check[]>(() => {
    const ids = Object.keys(agents) as AgentId[];

    const quotaCheck = ids.every((id) => {
      const a = agents[id];
      return a.quota >= -EPS && a.reservedQuota >= -EPS && a.reservedQuota <= a.quota + EPS;
    });

    const ySyncCheck = ids.every((id) => {
      const a = agents[id];
      return Math.abs(a.y - Math.max(1, a.quota - a.reservedQuota)) < 1e-3;
    });

    const capacityCheck = ids.every((id) => agents[id].activeTasks <= agents[id].capacity);

    const taskRefCheck = tasks.every((task) => {
      if (!task.assignedTo) return true;
      return Boolean(agents[task.assignedTo]);
    });

    const scoreWithinTheory = ids.every((id) => agents[id].s_hat <= 1 + EPS);
    const scoreWithinRuntime = ids.every((id) => agents[id].s_hat <= 1.5 + EPS && agents[id].s_hat > 0);

    return [
      {
        key: 'quota',
        label: '容量守恒',
        ok: quotaCheck,
        detail: 'reservedQuota <= quota 且非负',
        severity: quotaCheck ? 'ok' : 'fail',
      },
      {
        key: 'y_sync',
        label: '影子池同步',
        ok: ySyncCheck,
        detail: 'y == quota - reservedQuota',
        severity: ySyncCheck ? 'ok' : 'fail',
      },
      {
        key: 'capacity',
        label: '并发上限',
        ok: capacityCheck,
        detail: 'activeTasks <= capacity',
        severity: capacityCheck ? 'ok' : 'fail',
      },
      {
        key: 'client',
        label: '客户端余额',
        ok: clientBalance >= -EPS,
        detail: `clientBalance=${clientBalance.toFixed(2)}`,
        severity: clientBalance >= -EPS ? 'ok' : 'fail',
      },
      {
        key: 'task_ref',
        label: '任务引用完整性',
        ok: taskRefCheck,
        detail: 'assignedTo 必须存在于 agents',
        severity: taskRefCheck ? 'ok' : 'fail',
      },
      {
        key: 'score',
        label: '评分区间',
        ok: scoreWithinRuntime,
        detail: scoreWithinTheory ? 'ŝ 在理论区间(0,1]' : 'ŝ 超过1（运行时允许，理论建议收紧）',
        severity: !scoreWithinRuntime ? 'fail' : scoreWithinTheory ? 'ok' : 'warn',
      },
    ];
  }, [agents, clientBalance, tasks]);

  return (
    <section className="h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">不变量监控</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {checks.map((check) => (
          <div key={check.key} className="border rounded-lg p-2" style={{ borderColor: 'var(--sys-border-default)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[color:var(--sys-text-primary)]">{check.label}</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${styleFor(check.severity)}`}>
                {check.severity.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-[color:var(--sys-text-secondary)]">{check.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
