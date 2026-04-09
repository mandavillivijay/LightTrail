/**
 * trail.js
 * Manages all finger trail data and renders them onto the canvas.
 * Each finger gets its own trail history of smoothed points.
 */

import { getActiveColor } from './colors.js';
import { spawnParticles, updateParticles, drawParticles } from './particles.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const TRAIL_MAX_LENGTH  = 80;   // max points per trail segment
const FADE_ALPHA        = 0.12; // how fast old paint fades per frame (destination-out)
const MIN_MOVE_DIST     = 1;    // px – skip tiny jitter movements
const LERP_FACTOR       = 0.72; // smoothing: higher = more responsive, less lag
const BASE_LINE_WIDTH   = 6;    // base stroke width (px)
const MAX_LINE_WIDTH    = 18;   // maximum stroke at slow speed
const GLOW_RADIUS       = 28;   // outer glow blur radius
const CORE_RADIUS       = 6;    // inner bright core blur radius
const PARTICLE_INTERVAL = 4;    // spawn particles every N points added

/**
 * @typedef {Object} TrailPoint
 * @property {number} x
 * @property {number} y
 * @property {number} pressure  - simulated from speed (0..1)
 * @property {number} t         - timestamp
 */

/**
 * @typedef {Object} TrailEntry
 * @property {TrailPoint[]} points
 * @property {number}       frameCounter
 */

/** Map: fingerId (string) → TrailEntry */
const trails = new Map();

/** Whether particles are enabled – toggled from UI */
let particlesEnabled = true;

/** Glow intensity multiplier 0.5..2.0 */
let glowIntensity = 1.0;

/** Whether multi-finger tracking is active */
let multiFinger = true;

// ─── Public API ───────────────────────────────────────────────────────────────

export function setParticlesEnabled(v) { particlesEnabled = v; }
export function setGlowIntensity(v)    { glowIntensity   = Math.max(0.3, Math.min(2.5, v)); }
export function setMultiFinger(v)      { multiFinger      = v; }

/** Remove all trail data (particles are cleared by the caller in main.js). */
export function clearAllTrails() {
  trails.clear();
}

/**
 * Push new raw fingertip positions this frame.
 * @param {Array<{id: string, x: number, y: number}>} fingerPositions
 *  - x, y are in canvas pixel coordinates (already mirrored)
 */
export function updateTrails(fingerPositions) {
  // Limit to index finger only when multiFinger is off
  const inputs = multiFinger ? fingerPositions : fingerPositions.slice(0, 1);

  // Mark which fingers we still see
  const activeIds = new Set(inputs.map(f => f.id));

  // Remove trails for fingers that disappeared for >60 frames
  for (const [id, entry] of trails.entries()) {
    if (!activeIds.has(id)) {
      entry.frameCounter = (entry.frameCounter || 0) + 1;
      // Keep the trail for a while so it can fade naturally, then remove data
      if (entry.frameCounter > 90) trails.delete(id);
    }
  }

  for (const { id, x, y } of inputs) {
    if (!trails.has(id)) {
      trails.set(id, { points: [], frameCounter: 0 });
    }
    const entry = trails.get(id);
    entry.frameCounter = 0;

    const pts = entry.points;
    const last = pts[pts.length - 1];

    // Lerp toward target for smoothing
    let sx = x, sy = y;
    if (last) {
      sx = last.x + (x - last.x) * LERP_FACTOR;
      sy = last.y + (y - last.y) * LERP_FACTOR;

      // Skip if barely moved (jitter reduction)
      const dx = sx - last.x, dy = sy - last.y;
      if (Math.hypot(dx, dy) < MIN_MOVE_DIST) continue;
    }

    // Compute speed-based pressure for dynamic thickness
    let pressure = 0.5;
    if (last) {
      const dt = (Date.now() - last.t) || 16;
      const speed = Math.hypot(sx - last.x, sy - last.y) / dt;
      // Slow = thick, fast = thinner (light painting style)
      pressure = Math.max(0.1, Math.min(1.0, 1.0 - speed * 12));
    }

    pts.push({ x: sx, y: sy, pressure, t: Date.now() });

    // Trim old points
    if (pts.length > TRAIL_MAX_LENGTH) pts.shift();

    // Spawn sparkle particles periodically
    if (particlesEnabled && pts.length % PARTICLE_INTERVAL === 0) {
      const color = getActiveColor();
      spawnParticles(sx, sy, color.hex, 3, 1.2);
    }
  }
}

/**
 * Render all trails onto the canvas each frame.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 */
export function renderTrails(ctx, canvas) {
  const color = getActiveColor();

  // ── 1. Decay / motion-blur pass ───────────────────────────────────────────
  // Use 'destination-out' to erode existing alpha — canvas stays transparent
  // where there are no trails, so the webcam video shows through beneath it.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = FADE_ALPHA;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // ── 2. Update & draw particles ────────────────────────────────────────────
  if (particlesEnabled) {
    updateParticles();
    drawParticles(ctx);
  }

  // ── 3. Draw trails ────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // additive blending = light painting

  for (const [, entry] of trails) {
    const pts = entry.points;
    if (pts.length < 2) continue;

    drawTrailGlow(ctx, pts, color);
    drawTrailCore(ctx, pts, color);
  }

  ctx.restore();
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Draw the wide soft outer glow of one trail.
 */
function drawTrailGlow(ctx, pts, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    // Catmull-Rom-like smooth curve via quadratic bezier midpoints
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);

  // Dynamic width based on average pressure
  const avgPressure = pts.reduce((s, p) => s + p.pressure, 0) / pts.length;
  const width = BASE_LINE_WIDTH + (MAX_LINE_WIDTH - BASE_LINE_WIDTH) * avgPressure;

  ctx.lineWidth   = width * glowIntensity * 1.6;
  ctx.strokeStyle = color.glowOuter;
  ctx.shadowBlur  = GLOW_RADIUS * glowIntensity;
  ctx.shadowColor = color.glow;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  // Paint with gradient alpha along the trail (fade tail)
  paintWithFade(ctx, pts, width * glowIntensity * 1.6, color.glowOuter);
}

/**
 * Draw the bright inner core of one trail with per-segment alpha fading.
 */
function drawTrailCore(ctx, pts, color) {
  ctx.shadowBlur  = CORE_RADIUS * glowIntensity;
  ctx.shadowColor = '#ffffff';
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  paintWithFade(ctx, pts, BASE_LINE_WIDTH * 0.7 * glowIntensity, color.core, true);
}

/**
 * Paint trail segments individually so we can fade alpha from tail → tip.
 */
function paintWithFade(ctx, pts, baseWidth, strokeColor, isCore = false) {
  const len = pts.length;

  for (let i = 1; i < len; i++) {
    const t      = i / len;              // 0 at tail, 1 at tip
    const alpha  = Math.pow(t, 1.8);     // non-linear: tip stays bright longer

    // Dynamic width per segment from pressure
    const p     = pts[i].pressure;
    const width = isCore
      ? baseWidth
      : baseWidth * (0.6 + p * 0.8);

    ctx.globalAlpha = alpha * (isCore ? 0.9 : 0.55);

    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);

    // Smooth segment via midpoint bezier
    if (i < len - 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    } else {
      ctx.lineTo(pts[i].x, pts[i].y);
    }

    ctx.lineWidth   = width;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
  }
}
