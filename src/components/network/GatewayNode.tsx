import { motion } from 'framer-motion';
import { COLORS } from '../../constants/theme';

interface Props {
  x: number;
  y: number;
  isActive: boolean;
  compact?: boolean;
}

export function GatewayNode({ x, y, isActive, compact = false }: Props) {
  const size = compact ? 22 : 28;
  const points = [
    `${x},${y - size}`, `${x + size},${y}`,
    `${x},${y + size}`, `${x - size},${y}`,
  ].join(' ');

  return (
    <g>
      {isActive && (
        <motion.polygon
          points={points}
          fill={COLORS.state.idleSoft}
          opacity={0.8}
          animate={{ opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
      <polygon points={points} fill={COLORS.bg.panel} stroke={COLORS.agent.idle} strokeWidth={1.5} />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={COLORS.agent.idle}
        fontSize={compact ? 9 : 10}
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        GW
      </text>
    </g>
  );
}
