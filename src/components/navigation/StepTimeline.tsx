import { motion } from 'framer-motion';
import { useSimulationStore } from '../../store/simulationStore';
import { STEP_DEFINITIONS } from '../../constants/initialState';

export function StepTimeline() {
  const { currentStep, phase, goToStep, nextStep } = useSimulationStore();
  const totalSteps = STEP_DEFINITIONS.length;
  const inGuideScript = phase < totalSteps;

  return (
    <div className="p-4 space-y-1.5">
      <h2 className="text-[11px] font-semibold text-[color:var(--sys-text-muted)] uppercase tracking-wider px-2">
        六步机制剧本（教学）
      </h2>
      <p className="px-2 text-[10px] leading-relaxed text-[color:var(--sys-text-secondary)]">
        {inGuideScript
          ? '用于解释冷启动→清算的因果链。完成后会进入无限自动实验。'
          : '当前处于连续实验；这里保留为回放入口，便于对照机制解释。'}
      </p>

      {STEP_DEFINITIONS.map((step, index) => {
        const stepIndex = index + 1;
        const isCompleted = currentStep > index;
        const isCurrent = currentStep === index;

        return (
          <motion.button
            key={step.id}
            onClick={() => {
              if (isCurrent) nextStep();
              else if (isCompleted) goToStep(index);
            }}
            className={`w-full text-left p-3 rounded-lg transition-all ${
              isCurrent
                ? 'bg-[var(--sys-status-idle-soft)] border border-[var(--sys-status-idle)]'
                : isCompleted
                ? 'hover:bg-[var(--sys-bg-card)] cursor-pointer border border-transparent'
                : 'opacity-40 cursor-default'
            }`}
            layout
          >
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <motion.div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCompleted
                      ? 'bg-[var(--sys-status-success)] text-[color:var(--sys-text-inverse)]'
                      : isCurrent
                      ? 'bg-[var(--sys-action-primary)] text-[color:var(--sys-text-inverse)]'
                      : 'bg-[var(--sys-border-default)] text-[color:var(--sys-text-muted)]'
                  }`}
                  animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {isCompleted ? '✓' : stepIndex}
                </motion.div>
                {index < STEP_DEFINITIONS.length - 1 && (
                  <div className={`w-0.5 h-6 mt-1 ${isCompleted ? 'bg-[var(--sys-status-success)]/30' : 'bg-[var(--sys-border-default)]'}`} />
                )}
              </div>

              <div className="min-w-0 pt-0.5">
                <div className={`text-xs font-semibold ${isCurrent ? 'text-[color:var(--sys-action-primary)]' : isCompleted ? 'text-[color:var(--sys-text-primary)]' : 'text-[color:var(--sys-text-muted)]'}`}>
                  {step.title}
                </div>
                <div className="text-[10px] text-[color:var(--sys-text-muted)] mt-0.5 leading-tight">
                  {step.subtitle}
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}

      {currentStep === 0 && (
        <motion.div
          className="mt-4 p-3 bg-[var(--sys-status-idle-soft)] border border-[var(--sys-status-idle)] rounded-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-[10px] text-[color:var(--sys-status-idle)]">
            点击“下一步”从第 1/{totalSteps} 步开始；也可直接开启连续实验。
          </p>
        </motion.div>
      )}
    </div>
  );
}
