// The walk through the app: the first time a section comes on screen, its words fade in and then its phone rises
// into place (the motion itself is in tour.css). Only sections still below the screen wait for it, so nothing that
// was already in view disappears, and if this script never runs every section simply shows.

/** A section counts as reached once it is this far up from the bottom of the screen. */
const REACHED = '0px 0px -12% 0px';

export function revealOnScroll(sections) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const seenBefore = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting, boundingClientRect } of entries) {
      const first = !seenBefore.has(target);
      seenBefore.add(target);
      if (first && boundingClientRect.top < window.innerHeight) {
        observer.unobserve(target);
      } else if (first && !isIntersecting) {
        target.classList.add('is-waiting');
      } else if (isIntersecting) {
        target.classList.replace('is-waiting', 'is-seen');
        observer.unobserve(target);
      }
    }
  }, { rootMargin: REACHED });
  sections.forEach((section) => observer.observe(section));
}
