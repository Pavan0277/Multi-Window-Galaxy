# Multi-Window Galaxy

A tiny browser experiment where one giant glowing galaxy spans multiple real browser windows, as if the desktop were one shared patch of space.

Open the same URL in two or three separate windows and arrange them on your screen. Each window is a viewport into the same world: it shows only the slice of the galaxy that falls under its position on the desktop. Drag a window and the galaxy stays put while the view pans. Close a window and the part it was hiding shows through the others.

## Demo

![Demo Animation](assets/videoDemo1.gif)

## How It Works

Browser windows from the same origin can communicate through `localStorage`. When one window writes to `localStorage`, every other open window receives a `storage` event.

This project uses that as a tiny message bus:

1. Each window writes its screen rectangle: `screenX`, `screenY`, `innerWidth`, and `innerHeight`.
2. All windows keep a live registry of the other windows.
3. The window with the lowest id becomes the host.
4. Only the host runs the simulation: it centers the sphere on the union of all window rects, sizes it to span them, advances the rotation, and eases toward the target so layout changes glide instead of snapping.
5. The host broadcasts the sphere state (center, radius, rotation, timestamp) through `localStorage` about 20 times a second.
6. Every window renders that global state relative to its own `screenX/screenY`. Non-hosts extrapolate the rotation between broadcasts using `Date.now()`, the one clock all windows share, so the spin stays smooth.

The starfield itself is never synchronized. Every window generates the identical stars from the same seeded PRNG, so only the handful of numbers above ever cross the storage bus. The faint distant stars in the background are hashed from a fixed world-space grid, which is why they stay pinned to the desktop as you drag a window around.

## Run

Serve the folder over localhost. Do not open `index.html` directly with `file://`.

```powershell
node server.js
```

Then open:

```text
http://127.0.0.1:8000/
```

Use separate browser windows, not tabs.

## Files

- `index.html` - full-window canvas and minimal styling
- `main.js` - app wiring and animation loop
- `windowRegistry.js` - window heartbeat, cleanup, and host election
- `galaxy.js` - host-only simulation and shared sphere state
- `renderer.js` - deterministic starfield and glowing sphere renderer
- `viewport.js` - shared screen-space window rectangle
- `assets/` - demo video and other media

## Notes

This is intentionally dependency-free at runtime. It uses browser APIs, canvas, and `localStorage`.

The sphere is placed from window `screenX/screenY`, which some browsers report per physical display. On a multi-monitor setup with different scale factors, the slices may not line up exactly across monitors.
 