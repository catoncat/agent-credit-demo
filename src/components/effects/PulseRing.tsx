import { motion } from 'framer-motion';

interface Props {
  cx: number;
  cy: number;
  r: number;
  color: string;
}

export function PulseRing({ cx, cy, r, color }: Props) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={2}
      initial={{ r, opacity: 0.8 }}
      animate={{ r: r + 30, opacity: 0 }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}
