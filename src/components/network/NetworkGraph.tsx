import { useSimulationStore } from '../../store/simulationStore';
import { AGENT_LABEL_PANEL_HEIGHT, AGENT_LABEL_PANEL_HEIGHT_COMPACT, AgentNode } from './AgentNode';
import { GatewayNode } from './GatewayNode';
import { ConnectionLine } from './ConnectionLine';
import { TaskParticle, type ParticleStatus } from './TaskParticle';
import type { AgentId } from '../../types/agent';
import type { LedgerEntry } from '../../types/ledger';
import { useRef, useState, useEffect, useMemo } from 'react';
import { stepToTimelineTick } from '../../utils/timeline';

const ACTIVE_TASK_STATUSES = new Set(['RESERVE', 'DISPATCH', 'VALIDATE']);
const EVENT_WINDOW_TICKS = 1;
const LABEL_VERTICAL_PADDING = 8;
const LABEL_MIN_GAP = 6;

type LabelSide = 'left' | 'right';

function toParticleStatus(action: LedgerEntry['action']): ParticleStatus {
  switch (action) {
    case 'ROUTE':
      return 'ROUTE';
    case 'RESERVE':
      return 'RESERVE';
    case 'COMMIT':
      return 'COMMIT';
    case 'ABORT':
      return 'ABORT';
    case 'BURN':
      return 'BURN';
    case 'BANCOR_TAX':
      return 'BANCOR_TAX';
    case 'BANCOR_FEE':
      return 'BANCOR_FEE';
    case 'LIQUIDATE':
      return 'LIQUIDATE';
    default:
      return 'DISPATCH';
  }
}

function isForwardAction(action: LedgerEntry['action']): boolean {
  return action === 'ROUTE' || action === 'RESERVE';
}

function resolveLabelSide(nodeX: number, gatewayX: number): LabelSide {
  return nodeX <= gatewayX ? 'right' : 'left';
}

function solveSidePanelY(
  entries: Array<{ id: AgentId; idealCenterY: number }>,
  svgHeight: number,
  panelHeight: number,
): Record<AgentId, number> {
  const result = {} as Record<AgentId, number>;
  if (!entries.length) return result;

  const sorted = [...entries].sort((a, b) => a.idealCenterY - b.idealCenterY);
  const minTop = LABEL_VERTICAL_PADDING;
  const maxTop = Math.max(minTop, svgHeight - LABEL_VERTICAL_PADDING - panelHeight);
  const count = sorted.length;
  const availableHeight = Math.max(panelHeight, maxTop - minTop + panelHeight);
  const gap = count > 1
    ? Math.min(LABEL_MIN_GAP, Math.max(0, (availableHeight - count * panelHeight) / (count - 1)))
    : 0;
  const spacing = panelHeight + gap;
  const tops = new Array<number>(count);

  for (let i = 0; i < count; i += 1) {
    const idealTop = Math.max(minTop, Math.min(sorted[i].idealCenterY - panelHeight / 2, maxTop));
    tops[i] = i === 0 ? idealTop : Math.max(idealTop, tops[i - 1] + spacing);
  }

  if (tops[count - 1] > maxTop) {
    tops[count - 1] = maxTop;
    for (let i = count - 2; i >= 0; i -= 1) {
      tops[i] = Math.min(tops[i], tops[i + 1] - spacing);
    }
  }

  if (tops[0] < minTop) {
    tops[0] = minTop;
    for (let i = 1; i < count; i += 1) {
      tops[i] = Math.max(tops[i], tops[i - 1] + spacing);
    }
  }

  sorted.forEach((entry, index) => {
    result[entry.id] = Math.round(tops[index]);
  });
  return result;
}

export function NetworkGraph() {
  const { agents, tasks, ledger, priceComparison, tick } = useSimulationStore();
  const [dimensions, setDimensions] = useState({ width: 700, height: 450 });
  const containerRef = useRef<HTMLDivElement>(null);
  const agentIds = useMemo(() => Object.keys(agents) as AgentId[], [agents]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const layout = useMemo(() => {
    const width = Math.max(Math.round(dimensions.width), 320);
    const height = Math.max(Math.round(dimensions.height), 260);
    const compact = width < 500 || height < 340;
    const ultraCompact = width < 420 || height < 300;
    const viewScale = ultraCompact ? 1.22 : compact ? 1.1 : 1;
    const svgWidth = Math.round(width * viewScale);
    const svgHeight = Math.round(height * viewScale);
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const nodeCount = Math.max(agentIds.length, 1);
    const ringRadius = Math.max(compact ? 84 : 96, Math.min(svgWidth, svgHeight) / 2 - (compact ? 94 : 88));
    const agentPositions = {} as Record<AgentId, { x: number; y: number; angle: number }>;

    agentIds.forEach((id, index) => {
      const angle = -Math.PI / 2 + (index / nodeCount) * Math.PI * 2;
      agentPositions[id] = {
        x: centerX + ringRadius * Math.cos(angle),
        y: centerY + ringRadius * Math.sin(angle),
        angle: (angle * 180) / Math.PI,
      };
    });

    return {
      width: svgWidth,
      height: svgHeight,
      gateway: { x: centerX, y: centerY },
      nodeCount,
      compact,
      agentPositions,
    };
  }, [agentIds, dimensions.height, dimensions.width]);

  const activeAgentTasks = tasks.filter(task =>
    Boolean(task.assignedTo) && ACTIVE_TASK_STATUSES.has(task.status)
  );

  const recentEvents = useMemo(
    () => ledger
      .map((entry, index) => ({ entry, index, eventTick: stepToTimelineTick(entry.step) }))
      .filter(({ eventTick }) => tick >= eventTick && tick - eventTick <= EVENT_WINDOW_TICKS),
    [ledger, tick],
  );
  const eventActiveAgents = useMemo(
    () => new Set(recentEvents.map(({ entry }) => entry.agentId)),
    [recentEvents],
  );
  const eventPulseParticles = useMemo(() => {
    const perStepOrder = new Map<number, number>();
    return recentEvents
      .map(({ entry, index, eventTick }) => {
        const position = layout.agentPositions[entry.agentId];
        if (!position) return null;
        const order = perStepOrder.get(entry.step) ?? 0;
        perStepOrder.set(entry.step, order + 1);
        const age = Math.max(0, tick - eventTick);
        const forward = isForwardAction(entry.action);

        return {
          key: `evt-${index}`,
          from: forward ? layout.gateway : position,
          to: forward ? position : layout.gateway,
          status: toParticleStatus(entry.action),
          delay: order * 0.05 + age * 0.08,
          duration: 0.75,
          radius: entry.action === 'BURN'
            ? (layout.compact ? 3.2 : 3.8)
            : (layout.compact ? 2.8 : 3.2),
        };
      })
      .filter((item): item is {
        key: string;
        from: { x: number; y: number };
        to: { x: number; y: number };
        status: ParticleStatus;
        delay: number;
        duration: number;
        radius: number;
      } => item !== null);
  }, [layout.agentPositions, layout.compact, layout.gateway, recentEvents, tick]);
  const nodeEventSignals = useMemo(() => {
    const summary = {} as Record<AgentId, {
      eventCount: number;
      lastAction: LedgerEntry['action'] | null;
      deltaBalance: number;
    }>;
    for (const id of agentIds) {
      summary[id] = { eventCount: 0, lastAction: null, deltaBalance: 0 };
    }
    for (const entry of ledger) {
      if (stepToTimelineTick(entry.step) !== tick) continue;
      const current = summary[entry.agentId] ?? { eventCount: 0, lastAction: null, deltaBalance: 0 };
      current.eventCount += 1;
      current.lastAction = entry.action;
      current.deltaBalance += typeof entry.deltaBalance === 'number' ? entry.deltaBalance : 0;
      summary[entry.agentId] = current;
    }
    return summary;
  }, [agentIds, ledger, tick]);
  const labelLayout = useMemo(() => {
    const sideByAgent = {} as Record<AgentId, LabelSide>;
    const sideEntries: Record<LabelSide, Array<{ id: AgentId; idealCenterY: number }>> = {
      left: [],
      right: [],
    };

    for (const id of agentIds) {
      const position = layout.agentPositions[id];
      if (!position) continue;
      const side = resolveLabelSide(position.x, layout.gateway.x);
      sideByAgent[id] = side;
      sideEntries[side].push({ id, idealCenterY: position.y });
    }

    const panelHeight = layout.compact ? AGENT_LABEL_PANEL_HEIGHT_COMPACT : AGENT_LABEL_PANEL_HEIGHT;
    const panelYByAgent = {
      ...solveSidePanelY(sideEntries.left, layout.height, panelHeight),
      ...solveSidePanelY(sideEntries.right, layout.height, panelHeight),
    } as Record<AgentId, number>;

    return { sideByAgent, panelYByAgent };
  }, [agentIds, layout.agentPositions, layout.compact, layout.gateway.x, layout.height]);

  const comparedIds = priceComparison ? (Object.keys(priceComparison) as AgentId[]) : [];
  const lowestComparedPrice = priceComparison
    ? comparedIds
        .map(id => priceComparison[id])
        .filter((value): value is number => Number.isFinite(value))
        .reduce((min, value) => (value < min ? value : min), Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;

  const latestRoute = useMemo(
    () => [...ledger].reverse().find((entry) => entry.action === 'ROUTE') ?? null,
    [ledger],
  );
  const latestRouteTick = latestRoute ? stepToTimelineTick(latestRoute.step) : null;
  const isFocusFresh =
    latestRouteTick !== null &&
    tick >= latestRouteTick &&
    tick - latestRouteTick <= 2;
  const focusAgentId = isFocusFresh ? (latestRoute?.agentId ?? null) : null;
  const focusPosition = focusAgentId ? layout.agentPositions[focusAgentId] : null;
  const latestFinalize = useMemo(() => {
    if (!latestRoute) return null;
    const sameStep = [...ledger].reverse().filter((entry) => entry.step === latestRoute.step);
    return sameStep.find((entry) => entry.action === 'COMMIT' || entry.action === 'ABORT') ?? null;
  }, [latestRoute, ledger]);
  const focusAction = (latestFinalize?.action ?? latestRoute?.action ?? null) as 'ROUTE' | 'COMMIT' | 'ABORT' | null;

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[var(--sys-bg-panel)]">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full h-full"
      >
        {agentIds.map(id => {
          const position = layout.agentPositions[id];
          return (
            <ConnectionLine
              key={id}
              from={layout.gateway}
              to={position}
              agentId={id}
              isActive={agents[id].status === 'executing' || eventActiveAgents.has(id)}
              isFailed={agents[id].status === 'failed' || agents[id].status === 'isolated'}
              isRouteFocus={focusAgentId === id}
            />
          );
        })}

        {eventPulseParticles.map((particle) => (
          <TaskParticle
            key={particle.key}
            from={particle.from}
            to={particle.to}
            status={particle.status}
            delay={particle.delay}
            duration={particle.duration}
            radius={particle.radius}
          />
        ))}

        {activeAgentTasks.map(task => {
          if (!task.assignedTo) return null;
          const to = layout.agentPositions[task.assignedTo];
          if (!to) return null;
          return (
            <TaskParticle
              key={task.id}
              from={layout.gateway}
              to={to}
              status={task.status}
            />
          );
        })}

        {focusAgentId && focusPosition && (
          <>
            {[0, 0.24, 0.48].map((delay, index) => (
              <TaskParticle
                key={`focus-forward-${latestRoute?.step ?? 0}-${focusAgentId}-${index}`}
                from={layout.gateway}
                to={focusPosition}
                status={focusAction === 'ABORT' ? 'ABORT' : 'DISPATCH'}
                loop
                delay={delay}
                duration={1.4}
                radius={layout.compact ? 3.1 : 3.8}
              />
            ))}
            {focusAction === 'COMMIT' &&
              [0.1, 0.34].map((delay, index) => (
                <TaskParticle
                  key={`focus-return-${latestRoute?.step ?? 0}-${focusAgentId}-${index}`}
                  from={focusPosition}
                  to={layout.gateway}
                  status="COMMIT"
                  loop
                  delay={delay}
                  duration={1.5}
                  radius={layout.compact ? 3 : 3.4}
                />
              ))}
          </>
        )}

        <GatewayNode
          x={layout.gateway.x}
          y={layout.gateway.y}
          isActive={activeAgentTasks.length > 0 || isFocusFresh || eventPulseParticles.length > 0}
          compact={layout.compact}
        />

        {agentIds.map(id => {
          const position = layout.agentPositions[id];
          const signal = nodeEventSignals[id];
          const labelSide = labelLayout.sideByAgent[id] ?? resolveLabelSide(position.x, layout.gateway.x);
          return (
            <AgentNode
              key={id}
              agent={agents[id]}
              x={position.x}
              y={position.y}
              isRouteFocus={focusAgentId === id}
              compact={layout.compact}
              labelSide={labelSide}
              panelY={labelLayout.panelYByAgent[id]}
              bounds={{ minX: 8, maxX: layout.width - 8 }}
              eventCount={signal?.eventCount ?? 0}
              lastAction={signal?.lastAction ?? null}
              deltaBalance={signal?.deltaBalance ?? 0}
            />
          );
        })}
      </svg>

      {priceComparison && (
        <div className="absolute top-3 right-3 space-y-1.5 z-10 max-w-[180px] hidden sm:block">
          {comparedIds.map(id => {
            const price = priceComparison[id];
            const isLowest = Number.isFinite(price) && price === lowestComparedPrice;
            return (
              <div
                key={id}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-mono border ${
                  isLowest
                    ? 'bg-[var(--sys-status-success-soft)] text-[color:var(--sys-status-success)]'
                    : 'bg-[var(--sys-status-fail-soft)] text-[color:var(--sys-status-fail)]'
                }`}
                style={{ borderColor: isLowest ? 'var(--sys-status-success)' : 'var(--sys-status-fail)' }}
              >
                P_eff({id}) = {price === Infinity ? '∞' : price.toFixed(0)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
