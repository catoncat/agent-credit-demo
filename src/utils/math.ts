export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function calcPrice(k: number, y: number): number {
  if (y <= 0) return Infinity;
  return k / (y * y);
}

export function calcEffectivePrice(k: number, y: number, f: number, s_hat: number): number {
  const pBase = calcPrice(k, y);
  return pBase * (1 + f) * (1 / Math.max(s_hat, 0.01));
}

export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}
