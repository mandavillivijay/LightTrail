/**
 * main.js
 * LightTrail – Entry point.
 *
 * Orchestrates:
 *  1. UI scaffold
 *  2. Webcam initialisation
 *  3. MediaPipe Hands setup
 *  4. Main render loop (requestAnimationFrame)
 *  5. Gesture → trail pipeline
 */

import './style.css';
import { buildUI, setStatus, showToast, updateFingerIndicators, state, registerClearFn } from './ui.js';
import { classifyGesture, getFingerPositions } from './gesture.js';
import { updateTrails, renderTrails, clearAllTrails, setMultiFinger } from './trail.js';
import { clearParticles } from './particles.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const appRoot = document.getElementById('app');
buildUI(appRoot);

// ─── DOM refs (after buildUI injects) ────────────────────────────────────────
const startOverlay   = document.getElementById('start-overlay');
const loadingOverlay = document.getElementById('loading-overlay');
const stage          = document.getElementById('stage');
const video          = document.getElementById('webcam');
const canvas         = document.getElementById('trail-canvas');
const ctx            = canvas.getContext('2d');

// Register the clear function (avoids circular import)
registerClearFn(() => {
  clearAllTrails();
  clearParticles();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ─── State ────────────────────────────────────────────────────────────────────
let handsReady    = false;
let handDetector  = null;
let cameraUtil    = null;
let lastGesture   = '';
let fistFrames    = 0;       // consecutive fist frames (debounce clear gesture)
const FIST_CLEAR_FRAMES = 20; // hold fist for ~0.6s to clear

// ─── Start button ─────────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', async () => {
  startOverlay.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');

  try {
    await initWebcam();
    await initMediaPipe();
    showStage();
  } catch (err) {
    console.error('LightTrail init error:', err);
    loadingOverlay.innerHTML = `
      <p style="color:#ff4466;font-size:1rem;text-align:center;padding:24px">
        ❌ Could not access camera.<br><small>${err.message}</small>
      </p>
    `;
  }
});

// ─── Webcam setup ─────────────────────────────────────────────────────────────
async function initWebcam() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise(res => (video.onloadedmetadata = res));
  resizeCanvas();
}

/** Resize canvas to match its actual display size (not video resolution) */
function resizeCanvas() {
  // getBoundingClientRect returns 0 when stage is display:none.
  // Fall back to window size; showStage() reruns this after the stage is revealed.
  const rect    = canvas.getBoundingClientRect();
  canvas.width  = (rect.width  > 0 ? Math.round(rect.width)  : window.innerWidth);
  canvas.height = (rect.height > 0 ? Math.round(rect.height) : window.innerHeight);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  // Clear after resize to avoid artefacts
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Ensure stage starts hidden via display property (CSS class 'hidden' has no display rule)
stage.style.display = 'none';

// ─── MediaPipe Hands setup ────────────────────────────────────────────────────
async function initMediaPipe() {
  return new Promise((resolve, reject) => {
    // Check MediaPipe is loaded (from CDN scripts in index.html)
    if (typeof Hands === 'undefined') {
      reject(new Error('MediaPipe Hands library not loaded. Check CDN scripts.'));
      return;
    }

    handDetector = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    handDetector.setOptions({
      maxNumHands:             2,
      modelComplexity:         0,   // 0=lite (fast), 1=full (accurate)
      minDetectionConfidence:  0.6,
      minTrackingConfidence:   0.5,
    });

    handDetector.onResults(onHandResults);

    // Use MediaPipe Camera utility for efficient frame feeding
    cameraUtil = new Camera(video, {
      onFrame: async () => {
        if (handDetector) await handDetector.send({ image: video });
      },
      width:  1280,
      height: 720,
    });

    cameraUtil.start().then(() => {
      handsReady = true;
      resolve();
    }).catch(reject);
  });
}

// ─── MediaPipe result handler ─────────────────────────────────────────────────

/**
 * Called every frame by MediaPipe with detected hand landmarks.
 * @param {Object} results
 */
function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    // No hands detected
    setStatus('No hand detected', false);
    updateFingerIndicators([false, false, false, false, false]);
    fistFrames = 0;
    return;
  }

  // Use the first detected hand
  const landmarks = results.multiHandLandmarks[0];
  const { gesture, extended } = classifyGesture(landmarks);

  // Update HUD
  setStatus(`${capitalize(gesture)} detected`, true);
  updateFingerIndicators(extended);

  // ── Fist gesture → clear trails ──
  if (gesture === 'fist') {
    fistFrames++;
    if (fistFrames === FIST_CLEAR_FRAMES) {
      clearAllTrails();
      clearParticles();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      showToast('✊ Trails cleared!');
    }
    return; // don't draw while fist is closed
  } else {
    fistFrames = 0;
  }

  // ── Get finger positions ──
  const fingerPositions = getFingerPositions(
    landmarks,
    gesture,
    extended,
    canvas.width,
    canvas.height,
    state.multiFinger,
  );

  if (fingerPositions.length > 0) {
    updateTrails(fingerPositions);
  }

  lastGesture = gesture;
}

// ─── Show the live stage ──────────────────────────────────────────────────────
function showStage() {
  loadingOverlay.classList.add('hidden');
  stage.style.display = 'block'; // reveal stage (video + canvas overlay)
  resizeCanvas();                 // size canvas now stage is visible + has layout
  setStatus('Ready – raise your hand!', false);
  startRenderLoop();
}

// ─── Render loop ──────────────────────────────────────────────────────────────
/**
 * The render loop ONLY handles canvas compositing.
 * MediaPipe drives tracking via its own Camera util callback.
 */
function startRenderLoop() {
  function frame() {
    renderTrails(ctx, canvas);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
