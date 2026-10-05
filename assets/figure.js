// The figure on the rock and his seven energy points, ported from the app's FigureGeometry, FigureView,
// PointsRenderer, GlowDrawing and PromiseLight.

import { FIGURE_OUTLINE } from './figure-outline.js';
import { lerp } from './math.js';
import { addGlow, makeCanvas, paintSoft } from './paint.js';
import { COLOR, rgba } from './palette.js';

const HEIGHT_PER_WIDTH = 2360 / 2150;

/**
 * His height over his width; the seven points on the spine, base first, and the light above the head, as shares of
 * his height down from the top of the head; a point's radius, 3% of his width, as a share of his height.
 */
export const FIGURE = {
  heightPerWidth: HEIGHT_PER_WIDTH,
  pointY: [0.86, 0.73, 0.6, 0.47, 0.33, 0.2, 0.07],
  haloY: -0.06,
  pointRadius: 0.03 / HEIGHT_PER_WIDTH,
};

/** All seven lit and the light above the head steady, as the scene settles. */
export const LIT = { levels: FIGURE.pointY.map(() => 1), crown: 1 };

/** Rim width and blur as shares of his width, its strength, and where down him it has faded to a tenth. */
const RIM_WIDTH = 0.006;
const RIM_BLUR = 0.0035;
const RIM_OPACITY = 0.55;
const RIM_FADE_END = 0.7;
const RIM_FADED = 0.1;

/** The outline drawn in `rect`; fill it with the even-odd rule. */
export function figurePath(rect) {
  const x = (u) => rect.x + u * rect.w;
  const y = (v) => rect.y + v * rect.h;
  const path = new Path2D();
  for (const sub of FIGURE_OUTLINE) {
    path.moveTo(x(sub[0]), y(sub[1]));
    for (let i = 2; i < sub.length; i += 6) {
      path.bezierCurveTo(x(sub[i]), y(sub[i + 1]), x(sub[i + 2]), y(sub[i + 3]), x(sub[i + 4]), y(sub[i + 5]));
    }
    path.closePath();
  }
  return path;
}

/** The outline as closed polylines in unit coordinates, each curve cut into `steps` straight pieces. */
export function outlinePolylines(steps = 8) {
  return FIGURE_OUTLINE.map((sub) => {
    const points = [[sub[0], sub[1]]];
    for (let i = 2; i < sub.length; i += 6) {
      const [x0, y0] = points[points.length - 1];
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        points.push([
          a * x0 + b * sub[i] + c * sub[i + 2] + d * sub[i + 4],
          a * y0 + b * sub[i + 1] + c * sub[i + 3] + d * sub[i + 5],
        ]);
      }
    }
    return points;
  });
}

/**
 * The still figure: a dark silhouette rimmed with the sky's light, strongest on the head and shoulders and fading
 * toward the seat. `rim` is cool at night, warm otherwise.
 */
export function drawFigure(ctx, rect, rim) {
  const path = figurePath(rect);
  ctx.fillStyle = rgba(COLOR.figure);
  ctx.fill(path, 'evenodd');

  const light = makeCanvas(ctx.canvas.width, ctx.canvas.height);
  const g = light.getContext('2d');
  g.setTransform(ctx.getTransform());
  paintSoft(g, RIM_BLUR * rect.w, (c) => {
    c.strokeStyle = rgba(rim);
    c.lineWidth = 2 * RIM_WIDTH * rect.w;
    c.stroke(path);
  });
  g.globalCompositeOperation = 'destination-in';
  g.fill(path, 'evenodd');
  const fade = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  fade.addColorStop(0, rgba(COLOR.white));
  fade.addColorStop(RIM_FADE_END, rgba(COLOR.white, RIM_FADED));
  fade.addColorStop(1, rgba(COLOR.white, RIM_FADED));
  g.fillStyle = fade;
  g.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = RIM_OPACITY;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(light, 0, 0);
  ctx.restore();
}

/** A lit point: a wide ember halo, a bright orange core and a white-hot centre. `swell` widens the halo. */
function addLitPoint(ctx, x, y, radius, swell, level) {
  addGlow(ctx, x, y, radius * (1.9 + 0.8 * swell), COLOR.emberGlow, (0.55 + 0.45 * swell) * level);
  addGlow(ctx, x, y, radius * 0.95, COLOR.emberBright, level);
  addGlow(ctx, x, y, radius * (0.4 + 0.15 * swell), COLOR.emberCore, level);
}

/** An unlit point: a soft translucent ring set into the body. */
function drawEmptyRing(ctx, x, y, radius, alpha) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = rgba(COLOR.emptyRing, 0.08 * alpha);
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.14);
  ctx.strokeStyle = rgba(COLOR.emptyRing, 0.5 * alpha);
  ctx.stroke();
}

/**
 * The points as lit as `levels` says (0 to 1 each, base first), each unlit share showing its ring at `rings`; the
 * halo swelling by `swell` as the promise is made; and the light above the head at `crown`, as the promise has it
 * while `bloom` is 1 and settling to its steady look as `bloom` falls to 0.
 */
export function drawPoints(ctx, layout, { levels, swell = 0, crown = 0, bloom = 0, rings = 1 }) {
  const radius = layout.pointRadius;
  FIGURE.pointY.forEach((share, index) => {
    const { x, y } = layout.spine(share);
    const level = levels[index];
    if (rings * (1 - level) > 0.001) drawEmptyRing(ctx, x, y, radius, rings * (1 - level));
    if (level > 0.001) addLitPoint(ctx, x, y, radius, swell, level);
  });
  if (crown <= 0.001) return;
  const { x, y } = layout.spine(FIGURE.haloY);
  addGlow(ctx, x, y, radius * lerp(2.4, 3.9, bloom), COLOR.emberGlow, lerp(0.2, 0.35, bloom) * crown);
  addGlow(ctx, x, y, radius * lerp(0.9, 1.5, bloom), COLOR.emberCore, lerp(0.35, 0.6, bloom) * crown);
}
