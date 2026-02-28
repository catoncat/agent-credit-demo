import { motion } from 'framer-motion';
import type { AgentState } from '../../types/agent';
import { getBasePrice, getEffectivePrice } from '../../engine/amm';
import { AnimatedNumber } from './AnimatedNumber';
import { COLORS } from '../../constants/theme';

const STATUS_CONFIG: Record<string, { color: string; label: string; soft: string }> = {
  idle: { color: COLORS.agent.idle, label: '空闲', soft: COLORS.state.idleSoft },
  executing: { color: COLORS.agent.executing, label: '执行中', soft: COLORS.state.executingSoft },
  failed: { color: COLORS.agent.fail, label: '失败', soft: COLORS.state.failSoft },
  overloaded: { color: COLORS.agent.overflow, label: '过载', soft: COLORS.state.overflowSoft },
  isolated: { color: COLORS.agent.fail, label: '已隔离', soft: COLORS.state.failSoft },
};

interface Props { agent: AgentState; }

export function AgentMetricCard({ agent }: Props) {
  const config = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
  const pBase = getBasePrice(agent);
  const pEff = getEffectivePrice(agent);

  return (
    <motion.div
      className="bg-[var(--sys-bg-card)] rounded-lg border border-[var(--sys-border-default)] p-3 relative"
      layout
      animate={agent.status === 'failed' ? { x: [0, -4, 4, -4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: config.color }}
      />

      <div className="flex items-center justify-between mb-2 pl-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[color:var(--sys-text-primary)]">{agent.label}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: config.soft, color: config.color }}
          >
            {config.label}
          </span>
        </div>
        <div className="text-[10px] text-[color:var(--sys-text-muted)] font-mono">
          {agent.totalCompleted}✓ {agent.totalFailed}✗
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2 pl-3">
        <MetricItem label="y (储备)" value={agent.y} decimals={0} />
        <MetricItem label="P_base" value={pBase} decimals={0} />
        <MetricItem label="P_eff" value={pEff} decimals={0} accent />
        <MetricItem label="f (摩擦)" value={agent.f} decimals={1} warn={agent.f > 0} />
        <MetricItem label="ŝ (评分)" value={agent.s_hat} decimals={2} />
        <MetricItem label="余额" value={agent.tradeBalance} decimals={0} />
      </div>

      <div className="mt-2 pl-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[color:var(--sys-text-muted)]">容量</span>
          <span className="text-[10px] font-mono text-[color:var(--sys-text-secondary)]">{agent.activeTasks}/{agent.capacity}</span>
        </div>
        <div className="h-1.5 bg-[var(--sys-border-default)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: agent.activeTasks >= agent.capacity ? COLORS.agent.fail : COLORS.agent.idle }}
            animate={{ width: `${(agent.activeTasks / agent.capacity) * 100}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function MetricItem({ label, value, decimals = 1, accent, warn }: {
  label: string; value: number; decimals?: number; accent?: boolean; warn?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] text-[color:var(--sys-text-muted)] mb-0.5">{label}</div>
      <AnimatedNumber
        value={value}
        decimals={decimals}
        className={`text-xs font-mono font-semibold ${
          warn ? 'text-[color:var(--sys-status-fail)]' : accent ? 'text-[color:var(--sys-status-idle)]' : 'text-[color:var(--sys-text-primary)]'
        }`}
      />
    </div>
  );
}
