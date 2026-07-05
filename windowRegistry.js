import { viewportRect } from "./viewport.js";

const WINDOWS_KEY = "galaxy:windows";

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

export class WindowRegistry {
  constructor() {
    this.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.windows = {};
    this.listeners = new Set();
    this.lastRect = "";

    window.addEventListener("storage", (event) => {
      if (event.key === WINDOWS_KEY) this.refresh();
    });
    window.addEventListener("resize", () => this.writeSelf());
    document.addEventListener("visibilitychange", () => this.writeSelf());
    window.addEventListener("beforeunload", () => this.removeSelf());
  }

  start() {
    this.writeSelf();
    this.timer = setInterval(() => this.writeSelf(), 500);
    this.moveTimer = setInterval(() => this.writeIfMoved(), 100);
    this.refresh();
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  aliveWindows(now = Date.now()) {
    return Object.values(this.windows)
      .filter((win) => now - win.lastSeen <= 2000)
      .filter((win) => win.visible !== false)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  hostId() {
    return this.aliveWindows()[0]?.id || this.id;
  }

  isHost() {
    return this.hostId() === this.id;
  }

  writeSelf() {
    const now = Date.now();
    const all = readJson(WINDOWS_KEY, {});
    for (const [id, win] of Object.entries(all)) {
      if (now - win.lastSeen > 2000) delete all[id];
    }

    const viewport = viewportRect();
    const rect = {
      id: this.id,
      ...viewport,
      visible: document.visibilityState !== "hidden",
      lastSeen: now,
    };
    all[this.id] = rect;
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(all));
    this.windows = all;
    this.emit();

    this.lastRect = this.rectKey();
  }

  rectKey() {
    const rect = viewportRect();
    return `${rect.x},${rect.y},${rect.w},${rect.h}`;
  }

  writeIfMoved() {
    if (this.rectKey() !== this.lastRect) this.writeSelf();
  }

  refresh() {
    const now = Date.now();
    const all = readJson(WINDOWS_KEY, {});
    let changed = false;
    for (const [id, win] of Object.entries(all)) {
      if (now - win.lastSeen > 2000) {
        delete all[id];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(WINDOWS_KEY, JSON.stringify(all));
    this.windows = all;
    this.emit();
  }

  removeSelf() {
    clearInterval(this.timer);
    clearInterval(this.moveTimer);
    const all = readJson(WINDOWS_KEY, {});
    delete all[this.id];
    localStorage.setItem(WINDOWS_KEY, JSON.stringify(all));
  }

  emit() {
    const alive = this.aliveWindows();
    for (const listener of this.listeners) listener(alive, this.hostId());
  }
}
