// Terms of Use and the Privacy Policy: the same scene, still behind the frost with his points lit, and no animation.
// It is blurred, so finer pixels than one a point would not show.

import { Scene } from './scene.js';

Scene.open(document.querySelector('.scene'), { maxPixelRatio: 1 }).then((scene) => scene.show());
