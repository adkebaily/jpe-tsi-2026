// En attendant les photos : la date de la journée, écrite en gros pixels qui sortent du bruit.
import { calm } from "./motion";

const GLYPHS: Record<string, string[]> = {
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
};
const TEXT = "20.11";
const COLS = 29;
const ROWS = 11;

function target() {
  const lit = new Uint8Array(COLS * ROWS);
  let col = 2;
  for (const char of TEXT) {
    const glyph = GLYPHS[char];
    glyph.forEach((line, row) =>
      [...line].forEach((bit, x) => {
        if (bit === "1") lit[(row + 2) * COLS + col + x] = 1;
      }),
    );
    col += glyph[0].length + 1;
  }
  return lit;
}

export function initMosaic() {
  const canvas = document.getElementById("mosaic") as HTMLCanvasElement | null;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  const lit = target();
  const cells = COLS * ROWS;
  // Chaque case se fige à un moment différent : le bruit laisse place à l'image peu à peu.
  const lockAt = Float32Array.from({ length: cells }, () => 0.15 + Math.random() * 0.85);
  let progress = calm ? 1 : 0;
  let visible = false;

  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(box.width * dpr)) {
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
    }
    const size = canvas.width / COLS;
    const gap = Math.max(1, size * 0.12);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < cells; i++) {
      const locked = progress >= lockAt[i];
      const on = locked ? lit[i] === 1 : Math.random() > 0.62;
      const glitch = locked && !calm && Math.random() > 0.992;
      ctx.fillStyle = on !== glitch ? "#00C2FF" : "#1B3A69";
      ctx.globalAlpha = on && !locked ? 0.55 : 1;
      ctx.fillRect((i % COLS) * size + gap / 2, Math.floor(i / COLS) * size + gap / 2, size - gap, size - gap);
    }
    ctx.globalAlpha = 1;
  };

  draw();
  new ResizeObserver(draw).observe(canvas);
  if (calm) return;

  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.3 }).observe(canvas);
  setInterval(() => {
    if (!visible || document.hidden) return;
    progress = Math.min(1, progress + 0.045);
    draw();
  }, 90);
}
