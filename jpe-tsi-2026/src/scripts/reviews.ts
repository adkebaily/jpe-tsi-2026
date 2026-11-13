// Avis : chargement depuis /api/reviews, filtres par profil, et formulaire (une note, un commentaire).
// Tout le texte venant des visiteurs passe par textContent, jamais par innerHTML.
import { calm } from "./motion";

type Role = "pro" | "m2" | "m1" | "autre" | "";

interface Review {
  id: string;
  name: string;
  role: Role;
  rating: number;
  comment: string;
  createdAt: string;
}

interface Payload {
  reviews: Review[];
  stats: { count: number; avg: number | null };
}

const ROLE_LABEL: Record<string, string> = { pro: "Professionnel", m2: "Master 2", m1: "Master 1", autre: "Invité" };
const CHIP_LABEL: Record<string, string> = { pro: "Professionnels", m2: "Master 2", m1: "Master 1", autre: "Autres" };
const RATING_WORDS = ["Décevant", "Moyen", "Bien", "Très bien", "Excellent"];
const STAR = "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z";

// Uniquement avec ?demo=1 : de faux avis pour vérifier la mise en page avant d'en avoir de vrais.
const DEMO: Payload = {
  reviews: [
    { id: "d1", name: "Prénom Nom (exemple)", role: "pro", rating: 5, comment: "Ceci est un avis d'exemple, assez long pour voir comment le texte se place sur plusieurs lignes dans la carte.", createdAt: "2026-11-20T15:00:00Z" },
    { id: "d2", name: "Prénom Nom (exemple)", role: "m2", rating: 4, comment: "Avis d'exemple court.", createdAt: "2026-11-20T15:10:00Z" },
    { id: "d3", name: "", role: "", rating: 4, comment: "Avis d'exemple sans nom ni profil, pour tester le cas anonyme.", createdAt: "2026-11-20T15:20:00Z" },
    { id: "d4", name: "Prénom Nom (exemple)", role: "pro", rating: 5, comment: "Encore un avis d'exemple, côté professionnel, pour remplir le carrousel.", createdAt: "2026-11-20T15:30:00Z" },
  ],
  stats: { count: 4, avg: 4.5 },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const french = (n: number) => n.toFixed(1).replace(".", ",");

/** Cinq étoiles, dont `value` allumées. */
function stars(value: number, label = true) {
  const row = el("span", "stars-row");
  if (label) {
    row.setAttribute("role", "img");
    row.setAttribute("aria-label", `${value} sur 5`);
  }
  for (let i = 1; i <= 5; i++) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    if (i <= Math.round(value)) svg.classList.add("is-on");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", STAR);
    svg.append(path);
    row.append(svg);
  }
  return row;
}

function card(review: Review, order: number) {
  const item = el("li", "review");
  item.style.setProperty("--i", String(Math.min(order, 6)));
  const who = el("p", "review-who", review.name || "Anonyme");
  if (ROLE_LABEL[review.role]) who.append(el("span", "review-role", ROLE_LABEL[review.role]));
  item.append(stars(review.rating), el("blockquote", "review-text", review.comment), who);
  return item;
}

function renderScore({ stats }: Payload) {
  const box = $("score");
  const value = $("score-value");
  if (!box || !value || !stats.count || stats.avg === null) return;
  const avg = stats.avg;
  box.hidden = false;
  box.setAttribute("aria-label", `Note moyenne : ${french(avg)} sur 5`);
  $("score-stars")?.replaceChildren(...stars(avg, false).children);
  const count = $("score-count");
  if (count) count.textContent = stats.count === 1 ? "1 avis publié" : `${stats.count} avis publiés`;

  // La note monte de 0 à sa valeur la première fois qu'elle arrive à l'écran.
  if (calm) return void (value.textContent = french(avg));
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const startedAt = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - startedAt) / 900);
        value.textContent = french(avg * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { threshold: 0.6 },
  );
  observer.observe(value);
}

function renderList(data: Payload) {
  const list = $<HTMLUListElement>("reviews");
  const chips = $("chips");
  const nav = $("reviews-nav");
  const state = $("reviews-state");
  if (!list || !chips || !nav || !state) return;

  if (!data.reviews.length) {
    state.textContent = "Aucun avis publié pour l'instant. Le vôtre peut être le premier.";
    return;
  }
  state.hidden = true;

  const show = (filter: string) => {
    const visible = data.reviews.filter((r) => filter === "all" || r.role === filter);
    list.replaceChildren(...visible.map(card));
    list.scrollTo({ left: 0 });
    // Si toutes les cartes tiennent à l'écran, on les centre et on cache les flèches.
    const fits = list.scrollWidth <= list.clientWidth + 1;
    list.classList.toggle("is-fit", fits);
    nav.hidden = fits;
    chips.querySelectorAll<HTMLButtonElement>(".chip").forEach((chip) =>
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === filter)),
    );
  };

  // Un filtre par profil réellement présent dans les avis.
  const present = ["pro", "m2", "m1", "autre"].filter((role) => data.reviews.some((r) => r.role === role));
  if (present.length > 1) {
    chips.replaceChildren(
      ...[["all", "Tous"], ...present.map((r) => [r, CHIP_LABEL[r]])].map(([value, label]) => {
        const chip = el("button", "chip", label);
        chip.type = "button";
        chip.dataset.filter = value;
        chip.addEventListener("click", () => show(value));
        return chip;
      }),
    );
    chips.hidden = false;
  }
  show("all");
  window.addEventListener("resize", () => {
    const fits = list.scrollWidth <= list.clientWidth + 1;
    list.classList.toggle("is-fit", fits);
    nav.hidden = fits;
  });
}

async function loadReviews() {
  const state = $("reviews-state");
  const demo = new URLSearchParams(location.search).get("demo") === "1";
  try {
    let data: Payload;
    if (demo) {
      data = DEMO;
      const flag = $("demo-flag");
      if (flag) flag.hidden = false;
    } else {
      const response = await fetch("/api/reviews", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      data = await response.json();
    }
    renderScore(data);
    renderList(data);
  } catch {
    if (state) state.textContent = "Les avis ne se chargent pas pour le moment. Réessayez dans quelques minutes.";
  }
}

/** Une pluie de pixels aux couleurs de la journée, une seule fois, à l'envoi. */
function confetti(panel: HTMLElement) {
  if (calm) return;
  const canvas = el("canvas", "confetti");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  panel.append(canvas);
  const w = (canvas.width = panel.clientWidth);
  const h = (canvas.height = panel.clientHeight);
  const colors = ["#00C2FF", "#2ECC71", "#FF6B4A", "#F7F9FC"];
  const bits = Array.from({ length: 80 }, (_, i) => ({
    x: w * (0.2 + Math.random() * 0.6),
    y: h * 0.7,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 10,
    size: 5 + Math.random() * 6,
    color: colors[i % colors.length],
  }));
  const startedAt = performance.now();
  const tick = (now: number) => {
    const age = (now - startedAt) / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1) / 0.6);
    for (const bit of bits) {
      bit.vy += 0.42;
      bit.x += bit.vx;
      bit.y += bit.vy;
      ctx.fillStyle = bit.color;
      ctx.fillRect(bit.x, bit.y, bit.size, bit.size);
    }
    if (age < 1.6) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

function initForm() {
  const form = $<HTMLFormElement>("review-form");
  const done = $("form-done");
  const message = $("form-message");
  const panel = $("donner-mon-avis");
  const say = $("rating-say");
  if (!form || !done || !message || !panel) return;

  // Les étoiles : celle qu'on touche et toutes celles d'avant s'allument.
  const starLabels = [...form.querySelectorAll<HTMLLabelElement>(".star")];
  form.querySelector(".rating")?.addEventListener("change", (e) => {
    const value = Number((e.target as HTMLInputElement).value);
    starLabels.forEach((star, i) => {
      star.classList.toggle("is-on", i < value);
      star.classList.toggle("is-hit", i === value - 1);
    });
    setTimeout(() => starLabels[value - 1]?.classList.remove("is-hit"), 240);
    if (say) {
      const word = document.createElement("span");
      word.textContent = `  ${RATING_WORDS[value - 1]}`;
      say.replaceChildren(`${value} / 5`, word);
    }
  });

  const comment = form.elements.namedItem("comment") as HTMLTextAreaElement;
  const counter = $("comment-count");
  comment.addEventListener("input", () => {
    if (counter) counter.textContent = String(comment.value.length);
  });

  const showErrors = (errors: Record<string, string>) => {
    form.querySelectorAll<HTMLElement>("[data-error]").forEach((slot) => {
      slot.textContent = errors[slot.dataset.error ?? ""] ?? "";
    });
    const first = Object.keys(errors)[0];
    if (!first) return;
    const field = form.querySelector<HTMLElement>(`[name="${first}"]`);
    field?.focus({ preventScroll: true });
    field?.closest(".field")?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  };

  // Une erreur disparaît dès que la personne corrige le champ concerné.
  const clearError = (e: Event) => {
    const slot = form.querySelector<HTMLElement>(`[data-error="${(e.target as HTMLInputElement).name}"]`);
    if (slot) slot.textContent = "";
  };
  form.addEventListener("input", clearError);
  form.addEventListener("change", clearError);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const body = {
      rating: Number(data.get("rating") ?? 0),
      comment: String(data.get("comment") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      role: String(data.get("role") ?? ""),
      website: String(data.get("website") ?? ""),
    };

    // Même contrôle que côté serveur, pour répondre tout de suite.
    const errors: Record<string, string> = {};
    if (!body.rating) errors.rating = "Choisissez une note de 1 à 5 étoiles.";
    if (body.comment.length < 5) errors.comment = "Écrivez quelques mots.";
    showErrors(errors);
    message.textContent = "";
    if (Object.keys(errors).length) return;

    const button = form.querySelector<HTMLButtonElement>(".form-submit")!;
    button.disabled = true;
    button.textContent = "Envoi en cours…";
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        form.hidden = true;
        panel.querySelector(".form-title")?.setAttribute("hidden", "");
        $("form-intro")?.setAttribute("hidden", "");
        done.hidden = false;
        done.focus({ preventScroll: true });
        confetti(panel);
        return;
      }
      if (result.errors) showErrors(result.errors);
      message.textContent = result.message ?? (result.errors ? "" : "L'avis n'a pas été envoyé. Réessayez dans un instant.");
    } catch {
      message.textContent = "Pas de connexion. Votre texte est conservé : réessayez quand le réseau revient.";
    } finally {
      button.disabled = false;
      button.textContent = "Envoyer mon avis";
    }
  });
}

export function initReviews() {
  loadReviews();
  initForm();
}
