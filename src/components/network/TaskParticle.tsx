import { motion } from 'framer-motion';
import type { TaskStatus } from '../../types/task';
import { COLORS } from '../../constants/theme';

export type ParticleStatus = TaskStatus | 'ROUTE' | 'BURN' | 'BANCOR_TAX' | 'BANCOR_FEE' | 'LIQUIDATE';

interface Props {
  from: { x: number; y: number };
  to: { x: number; y: number };
  status: ParticleStatus;
  loop?: boolean;
  delay?: number;
  duration?: number;
  radius?: number;
}

const STATUS_COLORS: Record<string, string> = {
  RESERVE: COLORS.agent.idle,
  DISPATCH: COLORS.agent.idle,
  VALIDATE: COLORS.agent.success,
  COMMIT: COLORS.agent.success,
  ABORT: COLORS.agent.fail,
  ROUTE: COLORS.agent.idle,
  BURN: COLORS.agent.overflow,
  BANCOR_TAX: COLORS.agent.idle,
  BANCOR_FEE: COLORS.text.secondary,
  LIQUIDATE: COLORS.agent.fail,
};

export function TaskParticle({
  from,
  to,
  status,
  loop = false,
  delay = 0,
  duration = 1.2,
  radius = 3.5,
}: Props) {
  const color = STATUS_COLORS[status] || COLORS.agent.idle;
  return (
    <motion.g
      initial={{ x: from.x, y: from.y, opacity: 0 }}
      animate={{ x: to.x, y: to.y, opacity: [0, 1, 1, 0.5] }}
      transition={{
        duration,
        delay,
        ease: 'easeInOut',
        repeat: loop ? Infinity : 0,
        repeatDelay: loop ? 0.12 : 0,
      }}
    >
      <circle cx={0} cy={0} r={radius + 2} fill={color} opacity={0.16} />
      <circle cx={0} cy={0} r={radius} fill={color} />
    </motion.g>
  );
}
