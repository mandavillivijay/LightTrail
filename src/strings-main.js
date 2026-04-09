/**
 * strings-main.js
 * StringPlay – Elastic strings between matching fingers of both hands.
 *
 * Concept:
 *  • Track both hands via MediaPipe
 *  • Match each fingertip on the left hand to the same finger on the right
 *  • Draw 5 glowing neon elastic strings between matched pairs
 *  • Strings stretch/contract as hands move apart/together
 *  • Visual feedback: thickness, glow intensity, vibration, and particles react to tension
 */

import './strings-style.css';

// ─── Config ───────────────────────────────────────────────────────────────────
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const TIP_INDICES  = [4, 8, 12, 16, 20];   // MediaPipe landmark indices for fingertips

const COLORS = [
  { core: '#00d4ff', glow: 'rgba(0,212,255,0.7)',   outer: 'rgba(0,100,255,0.2)',  white: '#b0f0ff' },   // Thumb – cyan
  { core: '#ff2d78', glow: 'rgba(255,45,120,0.7)',   outer: 'rgba(200,0,80,0.2)',   white: '#ffb0cc' },   // Index – pink
  { core: '#39ff14', glow: 'rgba(57,255,20,0.7)',    outer: 'rgba(0,150,0,0.2)',    white: '#b0ffb0' },   // Middle – green
  { core: '#ffcc00', glow: 'rgba(255,204,0,0.7)',    outer: 'rgba(180,100,0,0.2)',  white: '#fff5b0' },   // Ring – gold
  { core: '#bf5af2', glow: 'rgba(191,90,242,0.7)',   outer: 'rgba(100,0,200,0.2)', white: '#e0b0ff' },   // Pinky – purple
];

// String visual params
const BASE_THICKNESS   = 5;
const MIN_THICKNESS    = 1.5;
const MAX_GLOW         = 45;
const MIN_GLOW         = 6;
const PARTICLE_CHANCE  = 0.35;

// ─── DOM scaffold ─────────────────────────────────────────────────────────────
document.getElementById('app').innerHTML = `
  <div id="start-overlay">
    <div class="sp-logo">StringPlay ◈</div>
    <p class="sp-tagline">Elastic strings between your fingertips</p>
    <div class="sp-features">
      <span class="sp-chip">🤲 Both hands</span>
      <span class="sp-chip">5 matching strings</span>
      <span class="sp-chip">✦ Stretch &amp; snap</span>
      <span class="sp-chip">〰 Real-time physics</span>
    </div>
    <button id="btn-start" class="btn-go">Enable Camera</button>
    <p class="sp-note">Show both hands to the camera · strings connect matching fingers</p>
  </div>

  <div id="loading-overlay" class="hidden">
    <div class="spinner"></div>
    <p class="loading-txt">Loading hand tracking…</p>
  </div>

  <div id="stage" style="display:none">
    <video id="webcam" autoplay muted playsinline></video>
    <canvas id="physics-canvas"></canvas>

    <div id="hud">
      <span class="hud-logo">StringPlay ◈</span>
      <div class="hud-pills">
        <div class="hud-pill"><span class="sdot" id="sdot"></span><span id="status-txt">Initialising…</span></div>
        <a href="/" class="nav-link hud-pill">← LightTrail</a>
      </div>
    </div>

    <div id="ctrl-bar">
      <button class="cb-btn active" id="btn-particles">✦ Particles</button>
      <button class="cb-btn active" id="btn-sound">♪ Sound</button>
      <div class="divider"></div>
      <button class="cb-btn active" id="btn-labels">Aa Labels</button>
    </div>

    <p id="hint">Show both hands · matching fingers connect with glowing strings</p>
    <div id="toasts"></div>
  </div>
`;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const startOverlay   = document.getElementById('start-overlay');
const loadingOverlay = document.getElementById('loading-overlay');
const stage          = document.getElementById('stage');
const video          = document.getElementById('webcam');
const canvas         = document.getElementById('physics-canvas');
const ctx            = canvas.getContext('2d');

// ─── State ────────────────────────────────────────────────────────────────────
let particlesOn  = true;
let soundOn      = true;
let labelsOn     = true;

// Per-string state (vibration amplitude for each of 5 strings)
const vibration  = [0, 0, 0, 0, 0];
const prevDist   = [0, 0, 0, 0, 0];   // previous frame distance for speed detection

// Particles
const particles = [];
const MAX_PARTICLES = 300;

// Finger positions: [hand0, hand1] each containing 5 {x,y} pairs
let handA = null;   // left-most hand
let handB = null;   // right-most hand

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioCtx = null;
const activeOscs = [null, null, null, null, null]; // per-string oscillator

function playStringTone(idx, tension) {
  if (!soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Map tension (0..1) to frequency
  const baseFreqs = [130, 165, 196, 247, 330]; // C3 E3 G3 B3 E4 – a nice chord
  const freq = baseFreqs[idx] * (1 + tension * 0.6);

  if (activeOscs[idx]) {
    // Update frequency of existing tone
    activeOscs[idx].osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
    activeOscs[idx].gain.gain.setTargetAtTime(Math.min(0.08, tension * 0.12), audioCtx.currentTime, 0.05);
    return;
  }

  const osc  = audioCtx.createOscillator();
  const filt = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filt.type = 'bandpass'; filt.frequency.value = freq * 2; filt.Q.value = 5;
  gain.gain.value = Math.min(0.08, tension * 0.12);

  osc.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
  osc.start();

  activeOscs[idx] = { osc, gain, filt };
}

function stopStringTone(idx) {
  if (!activeOscs[idx]) return;
  const { osc, gain } = activeOscs[idx];
  gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
  setTimeout(() => { try { osc.stop(); } catch(e) {} }, 200);
  activeOscs[idx] = null;
}

// ─── Particles ────────────────────────────────────────────────────────────────
function spawnParticle(x, y, color) {
  if (!particlesOn || particles.length >= MAX_PARTICLES) return;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.3 + Math.random() * 1.2;
  particles.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.8 + Math.random() * 0.2,
    size: 1 + Math.random() * 2,
    color,
  });
}

function updateAndDrawParticles() {
  ctx.save();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= 0.025;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = p.life;
    ctx.shadowBlur = 6; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();

    // White core
    ctx.globalAlpha = p.life * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ─── String drawing ───────────────────────────────────────────────────────────
/**
 * Draw a perfectly straight neon line between two matched fingertips.
 * @param {number} idx    – finger index (0..4)
 * @param {{x,y}}  a      – point on hand A
 * @param {{x,y}}  b      – point on hand B
 */
function drawString(idx, a, b) {
  const col  = COLORS[idx];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const maxDist = canvas.width * 0.8;

  // Tension: 0 (close) → 1 (far stretched)
  const tension = Math.min(1, dist / maxDist);
  prevDist[idx] = dist;

  // Dynamic thickness: thick when close, thin when stretched
  const thickness = Math.max(MIN_THICKNESS, BASE_THICKNESS * (1 - tension * 0.75));

  // Glow intensity: more glow when stretched
  const glow = MIN_GLOW + (MAX_GLOW - MIN_GLOW) * tension;

  // Midpoint for labels
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  // ── Draw layers (additive blending) — straight lines ──

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // Layer 1: Wide outer glow
  ctx.globalAlpha = 0.2 + tension * 0.3;
  ctx.strokeStyle = col.outer;
  ctx.lineWidth   = thickness * 5;
  ctx.shadowBlur  = glow * 1.5;
  ctx.shadowColor = col.glow;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

  // Layer 2: Core glow
  ctx.globalAlpha = 0.6 + tension * 0.3;
  ctx.strokeStyle = col.glow;
  ctx.lineWidth   = thickness * 2;
  ctx.shadowBlur  = glow;
  ctx.shadowColor = col.core;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

  // Layer 3: Bright center
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = col.core;
  ctx.lineWidth   = thickness;
  ctx.shadowBlur  = glow * 0.6;
  ctx.shadowColor = '#fff';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

  // Layer 4: White-hot center when stretched
  if (tension > 0.4) {
    ctx.globalAlpha = (tension - 0.4) * 1.2;
    ctx.strokeStyle = col.white;
    ctx.lineWidth   = thickness * 0.5;
    ctx.shadowBlur  = 4;
    ctx.shadowColor = '#fff';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  ctx.restore();

  // ── Endpoint dots (fingertip markers) ──
  for (const pt of [a, b]) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = col.core;
    ctx.shadowBlur  = 12 + tension * 10;
    ctx.shadowColor = col.core;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4 + tension * 3, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 2 + tension * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Label ──
  if (labelsOn) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = '11px Outfit, sans-serif';
    ctx.fillStyle = col.core;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 8;
    ctx.shadowColor = col.core;
    ctx.fillText(FINGER_NAMES[idx], midX, midY - 12);
    ctx.restore();
  }

  // ── Particles along the straight line ──
  if (particlesOn && Math.random() < PARTICLE_CHANCE * (0.3 + tension)) {
    const t  = Math.random();
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    spawnParticle(px, py, col.core);
  }

  // ── Sound (continuous tone mapped to tension) ──
  if (dist > 30) {
    playStringTone(idx, tension);
  } else {
    stopStringTone(idx);
  }
}

// ─── Webcam ───────────────────────────────────────────────────────────────────
async function initWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise(r => (video.onloadedmetadata = r));
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  > 0 ? Math.round(rect.width)  : window.innerWidth;
  canvas.height = rect.height > 0 ? Math.round(rect.height) : window.innerHeight;
}

window.addEventListener('resize', () => sizeCanvas());

// ─── MediaPipe Hands ──────────────────────────────────────────────────────────
async function initMediaPipe() {
  return new Promise((resolve, reject) => {
    if (typeof Hands === 'undefined') return reject(new Error('MediaPipe not loaded'));

    const hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });

    hands.setOptions({
      maxNumHands:            2,
      modelComplexity:        0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence:  0.5,
    });

    hands.onResults(onResults);

    const camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 1280, height: 720,
    });
    camera.start().then(resolve).catch(reject);
  });
}

function onResults(results) {
  const W = canvas.width, H = canvas.height;

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2) {
    // Need exactly 2 hands
    handA = null; handB = null;
    const count = results.multiHandLandmarks?.length || 0;
    setStatus(count === 1 ? '1 hand – show both!' : 'Show both hands', count > 0);

    // Stop all tones when hands disappear
    for (let i = 0; i < 5; i++) stopStringTone(i);
    return;
  }

  setStatus('Both hands connected ✦', true);

  // Get fingertip positions for both hands (mirrored x for selfie view)
  const rawHands = results.multiHandLandmarks.map(lm =>
    TIP_INDICES.map(ti => ({
      x: (1 - lm[ti].x) * W,
      y: lm[ti].y * H,
    }))
  );

  // Determine left vs right by wrist x position (landmark 0)
  const wrist0x = (1 - results.multiHandLandmarks[0][0].x) * W;
  const wrist1x = (1 - results.multiHandLandmarks[1][0].x) * W;

  if (wrist0x < wrist1x) {
    handA = rawHands[0]; // left hand
    handB = rawHands[1]; // right hand
  } else {
    handA = rawHands[1];
    handB = rawHands[0];
  }
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function renderLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (handA && handB) {
    // Draw 5 strings connecting matching fingers
    for (let i = 0; i < 5; i++) {
      drawString(i, handA[i], handB[i]);
    }
  }

  // Particles
  updateAndDrawParticles();

  requestAnimationFrame(renderLoop);
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setStatus(txt, on) {
  const dot  = document.getElementById('sdot');
  const span = document.getElementById('status-txt');
  if (dot)  dot.classList.toggle('on', on);
  if (span) span.textContent = txt;
}

function toast(msg) {
  const c = document.getElementById('toasts'); if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ─── Start ────────────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', async () => {
  startOverlay.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');

  try {
    await initWebcam();
    await initMediaPipe();
    loadingOverlay.classList.add('hidden');
    stage.style.display = 'block';
    sizeCanvas();
    setStatus('Show both hands', false);
    requestAnimationFrame(renderLoop);
    toast('🤲 Show both hands to connect strings');
  } catch (err) {
    console.error(err);
    loadingOverlay.innerHTML = `<p style="color:#ff4466;font-size:.95rem;text-align:center;padding:24px">❌ ${err.message}</p>`;
  }
});

// ─── Controls ─────────────────────────────────────────────────────────────────
document.getElementById('btn-particles').addEventListener('click', () => {
  particlesOn = !particlesOn;
  document.getElementById('btn-particles').classList.toggle('active', particlesOn);
  toast(particlesOn ? '✦ Particles ON' : '✦ Particles OFF');
});

document.getElementById('btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  document.getElementById('btn-sound').classList.toggle('active', soundOn);
  if (!soundOn) for (let i = 0; i < 5; i++) stopStringTone(i);
  toast(soundOn ? '♪ Sound ON' : '♪ Sound OFF');
});

document.getElementById('btn-labels').addEventListener('click', () => {
  labelsOn = !labelsOn;
  document.getElementById('btn-labels').classList.toggle('active', labelsOn);
  toast(labelsOn ? 'Aa Labels ON' : 'Aa Labels OFF');
});
