import type { Variants, Transition } from 'framer-motion';

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
};

export const snappySpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const gentleSpring: Transition = {
  type: 'spring',
  stiffness: 50,
  damping: 15,
};

export const nodeVariants: Variants = {
  idle: {
    scale: 1,
    opacity: 1,
  },
  executing: {
    scale: 1.05,
    opacity: 1,
    transition: { duration: 0.3 },
  },
  failed: {
    scale: 1,
    opacity: 1,
    x: [0, -10, 10, -10, 0],
    transition: { duration: 0.6 },
  },
  success: {
    scale: [1, 1.2, 1],
    opacity: 1,
    transition: { duration: 0.5 },
  },
  overloaded: {
    scale: 1,
    opacity: [1, 0.7, 1],
    transition: { duration: 1, repeat: Infinity },
  },
};

export const particleVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3 },
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: 0.3 },
  },
};

export const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

export const pulseAnimation = {
  scale: [1, 1.5, 1],
  opacity: [0.8, 0, 0.8],
  transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
};

export const glowAnimation = {
  boxShadow: [
    '0 0 5px rgba(129, 140, 248, 0.3)',
    '0 0 20px rgba(129, 140, 248, 0.6)',
    '0 0 5px rgba(129, 140, 248, 0.3)',
  ],
  transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
};
