/**
 * colors.js
 * Neon color palette definitions and active color management.
 */

export const COLORS = {
  blue: {
    id: 'blue',
    hex: '#00d4ff',
    core: '#00d4ff',
    glow: 'rgba(0, 212, 255, 0.8)',
    glowOuter: 'rgba(0, 100, 255, 0.25)',
    r: 0, g: 212, b: 255,
  },
  pink: {
    id: 'pink',
    hex: '#ff2d78',
    core: '#ff6eb0',
    glow: 'rgba(255, 45, 120, 0.8)',
    glowOuter: 'rgba(200, 0, 80, 0.25)',
    r: 255, g: 45, b: 120,
  },
  purple: {
    id: 'purple',
    hex: '#bf5af2',
    core: '#d97fff',
    glow: 'rgba(191, 90, 242, 0.8)',
    glowOuter: 'rgba(100, 0, 200, 0.25)',
    r: 191, g: 90, b: 242,
  },
  green: {
    id: 'green',
    hex: '#39ff14',
    core: '#80ff60',
    glow: 'rgba(57, 255, 20, 0.8)',
    glowOuter: 'rgba(0, 150, 0, 0.25)',
    r: 57, g: 255, b: 20,
  },
  gold: {
    id: 'gold',
    hex: '#ffcc00',
    core: '#ffe066',
    glow: 'rgba(255, 200, 0, 0.8)',
    glowOuter: 'rgba(180, 100, 0, 0.25)',
    r: 255, g: 204, b: 0,
  },
  cyan: {
    id: 'cyan',
    hex: '#00fff7',
    core: '#80fffc',
    glow: 'rgba(0, 255, 247, 0.8)',
    glowOuter: 'rgba(0, 120, 180, 0.25)',
    r: 0, g: 255, b: 247,
  },
};

/** Active color key */
let _active = 'blue';

export function getActiveColor() {
  return COLORS[_active];
}

export function setActiveColor(id) {
  if (COLORS[id]) _active = id;
}

export function getActiveId() {
  return _active;
}
