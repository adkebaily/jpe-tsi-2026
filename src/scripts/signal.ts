// Le signal du hero, fait de pixels. À gauche, du bruit : un nuage de points agités.
// À droite, le signal propre : une courbe nette. Faire défiler la page nettoie le signal.
// Passer le doigt ou la souris dessus le perturbe, puis il se reforme.
import { calm, clamp, onFrame, watch } from "./motion";

const CYAN = "#00C2FF";
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wave = (x: number, t: number) =>
  Math.sin(x * 7.2 - t * 0.6) * 0.58 + Math.sin(x * 14.5 + t * 0.4 + 1) * 0.22;

export function initSignal(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const root = document.documentElement;

  let width = 0;
  let height = 0;
  let count = 0;
  // Par particule : place sur l'axe (0..1), graine, position, vitesse.
  let fx = new Float32Array(0);
  let seed = new Float32Array(0);
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);

  const pointer = { x: -999, y: -999, live: 0 };
  let shake = 0;

  const build = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const wanted = Math.round(clamp(width * 1.5, 420, 1700));
    if (wanted === count) return;
    count = wanted;
    fx = new Float32Array(count);
    seed = new Float32Array(count);
    px = new Float32Array(count);
    py = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      fx[i] = (i + Math.random()) / count;
      seed[i] = Math.random();
      // Au départ : du bruit partout.
      px[i] = Math.random() * width;
      py[i] = Math.random() * height;
    }
  };

  const scrollProgress = () => clamp(window.scrollY / (window.innerHeight * 0.75));

  function draw(t: number, settled: boolean) {
    ctx!.clearRect(0, 0, width, height);
    if (!width) return;

    const mid = height / 2;
    const amp = height * 0.3;
    const endX = width - Math.max(22, width * 0.06);
    const front = lerp(0.58, -0.35, scrollProgress());
    const dirt = (x: number) => 1 - smooth(front, front + 0.32, x);
    const ready = root.classList.contains("is-ready");
    const radius = Math.max(70, width * 0.09);

    ctx!.fillStyle = CYAN;
    for (let i = 0; i < count; i++) {
      const x = fx[i];
      const d = dirt(x);
      const s = seed[i];
      const base = mid + amp * wave(x, t);
      const spread = d * 0.95 + 0.03 + shake * 0.6;
      // Cible : sur la courbe, dispersée par le bruit.
      const tx = x * endX + Math.cos(t * (1.5 + s * 3) + s * 50) * d * 14;
      const ty = base + amp * Math.sin(t * (2.2 + s * 5) + s * 40) * (s - 0.2) * 1.5 * spread;

      if (settled) {
        px[i] = tx;
        py[i] = ty;
      } else if (ready) {
        vx[i] += (tx - px[i]) * 0.045;
        vy[i] += (ty - py[i]) * 0.045;
        if (pointer.live > 0) {
          const dx = px[i] - pointer.x;
          const dy = py[i] - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < radius) {
            const force = (1 - dist / radius) * 5.5 * pointer.live;
            vx[i] += (dx / dist) * force;
            vy[i] += (dy / dist) * force;
          }
        }
        vx[i] *= 0.82;
        vy[i] *= 0.82;
        px[i] += vx[i];
        py[i] += vy[i];
      } else {
        // Avant l'entrée : le nuage de bruit flotte doucement.
        px[i] += Math.cos(t * 2 + s * 30) * 0.3;
        py[i] += Math.sin(t * 2.4 + s * 60) * 0.3;
      }

      const size = 1.6 + s * 2.2;
      ctx!.globalAlpha = 0.3 + (1 - d) * 0.5 + s * 0.2;
      ctx!.fillRect(px[i], py[i], size, size);
    }

    // Là où le signal est propre, la courbe devient un trait plein.
    const from = clamp(front + 0.12, 0, 1) * endX;
    if (ready && from < endX - 4) {
      const line = ctx!.createLinearGradient(from, 0, Math.min(endX, from + width * 0.22), 0);
      line.addColorStop(0, "rgba(0,194,255,0)");
      line.addColorStop(1, CYAN);
      ctx!.globalAlpha = 1;
      ctx!.strokeStyle = line;
      ctx!.lineWidth = 3;
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";
      ctx!.beginPath();
      for (let x = from; x <= endX; x += 3) {
        const y = mid + amp * wave(x / endX, t);
        if (x === from) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();

      const tipY = mid + amp * wave(1, t);
      ctx!.fillStyle = CYAN;
      ctx!.globalAlpha = 0.25;
      ctx!.beginPath();
      ctx!.arc(endX, tipY, 12, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
      ctx!.beginPath();
      ctx!.arc(endX, tipY, 5.5, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  new ResizeObserver(() => {
    build();
    if (calm) draw(0, true);
  }).observe(canvas);
  build();

  if (calm) {
    window.addEventListener("scroll", () => draw(0, true), { passive: true });
    return;
  }

  const hero = canvas.closest<HTMLElement>(".hero") ?? canvas;
  const track = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    pointer.x = e.clientX - box.left;
    pointer.y = e.clientY - box.top;
    pointer.live = 1;
  };
  hero.addEventListener("pointermove", track, { passive: true });
  hero.addEventListener("pointerdown", track, { passive: true });

  const seen = watch(canvas);
  onFrame(({ t, vel }) => {
    if (!seen.visible) return;
    shake = Math.max(shake * 0.9, clamp(Math.abs(vel) / 45));
    pointer.live *= 0.94;
    draw(t, false);
  });
}
