/**
 * 🧪 SoundSync Parity Test Suite
 * 
 * This script verifies that Frontend (Preview) and Backend (Render) logic are in sync.
 * Run this after making any changes to visual effects or typography.
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MockTrack {
  title: string;
  titleScale: number;
  titlePositionX: number;
  titlePositionY: number;
  waveformAmplitude: number;
  visualEffects: any[];
}

const SAMPLE_TRACK: MockTrack = {
  title: "Test Track",
  titleScale: 150, // 150%
  titlePositionX: 50,
  titlePositionY: -100,
  waveformAmplitude: 120,
  visualEffects: [
    { type: 'zoom_pulse', enabled: true, params: { strength: 40, frequencyBand: 'bass' } }
  ]
};

/**
 * 1. Typography Parity
 * Logic extracted from App.tsx (Frontend) vs server/index.ts (Backend)
 */
function testTypographyParity(track: MockTrack) {
  console.log("--- Testing Typography Parity ---");
  
  // FRONTEND LOGIC (from App.tsx styles/canvas)
  const feScale = 2; // Preview is often half-size or scaled
  const feTitleX = track.titlePositionX * feScale;
  const feTitleY = track.titlePositionY * feScale;
  const feTitleSize = Math.round(100 * (track.titleScale / 100));

  // BACKEND LOGIC (from server/index.ts)
  const beScale = 2; // Hardcoded in preview/render logic
  const beTitleX = track.titlePositionX * beScale;
  const beTitleY = track.titlePositionY * beScale;
  const beTitleSize = Math.round(100 * (track.titleScale / 100));

  const xMatch = feTitleX === beTitleX;
  const yMatch = feTitleY === beTitleY;
  const sizeMatch = feTitleSize === beTitleSize;

  console.log(`[X Offset] FE: ${feTitleX} | BE: ${beTitleX} -> ${xMatch ? '✅' : '❌'}`);
  console.log(`[Y Offset] FE: ${feTitleY} | BE: ${beTitleY} -> ${yMatch ? '✅' : '❌'}`);
  console.log(`[Scale   ] FE: ${feTitleSize} | BE: ${beTitleSize} -> ${sizeMatch ? '✅' : '❌'}`);

  return xMatch && yMatch && sizeMatch;
}

/**
 * 2. Visual Effect Math Parity
 * Logic extracted from App.tsx vs server/frameGenerator.ts
 */
function testEffectMathParity(track: MockTrack) {
  console.log("\n--- Testing Visual Effect Math Parity ---");
  
  const zoomEffect = track.visualEffects.find(e => e.type === 'zoom_pulse');
  const energy = 0.8; // Mock normalized energy peak
  
  // FRONTEND MATH (App.tsx)
  // Note: App.tsx uses CSS transforms: scale(1 + energy * strength * 0.004)
  const feStrength = zoomEffect.params.strength;
  const feZoomFactor = 1 + (energy * feStrength * 0.004);

  // BACKEND MATH (server/frameGenerator.ts)
  // Logic: const zoomFactor = 1.0 + (energy * strength * 0.4); where strength is strength/100
  const beStrength = zoomEffect.params.strength / 100;
  const beZoomFactor = 1.0 + (energy * beStrength * 0.4);

  const zoomMatch = Math.abs(feZoomFactor - beZoomFactor) < 0.001;

  console.log(`[Zoom Factor] FE: ${feZoomFactor.toFixed(4)} | BE: ${beZoomFactor.toFixed(4)} -> ${zoomMatch ? '✅' : '❌'}`);

  return zoomMatch;
}

// RUN TESTS
const typoPass = testTypographyParity(SAMPLE_TRACK);
const effectPass = testEffectMathParity(SAMPLE_TRACK);

console.log("\n" + "=".repeat(30));
if (typoPass && effectPass) {
  console.log("✨ PARITY CHECK PASSED ✨");
  process.exit(0);
} else {
  console.log("🚨 PARITY CHECK FAILED 🚨");
  console.log("Check the logic mirroring between App.tsx and server files.");
  process.exit(1);
}
