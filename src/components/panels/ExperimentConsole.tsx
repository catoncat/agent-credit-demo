import { useSimulationStore } from '../../store/simulationStore';
import { STEP_DEFINITIONS } from '../../constants/initialState';

export function ExperimentConsole() {
  const phase = useSimulationStore((s) => s.phase);
  const tick = useSimulationStore((s) => s.tick);
  const tasks = useSimulationStore((s) => s.tasks);
  const agents = useSimulationStore((s) => s.agents);
  const isPlaying = useSimulationStore((s) => s.isPlaying);

  const totalGuide = STEP_DEFINITIONS.length;
  const mode = phase < totalGuide ? '回放态' : '连续实验';

  return (
    <section className="h-full bg-[var(--sys-bg-panel)] border border-[var(--sys-border-default)] rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--sys-border-default)]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--sys-text-muted)]">实验控制台</div>
      </div>

      <div className="px-3 py-2 text-[10px] leading-relaxed text-[color:var(--sys-text-secondary)] border-b border-[var(--sys-border-muted)]">
        默认直接进入无限自动实验；六步剧本不参与实时运行，仅保留为理论回放语义。
      </div>

      <div className="px-3 pt-3 pb-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          模式: {mode}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          播放: {isPlaying ? 'ON' : 'OFF'}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          clearing: every 5 ticks
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          tick: {tick}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          节点: {Object.keys(agents).length}
        </span>
        <span className="px-2 py-1 rounded border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] text-[color:var(--sys-text-secondary)]">
          任务: {tasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2 text-[10px]">
        <div className="rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] px-2 py-1.5">
          <div className="text-[color:var(--sys-text-muted)] uppercase tracking-wider">机制要点 1</div>
          <div className="font-mono text-[color:var(--sys-text-secondary)] mt-0.5">Δx = k/(y-Δy) - k/y</div>
          <div className="text-[color:var(--sys-text-secondary)] mt-0.5">凸增背压：容量越紧，边际成本越高。</div>
        </div>
        <div className="rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] px-2 py-1.5">
          <div className="text-[color:var(--sys-text-muted)] uppercase tracking-wider">机制要点 2</div>
          <div className="font-mono text-[color:var(--sys-text-secondary)] mt-0.5">P_eff = Δx * (1+f) / ŝ</div>
          <div className="text-[color:var(--sys-text-secondary)] mt-0.5">拥塞、风险、质量统一到一个路由标量。</div>
        </div>
        <div className="rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] px-2 py-1.5">
          <div className="text-[color:var(--sys-text-muted)] uppercase tracking-wider">机制要点 3</div>
          <div className="font-mono text-[color:var(--sys-text-secondary)] mt-0.5">RESERVE → VALIDATE → COMMIT / ABORT+COMPENSATE</div>
          <div className="text-[color:var(--sys-text-secondary)] mt-0.5">非原子调用下保持可恢复和幂等。</div>
        </div>
        <div className="rounded-lg border border-[var(--sys-border-default)] bg-[var(--sys-bg-soft)] px-2 py-1.5">
          <div className="text-[color:var(--sys-text-muted)] uppercase tracking-wider">机制要点 4</div>
          <div className="font-mono text-[color:var(--sys-text-secondary)] mt-0.5">Epoch clearing (tax/fee/liquidate)</div>
          <div className="text-[color:var(--sys-text-secondary)] mt-0.5">封闭清算抑制长期垄断并维持流通。</div>
        </div>
      </div>
    </section>
  );
}
