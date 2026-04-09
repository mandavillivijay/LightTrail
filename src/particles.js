/**
 * particles.js
 * Manages sparkle/particle effects along the trail path.
 */

const MAX_PARTICLES = 600;

/** @type {Particle[]} */
const particles = [];

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} life   - 0..1 (1 = just born)
 * @property {number} size
 * @property {string} color
 */

/**
 * Spawn a burst of sparkles at a given position.
 * @param {number} x
 * @param {number} y
 * @param {string} color - hex or rgba
 * @param {number} count
 * @param {number} speed
 */
export function spawnParticles(x, y, color, count = 4, speed = 1.5) {
  if (particles.length > MAX_PARTICLES) return;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel   = (0.4 + Math.random() * 0.8) * speed;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life: 0.9 + Math.random() * 0.1,
      size: 1 + Math.random() * 2.5,
      color,
    });
  }
}

/**
 * Update all particles (call once per frame).
 */
export function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= 0.022;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/**
 * Draw all particles onto the canvas context.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawParticles(ctx) {
  ctx.save();
  for (const p of particles) {
    const alpha = Math.max(0, p.life);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';

    // Outer glow halo
    ctx.shadowBlur  = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle   = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Remove all particles (used when clearing trails). */
export function clearParticles() {
  particles.length = 0;
}
