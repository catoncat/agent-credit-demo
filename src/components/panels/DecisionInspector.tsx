import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { AgentId } from '../../types/agent';
import { getDeltaX, getEffectivePrice } from '../../engine/amm';
import { stepToTimelineTick } from '../../utils/timeline';

interface Row {
  id: AgentId;
  available: boolean;
  unavailableReason: 'capacity' | 'quota' | 'isolated' | null;
  deltaX: number;
  f: number;
  sHat: number;
  pEff: number;
  freeQuota: number;
  outcomes: number;
  warmupMultiplier: number;
  loadMultiplier: number;
}

function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '∞';
  return v.toFixed(digits);
}

function fmtAvailable(v: number, available: boolean, digits = 2): string {
  if (!available) return '--';
  return fmt(v, digits);
}

const ROUTE_FOCUS_WINDOW_TICKS = 2;

export function DecisionInspector() {
  const agents = useSimulationStore((s) => s.agents);
  const tasks = useSimulationStore((s) => s.tasks);
  const priceComparison = useSimulationStore((s) => s.priceComparison);
  const ledger = useSimulationStore((s) => s.ledger);
  const tick = useSimulationStore((s) => s.tick);

  const probeDelta = tasks.length > 0 ? tasks[tasks.length - 1].delta : 100;

  const rows = useMemo<Row[]>(() => {
    return Object.keys(agents).map((id) => {
      const agent = agents[id];
      const freeQuota = Math.max(0, agent.quota - agent.reservedQuota);
      const unavailableReason = agent.status === 'isolated'
        ? 'isolated'
        : agent.activeTasks >= agent.capacity
          ? 'capacity'
          : freeQuota <= probeDelta
            ? 'quota'
            : null;
      const available = unavailableReason === null;
      return {
        id,
        available,
        unavailableReason,
        freeQuota,
        deltaX: available ? getDeltaX(agent, probeDelta) : Infinity,
        f: agent.f,
        sHat: agent.s_hat,
        pEff: available ? getEffectivePrice(agent, probeDelta) : Infinity,
        outcomes: agent.totalCompleted + agent.totalFailed,
        warmupMultiplier: 1 + (1 - Math.min(1, (agent.totalCompleted + agent.totalFailed) / 12)) * 1.4,
        loadMultiplier: 1 + (Math.max(0, agent.capacity > 0 ? agent.activeTasks / agent.capacity : 1) * 0.35),
      };
    });
  }, [agents, probeDelta]);

  const bestPriceId = useMemo(() => {
    if (priceComparison) {
      const ids = Object.keys(priceComparison);
      let best: string | null = null;
      let bestVal = Infinity;
      for (const id of ids) {
        const val = priceComparison[id];
        if (Number.isFinite(val) && val < bestVal) {
          bestVal = val;
          best = id;
        }
      }
      if (best) return best;
    }

    const sorted = rows
      .filter((row) => Number.isFinite(row.pEff))
      .sort((a, b) => a.pEff - b.pEff);
    return sorted.length > 0 ? sorted[0].id : null;
  }, [priceComparison, rows]);

  const lastRoute = useMemo(
    () => [...ledger].reverse().find((entry) => entry.action === 'ROUTE') ?? null,
    [ledger],
  );
  const routeWinnerId = useMemo(() => {
    if (!lastRoute) return null;
    const routeTick = stepToTimelineTick(lastRoute.step);
    if (tick < routeTick || tick - routeTick > ROUTE_FOCUS_WINDOW_TICKS) return null;
    return lastRoute.agentId;
  }, [lastRoute, tick]);
  const footerText = useMemo(() => {
    if (!lastRoute) return 'No ROUTE event yet';
    if (routeWinnerId && bestPriceId && routeWinnerId !== bestPriceId) {
      return `${lastRoute.description} | routed=${routeWinnerId}, best=${bestPriceId}`;
    }
    return lastRoute.description;
  }, [bestPriceId, lastRoute, routeWinnerId]);

  return (
    <section className="lg:h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-visible lg:overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)] flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">Routing Decision Panel</div>
        <span className="text-[11px] font-mono text-[color:var(--sys-text-secondary)]">Δy={probeDelta}</span>
      </div>

      <div className="overflow-visible lg:min-h-0 lg:flex-1 lg:overflow-auto">
        <table className="w-full min-w-[500px] table-fixed text-[11px] font-mono tabular-nums">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[72px]" />
            <col className="w-[92px]" />
            <col className="w-[64px]" />
            <col className="w-[64px]" />
            <col className="w-[96px]" />
          </colgroup>
          <thead className="lg:sticky lg:top-0 z-10 bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-muted)]">
            <tr>
              <th className="text-left px-3 py-1.5">Node</th>
              <th className="text-right px-2 py-1.5">free</th>
              <th className="text-right px-2 py-1.5">Δx</th>
              <th className="text-right px-2 py-1.5">f</th>
              <th className="text-right px-2 py-1.5">ŝ</th>
              <th className="text-right px-3 py-1.5">P_eff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isRouted = routeWinnerId === row.id;
              const isBest = bestPriceId === row.id;
              const rowClass = isRouted
                ? 'bg-[var(--sys-status-success-soft)]'
                : isBest
                  ? 'bg-[var(--sys-status-idle-soft)]'
                  : 'border-t border-[var(--sys-border-muted)]';
              return (
                <tr
                  key={row.id}
                  className={rowClass}
                >
                  <td className="px-3 py-1.5 text-[color:var(--sys-text-primary)]">
                    <span className="inline-flex flex-col">
                      <span className="inline-flex items-center gap-1">
                        <span>{row.id}</span>
                        {!row.available ? <span className="text-[10px] text-[color:var(--sys-text-muted)]">({row.unavailableReason})</span> : null}
                        <span className="inline-flex items-center gap-1 min-w-[66px]">
                          {isRouted ? <span className="text-[10px] text-[color:var(--sys-status-success)]">ROUTED</span> : null}
                          {isBest ? <span className="text-[10px] text-[color:var(--sys-status-idle)]">BEST</span> : null}
                        </span>
                      </span>
                      <span className="text-[9px] text-[color:var(--sys-text-muted)]">
                        out={row.outcomes} · cold×{row.warmupMultiplier.toFixed(2)} · load×{row.loadMultiplier.toFixed(2)}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-[color:var(--sys-text-secondary)]">{fmt(row.freeQuota, 0)}</td>
                  <td className="px-2 py-1.5 text-right text-[color:var(--sys-text-secondary)]">{fmtAvailable(row.deltaX, row.available)}</td>
                  <td className="px-2 py-1.5 text-right text-[color:var(--sys-text-secondary)]">{fmt(row.f, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-[color:var(--sys-text-secondary)]">{fmt(row.sHat, 2)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-[color:var(--sys-text-primary)]">{fmtAvailable(row.pEff, row.available)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 border-t border-[var(--sys-border-default)] text-[11px] text-[color:var(--sys-text-muted)] truncate">
        {footerText}
      </div>
    </section>
  );
}
