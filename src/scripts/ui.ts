// Interactions générales : accueil QR, barre du haut, flèches des carrousels, partage et QR code.
import { calm } from "./motion";

const root = document.documentElement;
let toastTimer = 0;

export function toast(message: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("is-visible"), 2400);
}

export function initIntro() {
  const intro = document.getElementById("intro");
  if (!intro || !root.classList.contains("has-intro")) return;

  let done = false;
  const leave = () => {
    if (done) return;
    done = true;
    try {
      sessionStorage.setItem("jpe-intro", "1");
    } catch {
      /* navigation privée : l'intro se rejouera, sans conséquence */
    }
    intro.style.display = "grid";
    intro.classList.add("is-leaving");
    root.classList.add("is-ready");
    root.classList.remove("has-intro");
    setTimeout(() => intro.remove(), 500);
  };

  intro.addEventListener("click", leave);
  setTimeout(leave, 1600);
}

/** La barre du haut prend une ombre dès qu'on quitte le haut de la page. */
export function initNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const update = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

/** Flèches des carrousels. Au doigt, on fait simplement glisser. */
export function initRails() {
  document.querySelectorAll<HTMLElement>("[data-rail-nav]").forEach((nav) => {
    const rail = document.getElementById(nav.dataset.railNav ?? "");
    if (!rail) return;
    nav.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>("[data-dir]");
      const first = rail.firstElementChild as HTMLElement | null;
      if (!button || !first) return;
      rail.scrollBy({ left: Number(button.dataset.dir) * (first.offsetWidth + 16), behavior: calm ? "auto" : "smooth" });
    });
  });
}

/**
 * Compte la visite, une fois par session, avec son canal d'arrivée (?src=qr, ?src=linkedin…).
 * Aucun cookie, aucun identifiant : le serveur ne garde qu'un compteur par jour et par canal.
 */
export function initVisit() {
  const params = new URLSearchParams(location.search);
  // Les adresses de test (?now=, ?demo=) ne comptent pas.
  if (params.has("now") || params.has("demo")) return;
  try {
    if (sessionStorage.getItem("jpe-visit") === "1") return;
    sessionStorage.setItem("jpe-visit", "1");
  } catch {
    /* sans stockage, la visite est simplement comptée à chaque chargement */
  }
  const src = (params.get("src") ?? "direct").toLowerCase().slice(0, 20);
  fetch("/api/hit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ src }),
    keepalive: true,
  }).catch(() => {
    /* le compteur n'est jamais bloquant */
  });
}

/** Bloc "Partagez la page" : QR code de l'adresse, copie du lien, partage natif. */
export function initShare() {
  // L'adresse partagée ne garde ni ?src=qr ni les paramètres de test.
  const url = location.origin + location.pathname;
  const label = document.getElementById("share-url");
  if (label) label.textContent = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) =>
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("Lien copié");
      } catch {
        toast("Copie impossible : sélectionnez le lien à la main");
      }
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-share]").forEach((button) => {
    if (!navigator.share) return;
    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        await navigator.share({ title: document.title, url });
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") toast("Le partage n'a pas fonctionné");
      }
    });
  });

  // Le QR code n'est calculé que lorsque le bloc approche de l'écran.
  const box = document.getElementById("share-qr");
  if (!box) return;
  const observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const QRCode = (await import("qrcode")).default;
        const canvas = document.createElement("canvas");
        // Le lien du QR code porte ?src=qr, qui déclenche l'animation d'accueil.
        await QRCode.toCanvas(canvas, `${url}?src=qr`, {
          width: 480,
          margin: 0,
          errorCorrectionLevel: "M",
          color: { dark: "#0B1F3A", light: "#FFFFFF" },
        });
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        box.replaceChildren(canvas);
      } catch {
        box.hidden = true;
      }
    },
    { rootMargin: "400px" },
  );
  observer.observe(box);
}
