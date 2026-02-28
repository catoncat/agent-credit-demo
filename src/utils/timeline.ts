import { STEP_DEFINITIONS } from '../constants/initialState';

const GUIDE_PHASE_COUNT = STEP_DEFINITIONS.length;

export function stepToTimelineTick(step: number): number {
  if (step > GUIDE_PHASE_COUNT) return step - GUIDE_PHASE_COUNT;
  return step;
}

export function formatTimelineStepLabel(step: number): string {
  if (step > GUIDE_PHASE_COUNT) return `T${step - GUIDE_PHASE_COUNT}`;
  return `S${step}`;
}

export function formatTimelineStepDebugLabel(step: number): string {
  if (step > GUIDE_PHASE_COUNT) return `T${step - GUIDE_PHASE_COUNT}(S${step})`;
  return `S${step}`;
}
