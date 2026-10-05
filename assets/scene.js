// The Purpose scene on the web: the painted landscape for the visitor's time of day, the sun or tonight's moon, the
// figure on the rock and his energy points, stacked as the app's SceneView draws them. Each layer is its own canvas,
// so only what moves is drawn again: the mist, the stars at night and the points while they light.

import { drawFigure, drawPoints, LIT } from './figure.js';
import { sceneLayout } from './layout.js';
import { createLoop } from './loop.js';
import { driftScroll } from './math.js';
import { clearCanvas, makeCanvas, tinted } from './paint.js';
import { LOOKS, rgba } from './palette.js';
import {
  arcTopClearing, CLOUD_ART, drawClouds, drawMoon, drawSun, moonDisc, moonShows, tintedClouds,
} from './sky.js';
import { drawStars, STARS_BOTTOM } from './stars.js';

const ART = 'assets/art/';
/** Finer than this adds memory, not detail; and no full-screen canvas grows past this many pixels (a large desktop). */
const MAX_PIXEL_RATIO = 2;
const MAX_CANVAS_PIXELS = 8_000_000;
/** How often the mist and the stars are drawn. */
const AMBIENT_FPS = 30;
/** The rows of the plate each painted layer covers, as shares of its height. */
const ROWS = { sky: [0, 0.62], far: [0.56, 1], near: [0.7, 1] };
/** Bands of valley mist over the far ridges and behind the near slopes: the strip, its centre and height (plate
 * heights), the strip's length (plate widths), its drift (plate widths a second) and its strength. */
const MIST = [
  { image: 'mist-1', centerY: 0.615, height: 0.05, tile: 1.6, speed: 0.004, opacity: 0.45 },
  { image: 'mist-2', centerY: 0.66, height: 0.065, tile: 1.9, speed: -0.003, opacity: 0.4 },
  { image: 'mist-1', centerY: 0.705, height: 0.07, tile: 2.2, speed: 0.005, opacity: 0.45 },
];
const MIST_ROWS = [0.59, 0.74];
/** Beside the column on a wide screen: how dark the stretched, blurred sky is, the shadow along the column's edges
 * (its width in points and strength), and how small the sky is drawn to blur it. */
const BACKDROP_DIM = 0.4;
const EDGE_SHADOW = 48;
const EDGE_SHADOW_ALPHA = 0.35;
const BLUR_WIDTH = 24;
/** Room around the figure's canvas, in points. */
const FIGURE_MARGIN = 4;
/** The app's ambient clock counts seconds from 2001, so the mist and the clouds stand where the app has them. */
const REFERENCE_DATE = 978307200;
const BLACK = [0, 0, 0];

const ambientSeconds = () => Date.now() / 1000 - REFERENCE_DATE;

/** An image once loaded, and decoded where the browser can do that ahead of drawing. */
function loadImage(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image.decode().then(() => image, () => image));
    image.onerror = () => reject(new Error(`Scene art ${image.src} could not be loaded`));
    image.src = `${ART}${name}.webp`;
  });
}

const loadAll = (names) => Object.entries(names).map(async ([key, name]) => [key, await loadImage(name)]);

/**
 * The art for the time of day: the plate's three layers, which the scene needs, and what it can do without: the mist,
 * the clouds at dawn, by day and at dusk, and the moon while it is up. Missing extras are reported, not fatal.
 */
async function loadArt(phase, look, hour) {
  const plate = { sky: `plate-${phase}-sky`, far: `plate-${phase}-far`, near: `plate-${phase}-near` };
  const extras = {
    'mist-1': 'mist-1',
    'mist-2': 'mist-2',
    ...(look.cloudShade ? Object.fromEntries(CLOUD_ART.map((name) => [name, name])) : {}),
    ...(look.moon > 0 && moonShows(hour) ? { moon: 'moon' } : {}),
  };
  const [required, optional] = await Promise.all([Promise.all(loadAll(plate)), Promise.allSettled(loadAll(extras))]);
  optional.filter(({ status }) => status === 'rejected').forEach(({ reason }) => globalThis.reportError?.(reason));
  const loaded = optional.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
  return Object.fromEntries([...required, ...loaded]);
}

/** The scene's layers, back to front, in a holder inside `root`. */
function buildLayers(root, withStars) {
  const holder = document.createElement('div');
  holder.className = 'scene__layers';
  const layer = (name, tag = 'canvas') => {
    const element = document.createElement(tag);
    element.className = `scene__${name}`;
    holder.append(element);
    return element;
  };
  const layers = {
    back: layer('back'),
    stars: withStars ? layer('stars') : null,
    mist: layer('mist'),
    near: layer('near'),
    veil: layer('veil', 'div'),
    figure: layer('figure'),
    glow: layer('glow'),
  };
  root.append(holder);
  return layers;
}

/** Sizes `canvas` to cover `rect` (in points) at `ratio` pixels a point; its context then draws in screen points. */
function placeCanvas(canvas, rect, ratio) {
  const left = Math.floor(rect.x);
  const top = Math.floor(rect.y);
  const width = Math.max(1, Math.ceil(rect.x + rect.w) - left);
  const height = Math.max(1, Math.ceil(rect.y + rect.h) - top);
  Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio);
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

const padded = (rect, margin) => ({ x: rect.x - margin, y: rect.y - margin, w: rect.w + 2 * margin, h: rect.h + 2 * margin });

function drawRows(ctx, layout, image, [top, bottom]) {
  const { plate } = layout;
  ctx.drawImage(image, plate.x, plate.y + top * plate.h, plate.w, (bottom - top) * plate.h);
}

/** The sky drawn tiny, halving step by step, to be stretched over the screen as a smooth blur. */
function shrink(image) {
  let source = image;
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  while (width / 2 >= BLUR_WIDTH) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    const step = makeCanvas(width, height);
    step.getContext('2d').drawImage(source, 0, 0, width, height);
    source = step;
  }
  return source;
}

/** Beside the column: the same sky stretched, blurred and dimmed, darkening softly toward the column's edges. */
function drawBackdrop(ctx, layout, blurredSky) {
  const { width, height, plate } = layout;
  ctx.drawImage(blurredSky, 0, 0, width, height);
  ctx.fillStyle = rgba(BLACK, BACKDROP_DIM);
  ctx.fillRect(0, 0, width, height);
  for (const [edge, outward] of [[plate.x, -1], [plate.x + plate.w, 1]]) {
    const shadow = ctx.createLinearGradient(edge, 0, edge + outward * EDGE_SHADOW, 0);
    shadow.addColorStop(0, rgba(BLACK, EDGE_SHADOW_ALPHA));
    shadow.addColorStop(1, rgba(BLACK, 0));
    ctx.fillStyle = shadow;
    ctx.fillRect(Math.min(edge, edge + outward * EDGE_SHADOW), 0, EDGE_SHADOW, height);
  }
}

/** The mist's strips end to end where their drift has taken them at `seconds`, snapped to whole pixels so the joins
 * do not show. */
function drawMist(ctx, layout, strips, seconds) {
  const { plate, width } = layout;
  const ratio = ctx.getTransform().a;
  const snap = (value) => Math.round(value * ratio) / ratio;
  ctx.save();
  for (const band of MIST) {
    const tile = snap(band.tile * plate.w);
    const height = band.height * plate.h;
    const top = plate.y + band.centerY * plate.h - height / 2;
    const first = snap(plate.x + driftScroll(band.speed, seconds, band.tile) * plate.w - tile);
    const count = Math.max(Math.ceil((width - plate.x) / tile), 0) + 1;
    const strip = strips[band.image];
    ctx.globalAlpha = band.opacity;
    for (let index = 0; strip && index < count; index += 1) {
      ctx.drawImage(strip, first + index * tile, top, tile, height);
    }
  }
  ctx.restore();
}

export class Scene {
  /** Opens the scene in `root` for the time of day time.js set on <html>, once its art has loaded. `skyClearance`, if
   * given, says how far down the screen the words over the sky reach, in points: the sun and moon pass below them. */
  static async open(root, { maxPixelRatio = MAX_PIXEL_RATIO, skyClearance = null } = {}) {
    const { dataset } = document.documentElement;
    const phase = LOOKS[dataset.phase] ? dataset.phase : 'day';
    const hour = Number.isFinite(Number(dataset.hour)) ? Number(dataset.hour) : 12;
    const look = LOOKS[phase];
    const art = await loadArt(phase, look, hour);
    return new Scene(root, { look, hour, art, maxPixelRatio, skyClearance });
  }

  constructor(root, { look, hour, art, maxPixelRatio, skyClearance }) {
    this.root = root;
    this.skyClearance = skyClearance;
    this.look = look;
    this.hour = hour;
    this.art = art;
    this.maxPixelRatio = maxPixelRatio;
    this.mist = Object.fromEntries(
      ['mist-1', 'mist-2'].filter((name) => art[name]).map((name) => [name, tinted(art[name], look.mist)]),
    );
    this.clouds = look.cloudShade ? tintedClouds(art, look) : [];
    this.blurredSky = shrink(art.sky);
    this.painter = (ctx, layout) => drawPoints(ctx, layout, LIT);
    this.layers = buildLayers(root, look.stars);
    this.size = '';
    this.ambient = createLoop(() => this.drawAmbient(ambientSeconds()), AMBIENT_FPS);
    this.redraw();
    new ResizeObserver(() => this.redraw()).observe(root);
  }

  /** Lays the scene out for the root's size and draws every layer, unless the size is the same as before. */
  redraw() {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const size = `${width}x${height}`;
    if (!width || !height || size === this.size) return;
    this.size = size;
    const layout = sceneLayout(width, height);
    const fits = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    const ratio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio, fits);
    const screen = { x: 0, y: 0, w: width, h: height };
    this.layout = layout;
    this.arcTop = this.skyClearance ? arcTopClearing(layout, this.skyClearance()) : undefined;
    this.moon = this.art.moon ? moonDisc(layout, this.hour, this.arcTop) : null;
    this.drawBack(placeCanvas(this.layers.back, screen, ratio));
    if (this.layers.stars) placeCanvas(this.layers.stars, layout.rows(0, STARS_BOTTOM), ratio);
    placeCanvas(this.layers.mist, layout.rows(...MIST_ROWS), ratio);
    drawRows(placeCanvas(this.layers.near, layout.rows(...ROWS.near), ratio), layout, this.art.near, ROWS.near);
    const figure = placeCanvas(this.layers.figure, padded(layout.figure, FIGURE_MARGIN), ratio);
    drawFigure(figure, layout.figure, this.look.rim);
    placeCanvas(this.layers.glow, screen, ratio);
    this.drawAmbient(ambientSeconds());
    this.paintGlow(this.painter);
  }

  /** What never moves behind the mist: the sky, its clouds, the moon and the sun, then the far ridges. */
  drawBack(ctx) {
    const { layout, art, look, hour } = this;
    const { plate } = layout;
    if (plate.x > 0) drawBackdrop(ctx, layout, this.blurredSky);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plate.x, plate.y, plate.w, plate.h);
    ctx.clip();
    drawRows(ctx, layout, art.sky, ROWS.sky);
    drawClouds(ctx, layout, this.clouds, ambientSeconds());
    if (art.moon) drawMoon(ctx, layout, hour, art.moon, look.moon, this.arcTop);
    if (look.sun) drawSun(ctx, layout, hour, this.arcTop);
    drawRows(ctx, layout, art.far, ROWS.far);
    ctx.restore();
  }

  /** The stars and the mist at `seconds` on the ambient clock. */
  drawAmbient(seconds) {
    const { layout, layers } = this;
    if (!layout) return;
    if (layers.stars) {
      const stars = layers.stars.getContext('2d');
      clearCanvas(stars);
      drawStars(stars, layout, seconds, this.moon);
    }
    const mist = layers.mist.getContext('2d');
    clearCanvas(mist);
    drawMist(mist, layout, this.mist, seconds);
  }

  /** Paints the glow layer (his points, the light above his head, the motes) with `painter(ctx, layout)`, kept to
   * paint again after a resize. The layer is added to the scene as light. */
  paintGlow(painter) {
    this.painter = painter;
    if (!this.layout) return;
    const ctx = this.layers.glow.getContext('2d');
    clearCanvas(ctx);
    painter(ctx, this.layout);
  }

  /** How dim the landscape is, 0 to 1; the figure and the glow stay above the dimming. */
  setVeil(opacity) {
    this.layers.veil.style.opacity = String(opacity);
  }

  setFigureOpacity(opacity) {
    this.layers.figure.style.opacity = String(opacity);
  }

  /** Fades the layers in over the plain sky that shows while the art loads. */
  show() {
    this.root.classList.add('is-ready');
  }

  startAmbient() {
    this.ambient.start();
  }

  stopAmbient() {
    this.ambient.stop();
  }
}
