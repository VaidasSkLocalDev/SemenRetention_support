// Chooses the scene's time of day before the page first paints: by the visitor's local hour (no location), or by
// ?time=dawn|day|dusk|night for reviews. The pages' tone follows the app's interface, light at dawn and by day, dark
// at dusk and at night, whatever the system's appearance. Sets data-phase, data-tone and data-hour on <html>, starts
// loading the plate for that time, and on the home page hides the words until its opening reveals them and picks and
// paces the app's screenshots.
(() => {
  // Where each time of day begins, in local hours.
  const DAWN = 5;
  const DAY = 7;
  const DUSK = 18;
  const NIGHT = 21;
  // For a time of day forced by ?time=, an hour inside it that places the sun or the moon well.
  const SAMPLE_HOUR = { dawn: 6.4, day: 10.5, dusk: 19, night: 23.5 };
  // The top of each sky, for the browser's own bars.
  const SKY_TOP = { dawn: '#6675AE', day: '#9FC0E3', dusk: '#47416E', night: '#13152A' };
  const PLATE_LAYERS = ['sky', 'far', 'near'];
  // Should the opening never come (its art missing, an old browser), the words show anyway.
  const SAFETY_REVEAL_MS = 8000;
  // The app's screenshots on the home page, and how far ahead of the screen they start loading.
  const SHOT = 'img.phone__shot';
  const SHOT_LEAD = '25%';
  // Set once the home page's opening has played in this tab.
  const OPENING_PLAYED_KEY = 'purpose.openingPlayed';

  const openingPlayed = () => {
    try {
      return sessionStorage.getItem(OPENING_PLAYED_KEY) === '1';
    } catch {
      // Storage turned off: the opening plays.
      return false;
    }
  };

  const markOpeningPlayed = () => {
    try {
      sessionStorage.setItem(OPENING_PLAYED_KEY, '1');
    } catch {
      // Storage turned off: the opening plays again next time.
    }
  };

  const phaseAt = (hour) => {
    if (hour >= NIGHT || hour < DAWN) return 'night';
    if (hour < DAY) return 'dawn';
    if (hour < DUSK) return 'day';
    return 'dusk';
  };

  const root = document.documentElement;
  const now = new Date();
  const forced = new URLSearchParams(location.search).get('time');
  const isForced = Object.prototype.hasOwnProperty.call(SAMPLE_HOUR, forced);
  const hour = isForced ? SAMPLE_HOUR[forced] : now.getHours() + now.getMinutes() / 60;
  const phase = isForced ? forced : phaseAt(hour);

  root.dataset.phase = phase;
  root.dataset.tone = phase === 'dawn' || phase === 'day' ? 'light' : 'dark';
  root.dataset.hour = String(hour);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKY_TOP[phase]);

  for (const layer of PLATE_LAYERS) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = `assets/art/plate-${phase}-${layer}.webp`;
    document.head.append(link);
  }

  // The home page's opening plays once per visit (the tab): coming back from another page, the words are there at once.
  const isHome = root.dataset.page === 'home';
  if (isHome && !matchMedia('(prefers-reduced-motion: reduce)').matches && !openingPlayed()) {
    markOpeningPlayed();
    root.classList.add('gathering');
    setTimeout(() => root.classList.add('revealed'), SAFETY_REVEAL_MS);
  }

  // The app's screenshots. The page names the day set, loaded lazily, which is what shows without scripts. Here each is
  // taken in hand as the parser adds it, before anything is laid out: it is given its night twin at dusk and at night,
  // and held back until the page has loaded and it comes near the screen, so the first load carries the scene alone.
  const held = [];
  const hold = (shot) => {
    if (shot.dataset.src) return;
    const night = root.dataset.tone === 'dark' && shot.dataset.night;
    shot.dataset.src = night || shot.getAttribute('src');
    shot.removeAttribute('src');
    held.push(shot);
  };
  const holdShots = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    (node.matches(SHOT) ? [node] : node.querySelectorAll(SHOT)).forEach(hold);
  };
  const parsing = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(holdShots)));
  parsing.observe(root, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    parsing.disconnect();
    const near = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
        target.src = target.dataset.src;
        near.unobserve(target);
      });
    }, { rootMargin: `${SHOT_LEAD} 0px` });
    held.forEach((shot) => near.observe(shot));
  }, { once: true });
})();
