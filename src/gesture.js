/**
 * gesture.js
 * Detects hand gestures from MediaPipe Hands landmarks.
 *
 * Detected gestures:
 *  - 'pointing'   : only index finger extended
 *  - 'open'       : 4+ fingers extended
 *  - 'fist'       : no fingers extended (triggers clear)
 *  - 'peace'      : index + middle extended (2 trails)
 *  - 'three'      : index + middle + ring extended
 */

// Landmark indices from MediaPipe Hands
const TIPS  = [4, 8, 12, 16, 20];  // thumb, index, middle, ring, pinky tips
const PIPS  = [3, 6, 10, 14, 18];  // PIP joints (knuckle above base)
const MCPS  = [2, 5,  9, 13, 17];  // MCP joints (base knuckles)

/**
 * Determine if a specific finger is extended.
 * For the thumb (index 0), we compare x-axis instead of y.
 * @param {Array} lm - array of {x,y,z} normalized landmarks
 * @param {number} fingerIdx - 0=thumb, 1=index, 2=middle, 3=ring, 4=pinky
 * @returns {boolean}
 */
function isFingerExtended(lm, fingerIdx) {
  const tip = lm[TIPS[fingerIdx]];
  const pip = lm[PIPS[fingerIdx]];
  const mcp = lm[MCPS[fingerIdx]];

  if (fingerIdx === 0) {
    // Thumb: compare horizontal distance from wrist
    const wrist = lm[0];
    return Math.abs(tip.x - wrist.x) > Math.abs(mcp.x - wrist.x) * 1.2;
  }
  // Other fingers: tip should be above PIP vertically (lower y value = up)
  return tip.y < pip.y - 0.01;
}

/**
 * Classify hand gesture from landmarks.
 * @param {Array} landmarks  - normalized landmarks
 * @returns {{ gesture: string, extendedCount: number, extended: boolean[] }}
 */
export function classifyGesture(landmarks) {
  const lm = landmarks;
  const extended = [0, 1, 2, 3, 4].map(i => isFingerExtended(lm, i));
  const extendedCount = extended.slice(1).filter(Boolean).length; // exclude thumb

  let gesture = 'fist';

  if (extendedCount === 0) {
    gesture = 'fist';
  } else if (extendedCount === 1 && extended[1]) {
    gesture = 'pointing';
  } else if (extendedCount === 2 && extended[1] && extended[2]) {
    gesture = 'peace';
  } else if (extendedCount === 3 && extended[1] && extended[2] && extended[3]) {
    gesture = 'three';
  } else if (extendedCount >= 4) {
    gesture = 'open';
  } else {
    gesture = 'other';
  }

  return { gesture, extendedCount, extended };
}

/**
 * Extract active fingertip positions in canvas space.
 * Mirrors x (because webcam is mirrored).
 *
 * @param {Array}  landmarks    - normalized MediaPipe landmarks
 * @param {string} gesture      - classified gesture
 * @param {boolean[]} extended  - which fingers are extended
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {boolean} multiFinger - if false, only index finger
 * @returns {Array<{id: string, x: number, y: number}>}
 */
export function getFingerPositions(landmarks, gesture, extended, canvasW, canvasH, multiFinger) {
  const positions = [];

  // Finger tip landmark indices (skip thumb index 0)
  const fingerTipMap = [
    { id: 'index',  lmIdx: 8,  extIdx: 1 },
    { id: 'middle', lmIdx: 12, extIdx: 2 },
    { id: 'ring',   lmIdx: 16, extIdx: 3 },
    { id: 'pinky',  lmIdx: 20, extIdx: 4 },
  ];

  for (const { id, lmIdx, extIdx } of fingerTipMap) {
    if (!extended[extIdx]) continue;
    if (!multiFinger && id !== 'index') continue;

    const lm = landmarks[lmIdx];
    // Mirror x to match the CSS-mirrored webcam
    positions.push({
      id,
      x: (1 - lm.x) * canvasW,
      y: lm.y * canvasH,
    });
  }

  return positions;
}
