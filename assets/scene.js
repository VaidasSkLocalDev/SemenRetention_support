// The Purpose scene on the web: the painted landscape for the visitor's time of day, the sun or tonight's moon, the
// figure on the rock and his energy points, stacked as the app's SceneView draws them. Each layer is its own canvas,
// so only what moves is drawn again: the mist, the stars at night and the points while they light.

import { drawFigure, drawPoints, LIT } from './figure.js';
import { sceneLayout } from './layout.js';
import { createLoop } from './loop.js';
import { driftScroll } from './math.js';
import { clearCanvas, makeCanvas, tinted } from './paint.js';
import { LOOKS } from './palette.js';
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
/** On a wide screen the near slopes' cliffs run on this far past the plate's sides (plate widths), fading out from
 * this share of the way, so the rock in the middle is never repeated. */
const NEAR_REACH = 0.24;
const NEAR_FADE_FROM = 0.4;
/** How far each copy of the painting overlaps the next, in points, so no hairline shows at the joins. */
const JOIN_OVERLAP = 0.5;
/** On a wide screen: how soft the scene beside the plate is drawn (points), and how much of the plate's width each of
 * its sides takes to melt into it. */
const SIDE_BLUR = 6;
const PLATE_FEATHER = 0.14;
/** Room around the figure's canvas, in points. */
const FIGURE_MARGIN = 4;
/** The app's ambient clock counts seconds from 2001, so the mist and the clouds stand where the app has them. */
const REFERENCE_DATE = 978307200;

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

/** `rows` of `image` where the plate stands `index` plate widths over: the plate's own at 0, mirrored at every odd
 * step, so each join meets its own reflection and no seam shows. */
function drawPanel(ctx, layout, image, [top, bottom], index) {
  const { plate } = layout;
  const x = plate.x + index * plate.w - JOIN_OVERLAP;
  const y = plate.y + top * plate.h;
  const width = plate.w + 2 * JOIN_OVERLAP;
  const height = (bottom - top) * plate.h;
  if (index % 2 === 0) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  ctx.save();
  ctx.translate(x + width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, y, width, height);
  ctx.restore();
}

/** `rows` of `image` over the plate and, on a wide screen, on to the screen's sides (owner, 2026-10-21: the plate
 * alone looked like a phone's screen). */
function drawRowsAcross(ctx, layout, image, rows) {
  for (const index of layout.panels()) drawPanel(ctx, layout, image, rows, index);
}

/** Paints `paint(ctx)` over `rect` softly out of focus: sharp on a canvas of its own, a little larger than `rect` so the
 * blur has no edge, then laid over `ctx` blurred once, so no join between the copies in it shows. */
function drawSoft(ctx, rect, paint) {
  const ratio = ctx.getTransform().a;
  const margin = SIDE_BLUR * 3;
  const area = { x: rect.x - margin, y: rect.y - margin, w: rect.w + 2 * margin, h: rect.h + 2 * margin };
  const canvas = makeCanvas(area.w * ratio, area.h * ratio);
  const own = canvas.getContext('2d');
  own.setTransform(ratio, 0, 0, ratio, -area.x * ratio, -area.y * ratio);
  own.imageSmoothingQuality = 'high';
  paint(own, area);
  ctx.save();
  ctx.filter = `blur(${SIDE_BLUR * ratio}px)`;
  ctx.drawImage(canvas, area.x, area.y, area.w, area.h);
  ctx.restore();
}

/** The sky beside the plate: its painted sky stretched sideways across `area`, each row at the plate's own height, so
 * the light changes from the top down as over the plate and no mirrored cloud repeats; softened, its clouds lie in
 * long bands, the one sky. */
function drawWideSky(ctx, layout, image, area) {
  const { plate } = layout;
  const [top, bottom] = ROWS.sky;
  ctx.drawImage(image, area.x, plate.y + top * plate.h, area.w, (bottom - top) * plate.h);
}

/** `layout` with the plate's rows from `top` down starting at a canvas's top left, for drawing the plate alone. */
function plateLocal(layout, top) {
  const { plate } = layout;
  return {
    ...layout,
    plate: { ...plate, x: 0, y: -top * plate.h },
    at: (x, y) => ({ x: x * plate.w, y: (y - top) * plate.h }),
  };
}

/** The plate's rows from `top` to `bottom`, drawn sharp on a canvas of their own by `draw(ctx, local)`, its sides
 * fading out, then laid over `ctx` where the plate stands: it melts into the softer scene beside it. */
function drawFeathered(ctx, layout, [top, bottom], draw) {
  const { plate } = layout;
  const ratio = ctx.getTransform().a;
  const height = (bottom - top) * plate.h;
  const canvas = makeCanvas(plate.w * ratio, height * ratio);
  const own = canvas.getContext('2d');
  own.setTransform(ratio, 0, 0, ratio, 0, 0);
  own.imageSmoothingQuality = 'high';
  draw(own, plateLocal(layout, top));
  const fade = own.createLinearGradient(0, 0, plate.w, 0);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(PLATE_FEATHER, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(1 - PLATE_FEATHER, 'rgba(0, 0, 0, 1)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  own.globalCompositeOperation = 'destination-in';
  own.fillStyle = fade;
  own.fillRect(0, 0, plate.w, height);
  ctx.drawImage(canvas, plate.x, plate.y + top * plate.h, plate.w, height);
}

/** The near slopes: the plate's own, the rock in the middle; on a wide screen over a softer copy of them whose
 * cliffs run a little way past the plate's sides, fading into the valley's mist, so the rock is never repeated. */
function drawNear(ctx, layout, image) {
  const { plate } = layout;
  if (plate.x <= 0) {
    drawPanel(ctx, layout, image, ROWS.near, 0);
    return;
  }
  drawSoft(ctx, layout.rows(...ROWS.near), (soft, area) => {
    [-1, 0, 1].forEach((index) => drawPanel(soft, layout, image, ROWS.near, index));
    for (const side of [-1, 1]) {
      const edge = side < 0 ? plate.x : plate.x + plate.w;
      const fade = soft.createLinearGradient(edge, 0, edge + side * NEAR_REACH * plate.w, 0);
      fade.addColorStop(NEAR_FADE_FROM, 'rgba(0, 0, 0, 0)');
      fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
      soft.save();
      soft.globalCompositeOperation = 'destination-out';
      soft.fillStyle = fade;
      const outer = side < 0 ? area.x : area.x + area.w;
      soft.fillRect(Math.min(edge, outer), area.y, Math.abs(outer - edge), area.h);
      soft.restore();
    }
  });
  drawFeathered(ctx, layout, ROWS.near, (own, local) => drawPanel(own, local, image, ROWS.near, 0));
}

/** `layout` as if the plate stood `index` plate widths over, for what repeats across a wide screen. */
function shifted(layout, index) {
  const plate = { ...layout.plate, x: layout.plate.x + index * layout.plate.w };
  return { ...layout, plate, at: (x, y) => layout.at(x + index, y) };
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
    // From the screen's left edge, which on a wide screen lies past the plate's.
    const drifted = plate.x + driftScroll(band.speed, seconds, band.tile) * plate.w - tile;
    const first = snap(drifted - Math.max(0, Math.ceil(drifted / tile)) * tile);
    const count = Math.max(Math.ceil((width - first) / tile), 0);
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
    drawNear(placeCanvas(this.layers.near, layout.rows(...ROWS.near), ratio), layout, this.art.near);
    const figure = placeCanvas(this.layers.figure, padded(layout.figure, FIGURE_MARGIN), ratio);
    drawFigure(figure, layout.figure, this.look.rim);
    placeCanvas(this.layers.glow, screen, ratio);
    this.drawAmbient(ambientSeconds());
    this.paintGlow(this.painter);
  }

  /** What never moves behind the mist: the sky, its clouds, the moon and the sun, then the far ridges. On a wide screen
   * they run on to the sides softly out of focus, so their mirrored copies don't read as such, and the plate's own,
   * sharp, melts into them (owner, 2026-10-21: the plate alone looked like a phone's screen). */
  drawBack(ctx) {
    const { layout, art, look, hour } = this;
    if (layout.plate.x <= 0) {
      this.drawPlateBack(ctx, layout);
      return;
    }
    drawSoft(ctx, { x: 0, y: 0, w: layout.width, h: layout.height }, (soft, area) => {
      drawWideSky(soft, layout, art.sky, area);
      layout.panels().forEach((index) => drawClouds(soft, shifted(layout, index), this.clouds, ambientSeconds()));
      if (look.sun) drawSun(soft, layout, hour, this.arcTop);
      drawRowsAcross(soft, layout, art.far, ROWS.far);
    });
    drawFeathered(ctx, layout, [0, 1], (own, local) => this.drawPlateBack(own, local));
  }

  /** The plate's own sky, its clouds, the moon and the sun, then the far ridges. */
  drawPlateBack(ctx, layout) {
    const { art, look, hour } = this;
    drawPanel(ctx, layout, art.sky, ROWS.sky, 0);
    drawClouds(ctx, layout, this.clouds, ambientSeconds());
    if (art.moon) drawMoon(ctx, layout, hour, art.moon, look.moon, this.arcTop);
    if (look.sun) drawSun(ctx, layout, hour, this.arcTop);
    drawPanel(ctx, layout, art.far, ROWS.far, 0);
  }

  /** The stars and the mist at `seconds` on the ambient clock. */
  drawAmbient(seconds) {
    const { layout, layers } = this;
    if (!layout) return;
    if (layers.stars) {
      const stars = layers.stars.getContext('2d');
      clearCanvas(stars);
      layout.panels().forEach((index) => drawStars(stars, shifted(layout, index), seconds, this.moon));
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
