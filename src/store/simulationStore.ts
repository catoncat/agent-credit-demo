import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AgentState, AgentId } from '../types/agent';
import type { Task } from '../types/task';
import type { LedgerEntry } from '../types/ledger';
import type { StepSnapshot, StepDefinition, AnimationEvent } from '../types/step';
import {
  INITIAL_AGENTS,
  STEP_DEFINITIONS,
  DEFAULT_CLIENT_BALANCE,
  AUTO_CLEAR_INTERVAL,
} from '../constants/initialState';
import { DEFAULT_SIM_SEED, executeStep, executeAutoTick, type SimulationState } from '../engine/simulation';
import { createBootstrappedAgentState } from '../engine/bootstrap';
import { normalizeSeed } from '../utils/rng';

const TOTAL_GUIDE_PHASES = STEP_DEFINITIONS.length;

function buildInitialSimulationState(): SimulationState {
  return {
    agents: structuredClone(INITIAL_AGENTS),
    tasks: [],
    ledger: [],
    priceComparison: null,
    clientBalance: DEFAULT_CLIENT_BALANCE,
    tick: 0,
    phase: TOTAL_GUIDE_PHASES,
    rngState: normalizeSeed(DEFAULT_SIM_SEED),
    lastNarrative: '',
  };
}

function makeSnapshot(state: {
  agents: Record<AgentId, AgentState>;
  tasks: Task[];
  ledger: LedgerEntry[];
  currentStep: number;
  phase: number;
  tick: number;
  rngState: number;
  clientBalance: number;
  priceComparison: Record<AgentId, number> | null;
  lastNarrative: string;
}): StepSnapshot {
  return {
    agents: structuredClone(state.agents),
    tasks: structuredClone(state.tasks),
    ledger: structuredClone(state.ledger),
    currentStep: state.currentStep,
    phase: state.phase,
    tick: state.tick,
    rngState: state.rngState,
    clientBalance: state.clientBalance,
    priceComparison: state.priceComparison ? structuredClone(state.priceComparison) : null,
    lastNarrative: state.lastNarrative,
  };
}

interface SimulationStore {
  // State
  agents: Record<AgentId, AgentState>;
  tasks: Task[];
  ledger: LedgerEntry[];
  currentStep: number;
  phase: number;
  tick: number;
  rngState: number;
  clientBalance: number;
  lastNarrative: string;
  isPlaying: boolean;
  playSpeed: number;
  snapshots: StepSnapshot[];
  activeAnimations: AnimationEvent[];
  highlightedAgent: AgentId | null;
  priceComparison: Record<AgentId, number> | null;

  // Actions
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  reset: () => void;
  togglePlay: () => void;
  setPlaySpeed: (speed: number) => void;
  setHighlightedAgent: (id: AgentId | null) => void;
  setPriceComparison: (prices: Record<AgentId, number> | null) => void;
  addAgent: (id?: AgentId, label?: string) => AgentId;

  // Computed
  getCurrentStepDef: () => StepDefinition | undefined;
  getStepDefs: () => StepDefinition[];
}

export const useSimulationStore = create<SimulationStore>()(
  immer((set, get) => {
    const initial = buildInitialSimulationState();
    const initialCurrentStep = TOTAL_GUIDE_PHASES;
    const initialSnapshot = makeSnapshot({
      ...initial,
      currentStep: initialCurrentStep,
    });
    const initialSnapshots: StepSnapshot[] = [];
    initialSnapshots[initial.phase] = initialSnapshot;

    return {
      agents: initial.agents,
      tasks: initial.tasks,
      ledger: initial.ledger,
      currentStep: initialCurrentStep,
      phase: initial.phase,
      tick: initial.tick,
      rngState: initial.rngState,
      clientBalance: initial.clientBalance,
      lastNarrative: initial.lastNarrative,
      isPlaying: false,
      playSpeed: 1,
      snapshots: initialSnapshots,
      activeAnimations: [],
      highlightedAgent: null,
      priceComparison: null,

      nextStep: () => {
        const { agents, tasks, ledger, phase, tick, rngState, priceComparison, clientBalance, lastNarrative } = get();
        const stepNum = phase + 1;

        const simState: SimulationState = {
          agents: structuredClone(agents),
          tasks: structuredClone(tasks),
          ledger: structuredClone(ledger),
          priceComparison: priceComparison ? structuredClone(priceComparison) : null,
          clientBalance,
          tick,
          phase,
          rngState,
          lastNarrative,
        };

        const stepped = phase < TOTAL_GUIDE_PHASES
          ? executeStep(simState, STEP_DEFINITIONS[phase].actions, stepNum)
          : executeAutoTick(simState, stepNum, {
              clearEvery: AUTO_CLEAR_INTERVAL,
              routeNearBestRatio: 0.75,
              routeTemperature: 0.35,
              adaptiveDeltaFloor: 8,
              maxPaymentRatio: 0.08,
              budgetRefillThreshold: 9000,
            });

        const nextPhase = phase + 1;
        const nextTick = tick + 1;
        const nextCurrentStep = Math.min(nextPhase, TOTAL_GUIDE_PHASES);

        set((state) => {
          state.agents = stepped.agents;
          state.tasks = stepped.tasks;
          state.ledger = stepped.ledger;
          state.priceComparison = stepped.priceComparison;
          state.clientBalance = stepped.clientBalance;
          state.rngState = stepped.rngState;
          state.lastNarrative = stepped.lastNarrative;
          state.phase = nextPhase;
          state.tick = nextTick;
          state.currentStep = nextCurrentStep;

          const snapshot = makeSnapshot({
            agents: stepped.agents,
            tasks: stepped.tasks,
            ledger: stepped.ledger,
            currentStep: nextCurrentStep,
            phase: nextPhase,
            tick: nextTick,
            rngState: stepped.rngState,
            clientBalance: stepped.clientBalance,
            priceComparison: stepped.priceComparison,
            lastNarrative: stepped.lastNarrative,
          });

          state.snapshots[nextPhase] = snapshot;
        });
      },

      prevStep: () => {
        const { phase, snapshots } = get();
        if (phase <= 0) return;
        const targetPhase = phase - 1;
        const previous = snapshots[targetPhase];
        if (!previous) return;

        set((state) => {
          state.agents = structuredClone(previous.agents);
          state.tasks = structuredClone(previous.tasks);
          state.ledger = structuredClone(previous.ledger);
          state.currentStep = previous.currentStep;
          state.phase = previous.phase;
          state.tick = previous.tick;
          state.rngState = previous.rngState;
          state.clientBalance = previous.clientBalance;
          state.priceComparison = previous.priceComparison ? structuredClone(previous.priceComparison) : null;
          state.lastNarrative = previous.lastNarrative;
        });
      },

      goToStep: (step: number) => {
        const safeStep = Math.max(0, Math.min(step, TOTAL_GUIDE_PHASES));
        const { snapshots } = get();

        if (snapshots[safeStep]) {
          const snapshot = snapshots[safeStep];
          set((state) => {
            state.agents = structuredClone(snapshot.agents);
            state.tasks = structuredClone(snapshot.tasks);
            state.ledger = structuredClone(snapshot.ledger);
            state.currentStep = snapshot.currentStep;
            state.phase = snapshot.phase;
            state.tick = snapshot.tick;
            state.rngState = snapshot.rngState;
            state.clientBalance = snapshot.clientBalance;
            state.priceComparison = snapshot.priceComparison ? structuredClone(snapshot.priceComparison) : null;
            state.lastNarrative = snapshot.lastNarrative;
          });
          return;
        }

        let replay = buildInitialSimulationState();
        for (let i = 0; i < safeStep; i++) {
          replay = executeStep(replay, STEP_DEFINITIONS[i].actions, i + 1);
          replay = {
            ...replay,
            phase: i + 1,
            tick: i + 1,
          };
        }

        const replaySnapshot = makeSnapshot({
          agents: replay.agents,
          tasks: replay.tasks,
          ledger: replay.ledger,
          currentStep: Math.min(safeStep, TOTAL_GUIDE_PHASES),
          phase: safeStep,
          tick: safeStep,
          rngState: replay.rngState,
          clientBalance: replay.clientBalance,
          priceComparison: replay.priceComparison,
          lastNarrative: replay.lastNarrative,
        });

        set((state) => {
          state.agents = structuredClone(replay.agents);
          state.tasks = structuredClone(replay.tasks);
          state.ledger = structuredClone(replay.ledger);
          state.currentStep = replaySnapshot.currentStep;
          state.phase = replaySnapshot.phase;
          state.tick = replaySnapshot.tick;
          state.rngState = replaySnapshot.rngState;
          state.clientBalance = replay.clientBalance;
          state.priceComparison = replay.priceComparison ? structuredClone(replay.priceComparison) : null;
          state.lastNarrative = replay.lastNarrative;
          state.snapshots[safeStep] = replaySnapshot;
        });
      },

      reset: () => {
        const fresh = buildInitialSimulationState();
        const snapshot = makeSnapshot({
          ...fresh,
          currentStep: TOTAL_GUIDE_PHASES,
        });
        const snapshots: StepSnapshot[] = [];
        snapshots[fresh.phase] = snapshot;

        set((state) => {
          state.agents = fresh.agents;
          state.tasks = fresh.tasks;
          state.ledger = fresh.ledger;
          state.currentStep = TOTAL_GUIDE_PHASES;
          state.phase = fresh.phase;
          state.tick = 0;
          state.rngState = fresh.rngState;
          state.clientBalance = fresh.clientBalance;
          state.lastNarrative = fresh.lastNarrative;
          state.isPlaying = false;
          state.snapshots = snapshots;
          state.priceComparison = null;
          state.highlightedAgent = null;
        });
      },

      togglePlay: () => {
        set((state) => {
          state.isPlaying = !state.isPlaying;
        });
      },

      setPlaySpeed: (speed: number) => {
        set((state) => {
          state.playSpeed = speed;
        });
      },

      setHighlightedAgent: (id: AgentId | null) => {
        set((state) => {
          state.highlightedAgent = id;
        });
      },

      setPriceComparison: (prices: Record<AgentId, number> | null) => {
        set((state) => {
          state.priceComparison = prices;
        });
      },

      addAgent: (id?: AgentId, label?: string) => {
        const currentIds = Object.keys(get().agents);
        const normalizedId = id && id.trim().length > 0 ? id : `N${currentIds.length + 1}`;
        const normalizedLabel = label && label.trim().length > 0 ? label : `Agent-${normalizedId}`;

        if (get().agents[normalizedId]) return normalizedId;

        set((state) => {
          state.agents[normalizedId] = createBootstrappedAgentState(
            normalizedId,
            normalizedLabel,
            state.agents,
          );
        });
        return normalizedId;
      },

      getCurrentStepDef: () => {
        const { phase } = get();
        if (phase <= 0) return undefined;
        const index = Math.min(phase, TOTAL_GUIDE_PHASES) - 1;
        return STEP_DEFINITIONS[index];
      },

      getStepDefs: () => STEP_DEFINITIONS,
    };
  }),
);
