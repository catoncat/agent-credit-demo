import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import katex from 'katex';

interface Props { formula: string; }

export function FormulaDisplay({ formula }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(formula, ref.current, { throwOnError: false, displayMode: false, output: 'html' });
      } catch {
        if (ref.current) ref.current.textContent = formula;
      }
    }
  }, [formula]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="px-3 py-2 bg-[var(--sys-bg-card)] rounded-lg border border-[var(--sys-border-default)]"
    >
      <div ref={ref} className="text-[11px] text-[color:var(--sys-text-primary)] overflow-x-auto [&_.katex]:text-[11px]" />
    </motion.div>
  );
}
