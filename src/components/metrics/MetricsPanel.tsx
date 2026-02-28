import { useSimulationStore } from '../../store/simulationStore';
import { AgentMetricCard } from './AgentMetricCard';
import { LedgerTable } from './LedgerTable';
import { PriceCurveChart } from './PriceCurveChart';
import type { AgentId } from '../../types/agent';

export function MetricsPanel() {
  const agents = useSimulationStore(s => s.agents);
  const agentIds = Object.keys(agents) as AgentId[];
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-[11px] font-semibold text-[color:var(--sys-text-muted)] uppercase tracking-wider px-1">
        Agent Metrics
      </h2>
      <div className="space-y-3">
        {agentIds.map(id => (
          <AgentMetricCard key={id} agent={agents[id]} />
        ))}
      </div>
      <div className="bg-[var(--sys-bg-card)] rounded-lg border border-[var(--sys-border-default)] p-3">
        <h3 className="text-[11px] text-[color:var(--sys-text-muted)] mb-2 font-mono">P = k/y² 价格曲线</h3>
        <PriceCurveChart />
      </div>
      <LedgerTable />
    </div>
  );
}
