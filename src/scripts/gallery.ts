// Photos : chaque image arrive en gros pixels puis devient nette (c'est du traitement d'image).
// Un appui l'ouvre en plein écran ; flèches du clavier ou glissement pour naviguer.
import { calm } from "./motion";

const STEPS = [5, 9, 16, 28, 52, 96];

/** Dessine la photo en basse résolution, de plus en plus fine, puis laisse la place à l'image. */
function depixelate(shot: HTMLElement, img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas");
  const smallCtx = small.getContext("2d");
  const w = shot.clientWidth;
  const h = shot.clientHeight;
  // La photo reste masquée jusqu'à ce que le calque de pixels la recouvre.
  const uncover = () => shot.classList.add("is-sharp");
  if (!ctx || !smallCtx || !w || !h || !img.naturalWidth) return uncover();

  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;

  // Même cadrage que object-fit: cover.
  const boxRatio = w / h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (sw / sh > boxRatio) sw = sh * boxRatio;
  else sh = sw / boxRatio;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;

  let step = 0;
  const paint = () => {
    small.width = STEPS[step];
    small.height = Math.max(1, Math.round(STEPS[step] / boxRatio));
    smallCtx.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height);
    ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
    step += 1;
    if (step < STEPS.length) {
      setTimeout(paint, 110);
    } else {
      canvas.classList.add("is-done");
      setTimeout(() => canvas.remove(), 400);
    }
  };

  try {
    paint();
    shot.append(canvas);
  } catch {
    /* si le dessin échoue, la photo s'affiche normalement */
  }
  uncover();
}

export function initGallery() {
  const shots = [...document.querySelectorAll<HTMLButtonElement>(".shot")];
  const dialog = document.getElementById("lightbox") as HTMLDialogElement | null;
  const image = document.getElementById("lightbox-img") as HTMLImageElement | null;
  const count = document.getElementById("lightbox-count");
  const stage = document.getElementById("lightbox-stage");
  if (!shots.length || !dialog || !image || !stage) return;

  if (calm) shots.forEach((shot) => shot.classList.add("is-sharp"));
  if (!calm) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const shot = entry.target as HTMLElement;
          const img = shot.querySelector("img");
          if (!img) continue;
          if (img.complete && img.naturalWidth) depixelate(shot, img);
          else img.addEventListener("load", () => depixelate(shot, img), { once: true });
          img.addEventListener("error", () => shot.classList.add("is-sharp"), { once: true });
          setTimeout(() => shot.classList.add("is-sharp"), 5000);
        }
      },
      { threshold: 0.25 },
    );
    shots.forEach((shot) => observer.observe(shot));
  }

  let index = 0;
  const show = (next: number) => {
    index = (next + shots.length) % shots.length;
    const shot = shots[index];
    image.src = shot.dataset.full ?? "";
    image.alt = shot.querySelector("img")?.alt ?? "";
    if (count) count.textContent = `${index + 1} / ${shots.length}`;
  };

  shots.forEach((shot, i) =>
    shot.addEventListener("click", () => {
      show(i);
      dialog.showModal();
    }),
  );

  dialog.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>("[data-lb]")?.dataset.lb;
    if (action === "prev") show(index - 1);
    else if (action === "next") show(index + 1);
    else if (action === "close" || e.target === stage) dialog.close();
  });

  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });

  dialog.addEventListener("close", () => shots[index]?.focus());

  let startX = 0;
  stage.addEventListener("pointerdown", (e) => (startX = e.clientX));
  stage.addEventListener("pointerup", (e) => {
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 50) show(index + (delta < 0 ? 1 : -1));
  });
}
