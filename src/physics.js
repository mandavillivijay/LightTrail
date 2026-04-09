/**
 * physics.js
 * Verlet-based physics for interactive strings and elastic bands.
 * Supports: pinned ropes, pre-stretched elastic bands, closed rings.
 */

const GRAVITY    = 0.20;   // px/frame² downward
const DAMPING    = 0.982;  // velocity retention (1 = no loss)
const ITERATIONS = 20;     // constraint passes per frame
export const GRAB_RADIUS = 42; // px – finger interaction distance

// ─── Particle ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, pinned = false) {
    this.x = x;  this.y = y;
    this.ox = x; this.oy = y;   // previous position for Verlet
    this.pinned    = pinned;
    this.grabbedBy = null;       // finger id string or null
    this.pgx = null; this.pgy = null; // previous grab pos (for release velocity)
  }

  update() {
    if (this.pinned || this.grabbedBy !== null) return;
    const vx = (this.x - this.ox) * DAMPING;
    const vy = (this.y - this.oy) * DAMPING;
    this.ox = this.x;
    this.oy = this.y;
    this.x += vx;
    this.y += vy + GRAVITY;
  }
}

// ─── Constraint ───────────────────────────────────────────────────────────────
class Constraint {
  /**
   * @param {Particle} p1
   * @param {Particle} p2
   * @param {number}   restLength
   * @param {number}   stiffness   0..1
   * @param {boolean}  elasticOnly  only resists extension (rubber-band mode)
   */
  constructor(p1, p2, restLength, stiffness = 1, elasticOnly = false) {
    this.p1 = p1;  this.p2 = p2;
    this.restLength  = restLength;
    this.stiffness   = stiffness;
    this.elasticOnly = elasticOnly;
  }

  satisfy() {
    const dx   = this.p2.x - this.p1.x;
    const dy   = this.p2.y - this.p1.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    if (this.elasticOnly && dist <= this.restLength) return; // slack

    const diff  = (this.restLength - dist) / dist * this.stiffness;
    const p1mov = !this.p1.pinned && this.p1.grabbedBy === null;
    const p2mov = !this.p2.pinned && this.p2.grabbedBy === null;

    if (p1mov && p2mov) {
      this.p1.x -= dx * diff * 0.5;  this.p1.y -= dy * diff * 0.5;
      this.p2.x += dx * diff * 0.5;  this.p2.y += dy * diff * 0.5;
    } else if (p1mov) {
      this.p1.x -= dx * diff;  this.p1.y -= dy * diff;
    } else if (p2mov) {
      this.p2.x += dx * diff;  this.p2.y += dy * diff;
    }
  }

  /** Fractional extension beyond rest length */
  strain() {
    const d = Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
    return Math.max(0, d / this.restLength - 1);
  }
}

// ─── Shared grab logic (mixin) ─────────────────────────────────────────────────
function applyGrab(particles, fingers, releaseRadius = GRAB_RADIUS * 2) {
  // Move existing grabs / detect releases
  for (const p of particles) {
    if (p.grabbedBy === null) continue;
    const f = fingers.find(f => f.id === p.grabbedBy);
    if (!f || Math.hypot(f.x - p.x, f.y - p.y) > releaseRadius) {
      // Release: inject velocity from last grab delta
      if (p.pgx !== null) { p.ox = p.pgx; p.oy = p.pgy; }
      p.grabbedBy = null; p.pgx = null; p.pgy = null;
    } else {
      // Move grabbed particle to finger
      p.pgx = p.ox; p.pgy = p.oy;
      p.ox = p.x;   p.oy = p.y;
      p.x  = f.x;   p.y  = f.y;
    }
  }

  // New grabs
  for (const f of fingers) {
    if (particles.some(p => p.grabbedBy === f.id)) continue;
    let best = null, bestD = GRAB_RADIUS;
    for (const p of particles) {
      if (p.pinned || p.grabbedBy !== null) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) { best.grabbedBy = f.id; best.pgx = best.ox; best.pgy = best.oy; }
  }
}

// ─── Shared draw helpers ───────────────────────────────────────────────────────
function drawCurve(ctx, pts, closed = false) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  const end = closed ? pts.length : pts.length - 1;
  for (let i = 1; i < end; i++) {
    const next = pts[(i + 1) % pts.length];
    const mx = (pts[i].x + next.x) / 2;
    const my = (pts[i].y + next.y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  if (closed) ctx.closePath();
  else ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

function drawObject(ctx, pts, color, glowColor, thickness, strain, closed = false) {
  const glow   = 6 + strain * 55;
  const alpha  = Math.min(1, 0.55 + strain * 2.5);
  const width  = thickness + strain * 5;
  const grabbed = pts.some(p => p.grabbedBy !== null);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Outer glow
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth   = width * 3.5;
  ctx.shadowBlur  = glow * 2;
  ctx.shadowColor = glowColor;
  drawCurve(ctx, pts, closed);

  // Core
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = grabbed ? '#ffffff' : color;
  ctx.lineWidth   = width;
  ctx.shadowBlur  = glow;
  ctx.shadowColor = color;
  drawCurve(ctx, pts, closed);

  // Dots on grabbed points
  for (const p of pts) {
    if (p.grabbedBy !== null) {
      ctx.globalAlpha = 1; ctx.shadowBlur = 22; ctx.shadowColor = '#fff';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ─── StringLine ───────────────────────────────────────────────────────────────
export class StringLine {
  /**
   * A string/rope pinned at both ends.
   * @param {Object} opts
   * @param {number} opts.x1, opts.y1  – left pin (canvas px)
   * @param {number} opts.x2, opts.y2  – right pin
   * @param {number} opts.segments     – particle count
   * @param {number} opts.stiffness    – 0..1
   * @param {number} opts.restFactor   – >1 = sags (rope); <1 = taut (elastic band)
   * @param {boolean} opts.elastic     – one-way (rubber-band) constraint
   * @param {string}  opts.color
   * @param {string}  opts.glowColor
   * @param {number}  opts.thickness
   */
  constructor(opts) {
    const {
      x1, y1, x2, y2,
      segments    = 36,
      stiffness   = 0.95,
      restFactor  = 1.1,
      elastic     = false,
      color       = '#00d4ff',
      glowColor   = 'rgba(0,212,255,0.7)',
      thickness   = 3,
    } = opts;

    this.color = color; this.glowColor = glowColor; this.thickness = thickness;
    this.particles = []; this.constraints = [];

    const dist    = Math.hypot(x2 - x1, y2 - y1);
    const segLen  = dist / segments;
    const restLen = segLen * restFactor;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      this.particles.push(new Particle(
        x1 + (x2 - x1) * t,
        y1 + (y2 - y1) * t,
        i === 0 || i === segments,
      ));
    }
    for (let i = 0; i < segments; i++) {
      this.constraints.push(new Constraint(
        this.particles[i], this.particles[i + 1], restLen, stiffness, elastic,
      ));
    }
  }

  interact(fingers) { applyGrab(this.particles, fingers); }

  update() {
    for (const p of this.particles) p.update();
    for (let i = 0; i < ITERATIONS; i++)
      for (const c of this.constraints) c.satisfy();
  }

  avgStrain() {
    return this.constraints.reduce((s, c) => s + c.strain(), 0) / this.constraints.length;
  }

  draw(ctx) {
    drawObject(ctx, this.particles, this.color, this.glowColor,
      this.thickness, this.avgStrain(), false);
    // Pin dots
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10; ctx.shadowColor = this.color;
    for (const p of [this.particles[0], this.particles[this.particles.length - 1]]) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ─── ElasticRing ──────────────────────────────────────────────────────────────
export class ElasticRing {
  /**
   * A closed ring of particles, top particle pinned (hangs from a hook).
   */
  constructor(opts) {
    const {
      cx, cy, radius = 75, segments = 24,
      stiffness = 0.88,
      color     = '#ff2d78',
      glowColor = 'rgba(255,45,120,0.7)',
      thickness = 3,
    } = opts;

    this.color = color; this.glowColor = glowColor; this.thickness = thickness;
    this.particles = []; this.constraints = [];

    const natLen = 2 * radius * Math.sin(Math.PI / segments);

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
      this.particles.push(new Particle(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        i === 0,
      ));
    }

    // Adjacent constraints
    for (let i = 0; i < segments; i++) {
      this.constraints.push(new Constraint(
        this.particles[i],
        this.particles[(i + 1) % segments],
        natLen, stiffness, false,
      ));
    }

    // Cross-bracing (quarter-segments apart) for shape stability
    const step = Math.floor(segments / 4);
    for (let i = 0; i < segments; i++) {
      const j = (i + step) % segments;
      const dx = this.particles[j].x - this.particles[i].x;
      const dy = this.particles[j].y - this.particles[i].y;
      this.constraints.push(new Constraint(
        this.particles[i], this.particles[j],
        Math.hypot(dx, dy) * 0.88, stiffness * 0.55, true,
      ));
    }
  }

  interact(fingers) { applyGrab(this.particles, fingers, GRAB_RADIUS * 2.8); }

  update() {
    for (const p of this.particles) p.update();
    for (let i = 0; i < ITERATIONS; i++)
      for (const c of this.constraints) c.satisfy();
  }

  avgStrain() {
    const n = this.particles.length;
    return this.constraints.slice(0, n).reduce((s, c) => s + c.strain(), 0) / n;
  }

  draw(ctx) {
    drawObject(ctx, this.particles, this.color, this.glowColor,
      this.thickness, this.avgStrain(), true);
    // Pin dot
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 14; ctx.shadowColor = this.color;
    const p0 = this.particles[0];
    ctx.beginPath(); ctx.arc(p0.x, p0.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ─── PhysicsWorld ─────────────────────────────────────────────────────────────
export class PhysicsWorld {
  constructor() { this.objects = []; }

  add(obj) { this.objects.push(obj); return obj; }

  /** @param {Array<{id:string, x:number, y:number}>} fingers */
  update(fingers) {
    for (const o of this.objects) { o.interact(fingers); o.update(); }
  }

  draw(ctx) {
    for (const o of this.objects) o.draw(ctx);
  }
}
