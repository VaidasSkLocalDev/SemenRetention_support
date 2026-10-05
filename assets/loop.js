// An animation loop that stops while the page is hidden, optionally held to a frame rate.

/** The most one frame may add to a clock (about a frame at 20 fps), so a slow frame or a return to the page slows the
 * animation rather than skipping part of it, as the app's SplashClock does. */
const LONGEST_STEP = 0.05;

/** Calls `onFrame(step)` each frame, `step` being the seconds since the last one; `framesPerSecond` 0 runs at the
 * screen's rate. */
export function createLoop(onFrame, framesPerSecond = 0) {
  const interval = framesPerSecond > 0 ? 1000 / framesPerSecond : 0;
  let handle = 0;
  let running = false;
  let last = -1;

  const frame = (now) => {
    handle = requestAnimationFrame(frame);
    if (last >= 0 && now - last < interval - 1) return;
    const step = last < 0 ? 0 : Math.min((now - last) / 1000, LONGEST_STEP);
    last = now;
    onFrame(step);
  };
  const resume = () => {
    if (!running || document.hidden || handle) return;
    last = -1;
    handle = requestAnimationFrame(frame);
  };
  const pause = () => {
    cancelAnimationFrame(handle);
    handle = 0;
  };
  const onVisibility = () => (document.hidden ? pause() : resume());

  return {
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      resume();
    },
    stop() {
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      pause();
    },
  };
}
