import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { formatTimelineStepLabel } from '../../utils/timeline';

const INFLOW_STATUSES = new Set(['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE']);

export function MissionStrip() {
  const tick = useSimulationStore((s) => s.tick);
  const isPlaying = useSimulationStore((s) => s.isPlaying);
  const lastNarrative = useSimulationStore((s) => s.lastNarrative);
  const tasks = useSimulationStore((s) => s.tasks);
  const ledger = useSimulationStore((s) => s.ledger);
  const clientBalance = useSimulationStore((s) => s.clientBalance);

  const inflight = useMemo(
    () => tasks.filter((task) => INFLOW_STATUSES.has(task.status)).length,
    [tasks],
  );
  const latest = ledger.length > 0 ? ledger[ledger.length - 1] : null;

  return (
    <section className="px-3 py-2 rounded-xl border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="w-full min-w-0 sm:flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">状态</div>
        <div className="text-[12px] text-[color:var(--sys-text-primary)] truncate">{lastNarrative || '-'}</div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-mono text-[color:var(--sys-text-secondary)] flex-wrap">
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          T{tick}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          {isPlaying ? 'RUN' : 'PAUSE'}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          inflight={inflight}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)]">
          client={clientBalance.toFixed(0)}
        </span>
        {latest && (
          <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] max-w-full sm:max-w-[220px] truncate">
            {formatTimelineStepLabel(latest.step)} {latest.action}@{latest.agentId}
          </span>
        )}
      </div>
    </section>
  );
}
