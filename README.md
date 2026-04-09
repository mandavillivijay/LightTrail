# LightTrail ✦ & StringPlay ◈

A real-time, browser-based hand tracking experience creating cinematic neon light trails and interactive elastic strings using **MediaPipe Hands**, **Canvas API**, and **Web Audio**.

![Hand Tracking Demo](https://raw.githubusercontent.com/mandavillivijay/LightTrail/main/src/assets/hero.png)

## 🌟 Interactive Experiences

### 1. LightTrail (Main App)
Create cinematic neon light trails that follow your fingertips in real-time.
- **Viral Reel Style**: High-contrast, neon fluorescent glow with additive blending.
- **Hand Recognition**: Tracks index fingertip for light painting.
- **Dynamic Physics**: Line thickness reacts to movement speed; smooth interpolation prevents jitter.
- **Visual FX**: Bloom/glow intensity, motion blur, and particle sparkles.
- **Color Palettes**: Switch between 6 curated neon presets (Blue, Pink, Purple, Green, Gold, Cyan).
- **Gesture Control**: Hold a **closed fist (✊)** for ~0.6s to clear all trails.
- **Save Snapshot**: Composite your masterpiece with the webcam feed and download as a PNG.

### 2. StringPlay (Hand-to-Hand)
Interact with glowing neon strings stretched between the matching fingers of both hands.
- **Bilateral Tracking**: Tracks all 10 fingertips across both hands.
- **Straight Line Physics**: 5 elastic strings connect Thumb↔Thumb, Index↔Index, etc.
- **Dynamic Tension**: Strings thin out, glow brighter, and turn "white-hot" as you pull your hands apart.
- **Sonic Response**: Continuous audio tones mapped to the tension of each string.
- **Particle Feedback**: Sparkling embers emit from the strings under high tension.

## 🛠️ Tech Stack
- **Frontend**: HTML5, Vanilla CSS, JavaScript (ESM)
- **Tracking**: [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html) (Lite model for low latency)
- **Rendering**: HTML5 Canvas with Additive Blending
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Audio**: Web Audio API

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- A webcam

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/mandavillivijay/LightTrail.git
   cd LightTrail
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open the local address in your browser (usually `http://localhost:5173`).

## 🎮 Controls
| Action | LightTrail | StringPlay |
|---|---|---|
| **Draw/Move** | Point index finger | Show both hands |
| **Clear** | Hold closed fist (✊) | Click Reset button |
| **Colors** | Click left swatches | Automated per finger |
| **Toggle FX** | Sparkles, Multi-finger | Particles, Audio, Labels |

---
Created with ✦ by **mandavillivijay**
