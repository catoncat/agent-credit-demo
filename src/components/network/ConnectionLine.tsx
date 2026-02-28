import type { AgentId } from '../../types/agent';
import { COLORS } from '../../constants/theme';

interface Props {
  from: { x: number; y: number };
  to: { x: number; y: number };
  agentId: AgentId;
  isActive: boolean;
  isFailed: boolean;
  isRouteFocus?: boolean;
}

export function ConnectionLine({ from, to, isActive, isFailed, isRouteFocus = false }: Props) {
  const color = isFailed
    ? COLORS.agent.fail
    : isRouteFocus
      ? COLORS.accent
      : isActive
        ? COLORS.agent.idle
        : COLORS.chart.grid;
  return (
    <g>
      <line
        x1={from.x} y1={from.y} x2={to.x} y2={to.y}
        stroke={color}
        strokeWidth={isRouteFocus ? 2.6 : isActive ? 1.5 : 1}
        opacity={isFailed ? 0.3 : isRouteFocus ? 0.85 : isActive ? 0.6 : 0.5}
      />
      {(isActive || isRouteFocus) && (
        <line
          x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={isRouteFocus ? COLORS.accent : COLORS.agent.idle}
          strokeWidth={isRouteFocus ? 2.2 : 1.5}
          strokeDasharray="6 10"
          opacity={isRouteFocus ? 0.6 : 0.4}
          className="animate-dash"
        />
      )}
    </g>
  );
}
