// The home page's opening: a few hundred glowing motes drift in from the edges of the screen along gentle curves and
// gather into the figure on the rock, his outline first so his shape reads. The dark figure comes beneath them as they
// melt into him, then his seven points light one by one, base to crown, and glow together with the light above his
// head, as the app's promise does (PromiseLight), and settle lit.

import { drawPoints, figurePath, FIGURE, LIT, outlinePolylines } from './figure.js';
import { createLoop } from './loop.js';
import { lerp, smoothstep } from './math.js';
import { addGlow, makeCanvas } from './paint.js';
import { COLOR, rgba } from './palette.js';

/** When each part plays, in seconds from the start. */
const TIMING = {
  veil: 0.42, // how dim the landscape starts
  veilEnd: 2.8, // and when it is fully bright
  outlineDelay: [0, 0.45], // when the outline's motes set off
  bodyDelay: [0.15, 0.75], // and the body's
  flight: [1.05, 1.5], // how long a mote takes to arrive
  figure: [2.35, 3.05], // the figure fades in beneath them
  melt: [2.55, 3.3], // the motes shrink and melt into him
  points: 3.0, // the base point begins to light
  pointStep: 0.12, // each next point begins this much later
  pointLight: 0.25, // and takes this long
  swellRise: 0.2, // the halo swells as the promise is made
  glow: 1.2, // all seven glow together, then settle
  crownRise: 0.4, // the light above his head comes
  reveal: 4.3, // the words and the links fade in
};
const PROMISED = TIMING.points + (FIGURE.pointY.length - 1) * TIMING.pointStep + TIMING.pointLight;
const END = PROMISED + TIMING.glow;

/** How many motes, fewer on a small screen, and the share of them that draws his outline. */
const MOTES_SMALL_SCREEN = 280;
const MOTES_LARGE_SCREEN = 420;
const SMALL_SCREEN = 640;
const OUTLINE_SHARE = 0.5;
/** A mote's size against the app's single mote (MoteDrawing): hundreds of them gather, so each is smaller. */
const MOTE_SCALE = 0.5;
/** How far a path bends either way, a share of its length; how far a mote sways in flight, plate widths. */
const BEND = 0.3;
const SWAY = 0.012;
/** The share of its flight over which a mote brightens, as it leaves the edge. */
const FADE_IN = 0.15;
/** The short fading trail behind a mote in flight: how far behind (seconds), how bright and how small. */
const TRAIL = [[0.06, 0.45], [0.12, 0.2]];
const TRAIL_SIZE = 0.6;
/** The figure is sampled at this size to scatter the motes inside him. */
const SAMPLE_WIDTH = 1000;
const AREA_TRIALS = 600;

/** `count` points spread evenly along his outline (the gaps between arms and body too), in his unit coordinates. */
function outlinePoints(count) {
  const segments = outlinePolylines().flatMap((line) => line.slice(1).map((point, index) => [line[index], point]));
  const lengthOf = ([a, b]) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * FIGURE.heightPerWidth);
  const spacing = segments.reduce((sum, segment) => sum + lengthOf(segment), 0) / count;
  const points = [];
  let along = Math.random() * spacing;
  for (const segment of segments) {
    const length = lengthOf(segment);
    for (; along < length && points.length < count; along += spacing) {
      const t = along / length;
      points.push([lerp(segment[0][0], segment[1][0], t), lerp(segment[0][1], segment[1][1], t)]);
    }
    along -= length;
  }
  return points;
}

/** About `count` points scattered evenly inside him (one in each cell of a jittered grid), in his unit coordinates. */
function bodyPoints(count) {
  const rect = { x: 0, y: 0, w: SAMPLE_WIDTH, h: SAMPLE_WIDTH * FIGURE.heightPerWidth };
  const path = figurePath(rect);
  const probe = makeCanvas(1, 1).getContext('2d');
  const inside = (x, y) => probe.isPointInPath(path, x, y, 'evenodd');
  const trials = Array.from({ length: AREA_TRIALS }, () => inside(Math.random() * rect.w, Math.random() * rect.h));
  const area = (rect.w * rect.h * trials.filter(Boolean).length) / AREA_TRIALS;
  const cell = Math.sqrt(area / count);
  const points = [];
  for (let y = 0; y < rect.h; y += cell) {
    for (let x = 0; x < rect.w; x += cell) {
      const px = x + Math.random() * cell;
      const py = y + Math.random() * cell;
      if (inside(px, py)) points.push([px / rect.w, py / rect.h]);
    }
  }
  return points;
}

/** A point on the edge of a `width` × `height` screen, `share` of the way round it, as shares of its size. */
function edgePoint(share, width, height) {
  const distance = share * 2 * (width + height);
  if (distance < width) return [distance / width, 0];
  if (distance < width + height) return [1, (distance - width) / height];
  if (distance < 2 * width + height) return [1 - (distance - width - height) / width, 1];
  return [0, 1 - (distance - 2 * width - height) / height];
}

function makeMotes(layout) {
  const count = layout.width < SMALL_SCREEN ? MOTES_SMALL_SCREEN : MOTES_LARGE_SCREEN;
  const outline = Math.round(count * OUTLINE_SHARE);
  const settles = [
    ...outlinePoints(outline).map((target) => [target, TIMING.outlineDelay]),
    ...bodyPoints(count - outline).map((target) => [target, TIMING.bodyDelay]),
  ];
  return settles.map(([target, [early, late]]) => ({
    target,
    start: edgePoint(Math.random(), layout.width, layout.height),
    delay: lerp(early, late, Math.random()),
    flight: lerp(TIMING.flight[0], TIMING.flight[1], Math.random()),
    bend: (Math.random() * 2 - 1) * BEND,
    size: 0.75 + 0.5 * Math.random(),
    phase: Math.random() * Math.PI * 2,
  }));
}

/** Where a mote is at `time`, on the screen, and how far along its flight, 0 to 1, eased. */
function moteAt(mote, layout, time) {
  const s = smoothstep((time - mote.delay) / mote.flight);
  const { figure } = layout;
  const sx = mote.start[0] * layout.width;
  const sy = mote.start[1] * layout.height;
  const tx = figure.x + mote.target[0] * figure.w;
  const ty = figure.y + mote.target[1] * figure.h;
  const cx = (sx + tx) / 2 - (ty - sy) * mote.bend;
  const cy = (sy + ty) / 2 + (tx - sx) * mote.bend;
  const u = 1 - s;
  const sway = SWAY * layout.plate.w * u;
  return {
    x: u * u * sx + 2 * u * s * cx + s * s * tx + sway * Math.sin(2.3 * time + mote.phase),
    y: u * u * sy + 2 * u * s * cy + s * s * ty + sway * Math.cos(1.9 * time + mote.phase),
    s,
  };
}

/** The motes pre-drawn once, as hundreds of glows a frame would be slow: the firefly's gold glow with a white-hot
 * centre, or the sun sparkle's warm-white speck with its glint, a thin cross of light that twinkles. */
function moteSprites(kind, plateWidth, ratio) {
  const unit = MOTE_SCALE * plateWidth;
  const firefly = kind === 'firefly';
  const sigma = (firefly ? 0.013 : 0.011) * unit;
  const extent = 3 * sigma;
  const pixels = Math.ceil(2 * extent * ratio);
  const sprite = () => {
    const canvas = makeCanvas(pixels, pixels);
    const ctx = canvas.getContext('2d');
    ctx.scale(pixels / (2 * extent), pixels / (2 * extent));
    return [canvas, ctx];
  };
  const [speck, s] = sprite();
  if (firefly) {
    addGlow(s, extent, extent, sigma, COLOR.liquid, 0.38);
    addGlow(s, extent, extent, 0.0037 * unit, COLOR.emberCore, 1.1);
    return { speck, glint: null, extent };
  }
  addGlow(s, extent, extent, sigma, COLOR.sparkleGlow, 0.45);
  addGlow(s, extent, extent, 0.0033 * unit, COLOR.emberCore, 1.4);
  const [glint, g] = sprite();
  const reach = 0.018 * unit;
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.75 / ratio, 0.0022 * unit);
  for (const [dx, dy] of [[reach, 0], [0, reach]]) {
    const arm = g.createLinearGradient(extent - dx, extent - dy, extent + dx, extent + dy);
    arm.addColorStop(0, rgba(COLOR.emberCore, 0));
    arm.addColorStop(0.5, rgba(COLOR.emberCore, 0.9));
    arm.addColorStop(1, rgba(COLOR.emberCore, 0));
    g.strokeStyle = arm;
    g.beginPath();
    g.moveTo(extent - dx, extent - dy);
    g.lineTo(extent + dx, extent + dy);
    g.stroke();
  }
  return { speck, glint, extent };
}

function stamp(ctx, sprite, extent, { x, y }, size, alpha) {
  if (alpha <= 0.005) return;
  const half = extent * size;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - half, y - half, 2 * half, 2 * half);
}

function drawMotes(ctx, layout, motes, sprites, time) {
  const melt = smoothstep((time - TIMING.melt[0]) / (TIMING.melt[1] - TIMING.melt[0]));
  if (melt >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const mote of motes) {
    if (time < mote.delay) continue;
    const head = moteAt(mote, layout, time);
    const arrived = head.s >= 1;
    const flicker = arrived ? 0.8 + 0.2 * Math.sin(4 * time + mote.phase) : 0.85 + 0.15 * Math.sin(3.9 * time + mote.phase);
    const shine = smoothstep(head.s / FADE_IN) * (1 - melt) * flicker;
    const size = mote.size * (1 - 0.6 * melt);
    stamp(ctx, sprites.speck, sprites.extent, head, size, shine);
    if (sprites.glint) {
      stamp(ctx, sprites.glint, sprites.extent, head, size, shine * (0.7 + 0.3 * Math.sin(5 * time + mote.phase)));
    }
    if (arrived) continue;
    for (const [behind, strength] of TRAIL) {
      if (time - behind < mote.delay) continue;
      stamp(ctx, sprites.speck, sprites.extent, moteAt(mote, layout, time - behind), size * TRAIL_SIZE, shine * strength);
    }
  }
  ctx.restore();
}

/** How lit each point is at `time`: in turn, base first. */
const pointLevels = (time) =>
  FIGURE.pointY.map((_, index) => smoothstep((time - TIMING.points - index * TIMING.pointStep) / TIMING.pointLight));

/** Once all seven are lit: the halo's swell, the light above his head, and the bloom settling over a moment. */
function promiseLight(time) {
  const since = time - PROMISED;
  if (since <= 0) return { swell: 0, crown: 0, bloom: 0 };
  const bloom = 1 - smoothstep(since / TIMING.glow);
  return { swell: smoothstep(since / TIMING.swellRise) * bloom, crown: smoothstep(since / TIMING.crownRise), bloom };
}

/** Plays the opening on `scene`, calling `onReveal` when the words should come; resolves once he has settled lit. */
export function playGather(scene, onReveal) {
  const motes = makeMotes(scene.layout);
  const kind = scene.look.mote;
  let sprites = null;
  let spritesKey = '';
  const spritesFor = (ctx, layout) => {
    const ratio = ctx.getTransform().a;
    const key = `${layout.plate.w}@${ratio}`;
    if (key !== spritesKey) {
      sprites = moteSprites(kind, layout.plate.w, ratio);
      spritesKey = key;
    }
    return sprites;
  };

  const render = (time) => {
    const figure = smoothstep((time - TIMING.figure[0]) / (TIMING.figure[1] - TIMING.figure[0]));
    const levels = pointLevels(time);
    const promise = promiseLight(time);
    scene.setVeil(TIMING.veil * (1 - smoothstep(time / TIMING.veilEnd)));
    scene.setFigureOpacity(figure);
    scene.paintGlow((ctx, layout) => {
      drawPoints(ctx, layout, { levels, ...promise, rings: figure });
      drawMotes(ctx, layout, motes, spritesFor(ctx, layout), time);
    });
  };

  return new Promise((resolve) => {
    let time = 0;
    let revealed = false;
    const loop = createLoop((step) => {
      time += step;
      if (!revealed && time >= TIMING.reveal) {
        revealed = true;
        onReveal();
      }
      if (time < END) {
        render(time);
        return;
      }
      loop.stop();
      scene.setVeil(0);
      scene.setFigureOpacity(1);
      scene.paintGlow((ctx, layout) => drawPoints(ctx, layout, LIT));
      resolve();
    });
    render(0);
    scene.show();
    loop.start();
  });
}
