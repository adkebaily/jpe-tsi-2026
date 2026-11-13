import { initReveals } from "./motion";
import { initSignal } from "./signal";
import { initSchedule } from "./schedule";
import { initGallery } from "./gallery";
import { initMosaic } from "./mosaic";
import { initReviews } from "./reviews";
import { initIntro, initNav, initRails, initShare } from "./ui";

initIntro();
initSchedule();
initReveals();
const canvas = document.getElementById("signal");
if (canvas instanceof HTMLCanvasElement) initSignal(canvas);
initNav();
initRails();
initShare();
initGallery();
initMosaic();
initReviews();
