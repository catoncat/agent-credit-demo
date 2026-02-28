import { useEffect, useMemo, useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import type { LedgerEntry } from '../../types/ledger';
import { formatTimelineStepDebugLabel, formatTimelineStepLabel, stepToTimelineTick } from '../../utils/timeline';

type TimelineEventRow = {
  event: LedgerEntry;
  rowKey: string;
  tick: number;
};

type TimelineGroup = {
  tick: number;
  rows: TimelineEventRow[];
  netDeltaY: number;
  netDeltaR: number;
  hasDeltaR: boolean;
};

function formatSigned(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

interface EventTimelinePanelProps {
  forceFullHeight?: boolean;
}

export function EventTimelinePanel({ forceFullHeight = false }: EventTimelinePanelProps) {
  const panelHeightClass = forceFullHeight ? 'h-full' : 'lg:h-full';
  const tick = useSimulationStore((s) => s.tick);
  const phase = useSimulationStore((s) => s.phase);
  const rngState = useSimulationStore((s) => s.rngState);
  const lastNarrative = useSimulationStore((s) => s.lastNarrative);
  const ledger = useSimulationStore((s) => s.ledger);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [expandedByTick, setExpandedByTick] = useState<Record<number, boolean>>({});

  const events = useMemo(() => {
    return ledger
      .map((event, offset) => ({
        event,
        rowKey: `timeline-${offset}`,
        tick: stepToTimelineTick(event.step),
      }))
      .reverse();
  }, [ledger]);

  const groupedEvents = useMemo<TimelineGroup[]>(() => {
    const groupsByTick = new Map<number, TimelineGroup>();
    const orderedGroups: TimelineGroup[] = [];

    for (const row of events) {
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
      group.netDeltaY += row.event.deltaY;
      if (typeof row.event.deltaBalance === 'number') {
        group.netDeltaR += row.event.deltaBalance;
        group.hasDeltaR = true;
      }
    }

    return orderedGroups;
  }, [events]);

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

  const copyPayload = useMemo(() => {
    const lines = [
      '# 事件时间线快照',
      `tick: ${tick}`,
      `phase: ${phase}`,
      `rng: ${rngState}`,
      `events: ${events.length} (latest first)`,
      `narrative: ${lastNarrative}`,
      '',
      ...events.map(({ event }, index) => {
        const stepLabel = formatTimelineStepDebugLabel(event.step);
        const parts = [
          stepLabel,
          event.action,
          event.agentId,
          `Δy=${event.deltaY.toFixed(2)}`,
          `y:${event.yBefore.toFixed(2)}->${event.yAfter.toFixed(2)}`,
          `p:${event.priceBefore.toFixed(2)}->${event.priceAfter.toFixed(2)}`,
        ];

        if (typeof event.deltaBalance === 'number') parts.push(`Δbal=${event.deltaBalance.toFixed(2)}`);
        if (typeof event.deltaQuota === 'number') parts.push(`Δquota=${event.deltaQuota.toFixed(2)}`);

        return `${index + 1}. ${parts.join(' | ')} | ${event.description}`;
      }),
    ];

    return lines.join('\n');
  }, [events, lastNarrative, phase, rngState, tick]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const handleCopyTimeline = async () => {
    try {
      await navigator.clipboard.writeText(copyPayload);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <section className={`${panelHeightClass} bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-visible lg:overflow-hidden flex flex-col`}>
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)] flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">全量事件日志</div>
        <button
          onClick={handleCopyTimeline}
          title="复制当前时间线"
          aria-label="复制当前时间线"
          className="h-8 px-2.5 rounded-md border border-[var(--sys-border-default)] text-[11px] text-[color:var(--sys-text-secondary)] hover:text-[color:var(--sys-text-primary)] hover:bg-[var(--sys-bg-hover)] transition-colors inline-flex items-center gap-1.5"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.4" />
            <path d="M10.75 5V3.75c0-.83-.67-1.5-1.5-1.5h-5.5c-.83 0-1.5.67-1.5 1.5v5.5c0 .83.67 1.5 1.5 1.5H5" />
          </svg>
          {copyStatus === 'copied' ? '已复制' : copyStatus === 'error' ? '失败' : '复制'}
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[var(--sys-border-muted)] bg-[var(--sys-bg-soft)]">
        <div className="text-[11px] text-[color:var(--sys-text-secondary)] leading-relaxed">{lastNarrative}</div>
      </div>

      <div className="overflow-visible lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {groupedEvents.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-[color:var(--sys-text-muted)]">暂无事件</div>
        ) : (
          groupedEvents.map((group) => {
            const expanded = isTickExpanded(group.tick);
            return (
              <div key={`timeline-group-${group.tick}`} className="border-b border-[var(--sys-border-muted)]">
                <button
                  type="button"
                  onClick={() => toggleTick(group.tick)}
                  className="w-full px-3 py-2 text-left hover:bg-[var(--sys-bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2 font-mono text-[11px]">
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
                  group.rows.map(({ event, rowKey }) => (
                    <div key={rowKey} className="px-3 py-2 border-t border-[var(--sys-border-muted)] text-[11px]">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-[color:var(--sys-text-muted)] w-8">{formatTimelineStepLabel(event.step)}</span>
                        <span className="text-[color:var(--sys-text-primary)]">{event.action}</span>
                        <span className="text-[color:var(--sys-text-secondary)]">{event.agentId}</span>
                        <span className="ml-auto text-[color:var(--sys-text-muted)]">Δy {event.deltaY.toFixed(1)}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-[color:var(--sys-text-secondary)] truncate">{event.description}</div>
                    </div>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
