/**
 * ui.js
 * Builds the entire HTML UI, wires up event listeners, and exposes
 * a state object for other modules to read.
 */

import { COLORS, setActiveColor, getActiveId } from './colors.js';
import { setParticlesEnabled, setGlowIntensity, setMultiFinger, clearAllTrails } from './trail.js';

// ─── Shared UI State ──────────────────────────────────────────────────────────
export const state = {
  particlesOn:  true,
  multiFinger:  false,   // start with single finger (index only)
  glowIntensity: 1.0,
};

// ─── SVG Icon helpers ─────────────────────────────────────────────────────────
const icons = {
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  clear:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  camera:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  fingers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
};

// ─── Build DOM ────────────────────────────────────────────────────────────────

/**
 * Inject the full app UI into #app.
 * @param {HTMLElement} root
 */
export function buildUI(root) {
  root.innerHTML = `
    <!-- ── Start Permission Overlay ── -->
    <div id="start-overlay">
      <div class="overlay-logo">LightTrail ✦</div>
      <p class="overlay-tagline">Paint with your fingers in the air</p>
      <button id="btn-start" class="btn-start">Enable Camera</button>
      <p class="overlay-note">Camera access required · runs entirely in your browser</p>
    </div>

    <!-- ── Webcam loading overlay ── -->
    <div id="loading-overlay" class="hidden">
      <div class="spinner-ring"></div>
      <p class="loading-text">Loading hand tracking model…</p>
    </div>

    <!-- ── Main Stage ── -->
    <div id="stage" class="hidden">
      <!-- Webcam video element (hidden) -->
      <video id="webcam" autoplay muted playsinline></video>

      <!-- Trail + effects canvas -->
      <canvas id="trail-canvas"></canvas>

      <!-- Flash effect for screenshot -->
      <div id="flash"></div>

      <!-- HUD top bar -->
      <div id="hud">
        <span class="hud-logo">LightTrail ✦</span>
        <div class="hud-status">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Initializing…</span>
        </div>
      </div>

      <!-- Left – Color swatches -->
      <div id="panel-colors">
        ${Object.values(COLORS).map(c => `
          <button
            class="color-swatch swatch-${c.id} ${c.id === getActiveId() ? 'active' : ''}"
            id="swatch-${c.id}"
            data-color="${c.id}"
            title="${c.id.charAt(0).toUpperCase() + c.id.slice(1)}"
          ></button>
        `).join('')}
      </div>

      <!-- Right – Finger indicators -->
      <div id="finger-badge">
        <span class="badge-label">fingers</span>
        <div class="badge-fingers">
          ${['index','middle','ring','pinky'].map(f =>
            `<div class="finger-indicator" id="fi-${f}" title="${f}"></div>`
          ).join('')}
        </div>
      </div>

      <!-- Bottom Control Bar -->
      <div id="control-bar">
        <!-- Particles toggle -->
        <button class="ctrl-btn active" id="btn-particles" title="Toggle Sparkles">
          ${icons.sparkle} Sparkles
        </button>

        <!-- Multi-finger toggle -->
        <button class="ctrl-btn" id="btn-multifinger" title="Multi-finger tracking">
          ${icons.fingers} Multi
        </button>

        <div class="ctrl-divider"></div>

        <!-- Glow intensity slider -->
        <div class="ctrl-slider-group">
          <label class="ctrl-slider-label" for="slider-glow">GLOW</label>
          <input type="range" class="ctrl-slider" id="slider-glow"
            min="30" max="250" value="100" step="5" />
        </div>

        <div class="ctrl-divider"></div>

        <!-- Clear trails button -->
        <button class="ctrl-btn" id="btn-clear" title="Clear trails (or make a fist)">
          ${icons.clear} Clear
        </button>

        <!-- Screenshot button -->
        <button class="ctrl-btn" id="btn-screenshot" title="Save screenshot">
          ${icons.camera} Save
        </button>
      </div>

      <!-- Gesture hint -->
      <div id="gesture-hint">✊ Closed fist = clear trails · ☝️ Point to draw</div>

      <!-- Toast container -->
      <div id="toast-container"></div>
    </div>
  `;

  _wireEvents();
  _applyActiveColorCSS();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

function _wireEvents() {
  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.color;
      setActiveColor(id);
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _applyActiveColorCSS();
      showToast(`Color: ${id}`);
    });
  });

  // Particles toggle
  document.getElementById('btn-particles').addEventListener('click', () => {
    state.particlesOn = !state.particlesOn;
    setParticlesEnabled(state.particlesOn);
    _toggleActive('btn-particles', state.particlesOn);
    showToast(state.particlesOn ? 'Sparkles ON' : 'Sparkles OFF');
  });

  // Multi-finger toggle
  document.getElementById('btn-multifinger').addEventListener('click', () => {
    state.multiFinger = !state.multiFinger;
    setMultiFinger(state.multiFinger);
    _toggleActive('btn-multifinger', state.multiFinger);
    showToast(state.multiFinger ? 'Multi-finger ON' : 'Single finger (index)');
  });

  // Glow slider
  document.getElementById('slider-glow').addEventListener('input', (e) => {
    const v = e.target.value / 100;
    state.glowIntensity = v;
    setGlowIntensity(v);
  });

  // Clear button
  document.getElementById('btn-clear').addEventListener('click', () => {
    clearAllTrailsProxy();
    showToast('Trails cleared');
  });

  // Screenshot button
  document.getElementById('btn-screenshot').addEventListener('click', () => {
    takeScreenshot();
  });
}

// Proxy so non-circular – main.js sets this up
let _clearTrailsFn = () => {};
export function registerClearFn(fn) { _clearTrailsFn = fn; }
function clearAllTrailsProxy() { _clearTrailsFn(); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Set CSS custom properties for active neon color */
function _applyActiveColorCSS() {
  const color = Object.values(COLORS).find(c => c.id === getActiveId());
  if (!color) return;
  const root = document.documentElement;
  root.style.setProperty('--neon-active', color.hex);
  root.style.setProperty('--neon-r', color.r);
  root.style.setProperty('--neon-g', color.g);
  root.style.setProperty('--neon-b', color.b);
}

function _toggleActive(id, on) {
  const btn = document.getElementById(id);
  if (on) btn.classList.add('active');
  else    btn.classList.remove('active');
}

/** Show a brief toast notification */
export function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/** Update the HUD status dot and text */
export function setStatus(text, active = false) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-text');
  if (dot)  dot.classList.toggle('active', active);
  if (span) span.textContent = text;
}

/** Light up / dim finger indicators */
export function updateFingerIndicators(extended) {
  const fingers = ['index','middle','ring','pinky'];
  fingers.forEach((f, i) => {
    const el = document.getElementById(`fi-${f}`);
    if (el) el.classList.toggle('lit', !!extended[i + 1]);
  });
}

/** Camera flash + canvas snapshot save */
function takeScreenshot() {
  const flash  = document.getElementById('flash');
  const video  = document.getElementById('webcam');
  const canvas = document.getElementById('trail-canvas');

  if (!canvas || !video) return;

  // Compose: video frame + trail canvas
  const out = document.createElement('canvas');
  out.width  = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext('2d');

  // Mirror video like CSS
  octx.save();
  octx.scale(-1, 1);
  octx.drawImage(video, -out.width, 0, out.width, out.height);
  octx.restore();

  // Composite trail on top
  octx.drawImage(canvas, 0, 0);

  // Flash effect
  if (flash) {
    flash.classList.add('flashing');
    setTimeout(() => flash.classList.remove('flashing'), 120);
  }

  // Download
  out.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `lighttrail-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Screenshot saved!');
  }, 'image/png');
}
