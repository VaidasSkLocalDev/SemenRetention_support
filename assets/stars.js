// The night's twinkling stars, ported from the app's StarField, StarsDrawing and StableRandom: scattered from the
// same seed, so the website's night sky is the app's. Most are faint and a few bright; they crowd the top of the sky
// and fade into the glow above the horizon.

import { addGlow } from './paint.js';
import { COLOR, rgba } from './palette.js';
import { HORIZON_Y } from './sky.js';

const COUNT = 150;
const SEED = 0x5eed57a2n;
const PICKS_PER_STAR = 8;
/** How far below its brightness a star dims at the bottom of its twinkle. */
const TWINKLE_DEPTH = 0.35;
/** The lowest a star sits, just above the far ridges, and the height above that over which stars fade out. */
const LOWEST = HORIZON_Y - 0.02;
const HORIZON_FADE = 0.12;
/** Above 1 crowds the stars toward the top of the sky. */
const CROWDING = 2;
/** Stars at least this big (a share of the plate's width) get a soft halo. */
const HALO_FROM = 0.0026;
/** How far past the moon's edge stars stay hidden, for its soft rim. */
const MOON_COVER = 1.08;

/** The bottom of the starry sky, as a share of the plate's height. */
export const STARS_BOTTOM = LOWEST;

const U64 = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;

/** The SplitMix64 finalizer: every input bit affects every output bit. */
function mix(value) {
  const first = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & U64;
  const second = ((first ^ (first >> 27n)) * 0x94d049bb133111ebn) & U64;
  return second ^ (second >> 31n);
}

/** A value in 0 up to 1, the `index`th of the sequence for `seed`: the same on every device. */
function unit(seed, index) {
  const mixed = mix((mix(seed) + BigInt.asUintN(64, BigInt(index)) * GOLDEN) & U64);
  return Number(mixed >> 11n) / 2 ** 53;
}

/** One star in twenty is bright, a quarter are middling and the rest are faint. */
function size(kind, first, second) {
  if (kind < 0.05) return [0.0026 + 0.001 * first, 0.86 + 0.14 * second];
  if (kind < 0.3) return [0.0016 + 0.001 * first, 0.6 + 0.24 * second];
  return [0.001 + 0.0006 * first, 0.35 + 0.3 * second];
}

const STARS = Array.from({ length: COUNT }, (_, index) => {
  const pick = (n) => unit(SEED, index * PICKS_PER_STAR + n);
  const [radius, brightness] = size(pick(0), pick(1), pick(2));
  return {
    x: pick(3),
    y: LOWEST * pick(4) ** CROWDING,
    radius,
    brightness,
    period: 2 + 4 * pick(5),
    phase: 2 * Math.PI * pick(6),
  };
});

/** How bright a star shines at `seconds`: a slow, gentle twinkle, fading out near the horizon. */
function shine(star, seconds) {
  const wave = 0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / star.period + star.phase);
  const height = Math.min(Math.max((LOWEST - star.y) / HORIZON_FADE, 0), 1);
  return star.brightness * (1 - TWINKLE_DEPTH * wave) * height;
}

/** The stars at `seconds`; those behind the moon's disc, if there is one, stay hidden. */
export function drawStars(ctx, layout, seconds, moon) {
  for (const star of STARS) {
    const { x, y } = layout.at(star.x, star.y);
    if (moon && Math.hypot(x - moon.x, y - moon.y) < moon.r * MOON_COVER) continue;
    const light = shine(star, seconds);
    if (light <= 0) continue;
    const radius = star.radius * layout.plate.w;
    ctx.fillStyle = rgba(COLOR.starlight, light);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (star.radius >= HALO_FROM) addGlow(ctx, x, y, radius * 2.2, COLOR.starlight, 0.35 * light);
  }
}
