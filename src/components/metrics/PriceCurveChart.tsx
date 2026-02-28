import { motion } from 'framer-motion';
import { useSimulationStore } from '../../store/simulationStore';
import { getPriceCurvePoints } from '../../engine/amm';
import type { AgentId } from '../../types/agent';
import { COLORS } from '../../constants/theme';

const SERIES_PALETTE = [
  COLORS.agent.idle,
  COLORS.agent.fail,
  COLORS.agent.success,
  COLORS.agent.executing,
  COLORS.agent.overflow,
  COLORS.text.secondary,
];

const W = 280;
const H = 120;
const PAD = { top: 10, right: 10, bottom: 20, left: 35 };

export function PriceCurveChart() {
  const agents = useSimulationStore(s => s.agents);
  const agentIds = Object.keys(agents) as AgentId[];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const firstAgentId = agentIds[0];
  const k = firstAgentId ? agents[firstAgentId].k : 100_000_000;
  const points = getPriceCurvePoints(k, 200, 1100, 80);
  const yMin = 200;
  const yMax = 1100;
  const pMax = Math.min(k / (200 * 200), 3000);
  const scaleX = (y: number) => PAD.left + ((y - yMin) / (yMax - yMin)) * plotW;
  const scaleY = (p: number) => PAD.top + plotH - (Math.min(p, pMax) / pMax) * plotH;
  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(pt.y).toFixed(1)} ${scaleY(pt.p).toFixed(1)}`).join(' ');
  const colorByAgentId = agentIds.reduce<Record<AgentId, string>>((acc, id, index) => {
    acc[id] = SERIES_PALETTE[index % SERIES_PALETTE.length];
    return acc;
  }, {} as Record<AgentId, string>);

  return (
    <svg width={W} height={H} className="w-full">
      {[0, 500, 1000, 2000].map(v => (
        <g key={v}>
          <line x1={PAD.left} y1={scaleY(v)} x2={PAD.left + plotW} y2={scaleY(v)} stroke={COLORS.chart.grid} strokeWidth={0.5} />
          <text x={PAD.left - 4} y={scaleY(v) + 3} textAnchor="end" fill={COLORS.text.muted} fontSize="7" fontFamily="JetBrains Mono">{v}</text>
        </g>
      ))}

      <path d={pathD} fill="none" stroke={COLORS.chart.line} strokeWidth={1.5} opacity={0.6} />
      <path d={`${pathD} L ${scaleX(yMax)} ${PAD.top + plotH} L ${scaleX(yMin)} ${PAD.top + plotH} Z`} fill={COLORS.chart.line} opacity={0.08} />

      {agentIds.map(id => {
        const agent = agents[id];
        const price = agent.k / (agent.y * agent.y);
        const cx = scaleX(agent.y);
        const cy = scaleY(price);
        if (agent.y < yMin || agent.y > yMax) return null;
        return (
          <g key={id}>
            <motion.circle
              cx={cx}
              cy={cy}
              r={4}
              fill={colorByAgentId[id]}
              animate={{ r: [4, 5, 4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <text x={cx + 6} y={cy - 4} fill={colorByAgentId[id]} fontSize="8" fontWeight="700" fontFamily="JetBrains Mono">{id}</text>
          </g>
        );
      })}

      <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" fill={COLORS.text.muted} fontSize="8">y (储备量)</text>
      <text x={4} y={PAD.top + plotH / 2} textAnchor="middle" fill={COLORS.text.muted} fontSize="8" transform={`rotate(-90, 4, ${PAD.top + plotH / 2})`}>P (价格)</text>
    </svg>
  );
}
