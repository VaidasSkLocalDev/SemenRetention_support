// The sun, tonight's moon and the clouds, ported from the app's SkyLayout, SunView, MoonView, MoonPhaseShape,
// MoonDisc and CloudsLayer. Without a location the sun keeps a mid-latitude equinox day by the visitor's clock, and the
// moon, in tonight's real phase, crosses the night sky once the sun has gone.

import { PLATE } from './layout.js';
import { clamp, driftLeftEdge } from './math.js';
import { addGlow, makeCanvas, paintSoft, tinted } from './paint.js';
import { COLOR, mixColor, rgba } from './palette.js';

/** The horizon behind the far ridges and the top of the bodies' arc, as shares of the plate's height. */
export const HORIZON_Y = 0.585;
const ARC_TOP_Y = 0.35;
/** Lowered to clear the words over the sky, the arc's top goes no lower than this, and keeps this much room below
 * them (shares of the plate's height). */
const LOWEST_ARC_TOP = 0.45;
const CLEARANCE_GAP = 0.015;
/** The share of the plate's width the arc spans, centred, and how far below the horizon a set body is still drawn,
 * as a share of the horizon-to-top height. */
const PATH_WIDTH = 0.7;
const LOWEST_DEPTH = 0.4;
/** The moon's diameter and the sun's whole glow as shares of the plate's width; the moon's radius as a share of its
 * height. */
const MOON_DIAMETER = 0.14;
const SUN_DIAMETER = 1.2;
const DISC_RADIUS = (MOON_DIAMETER / 2) * (PLATE.width / PLATE.height);

/** Local hours: the sun's centre crosses the horizon at sunrise and sunset; the moon rises once the sun has gone and
 * sets before it is back (hours past midnight count on from 24), so only one of them is up at a time. */
const SUNRISE = 6;
const SUNSET = 19.5;
const MOONRISE = 20;
const MOONSET = 29.5;
/** The sun's noon height in degrees, and the height below which its light warms. */
const SUN_PEAK = 50;
const WARMING_ALTITUDE = 15;

/** How strongly the moon's shadowed side shows and how much darker it is; the terminator's blur as a share of the
 * diameter. */
const SHADOW_SIDE = 0.2;
const SHADOW_DARKENING = 0.5;
const TERMINATOR_SOFTNESS = 0.05;
const TERMINATOR_STEPS = 48;
/** The mean lunation in days and a known new moon, 2000-01-06 18:14 UTC. */
const SYNODIC_MONTH = 29.530588853;
const REFERENCE_NEW_MOON = 947182440000;
const DAY_MS = 86400000;

/** Three wispy clouds low in the open sky: their width (plate widths), centre (plate heights), where their left edge
 * started and how fast they drift (plate widths, plate widths a second). The page draws them where they are now. */
const CLOUDS = [
  { number: 2, width: 0.28, centerY: 0.395, start: 0, speed: 0.13 / 60 },
  { number: 4, width: 0.25, centerY: 0.455, start: 0.45, speed: 0.115 / 60 },
  { number: 3, width: 0.23, centerY: 0.425, start: 0.9, speed: 0.125 / 60 },
];
const CLOUD_OPACITY = 0.85;
export const CLOUD_ART = CLOUDS.flatMap(({ number }) => [`cloud-${number}`, `cloud-${number}-light`]);

/** A body `progress` along its way (0 rising, 1 setting) as shares of the plate; `height` is 1 at the arc's top and
 * negative below the horizon. */
function arcPoint(progress, arcTop) {
  const height = clamp(Math.sin(Math.PI * clamp(progress, -0.5, 1.5)), -LOWEST_DEPTH, 1);
  return {
    x: 0.5 + (clamp(progress, 0, 1) - 0.5) * PATH_WIDTH,
    y: HORIZON_Y - (HORIZON_Y - arcTop) * height,
    height,
  };
}

const sunPlacement = (hour, arcTop) => arcPoint((hour - SUNRISE) / (SUNSET - SUNRISE), arcTop);
const moonPlacement = (hour, arcTop) =>
  arcPoint(((hour < 12 ? hour + 24 : hour) - MOONRISE) / (MOONSET - MOONRISE), arcTop);

/** The top of the arc, as a share of the plate's height, for words over the sky reaching `clearance` points down the
 * screen: the standard arc, lowered only as far as the sun's and moon's discs need to pass below them. */
export function arcTopClearing(layout, clearance) {
  const clear = (clearance - layout.plate.y) / layout.plate.h + DISC_RADIUS + CLEARANCE_GAP;
  return clamp(clear, ARC_TOP_Y, LOWEST_ARC_TOP);
}

/** Whether the moon shows above the ridges at `hour`, if only its top. */
export const moonShows = (hour) => moonPlacement(hour, ARC_TOP_Y).y - DISC_RADIUS < HORIZON_Y;

/** The moon's disc on the screen: its centre and radius. */
export function moonDisc(layout, hour, arcTop = ARC_TOP_Y) {
  const place = moonPlacement(hour, arcTop);
  return { ...layout.at(place.x, place.y), r: (layout.plate.w * MOON_DIAMETER) / 2 };
}

/** Tonight's phase: the lit share, 0 new to 1 full, and where the terminator crosses the equator, from -1 (left limb)
 * to 1 (right limb). A waxing moon is lit on the right. */
function moonPhase(now) {
  const days = (now - REFERENCE_NEW_MOON) / DAY_MS;
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2;
  const waxing = age < SYNODIC_MONTH / 2;
  return { lit, waxing, terminatorX: waxing ? 1 - 2 * lit : 2 * lit - 1 };
}

/** The sun as added light: a wide bloom, warmer near the horizon, a bright halo and a white core. */
export function drawSun(ctx, layout, hour, arcTop = ARC_TOP_Y) {
  const sun = sunPlacement(hour, arcTop);
  const { x, y } = layout.at(sun.x, sun.y);
  const radius = (layout.plate.w * SUN_DIAMETER) / 2;
  const warmth = clamp(1 - (sun.height * SUN_PEAK) / WARMING_ALTITUDE, 0, 1);
  addGlow(ctx, x, y, radius * 0.33, mixColor(COLOR.sunHigh, COLOR.sunLow, warmth), 0.55);
  addGlow(ctx, x, y, radius * 0.15, COLOR.sunHigh, 0.9);
  addGlow(ctx, x, y, radius * 0.067, COLOR.white, 1);
}

/** The lit part of a disc `size` across: the limb a half circle, the terminator a half ellipse. */
function phasePath(size, { waxing, terminatorX }) {
  const r = size / 2;
  const limb = waxing ? 1 : -1;
  const path = new Path2D();
  path.moveTo(r, 0);
  for (let step = 0; step <= TERMINATOR_STEPS; step += 1) {
    const y = -1 + (2 * step) / TERMINATOR_STEPS;
    path.lineTo(r + limb * Math.sqrt(1 - y * y) * r, r + y * r);
  }
  for (let step = 0; step <= TERMINATOR_STEPS; step += 1) {
    const y = 1 - (2 * step) / TERMINATOR_STEPS;
    path.lineTo(r + terminatorX * Math.sqrt(1 - y * y) * r, r + y * r);
  }
  path.closePath();
  return path;
}

function keepDisc(ctx, size) {
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** The photograph darkened for the shadowed side, and masked to tonight's phase with a soft terminator. */
function moonSides(image, size, phase) {
  const shadow = makeCanvas(size, size);
  const dark = shadow.getContext('2d');
  dark.drawImage(image, 0, 0, size, size);
  dark.globalCompositeOperation = 'source-atop';
  dark.fillStyle = rgba([0, 0, 0], SHADOW_DARKENING);
  dark.fillRect(0, 0, size, size);
  keepDisc(dark, size);

  const lit = makeCanvas(size, size);
  const light = lit.getContext('2d');
  paintSoft(light, size * TERMINATOR_SOFTNESS, (c) => {
    c.fillStyle = rgba(COLOR.white);
    c.fill(phasePath(size, phase));
  });
  light.globalCompositeOperation = 'source-in';
  light.drawImage(image, 0, 0, size, size);
  keepDisc(light, size);
  return { shadow, lit };
}

/** Tonight's moon: a halo growing with its light, the shadowed side faintly darker than the sky, and the lit side
 * screened onto the sky. `brightness` is 1 at night, paler in twilight. */
export function drawMoon(ctx, layout, hour, image, brightness, arcTop = ARC_TOP_Y) {
  const { x, y, r } = moonDisc(layout, hour, arcTop);
  const phase = moonPhase(Date.now());
  addGlow(ctx, x, y, 2 * r * 0.42, COLOR.moonHalo, (0.06 + 0.2 * phase.lit) * brightness);
  const matrix = ctx.getTransform();
  const sides = moonSides(image, Math.ceil(2 * r * Math.hypot(matrix.a, matrix.b)), phase);
  ctx.save();
  ctx.globalAlpha = SHADOW_SIDE * brightness;
  ctx.drawImage(sides.shadow, x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = brightness;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(sides.lit, x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
}

/** The clouds whose art loaded, each body tinted the time of day's shade and its lit parts its light, once. */
export function tintedClouds(art, look) {
  return CLOUDS.filter(({ number }) => art[`cloud-${number}`] && art[`cloud-${number}-light`]).map((cloud) => ({
    cloud,
    shade: tinted(art[`cloud-${cloud.number}`], look.cloudShade),
    light: tinted(art[`cloud-${cloud.number}-light`], look.cloudLight),
  }));
}

/** The clouds where their drift has taken them at `seconds`, each body with its lit parts over it. */
export function drawClouds(ctx, layout, clouds, seconds) {
  const { plate } = layout;
  ctx.save();
  ctx.globalAlpha = CLOUD_OPACITY;
  for (const { cloud, shade, light } of clouds) {
    const width = cloud.width * plate.w;
    const height = (width * shade.height) / shade.width;
    const left = plate.x + driftLeftEdge(cloud.start, cloud.speed, seconds, 1, cloud.width) * plate.w;
    const top = plate.y + cloud.centerY * plate.h - height / 2;
    ctx.drawImage(shade, left, top, width, height);
    ctx.drawImage(light, left, top, width, height);
  }
  ctx.restore();
}
