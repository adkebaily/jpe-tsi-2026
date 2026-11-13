// Le moteur de mouvement de la page : une seule boucle d'animation, à laquelle chaque
// effet s'abonne. Tout passe par transform, opacity ou clip-path.

export const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export interface Frame {
  /** secondes depuis le chargement */
  t: number;
  /** secondes depuis l'image précédente */
  dt: number;
  /** position de défilement */
  y: number;
  /** vitesse de défilement lissée, en pixels par image */
  vel: number;
  vh: number;
}

type Subscriber = (frame: Frame) => void;
const subscribers: Subscriber[] = [];
let running = false;
let last = 0;
let lastY = 0;
let vel = 0;

function loop(now: number) {
  if (document.hidden) {
    running = false;
    return;
  }
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  const y = window.scrollY;
  vel = vel * 0.86 + (y - lastY) * 0.14;
  lastY = y;
  const frame: Frame = { t: now / 1000, dt, y, vel, vh: window.innerHeight };
  for (const subscriber of subscribers) subscriber(frame);
  requestAnimationFrame(loop);
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  lastY = window.scrollY;
  requestAnimationFrame(loop);
}

/** Appelle `fn` à chaque image tant que l'onglet est visible. */
export function onFrame(fn: Subscriber) {
  subscribers.push(fn);
  start();
}

document.addEventListener("visibilitychange", start);

/** Suit la visibilité d'un élément, pour ne rien calculer hors écran. */
export function watch(el: Element, margin = "100px") {
  const state = { visible: false };
  new IntersectionObserver(([entry]) => (state.visible = entry.isIntersecting), { rootMargin: margin }).observe(el);
  return state;
}

/** Apparition au défilement : ajoute .is-in une fois, quand l'élément arrive à l'écran. */
export function initReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
}
