import { NetworkGraph } from '../network/NetworkGraph';
import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { formatTimelineStepLabel, stepToTimelineTick } from '../../utils/timeline';

const INFLOW_STATUSES = new Set(['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE']);

export function FlowTopologyPanel() {
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
  const eventCount = useMemo(
    () => ledger.filter((entry) => stepToTimelineTick(entry.step) === tick).length,
    [ledger, tick],
  );
  const latest = ledger.length > 0 ? ledger[ledger.length - 1] : null;

  return (
    <section className="h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)] flex items-center justify-between">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">Routing Topology</div>
        <span className="text-[11px] font-mono text-[color:var(--sys-text-secondary)]">Gateway ↔ Agents</span>
      </div>

      <div className="px-3 py-2 border-b border-[var(--sys-border-muted)] bg-[var(--sys-bg-soft)] flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-[12px] text-[color:var(--sys-text-secondary)] truncate">{lastNarrative || '-'}</div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[color:var(--sys-text-secondary)] overflow-x-auto whitespace-nowrap sm:shrink-0">
          <span className="px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)]">T{tick}</span>
          <span className="px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)]">
            {isPlaying ? 'RUN' : 'PAUSE'}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)]">
            inflight={inflight}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)]">
            events={eventCount}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)]">
            client={clientBalance.toFixed(0)}
          </span>
          {latest && (
            <span className="hidden md:inline-flex px-1.5 py-0.5 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-panel)] max-w-[220px] truncate">
              {formatTimelineStepLabel(latest.step)} {latest.action}@{latest.agentId}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <NetworkGraph />
      </div>
    </section>
  );
}
