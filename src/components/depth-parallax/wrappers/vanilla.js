// For reference — no wrapper needed. Just use the element directly.
import 'depth-parallax';

const el = document.createElement('depth-parallax');
el.setAttribute('src', 'video.mp4');
el.setAttribute('depth-src', 'depth-data.bin');
el.setAttribute('depth-meta', 'depth-meta.json');
document.body.appendChild(el);
