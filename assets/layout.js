// Where the plate, the figure and his points sit on the screen, as the app's PlateFrame and SceneLayout. On a phone
// the plate covers the screen, cropped from the sky down; on a wider screen it stands as a centred column the
// height of the screen, so the figure and the rock are never cropped.

import { FIGURE } from './figure.js';

/** The plates' size in pixels: every layer is this wide. */
export const PLATE = { width: 1536, height: 2752 };
/** A screen up to this wide for its height (any phone held upright, an iPad too) is covered by the plate; a wider one
 * shows it as a column. */
const COVER_UP_TO = 0.82;
/** Covering, the plate keeps this much of its height above the screen's bottom edge: the crop takes the sky first and
 * only a sliver of the rock, so he and his rock always show. */
const KEPT_TO = 0.96;

/** The figure's width as a share of the plate's; his seat line on the rock as a share of the plate's height; the
 * share of his height that sits below it, on the rock's top. */
const FIGURE_WIDTH = 0.5;
const SEAT_Y = 0.842;
const SEAT_OVERLAP = 0.03;

function plateFrame(width, height) {
  const covers = width / height <= COVER_UP_TO;
  const scale = covers ? Math.max(width / PLATE.width, height / PLATE.height) : height / PLATE.height;
  const w = PLATE.width * scale;
  const h = PLATE.height * scale;
  const y = covers ? Math.min(0, Math.max(height - h, height - h * KEPT_TO)) : (height - h) / 2;
  return { x: (width - w) / 2, y, w, h };
}

export function sceneLayout(width, height) {
  const plate = plateFrame(width, height);
  const figureWidth = plate.w * FIGURE_WIDTH;
  const figureHeight = figureWidth * FIGURE.heightPerWidth;
  const seat = plate.y + plate.h * SEAT_Y + figureHeight * SEAT_OVERLAP;
  const figure = { x: plate.x + (plate.w - figureWidth) / 2, y: seat - figureHeight, w: figureWidth, h: figureHeight };
  const left = Math.max(0, plate.x);
  const right = Math.min(width, plate.x + plate.w);
  return {
    width,
    height,
    plate,
    figure,
    pointRadius: FIGURE.pointRadius * figure.h,
    /** A point given as shares of the plate's width and height, on the screen. */
    at: (x, y) => ({ x: plate.x + x * plate.w, y: plate.y + y * plate.h }),
    /** A point on his spine, `share` of his height down from the top of his head. */
    spine: (share) => ({ x: figure.x + figure.w / 2, y: figure.y + share * figure.h }),
    /** The plate's rows from `top` to `bottom` (shares of its height), as much of them as is on the screen. */
    rows: (top, bottom) => {
      const y = Math.max(0, plate.y + top * plate.h);
      const end = Math.min(height, plate.y + bottom * plate.h);
      return { x: left, y, w: right - left, h: Math.max(0, end - y) };
    },
  };
}
