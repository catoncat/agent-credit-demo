import { motion } from 'framer-motion';

interface Props { color: string; size?: number; className?: string; }

export function GlowEffect({ color, size = 100, className = '' }: Props) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(circle, ${color}15 0%, transparent 70%)` }}
      animate={{ opacity: [0.3, 0.5, 0.3], scale: [0.95, 1.05, 0.95] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}
