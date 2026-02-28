import type { Variants } from 'framer-motion';
import { COLORS } from '../constants/theme';

export const statusColorMap: Record<string, string> = {
  idle: COLORS.agent.idle,
  executing: COLORS.agent.executing,
  failed: COLORS.agent.fail,
  overloaded: COLORS.agent.overflow,
  isolated: COLORS.agent.fail,
  success: COLORS.agent.success,
};

export const stateNodeVariants: Variants = {
  inactive: {
    opacity: 0.4,
    scale: 0.95,
  },
  active: {
    opacity: 1,
    scale: 1.1,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
  completed: {
    opacity: 0.7,
    scale: 1,
  },
};

export const numberVariants: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } },
  exit: { opacity: 0, y: 10, transition: { duration: 0.2 } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};
