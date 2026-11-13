// Avant, pendant, après : le compte à rebours, le statut et le programme suivent l'heure de Paris.
import event from "../data/event.json";
import { calm } from "./motion";

const root = document.documentElement;
const forced = new URLSearchParams(location.search).get("now");
const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** "2026-11-20 14:05:09", heure de Paris (ou la valeur de ?now= pour les tests). */
const parisNow = () =>
  forced && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(forced) ? `${forced.replace("T", " ")}:00` : formatter.format(new Date());

// Les deux dates sont lues comme si elles étaient en UTC : seul leur écart compte.
const asNumber = (stamp: string) => Date.parse(`${stamp.replace(" ", "T")}Z`);

export function initSchedule() {
  const status = document.getElementById("status-text");
  const slots = [...document.querySelectorAll<HTMLElement>(".slot")];
  const cells = {
    d: document.querySelector<HTMLElement>('[data-count="d"]'),
    h: document.querySelector<HTMLElement>('[data-count="h"]'),
    m: document.querySelector<HTMLElement>('[data-count="m"]'),
    s: document.querySelector<HTMLElement>('[data-count="s"]'),
  };
  const start = `${event.date} ${event.start}:00`;
  const end = `${event.date} ${event.end}:00`;

  const set = (cell: HTMLElement | null, value: string) => {
    if (!cell || cell.textContent === value) return;
    cell.textContent = value;
    if (!calm) {
      cell.animate(
        [{ transform: "translateY(45%)", opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    }
  };

  const update = () => {
    const now = parisNow();
    const clock = now.slice(11, 16);
    const phase = now < start ? "before" : now < end ? "during" : "after";
    root.dataset.now = now;
    root.dataset.phase = phase;

    if (phase === "before") {
      let left = Math.max(0, Math.floor((asNumber(start) - asNumber(now)) / 1000));
      const days = Math.floor(left / 86400);
      left -= days * 86400;
      const hours = Math.floor(left / 3600);
      left -= hours * 3600;
      const minutes = Math.floor(left / 60);
      set(cells.d, String(days));
      set(cells.h, String(hours).padStart(2, "0"));
      set(cells.m, String(minutes).padStart(2, "0"));
      set(cells.s, String(left - minutes * 60).padStart(2, "0"));
    }

    let current = -1;
    if (phase === "during") {
      slots.forEach((slot, i) => {
        if ((slot.dataset.time ?? "") <= clock) current = i;
      });
    }
    slots.forEach((slot, i) => {
      slot.classList.toggle("is-now", i === current);
      slot.classList.toggle("is-past", phase === "during" && i < current);
    });

    if (status) {
      status.textContent =
        phase === "during"
          ? `En ce moment : ${event.schedule[Math.max(current, 0)].title.toLowerCase()}`
          : "Journée terminée. Merci à toutes et à tous.";
    }
  };

  update();
  if (!forced) setInterval(update, 1000);
}
