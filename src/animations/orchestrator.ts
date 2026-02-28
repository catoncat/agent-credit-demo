export type AnimationFn = () => Promise<void>;

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Run animations in sequence */
export async function sequence(...fns: AnimationFn[]): Promise<void> {
  for (const fn of fns) {
    await fn();
  }
}

/** Run animations in parallel */
export async function parallel(...fns: AnimationFn[]): Promise<void> {
  await Promise.all(fns.map(fn => fn()));
}

/** Create a delayed animation */
export function withDelay(ms: number, fn: AnimationFn): AnimationFn {
  return async () => {
    await delay(ms);
    await fn();
  };
}

/** Create a step animation sequence with auto-advance */
export function createStepSequence(
  actions: AnimationFn[],
  speedMultiplier: number = 1,
): AnimationFn {
  return async () => {
    for (const action of actions) {
      await action();
      await delay(300 / speedMultiplier);
    }
  };
}
