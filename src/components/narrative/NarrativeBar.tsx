import { motion, AnimatePresence } from 'framer-motion';
import { useSimulationStore } from '../../store/simulationStore';
import { STEP_DEFINITIONS } from '../../constants/initialState';
import { FormulaDisplay } from './FormulaDisplay';
import { useEffect, useState } from 'react';

export function NarrativeBar() {
  const currentStep = useSimulationStore(s => s.currentStep);
  const stepDef = currentStep > 0 ? STEP_DEFINITIONS[currentStep - 1] : null;
  const totalSteps = STEP_DEFINITIONS.length;
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!stepDef) {
      setDisplayText('点击“下一步”启动 6 阶段引导；也可直接开启自动演化，让系统连续推进。');
      setIsTyping(false);
      return;
    }

    setDisplayText('');
    setIsTyping(true);
    const text = stepDef.narrative;
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, 25);

    return () => clearInterval(timer);
  }, [currentStep, stepDef]);

  return (
    <div className="min-h-[76px] bg-[var(--sys-bg-panel)] rounded-xl border border-[var(--sys-border-default)] flex items-center px-5 gap-5">
      <AnimatePresence mode="wait">
        {stepDef && (
          <motion.div
            key={stepDef.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex-shrink-0"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--sys-status-idle-soft)] flex items-center justify-center text-sm font-bold text-[color:var(--sys-status-idle)]">
              {stepDef.id}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--sys-status-idle-soft)] text-[color:var(--sys-status-idle)] border border-[var(--sys-border-default)]">
            {stepDef ? `阶段 ${stepDef.id}/${totalSteps}` : `阶段 0/${totalSteps}`}
          </span>
          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)] border border-[var(--sys-border-default)]">
            自动演化
          </span>
        </div>
        <motion.p className="text-xs text-[color:var(--sys-text-secondary)] leading-relaxed" key={currentStep}>
          {displayText}
          {isTyping && <span className="inline-block w-0.5 h-3 bg-[var(--sys-action-primary)] ml-0.5 animate-pulse" />}
        </motion.p>
      </div>

      {stepDef?.formula && (
        <div className="flex-shrink-0 max-w-[480px]">
          <FormulaDisplay formula={stepDef.formula} />
        </div>
      )}
    </div>
  );
}
