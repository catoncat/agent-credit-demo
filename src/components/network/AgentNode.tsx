import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { AgentState } from '../../types/agent';
import { useSimulationStore } from '../../store/simulationStore';
import { COLORS } from '../../constants/theme';
import type { LedgerEntry } from '../../types/ledger';

const STATUS_COLORS: Record<string, string> = {
  idle: COLORS.agent.idle,
  executing: COLORS.agent.executing,
  failed: COLORS.agent.fail,
  overloaded: COLORS.agent.overflow,
  isolated: COLORS.agent.fail,
};

interface Props {
  agent: AgentState;
  x: number;
  y: number;
  isRouteFocus?: boolean;
  compact?: boolean;
  labelSide?: 'left' | 'right';
  panelY?: number;
  bounds?: { minX: number; maxX: number };
  eventCount?: number;
  lastAction?: LedgerEntry['action'] | null;
  deltaBalance?: number;
}

export const AGENT_LABEL_PANEL_HEIGHT = 36;
export const AGENT_LABEL_PANEL_HEIGHT_COMPACT = 30;
const AGENT_LABEL_PANEL_HORIZONTAL_GAP = 10;
const AGENT_LABEL_PANEL_HORIZONTAL_GAP_COMPACT = 7;

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function actionColor(action: LedgerEntry['action'] | null | undefined): string {
  switch (action) {
    case 'COMMIT':
      return COLORS.agent.success;
    case 'ABORT':
    case 'LIQUIDATE':
      return COLORS.agent.fail;
    case 'BURN':
      return COLORS.agent.overflow;
    case 'BANCOR_TAX':
    case 'BANCOR_FEE':
      return COLORS.text.secondary;
    default:
      return COLORS.agent.idle;
  }
}

export function AgentNode({
  agent,
  x,
  y,
  isRouteFocus = false,
  compact = false,
  labelSide = 'right',
  panelY,
  bounds,
  eventCount = 0,
  lastAction = null,
  deltaBalance = 0,
}: Props) {
  const setHighlightedAgent = useSimulationStore(s => s.setHighlightedAgent);
  const highlightedAgent = useSimulationStore(s => s.highlightedAgent);
  const color = STATUS_COLORS[agent.status] || COLORS.agent.idle;
  const isHighlighted = highlightedAgent === agent.id || isRouteFocus;
  const radius = compact ? 30 : 38;
  const freeQuota = Math.max(0, agent.quota - agent.reservedQuota);
  const prevBalanceRef = useRef(agent.balance);
  const prevBalance = prevBalanceRef.current;
  const balanceDelta = agent.balance - prevBalance;

  useEffect(() => {
    prevBalanceRef.current = agent.balance;
  }, [agent.balance]);

  const balanceTone = balanceDelta > 0.0001
    ? COLORS.agent.success
    : balanceDelta < -0.0001
      ? COLORS.agent.fail
      : COLORS.text.secondary;
  const primaryText = Math.abs(deltaBalance) > 0.0001
    ? `ΔR ${deltaBalance > 0 ? '+' : ''}${compact(deltaBalance)}`
    : `R ${compact(agent.balance)}`;
  const primaryTone = Math.abs(deltaBalance) > 0.0001
    ? (deltaBalance > 0 ? COLORS.agent.success : COLORS.agent.fail)
    : balanceTone;
  const secondaryText = `s${agent.s_hat.toFixed(2)} q${compact(freeQuota)}`;
  const tertiaryText = `t${agent.activeTasks}/${agent.capacity} f${agent.f.toFixed(1)}`;
  const actionBadge = eventCount > 0 && lastAction ? `${lastAction}${eventCount > 1 ? `×${eventCount}` : ''}` : null;
  const badgeColor = actionColor(lastAction);
  const maxChars = Math.max(primaryText.length, secondaryText.length, tertiaryText.length);
  const panelWidth = Math.max(88, Math.min(132, Math.round(maxChars * 5.8) + 14));
  const panelHeight = compact ? AGENT_LABEL_PANEL_HEIGHT_COMPACT : AGENT_LABEL_PANEL_HEIGHT;
  const panelGap = compact ? AGENT_LABEL_PANEL_HORIZONTAL_GAP_COMPACT : AGENT_LABEL_PANEL_HORIZONTAL_GAP;
  const rawPanelX = labelSide === 'right'
    ? x + radius + panelGap
    : x - radius - panelGap - panelWidth;
  const panelX = bounds
    ? Math.max(bounds.minX, Math.min(rawPanelX, bounds.maxX - panelWidth))
    : rawPanelX;
  const resolvedPanelY = panelY ?? y - Math.round(panelHeight / 2);
  const panelTextAnchor = labelSide === 'right' ? 'start' : 'end';
  const panelTextX = labelSide === 'right' ? panelX + 7 : panelX + panelWidth - 7;
  const panelCenterY = resolvedPanelY + panelHeight / 2;
  const guideStartX = labelSide === 'right' ? x + radius : x - radius;
  const guideMidX = guideStartX + (labelSide === 'right' ? (compact ? 4 : 6) : (compact ? -4 : -6));
  const guideEndX = labelSide === 'right' ? panelX : panelX + panelWidth;

  return (
    <g
      onMouseEnter={() => setHighlightedAgent(agent.id)}
      onMouseLeave={() => setHighlightedAgent(null)}
      style={{ cursor: 'pointer' }}
    >
      {(agent.status === 'executing' || agent.status === 'overloaded') && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          initial={{ r: radius, opacity: 0.4 }}
          animate={{ r: radius + 24, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {isRouteFocus && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 8}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={2}
          initial={{ opacity: 0.2, r: radius + 2 }}
          animate={{ opacity: [0.35, 0.05, 0.35], r: [radius + 2, radius + (compact ? 10 : 14), radius + 2] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <motion.circle
        cx={x}
        cy={y}
        r={radius}
        fill={COLORS.bg.panel}
        stroke={isRouteFocus ? COLORS.accent : isHighlighted ? color : COLORS.border}
        strokeWidth={isRouteFocus ? 3 : isHighlighted ? 2.5 : 1.5}
        animate={
          agent.status === 'failed'
            ? { x: [0, -8, 8, -8, 0], transition: { duration: 0.5 } }
            : {}
        }
      />

      {agent.status !== 'idle' && (
        <circle
          cx={x}
          cy={y}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          opacity={0.8}
        />
      )}

      {agent.status === 'isolated' && (
        <>
          <circle cx={x} cy={y} r={radius - 1} fill={COLORS.state.failSoft} opacity={0.85} />
          <line x1={x - 16} y1={y - 16} x2={x + 16} y2={y + 16} stroke={COLORS.agent.fail} strokeWidth={2} opacity={0.5} strokeLinecap="round" />
          <line x1={x + 16} y1={y - 16} x2={x - 16} y2={y + 16} stroke={COLORS.agent.fail} strokeWidth={2} opacity={0.5} strokeLinecap="round" />
        </>
      )}

      {!compact && actionBadge && (
        <g>
          <rect
            x={x - Math.max(40, Math.min(84, Math.round(actionBadge.length * 5.2) + 10)) / 2}
            y={y - radius - 20}
            width={Math.max(40, Math.min(84, Math.round(actionBadge.length * 5.2) + 10))}
            height={13}
            rx={6.5}
            fill={COLORS.bg.panel}
            stroke={badgeColor}
            strokeWidth={1}
          />
          <text
            x={x}
            y={y - radius - 11}
            textAnchor="middle"
            fill={badgeColor}
            fontSize="8.5"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {actionBadge}
          </text>
        </g>
      )}

      <text
        x={x}
        y={y + (compact ? 3 : 4)}
        textAnchor="middle"
        fill={COLORS.text.primary}
        fontSize={compact ? 13 : 16}
        fontWeight="700"
        fontFamily="IBM Plex Sans, Inter, sans-serif"
      >
        {agent.id}
      </text>

      <polyline
        points={`${guideStartX},${y} ${guideMidX},${y} ${guideMidX},${panelCenterY} ${guideEndX},${panelCenterY}`}
        fill="none"
        stroke={isRouteFocus ? COLORS.accent : COLORS.border}
        strokeWidth={1}
        strokeOpacity={0.72}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect
        x={panelX}
        y={resolvedPanelY}
        width={panelWidth}
        height={panelHeight}
        rx={8}
        fill={COLORS.bg.panel}
        stroke={COLORS.border}
        strokeWidth={1}
        opacity={0.96}
      />
      <motion.text
        key={`primary-${agent.id}-${Math.round(deltaBalance * 100)}-${Math.round(agent.balance * 100)}`}
        x={panelTextX}
        y={resolvedPanelY + (compact ? 10.5 : 12)}
        textAnchor={panelTextAnchor}
        fill={primaryTone}
        fontSize={compact ? 9.1 : 10.2}
        fontFamily="JetBrains Mono, monospace"
        initial={{ opacity: 0.45, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.16 }}
      >
        {primaryText}
      </motion.text>
      <text
        x={panelTextX}
        y={resolvedPanelY + (compact ? 19 : 23)}
        textAnchor={panelTextAnchor}
        fill={COLORS.text.secondary}
        fontSize={compact ? 8.2 : 9.2}
        fontFamily="JetBrains Mono, monospace"
      >
        {secondaryText}
      </text>
      <text
        x={panelTextX}
        y={resolvedPanelY + (compact ? 27.2 : 33)}
        textAnchor={panelTextAnchor}
        fill={agent.f > 0 ? COLORS.agent.fail : COLORS.text.muted}
        fontSize={compact ? 7.8 : 8.8}
        fontFamily="JetBrains Mono, monospace"
      >
        {tertiaryText}
      </text>
    </g>
  );
}
