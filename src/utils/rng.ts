const NON_ZERO_FALLBACK_SEED = 0x6d2b79f5;

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? NON_ZERO_FALLBACK_SEED : normalized;
}

export function nextRandomUnit(seed: number): { seed: number; value: number } {
  const nextSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return {
    seed: nextSeed,
    value: nextSeed / 0x1_0000_0000,
  };
}

export function randomIntFromUnit(min: number, max: number, unit: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(unit * (hi - lo + 1)) + lo;
}
