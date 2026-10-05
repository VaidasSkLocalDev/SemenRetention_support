// Drawing helpers shared by every layer of the scene, ported from the app's GlowDrawing and its tinted art.

import { rgba } from './palette.js';

const GLOW_STOPS = 12;

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function clearCanvas(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** Adds a soft glow to what is drawn: `amplitude · exp(-(d/σ)²)` of `color`, out to 3σ, added as light. */
export function addGlow(ctx, x, y, sigma, color, amplitude) {
  if (sigma <= 0 || amplitude <= 0) return;
  const extent = sigma * 3;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, extent);
  for (let step = 0; step <= GLOW_STOPS; step += 1) {
    const t = step / GLOW_STOPS;
    gradient.addColorStop(t, rgba(color, Math.min(1, amplitude * Math.exp(-9 * t * t))));
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, extent, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws what `paint` draws, softened by about `sigma` (in the context's units): painted small, one pixel to about σ,
 * then stretched back with smoothing, which every browser does alike (unlike `ctx.filter`).
 */
export function paintSoft(ctx, sigma, paint) {
  const matrix = ctx.getTransform();
  const shrink = Math.min(1, 1 / (sigma * Math.hypot(matrix.a, matrix.b)));
  const { width, height } = ctx.canvas;
  const small = makeCanvas(width * shrink, height * shrink);
  const smallCtx = small.getContext('2d');
  smallCtx.setTransform(
    matrix.a * shrink, matrix.b * shrink, matrix.c * shrink, matrix.d * shrink, matrix.e * shrink, matrix.f * shrink,
  );
  paint(smallCtx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width * shrink, height * shrink, 0, 0, width, height);
  ctx.restore();
}

/** White art with alpha (the mist and the clouds) tinted `color`, as the app draws its template images. */
export function tinted(image, color) {
  const canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = rgba(color);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
