import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  value: number;
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({ value, decimals = 1, className = '' }: Props) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, v => {
    if (v === Infinity || v === -Infinity) return '∞';
    if (isNaN(v)) return 'N/A';
    return v.toFixed(decimals);
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
