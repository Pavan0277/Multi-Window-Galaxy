import { WindowRegistry } from "./windowRegistry.js";
import { Galaxy, extrapolate } from "./galaxy.js";
import { Renderer } from "./renderer.js";

const registry = new WindowRegistry();
const galaxy = new Galaxy();
const renderer = new Renderer(document.querySelector("#game"));

registry.start();

function frame() {
  // Date.now() is the one clock all windows share; rAF timestamps are
  // per-window and can't be compared across the storage bus.
  const now = Date.now();
  const state = registry.isHost()
    ? galaxy.tick(registry.aliveWindows(), now)
    : extrapolate(galaxy.currentState(), now);
  renderer.draw(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
