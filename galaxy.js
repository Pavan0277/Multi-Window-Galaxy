const STATE_KEY = "galaxy:state";

export const ROT_SPEED = 0.12; // radians per second

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

// The sphere that spans every open window: centered on the union
// bounding box of all window rects, sized to reach across it.
export const worldSphere = (rects) => {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    r: Math.max(maxX - minX, maxY - minY) * 0.45,
  };
};

// Non-hosts advance rotation locally between host broadcasts so the
// spin stays smooth even though state only arrives a few times a second.
export const extrapolate = (state, now) =>
  state && { ...state, rot: state.rot + (ROT_SPEED * Math.max(now - state.t, 0)) / 1000 };

export class Galaxy {
  constructor() {
    this.state = null;
    this.lastWrite = 0;
    window.addEventListener("storage", (event) => {
      if (event.key === STATE_KEY) this.state = readJson(STATE_KEY, this.state);
    });
  }

  currentState() {
    this.state ||= readJson(STATE_KEY, null);
    return this.state;
  }

  // Host only. Eases the sphere toward wherever the windows currently
  // are, so opening, closing, or dragging a window glides the galaxy
  // instead of snapping it.
  tick(rects, now) {
    if (!rects.length) return null;
    const target = worldSphere(rects);
    const prev = this.state || readJson(STATE_KEY, null) || { ...target, rot: 0, t: now };

    const dt = Math.min(Math.max(now - prev.t, 0) / 1000, 0.1);
    const ease = 1 - Math.exp(-dt * 4);

    const next = {
      cx: prev.cx + (target.cx - prev.cx) * ease,
      cy: prev.cy + (target.cy - prev.cy) * ease,
      r: prev.r + (target.r - prev.r) * ease,
      rot: prev.rot + ROT_SPEED * dt,
      t: now,
    };

    this.state = next;
    if (now - this.lastWrite > 50) {
      localStorage.setItem(STATE_KEY, JSON.stringify(next));
      this.lastWrite = now;
    }
    return next;
  }
}
