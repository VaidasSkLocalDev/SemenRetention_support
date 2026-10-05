// The scene's colours, as the app's Palette.Scene, and how each time of day looks, as its SceneLook.
// Colours are [red, green, blue], 0 to 255.

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

export const COLOR = {
  emberGlow: hex(0xff7028),
  emberBright: hex(0xffa83c),
  emberCore: hex(0xfff0dc),
  liquid: hex(0xffc46e),
  emptyRing: hex(0xa0a0b9),
  figure: hex(0x10121f),
  rimCool: hex(0xa9c0ff),
  rimWarm: hex(0xffc48a),
  sunHigh: hex(0xfff1d6),
  sunLow: hex(0xffa45c),
  moonHalo: hex(0xc9d6ff),
  starlight: hex(0xf2f4ff),
  sparkleGlow: hex(0xffecbe),
  white: [255, 255, 255],
};

/**
 * Each time of day: the mist's tint, the clouds' shade and light (none at night), the rim light on the figure, the
 * motes (a firefly at dusk and night, a sun sparkle at dawn and by day), the stars, whether the sun is drawn and how
 * bright the moon is when it is up (paler in the twilight of dawn and dusk).
 */
export const LOOKS = {
  dawn: {
    mist: hex(0xcdbde3), cloudShade: hex(0xa898c4), cloudLight: hex(0xffdcd6), rim: COLOR.rimWarm,
    mote: 'sparkle', stars: false, sun: true, moon: 0.8,
  },
  day: {
    mist: hex(0xf4f6fa), cloudShade: hex(0xc2d1e8), cloudLight: hex(0xffffff), rim: COLOR.rimWarm,
    mote: 'sparkle', stars: false, sun: true, moon: 0,
  },
  dusk: {
    mist: hex(0xf4c3a6), cloudShade: hex(0x946b99), cloudLight: hex(0xffb885), rim: COLOR.rimWarm,
    mote: 'firefly', stars: false, sun: true, moon: 0.8,
  },
  night: {
    mist: hex(0x8e9ab8), cloudShade: null, cloudLight: null, rim: COLOR.rimCool,
    mote: 'firefly', stars: true, sun: false, moon: 1,
  },
};

export const rgba = ([red, green, blue], alpha = 1) => `rgba(${red}, ${green}, ${blue}, ${alpha})`;

/** `from` mixed toward `to` by `amount`, 0 to 1. */
export const mixColor = (from, to, amount) =>
  from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
