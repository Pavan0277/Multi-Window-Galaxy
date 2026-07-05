import { viewportRect } from "./viewport.js";
import { ROT_SPEED } from "./galaxy.js";

const TILT = 0.55; // fixed tilt of the galaxy disc, radians
const ARMS = 2;
const TWIST = 5.5; // spiral winding, shared by stars, nebula, and dust
const TEX = 1024; // nebula texture resolution

const DISC_STARS = 2400;
const HALO_STARS = 480;
const FLARE_STARS = 44;

// blue, cyan, purple, pink, gold, white — the whole scene stays inside
// this family so the crossfades feel like one continuous palette.
const PALETTE = [210, 185, 265, 318, 45, 0];
const PALETTE_WEIGHTS = [0.3, 0.45, 0.65, 0.77, 0.87, 1];

// Deterministic PRNG: every window seeds the same value, so every
// window generates the exact same galaxy without syncing any of it.
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hash2 = (x, y) => {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

const pickColor = (rand) => {
  const t = rand();
  const i = PALETTE_WEIGHTS.findIndex((w) => t < w);
  return i < 0 ? PALETTE.length - 1 : i;
};

// lerp hue the short way around the color wheel, so gold blends to
// purple through pink instead of sweeping through green
const hueLerp = (a, b, t) => {
  const diff = ((b - a + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
};
const hueAt = (stops, d) =>
  d < 0.5 ? hueLerp(stops[0], stops[1], d * 2) : hueLerp(stops[1], stops[2], (d - 0.5) * 2);

// unit-space extent baked into the nebula textures: max blob center
// distance plus max blob radius, so nothing clips at the texture edge
const EXTENT = 1.32;
const texScale = TEX / 2 / EXTENT - 8;

// A glowing star sprite: white-hot center falling off into its hue.
// Blitting these is what makes thousands of soft stars cheap.
const makeSprite = (hue, flare) => {
  const c = document.createElement("canvas");
  const S = 64;
  c.width = c.height = S;
  const g = c.getContext("2d");
  const sat = hue === 0 ? 0 : 90;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `hsla(${hue},${sat}%,97%,1)`);
  grad.addColorStop(0.16, `hsla(${hue},${sat}%,80%,0.8)`);
  grad.addColorStop(0.42, `hsla(${hue},${sat}%,65%,0.22)`);
  grad.addColorStop(1, `hsla(${hue},${sat}%,60%,0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  if (flare) {
    g.globalCompositeOperation = "lighter";
    for (const rotate of [0, Math.PI / 2]) {
      g.save();
      g.translate(32, 32);
      g.rotate(rotate);
      const spike = g.createLinearGradient(-32, 0, 32, 0);
      spike.addColorStop(0, "hsla(0,0%,100%,0)");
      spike.addColorStop(0.5, "hsla(0,0%,100%,0.75)");
      spike.addColorStop(1, "hsla(0,0%,100%,0)");
      g.fillStyle = spike;
      g.fillRect(-32, -1, 64, 2);
      g.restore();
    }
  }
  return c;
};

// Cloud blobs placed along the same spiral the stars follow, plus a
// central bulge. Positions are generated once so the two color variants
// of each layer overlap exactly and can crossfade without drifting.
const makeBlobs = (rand, count, opts) => {
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const bulge = rand() < 0.22;
    let d, a;
    if (bulge) {
      d = Math.pow(rand(), 1.6) * 0.32;
      a = rand() * Math.PI * 2;
    } else {
      d = 0.12 + Math.pow(rand(), 0.7) * 0.86;
      const arm = Math.floor(rand() * ARMS);
      a = (arm * Math.PI * 2) / ARMS + d * TWIST + (rand() - 0.5) * opts.spread * (0.4 + d) + opts.angleShift;
    }
    blobs.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      dist: d,
      r: opts.rMin + rand() * (opts.rMax - opts.rMin),
      alpha: opts.aMin + rand() * (opts.aMax - opts.aMin),
      jitter: (rand() - 0.5) * 26,
    });
  }
  return blobs;
};

const paintNebula = (blobs, stops) => {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d");
  g.globalCompositeOperation = "lighter";
  for (const b of blobs) {
    const hue = hueAt(stops, b.dist) + b.jitter;
    const px = TEX / 2 + b.x * texScale;
    const py = TEX / 2 + b.y * texScale;
    const pr = Math.max(b.r * texScale, 2);
    const grad = g.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, `hsla(${hue},85%,64%,${b.alpha})`);
    grad.addColorStop(0.6, `hsla(${hue},85%,58%,${b.alpha * 0.4})`);
    grad.addColorStop(1, `hsla(${hue},85%,55%,0)`);
    g.fillStyle = grad;
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  return c;
};

// Dark dust lanes hugging the inner edge of each arm. Drawn source-over
// between the clouds and the stars, they silhouette against the glow.
const paintDust = (blobs) => {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d");
  for (const b of blobs) {
    const px = TEX / 2 + b.x * texScale;
    const py = TEX / 2 + b.y * texScale;
    const pr = Math.max(b.r * texScale, 2);
    const grad = g.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, `rgba(6,7,16,${b.alpha})`);
    grad.addColorStop(1, "rgba(6,7,16,0)");
    g.fillStyle = grad;
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }
  return c;
};

const makeStars = (rand, count, kind) => {
  const stars = [];
  for (let i = 0; i < count; i++) {
    if (kind === "halo") {
      // sparse spherical shell that gives the sphere its volume
      const v = rand() * 2 - 1;
      const ring = Math.sqrt(Math.max(1 - v * v, 0)) * (0.55 + rand() * 0.45);
      stars.push({
        a0: rand() * Math.PI * 2,
        d: ring,
        h: v * (0.55 + rand() * 0.45),
        spin: 0.55,
        sz: 2.5 + rand() * 2.5,
        al: 0.2 + rand() * 0.3,
        c: rand() < 0.6 ? 5 : 0,
        ts: 0.6 + rand() * 1.6,
        tp: rand() * Math.PI * 2,
      });
      continue;
    }
    const arm = Math.floor(rand() * ARMS);
    const d = kind === "flare" ? 0.25 + rand() * 0.6 : Math.sqrt(rand());
    const a0 = (arm * Math.PI * 2) / ARMS + d * TWIST + (rand() - 0.5) * (0.5 + d * 0.35);
    const band = Math.floor(rand() * 3); // depth band → differential spin
    stars.push({
      a0,
      d,
      h: (rand() - 0.5) * 0.16 * (1 - d * 0.55),
      spin: 0.88 + band * 0.12,
      sz: kind === "flare" ? 18 + rand() * 16 : 3.5 + rand() * 5.5,
      al: kind === "flare" ? 0.8 : 0.35 + rand() * 0.55,
      c: pickColor(rand),
      ts: kind === "flare" ? 0.35 + rand() * 0.8 : 0.7 + rand() * 2.2,
      tp: rand() * Math.PI * 2,
    });
  }
  return stars;
};

const NEBULA_LAYERS = [
  { count: 150, rMin: 0.12, rMax: 0.3, aMin: 0.045, aMax: 0.09, spread: 0.55, angleShift: 0, speed: 0.85, alpha: 1 },
  { count: 210, rMin: 0.05, rMax: 0.14, aMin: 0.07, aMax: 0.14, spread: 0.34, angleShift: 0, speed: 1, alpha: 0.95 },
  { count: 330, rMin: 0.012, rMax: 0.045, aMin: 0.14, aMax: 0.28, spread: 0.26, angleShift: 0, speed: 1.14, alpha: 0.9 },
];

// gold core → purple mid → blue rim, crossfading toward pink and cyan
const STOPS_A = [45, 280, 208];
const STOPS_B = [32, 318, 186];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    const rand = mulberry32(1234);
    this.discStars = makeStars(rand, DISC_STARS, "disc");
    this.haloStars = makeStars(rand, HALO_STARS, "halo");
    this.flareStars = makeStars(rand, FLARE_STARS, "flare");

    this.sprites = PALETTE.map((hue) => makeSprite(hue, false));
    this.flares = PALETTE.map((hue) => makeSprite(hue, true));

    this.nebula = NEBULA_LAYERS.map((layer) => {
      const blobs = makeBlobs(rand, layer.count, layer);
      return { ...layer, texA: paintNebula(blobs, STOPS_A), texB: paintNebula(blobs, STOPS_B) };
    });
    this.dust = paintDust(makeBlobs(rand, 240, { rMin: 0.02, rMax: 0.07, aMin: 0.3, aMax: 0.55, spread: 0.2, angleShift: 0.16 }));

    this.backColors = ["#c8d2ff", "#bfeaff", "#d9c8ff", "#ffd9ef"];
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(state) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const view = viewportRect();
    // shared world clock: rotation is the one animated value every
    // window agrees on, so all twinkle and color cycles derive from it
    const time = state ? state.rot / ROT_SPEED : 0;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#030309";
    ctx.fillRect(0, 0, w, h);
    this.drawBackdrop(ctx, view, w, h, time);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    if (!state) return;

    const cx = state.cx - view.x;
    const cy = state.cy - view.y;
    const r = state.r;
    if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) return;

    ctx.globalCompositeOperation = "lighter";
    this.drawHalo(ctx, cx, cy, r, time);
    this.drawNebula(ctx, cx, cy, r, state.rot, time);
    this.drawCore(ctx, cx, cy, r, time);
    this.drawStarField(ctx, cx, cy, r, state.rot, time, w, h);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  drawHalo(ctx, cx, cy, r, time) {
    const hue = 240 + 30 * Math.sin(time * 0.045);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    halo.addColorStop(0, `hsla(${hue},80%,70%,0.14)`);
    halo.addColorStop(0.55, `hsla(${hue + 25},70%,55%,0.055)`);
    halo.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Each cloud layer spins at its own rate (inner layers faster) and
  // slowly crossfades between two colorways of the same blobs.
  drawNebula(ctx, cx, cy, r, rot, time) {
    const size = (TEX * r * 1.075) / texScale; // unit-space → world px, exact
    const sinT = Math.sin(TILT);
    this.nebula.forEach((layer, i) => {
      const fade = 0.5 + 0.5 * Math.sin(time * 0.04 + i * 2.1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, -sinT); // tilt the disc exactly like the star math
      ctx.rotate(rot * layer.speed);
      ctx.globalAlpha = layer.alpha * fade;
      ctx.drawImage(layer.texA, -size / 2, -size / 2, size, size);
      ctx.globalAlpha = layer.alpha * (1 - fade);
      ctx.drawImage(layer.texB, -size / 2, -size / 2, size, size);
      ctx.restore();
    });

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(cx, cy);
    ctx.scale(1, -sinT);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.dust, -size / 2, -size / 2, size, size);
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;
  }

  drawCore(ctx, cx, cy, r, time) {
    const pulse = 1 + 0.02 * Math.sin(time * 0.8);
    const warmR = r * 0.3 * pulse;
    const warm = ctx.createRadialGradient(cx, cy, 0, cx, cy, warmR);
    warm.addColorStop(0, "rgba(255,242,210,0.7)");
    warm.addColorStop(0.35, "rgba(255,210,150,0.26)");
    warm.addColorStop(1, "rgba(255,180,110,0)");
    ctx.fillStyle = warm;
    ctx.beginPath();
    ctx.arc(cx, cy, warmR, 0, Math.PI * 2);
    ctx.fill();

    const hotR = r * 0.11 * pulse;
    const hot = ctx.createRadialGradient(cx, cy, 0, cx, cy, hotR);
    hot.addColorStop(0, "rgba(255,255,255,0.9)");
    hot.addColorStop(0.4, "rgba(255,246,228,0.42)");
    hot.addColorStop(1, "rgba(255,230,200,0)");
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.arc(cx, cy, hotR, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStarField(ctx, cx, cy, r, rot, time, w, h) {
    const sinT = Math.sin(TILT);
    const cosT = Math.cos(TILT);
    const scale = Math.min(Math.max(r / 1100, 0.7), 1.7);

    const blit = (stars, sprites, twinkleDepth) => {
      for (const s of stars) {
        const a = s.a0 + rot * s.spin;
        const px = Math.cos(a) * s.d;
        const pz = Math.sin(a) * s.d;
        const sx = cx + px * r;
        const sy = cy + (s.h * cosT - pz * sinT) * r;
        if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;
        const depth = (s.h * sinT + pz * cosT + 1) * 0.5;
        const tw = 1 - twinkleDepth + twinkleDepth * Math.sin(time * s.ts + s.tp);
        ctx.globalAlpha = s.al * (0.35 + 0.65 * depth) * tw;
        const size = s.sz * (0.6 + 0.55 * depth) * scale;
        ctx.drawImage(sprites[s.c], sx - size / 2, sy - size / 2, size, size);
      }
    };

    blit(this.haloStars, this.sprites, 0.2);
    blit(this.discStars, this.sprites, 0.28);
    blit(this.flareStars, this.flares, 0.42);
    ctx.globalAlpha = 1;
  }

  // Two depths of faint distant stars hashed from fixed world-space
  // grids: they stay pinned to the desktop as windows move, and the
  // near layer twinkles on the shared clock.
  drawBackdrop(ctx, view, w, h, time) {
    const layers = [
      { cell: 150, size: 1, aMax: 0.16, salt: 0, twinkle: 0 },
      { cell: 95, size: 1.6, aMax: 0.3, salt: 7349, twinkle: 0.3 },
    ];
    for (const layer of layers) {
      const x0 = Math.floor(view.x / layer.cell);
      const x1 = Math.floor((view.x + w) / layer.cell);
      const y0 = Math.floor(view.y / layer.cell);
      const y1 = Math.floor((view.y + h) / layer.cell);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const n = hash2(gx + layer.salt, gy - layer.salt);
          const px = gx * layer.cell + ((n & 1023) / 1023) * layer.cell - view.x;
          const py = gy * layer.cell + (((n >>> 10) & 1023) / 1023) * layer.cell - view.y;
          const tw = layer.twinkle
            ? 1 - layer.twinkle + layer.twinkle * Math.sin(time * (0.5 + ((n >>> 24) & 7) * 0.2) + (n & 63))
            : 1;
          ctx.globalAlpha = (0.04 + (((n >>> 20) & 255) / 255) * layer.aMax) * tw;
          ctx.fillStyle = this.backColors[(n >>> 28) & 3];
          ctx.fillRect(px, py, layer.size, layer.size);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
