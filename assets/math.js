// Small numeric helpers shared by the scene, ported from the app (MoteJourney.smoothstep, Drift).

export const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export const lerp = (from, to, amount) => from + (to - from) * amount;

/** 0 up to 0, 1 from 1, easing in and out between. */
export function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

const wrapped = (value, length) => ((value % length) + length) % length;

/** The left edge of something `width` wide that started at `start` and drifts across `span`, wrapping around. */
export function driftLeftEdge(start, speed, time, span, width) {
  return wrapped(start + width + speed * time, span + width) - width;
}

/** How far a pattern repeating every `tile` has scrolled at `time`, 0 up to `tile`. */
export const driftScroll = (speed, time, tile) => wrapped(speed * time, tile);
