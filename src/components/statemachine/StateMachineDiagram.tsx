import { motion } from 'framer-motion';
import { useSimulationStore } from '../../store/simulationStore';
import { getStateMachineStates, getValidTransitions } from '../../engine/saga';
import type { TaskStatus } from '../../types/task';
import { COLORS } from '../../constants/theme';

const STATE_POSITIONS: Record<TaskStatus, { x: number; y: number }> = {
  INIT:       { x: 70,  y: 50 },
  RESERVE:    { x: 200, y: 50 },
  DISPATCH:   { x: 330, y: 50 },
  VALIDATE:   { x: 330, y: 160 },
  COMMIT:     { x: 200, y: 160 },
  COMMITTED:  { x: 70,  y: 160 },
  ABORT:      { x: 460, y: 50 },
  COMPENSATE: { x: 460, y: 160 },
  ABORTED:    { x: 460, y: 270 },
};

const STATUS_COLORS: Record<string, string> = {
  INIT: COLORS.text.muted,
  RESERVE: COLORS.agent.idle,
  DISPATCH: COLORS.agent.idle,
  VALIDATE: COLORS.agent.idle,
  COMMIT: COLORS.agent.success,
  COMMITTED: COLORS.agent.success,
  ABORT: COLORS.agent.fail,
  COMPENSATE: COLORS.agent.fail,
  ABORTED: COLORS.agent.fail,
};

export function StateMachineDiagram() {
  const tasks = useSimulationStore(s => s.tasks);
  const currentTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;
  const currentStatus = currentTask?.status || null;

  const states = getStateMachineStates();
  const transitions = getValidTransitions();

  const edges: { from: TaskStatus; to: TaskStatus }[] = [];
  for (const [from, tos] of Object.entries(transitions)) {
    for (const to of tos) {
      edges.push({ from: from as TaskStatus, to });
    }
  }

  const visitedStates = new Set<TaskStatus>();
  if (currentTask) {
    const happyPath: TaskStatus[] = ['INIT', 'RESERVE', 'DISPATCH', 'VALIDATE', 'COMMIT', 'COMMITTED'];
    const sadPath: TaskStatus[] = ['INIT', 'RESERVE', 'DISPATCH', 'ABORT', 'COMPENSATE', 'ABORTED'];
    const isAbortPath = ['ABORT', 'COMPENSATE', 'ABORTED'].includes(currentStatus!);
    const path = isAbortPath ? sadPath : happyPath;
    for (const s of path) {
      visitedStates.add(s);
      if (s === currentStatus) break;
    }
  }

  return (
    <div className="w-full h-full p-4 relative">
      <div className="text-[11px] text-[color:var(--sys-text-muted)] font-mono mb-3 uppercase tracking-wider">State Machine</div>

      <svg width="100%" height="100%" viewBox="0 0 540 310" preserveAspectRatio="xMidYMid meet">
        {edges.map(({ from, to }) => {
          const p1 = STATE_POSITIONS[from];
          const p2 = STATE_POSITIONS[to];
          const isVisited = visitedStates.has(from) && visitedStates.has(to);
          const isActive = from === currentStatus;
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const nx = dx / len, ny = dy / len;
          const r = 28;
          const x1 = p1.x + nx * r, y1 = p1.y + ny * r;
          const x2 = p2.x - nx * r, y2 = p2.y - ny * r;
          return (
            <g key={`${from}-${to}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isActive ? STATUS_COLORS[from] : isVisited ? COLORS.chart.grid : COLORS.bg.card}
                strokeWidth={isActive ? 2 : 1}
              />
              <polygon
                points={`${x2},${y2} ${x2 - nx * 6 - ny * 4},${y2 - ny * 6 + nx * 4} ${x2 - nx * 6 + ny * 4},${y2 - ny * 6 - nx * 4}`}
                fill={isActive ? STATUS_COLORS[from] : isVisited ? COLORS.chart.grid : COLORS.bg.card}
              />
            </g>
          );
        })}

        {states.map(state => {
          const pos = STATE_POSITIONS[state.id];
          const isCurrent = state.id === currentStatus;
          const isVisited = visitedStates.has(state.id);
          const color = STATUS_COLORS[state.id];
          return (
            <g key={state.id}>
              {isCurrent && (
                <motion.circle cx={pos.x} cy={pos.y} r={26} fill="none" stroke={color} strokeWidth={1.5}
                  initial={{ r: 26, opacity: 0.4 }}
                  animate={{ r: 36, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              <circle
                cx={pos.x} cy={pos.y} r={state.isTerminal ? 26 : 24}
                fill={isCurrent ? `${color}16` : COLORS.bg.panel}
                stroke={isCurrent ? color : isVisited ? COLORS.chart.grid : COLORS.border}
                strokeWidth={isCurrent ? 2 : 1}
              />
              {state.isTerminal && (
                <circle cx={pos.x} cy={pos.y} r={21} fill="none"
                  stroke={isCurrent ? color : isVisited ? COLORS.chart.grid : COLORS.border} strokeWidth={1}
                />
              )}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill={isCurrent ? color : isVisited ? COLORS.text.secondary : COLORS.chart.grid}
                fontSize="9" fontWeight={isCurrent ? '700' : '500'} fontFamily="JetBrains Mono, monospace"
              >
                {state.id}
              </text>
              <text x={pos.x} y={pos.y + 38} textAnchor="middle" fill={COLORS.text.muted} fontSize="9">
                {state.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
