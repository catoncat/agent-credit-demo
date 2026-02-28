import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { LedgerTable } from '../metrics/LedgerTable';
import type { AgentId } from '../../types/agent';

function num(v: number, digits = 2): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '∞';
}

interface MetricSnapshot {
  balance: number;
  trade: number;
  free: number;
  reserved: number;
  y: number;
}

interface AnimatedValueProps {
  value: number;
  prev?: number;
  digits?: number;
  valueWidthCh?: number;
  deltaWidthCh?: number;
  showDelta?: boolean;
}

function AnimatedValue({
  value,
  prev,
  digits = 2,
  valueWidthCh = 8,
  deltaWidthCh = 6,
  showDelta = true,
}: AnimatedValueProps) {
  const delta = typeof prev === 'number' ? value - prev : 0;
  const changed = typeof prev === 'number' && Math.abs(delta) > 0.0001;
  const isUp = changed && delta > 0;
  const tone = isUp
    ? 'text-[color:var(--sys-status-success)]'
    : changed
      ? 'text-[color:var(--sys-status-fail)]'
      : 'text-[color:var(--sys-text-secondary)]';
  const valueKey = `${value.toFixed(Math.min(6, digits + 2))}-${digits}`;
  const formattedValue = num(value, digits);
  const deltaLabel = `${delta > 0 ? '+' : ''}${num(delta, digits)}`;

  return (
    <span
      className="inline-flex items-center justify-end whitespace-nowrap tabular-nums"
      style={{ width: `${showDelta ? valueWidthCh + deltaWidthCh : valueWidthCh}ch` }}
    >
      {showDelta && (
        <span className="relative inline-block h-[1.2em] align-middle" style={{ width: `${deltaWidthCh}ch` }}>
          <AnimatePresence initial={false}>
            {changed && (
              <motion.span
                key={`d-${valueKey}`}
                initial={{ opacity: 0, y: isUp ? '20%' : '-20%' }}
                animate={{ opacity: [0, 1, 0], y: '0%' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.54 }}
                className={`absolute inset-0 text-right text-[9px] leading-[1.2em] ${isUp ? 'text-[color:var(--sys-status-success)]' : 'text-[color:var(--sys-status-fail)]'}`}
              >
                {deltaLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      )}

      <span className="relative inline-block h-[1.2em] overflow-hidden align-middle" style={{ width: `${valueWidthCh}ch` }}>
        <AnimatePresence initial={false}>
          <motion.span
            key={`v-${valueKey}`}
            initial={changed ? { opacity: 0, y: isUp ? '100%' : '-100%' } : false}
            animate={{ opacity: 1, y: '0%' }}
            exit={changed ? { opacity: 0, y: isUp ? '-100%' : '100%' } : { opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={`absolute inset-0 text-right leading-[1.2em] ${tone}`}
          >
            {formattedValue}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

export function SettlementPanel() {
  const clientBalance = useSimulationStore((s) => s.clientBalance);
  const agents = useSimulationStore((s) => s.agents);
  const ids = useMemo(() => Object.keys(agents) as AgentId[], [agents]);

  const metrics = useMemo(() => {
    const mapped: Record<string, MetricSnapshot> = {};
    for (const id of ids) {
      const a = agents[id];
      mapped[id] = {
        balance: a.balance,
        trade: a.tradeBalance,
        free: Math.max(0, a.quota - a.reservedQuota),
        reserved: a.reservedQuota,
        y: a.y,
      };
    }
    return mapped;
  }, [agents, ids]);

  const prevMetricsRef = useRef<Record<string, MetricSnapshot>>({});
  const prevClientBalanceRef = useRef(clientBalance);
  const prevMetrics = prevMetricsRef.current;
  const prevClientBalance = prevClientBalanceRef.current;

  useEffect(() => {
    prevMetricsRef.current = metrics;
    prevClientBalanceRef.current = clientBalance;
  }, [metrics, clientBalance]);

  return (
    <section className="h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)] flex items-center justify-between">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">Settlement Ledger</div>
        <div className="text-[11px] font-mono">
          <span className="text-[color:var(--sys-text-muted)]">client R </span>
          <AnimatedValue value={clientBalance} prev={prevClientBalance} digits={2} valueWidthCh={11} showDelta={false} />
        </div>
      </div>

      <div className="px-2.5 py-1 overflow-x-auto border-b border-[var(--sys-border-muted)]">
        <table className="w-full min-w-[340px] sm:min-w-[420px] md:min-w-[560px] table-fixed text-[11px] font-mono leading-tight tabular-nums">
          <colgroup>
            <col className="w-[58px]" />
            <col className="w-[128px]" />
            <col className="w-[108px]" />
            <col className="w-[98px]" />
            <col className="hidden md:table-column w-[128px]" />
            <col className="hidden md:table-column w-[108px]" />
          </colgroup>
          <thead className="text-[color:var(--sys-text-muted)]">
            <tr>
              <th className="text-left py-0.5 px-1">ag</th>
              <th className="text-right py-0.5 px-1">bal</th>
              <th className="text-right py-0.5 px-1">free</th>
              <th className="text-right py-0.5 px-1">y</th>
              <th className="text-right py-0.5 px-1 hidden md:table-cell">trade</th>
              <th className="text-right py-0.5 px-1 hidden md:table-cell">res</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const m = metrics[id];
              const prev = prevMetrics[id];
              if (!m) return null;
              return (
                <tr key={id} className="border-t border-[var(--sys-border-muted)] text-[color:var(--sys-text-secondary)]">
                  <td className="py-0.5 px-1 text-[color:var(--sys-text-primary)]">{id}</td>
                  <td className="py-0.5 px-1 text-right"><AnimatedValue value={m.balance} prev={prev?.balance} digits={2} valueWidthCh={8} deltaWidthCh={6} /></td>
                  <td className="py-0.5 px-1 text-right"><AnimatedValue value={m.free} prev={prev?.free} digits={1} valueWidthCh={6} deltaWidthCh={5} /></td>
                  <td className="py-0.5 px-1 text-right"><AnimatedValue value={m.y} prev={prev?.y} digits={1} valueWidthCh={6} deltaWidthCh={5} /></td>
                  <td className="py-0.5 px-1 text-right hidden md:table-cell"><AnimatedValue value={m.trade} prev={prev?.trade} digits={2} valueWidthCh={8} deltaWidthCh={6} /></td>
                  <td className="py-0.5 px-1 text-right hidden md:table-cell"><AnimatedValue value={m.reserved} prev={prev?.reserved} digits={1} valueWidthCh={6} deltaWidthCh={5} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-h-0 flex-1">
        <LedgerTable embedded />
      </div>
    </section>
  );
}
