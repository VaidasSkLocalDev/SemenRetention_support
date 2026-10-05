// The home page: the scene and its opening, once per visit (owner, 2026-10-05: coming back from Support, Terms of Use
// or Privacy, it does not play again), then only the mist and the stars move, resting once the panel below covers the
// scene. With Reduce Motion: the still scene, his points lit, and the words at once. Further down, the walk through
// the app shows each section as it is reached.

import { playGather } from './gather.js';
import { Scene } from './scene.js';
import { revealOnScroll } from './tour.js';

const reveal = () => document.documentElement.classList.add('revealed');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const words = document.querySelector('.hero__words');
// time.js decides before the first paint whether the opening plays in this visit, and marks it played.
const opens = document.documentElement.classList.contains('gathering');

/** The mist and the stars move only while some of the scene shows above the panel. */
function animateWhileSeen(scene) {
  const hero = document.querySelector('.hero');
  new IntersectionObserver((entries) => {
    const latest = entries[entries.length - 1];
    return latest.isIntersecting ? scene.startAmbient() : scene.stopAmbient();
  }).observe(hero);
}

async function start() {
  revealOnScroll(document.querySelectorAll('.tour'));
  const scene = await Scene.open(document.querySelector('.scene'), {
    skyClearance: () => words.offsetTop + words.offsetHeight,
  });
  if (calm) {
    scene.show();
    reveal();
    return;
  }
  animateWhileSeen(scene);
  if (!opens) {
    // Back on the home page in the same visit: he is already there, lit.
    scene.show();
    reveal();
    return;
  }
  await playGather(scene, reveal);
}

start().catch((error) => {
  reveal();
  throw error;
});
