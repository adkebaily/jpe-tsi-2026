// Exécuté avant le premier affichage, pour éviter tout clignotement.
// Décide si la journée est à venir, en cours ou passée (heure de Paris),
// et si le visiteur arrive du QR code.
// Pour tester une autre date : ajouter ?now=2026-11-20T14:00 à l'adresse.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var params = new URLSearchParams(location.search);
  var forced = params.get("now");
  var now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(forced || "")
    ? forced.replace("T", " ")
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Paris",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(new Date());
  var start = root.dataset.date + " " + root.dataset.start;
  var end = root.dataset.date + " " + root.dataset.end;
  root.dataset.now = now;
  root.dataset.phase = now < start ? "before" : now < end ? "during" : "after";

  var seen = false;
  try { seen = sessionStorage.getItem("jpe-intro") === "1"; } catch (e) {}
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (params.get("src") === "qr" && !seen && !calm) root.classList.add("has-intro");
  else root.classList.add("is-ready");
})();
