import { useSimulationStore } from '../../store/simulationStore';
import { COLORS } from '../../constants/theme';
import type { LedgerEntry } from '../../types/ledger';
import { useMemo, useState } from 'react';
import { formatTimelineStepLabel, stepToTimelineTick } from '../../utils/timeline';

const ACTION_COLORS: Record<string, { text: string; soft: string }> = {
  RESERVE: { text: COLORS.agent.idle, soft: COLORS.state.idleSoft },
  COMMIT: { text: COLORS.agent.success, soft: COLORS.state.successSoft },
  ABORT: { text: COLORS.agent.fail, soft: COLORS.state.failSoft },
  BURN: { text: COLORS.agent.overflow, soft: COLORS.state.overflowSoft },
  BANCOR_TAX: { text: COLORS.agent.idle, soft: COLORS.state.idleSoft },
  BANCOR_FEE: { text: COLORS.text.secondary, soft: COLORS.state.neutralSoft },
};

type LedgerRecordRow = {
  entry: LedgerEntry;
  rowKey: string;
  tick: number;
};

type LedgerRecordGroup = {
  tick: number;
  rows: LedgerRecordRow[];
  netDeltaY: number;
  netDeltaR: number;
  hasDeltaR: boolean;
};

function formatSigned(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

interface LedgerTableProps {
  embedded?: boolean;
}

export function LedgerTable({ embedded = false }: LedgerTableProps) {
  const tick = useSimulationStore(s => s.tick);
  const ledger = useSimulationStore(s => s.ledger);
  const [expandedByTick, setExpandedByTick] = useState<Record<number, boolean>>({});

  const records = useMemo<LedgerRecordRow[]>(() => {
    return ledger
      .map((entry, offset) => ({
        entry,
        rowKey: `ledger-${offset}`,
        tick: stepToTimelineTick(entry.step),
      }))
      .reverse();
  }, [ledger]);

  const groupedRecords = useMemo<LedgerRecordGroup[]>(() => {
    const groupsByTick = new Map<number, LedgerRecordGroup>();
    const orderedGroups: LedgerRecordGroup[] = [];

    for (const row of records) {
      let group = groupsByTick.get(row.tick);
      if (!group) {
        group = {
          tick: row.tick,
          rows: [],
          netDeltaY: 0,
          netDeltaR: 0,
          hasDeltaR: false,
        };
        groupsByTick.set(row.tick, group);
        orderedGroups.push(group);
      }

      group.rows.push(row);
      group.netDeltaY += row.entry.deltaY;
      if (typeof row.entry.deltaBalance === 'number') {
        group.netDeltaR += row.entry.deltaBalance;
        group.hasDeltaR = true;
      }
    }

    return orderedGroups;
  }, [records]);

  const isTickExpanded = (groupTick: number) => {
    const defaultExpanded = groupTick === tick || groupTick === tick - 1;
    return expandedByTick[groupTick] ?? defaultExpanded;
  };

  const toggleTick = (groupTick: number) => {
    setExpandedByTick((previous) => {
      const defaultExpanded = groupTick === tick || groupTick === tick - 1;
      const currentlyExpanded = previous[groupTick] ?? defaultExpanded;
      return { ...previous, [groupTick]: !currentlyExpanded };
    });
  };

  const rootClass = embedded
    ? 'h-full flex flex-col'
    : 'bg-[var(--sys-bg-card)] rounded-lg border border-[var(--sys-border-default)] flex flex-col';

  const listClass = embedded
    ? 'min-h-0 flex-1 overflow-y-auto'
    : 'overflow-visible lg:max-h-[340px] lg:overflow-y-auto';

  return (
    <div className={rootClass}>
      <div className="px-3 py-1.5 border-b border-[var(--sys-border-default)] flex items-center justify-between">
        <h3 className="text-[12px] text-[color:var(--sys-text-muted)] font-mono uppercase tracking-wider">记录 ({ledger.length})</h3>
        <span className="text-[10px] font-mono text-[color:var(--sys-text-secondary)]">ALL</span>
      </div>

      <div className={listClass}>
        {groupedRecords.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-[color:var(--sys-text-muted)]">
            --
          </div>
        )}

        {groupedRecords.map((group) => {
          const expanded = isTickExpanded(group.tick);
          return (
            <div key={`ledger-group-${group.tick}`} className="border-b border-[var(--sys-border-muted)]">
              <button
                type="button"
                onClick={() => toggleTick(group.tick)}
                className="w-full px-3 py-1.5 text-left hover:bg-[var(--sys-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] leading-tight">
                  <span className="text-[color:var(--sys-text-secondary)] w-4">{expanded ? '▾' : '▸'}</span>
                  <span className="text-[color:var(--sys-text-primary)]">T{group.tick}</span>
                  <span className="text-[color:var(--sys-text-muted)]">事件 {group.rows.length}</span>
                  <span className="text-[color:var(--sys-text-muted)]">净Δy {formatSigned(group.netDeltaY, 1)}</span>
                  {group.hasDeltaR && (
                    <span className="text-[color:var(--sys-text-muted)]">净ΔR {formatSigned(group.netDeltaR, 1)}</span>
                  )}
                </div>
              </button>

              {expanded &&
                group.rows.map(({ entry, rowKey }) => {
                  const action = ACTION_COLORS[entry.action] || { text: COLORS.text.secondary, soft: COLORS.state.neutralSoft };
                  const deltaClass = entry.deltaY < 0 ? 'text-[color:var(--sys-status-fail)]' : 'text-[color:var(--sys-status-success)]';
                  return (
                    <div
                      key={rowKey}
                      className="px-3 py-1.5 border-t border-[var(--sys-border-muted)] text-[11px] font-mono leading-tight"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[color:var(--sys-text-muted)] w-8 shrink-0">{formatTimelineStepLabel(entry.step)}</span>
                        <span
                          className="px-1 py-[1px] rounded text-[10px] font-semibold shrink-0"
                          style={{ backgroundColor: action.soft, color: action.text }}
                        >
                          {entry.action}
                        </span>
                        <span className="text-[color:var(--sys-text-secondary)] shrink-0">{entry.agentId}</span>
                        <span className="text-[color:var(--sys-text-muted)] truncate">{entry.description}</span>
                        <span className={`ml-auto shrink-0 text-right min-w-[46px] font-semibold ${deltaClass}`}>
                          {entry.deltaY > 0 ? '+' : ''}
                          {entry.deltaY.toFixed(1)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[color:var(--sys-text-secondary)] whitespace-nowrap overflow-x-auto">
                        <span>y {entry.yBefore.toFixed(1)}→{entry.yAfter.toFixed(1)}</span>
                        <span>P {entry.priceBefore.toFixed(0)}→{entry.priceAfter.toFixed(0)}</span>
                        <span>f {entry.fBefore.toFixed(1)}→{entry.fAfter.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
