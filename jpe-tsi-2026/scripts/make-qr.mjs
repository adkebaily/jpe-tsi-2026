// Génère le QR code à imprimer :
//   npm run qr -- https://votre-site.netlify.app
// Le lien encodé se termine par ?src=qr, ce qui déclenche l'animation d'accueil.
import QRCode from "qrcode";

const site = process.argv[2];
if (!site || !/^https?:\/\//.test(site)) {
  console.error("Donnez l'adresse du site, par exemple : npm run qr -- https://jpe-tsi-2026.netlify.app");
  process.exit(1);
}

const target = new URL(site);
target.searchParams.set("src", "qr");
const options = { errorCorrectionLevel: "Q", margin: 2, color: { dark: "#0B1F3A", light: "#FFFFFF" } };

await QRCode.toFile("qr-jpe-tsi-2026.png", target.href, { ...options, width: 1600 });
await QRCode.toFile("qr-jpe-tsi-2026.svg", target.href, { ...options, type: "svg" });
console.log(`QR code créé pour ${target.href}\n  qr-jpe-tsi-2026.png (impression)\n  qr-jpe-tsi-2026.svg (affiche, vectoriel)`);
