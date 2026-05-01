import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRAMES_DIR = path.join(__dirname, '../data/frames');

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

// Xorshift PRNG for deterministic camera shake
class XorShift {
  private state: number;
  constructor(seed: number) { this.state = seed || 1; }
  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 4294967296; // 0 to 1
  }
}

export async function generateFrames(
  jobId: string, 
  imagePath: string, 
  analysisPath: string, 
  effects: any[], 
  onProgress: (p: number) => void,
  maxFrames?: number
): Promise<string> {
  const jobFramesDir = path.join(FRAMES_DIR, jobId);
  if (!fs.existsSync(jobFramesDir)) fs.mkdirSync(jobFramesDir, { recursive: true });

  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  const frames = analysis.frames;
  const totalFrames = maxFrames ? Math.min(frames.length, maxFrames) : frames.length;

  // Find max energy to normalize
  let maxEnergyFound = 0.01; // Avoid division by zero
  for (const frame of frames) {
    maxEnergyFound = Math.max(maxEnergyFound, frame.bassEnergy || 0, frame.midEnergy || 0, frame.trebleEnergy || 0, frame.rms || 0);
  }
  // We want to scale energy so the peaks hit around 1.0
  // Typically max energy is around 0.04 to 0.08. We'll use a dynamic scale based on the track's actual peak.
  const energyScale = 1.0 / maxEnergyFound;

  // Pre-load background image to a raw buffer for faster processing
  const baseImage = sharp(imagePath).resize(1920, 1080, { fit: 'cover' });
  const baseBuffer = await baseImage.toBuffer();

  // Active effects
  const zoomEffect = effects.find(e => e.type === 'zoom_pulse' && e.enabled);
  const shakeEffect = effects.find(e => e.type === 'camera_shake' && e.enabled);
  const vignetteEffect = effects.find(e => e.type === 'vignette_pulse' && e.enabled);
  const chromaticEffect = effects.find(e => e.type === 'chromatic_aberration' && e.enabled);
  const displacementEffect = effects.find(e => e.type === 'displacement' && e.enabled);
  const prng = new XorShift(1337);

  // Helper to get normalized energy from a frame based on frequencyBand
  const getNormalizedEnergy = (data: any, band: any) => {
    let raw = data.bassEnergy || 0;
    switch (band) {
      case 'bass': raw = data.bassEnergy || 0; break;
      case 'mid': raw = data.midEnergy || 0; break;
      case 'treble': raw = data.trebleEnergy || 0; break;
      case 'rms': raw = data.rms || 0; break;
    }
    // Scale and clamp to [0, 1]
    return Math.min(1.0, raw * energyScale);
  };

  const CONCURRENCY = 8;
  let completed = 0;

  for (let i = 0; i < totalFrames; i += CONCURRENCY) {
    const batch = [];
    for (let j = 0; j < CONCURRENCY && i + j < totalFrames; j++) {
      const frameIndex = i + j;
      const data = frames[frameIndex];
      const framePath = path.join(jobFramesDir, `frame_${String(frameIndex).padStart(5, '0')}.jpg`);
      
      let img = sharp(baseBuffer);

      // --- Apply Transform Effects (Zoom, Shake) ---
      let cropWidth = 1920;
      let cropHeight = 1080;
      let left = 0;
      let top = 0;
      let needsTransform = false;

      // Ensure there's room to shake by slightly zooming in if shake is active
      if (shakeEffect) {
        cropWidth = 1920 - 160; // Leave 80px on each side
        cropHeight = 1080 - 160; // Leave 80px on top/bottom
        left = 80;
        top = 80;
        needsTransform = true;
      }

      if (zoomEffect) {
        const energy = getNormalizedEnergy(data, zoomEffect.params?.frequencyBand);
        const strength = (Number(zoomEffect.params?.strength) || 30) / 100;
        const zoomFactor = 1.0 + (energy * strength * 0.4); // max 40% zoom
        cropWidth = Math.max(2, Math.floor(1920 / zoomFactor));
        cropHeight = Math.max(2, Math.floor(1080 / zoomFactor));
        left = Math.floor((1920 - cropWidth) / 2);
        top = Math.floor((1080 - cropHeight) / 2);
        needsTransform = true;
      }

      if (shakeEffect) {
        const energy = getNormalizedEnergy(data, shakeEffect.params?.frequencyBand);
        const intensity = (Number(shakeEffect.params?.intensity) || 40) / 100;
        // Jitter amount based on normalized energy. Max shake is 100 pixels in any direction.
        const jitterX = (prng.next() - 0.5) * 2 * energy * intensity * 100;
        const jitterY = (prng.next() - 0.5) * 2 * energy * intensity * 100;
        
        left = Math.max(0, Math.min(1920 - cropWidth, left + Math.floor(jitterX)));
        top = Math.max(0, Math.min(1080 - cropHeight, top + Math.floor(jitterY)));
        needsTransform = true;
      }

      if (needsTransform) {
        img = img.extract({ 
          left: Math.max(0, left), 
          top: Math.max(0, top), 
          width: Math.min(1920 - Math.max(0, left), cropWidth), 
          height: Math.min(1080 - Math.max(0, top), cropHeight) 
        }).resize(1920, 1080);
      }

      // --- Apply Overlay Effects (Vignette) ---
      if (vignetteEffect) {
        const energy = getNormalizedEnergy(data, vignetteEffect.params?.frequencyBand);
        const baseOpacity = (Number(vignetteEffect.params?.baseOpacity) || 20) / 100;
        const pulseStrength = (Number(vignetteEffect.params?.pulseStrength) || 40) / 100;
        const radius = (Number(vignetteEffect.params?.radius) || 70) / 100;
        const opacity = Math.min(1, baseOpacity + (energy * pulseStrength));
        
        const svg = `
          <svg width="1920" height="1080">
            <defs>
              <radialGradient id="grad" cx="50%" cy="50%" r="${radius * 100}%">
                <stop offset="0%" stop-color="black" stop-opacity="0" />
                <stop offset="100%" stop-color="black" stop-opacity="${opacity}" />
              </radialGradient>
            </defs>
            <rect width="1920" height="1080" fill="url(#grad)" />
          </svg>
        `;
        img = img.composite([{ input: Buffer.from(svg), blend: 'over' }]);
      }

      // --- Apply Chromatic Aberration ---
      if (chromaticEffect) {
        const energy = getNormalizedEnergy(data, chromaticEffect.params?.frequencyBand);
        const intensity = (Number(chromaticEffect.params?.intensity) || 50) / 100;
        const maxOffset = Number(chromaticEffect.params?.maxOffset) || 24;
        const offset = Math.round(energy * intensity * maxOffset);
        
        if (offset > 0) {
            const currentBuf = await img.jpeg().toBuffer();
            
            const r = await sharp(currentBuf)
                .extract({ left: offset, top: 0, width: 1920 - offset, height: 1080 })
                .extend({ left: 0, right: offset, top: 0, bottom: 0, background: '#000' })
                .extractChannel('red')
                .toBuffer();
                
            const g = await sharp(currentBuf)
                .extractChannel('green')
                .toBuffer();
                
            const b = await sharp(currentBuf)
                .extract({ left: 0, top: 0, width: 1920 - offset, height: 1080 })
                .extend({ left: offset, right: 0, top: 0, bottom: 0, background: '#000' })
                .extractChannel('blue')
                .toBuffer();
                
            img = sharp(r).joinChannel([g, b]);
        }
      }

      // --- Apply Displacement / Smudge ---
      if (displacementEffect) {
        const energy = getNormalizedEnergy(data, displacementEffect.params?.frequencyBand);
        const intensity = (Number(displacementEffect.params?.intensity) || 30) / 100;
        const noiseScale = Number(displacementEffect.params?.noiseScale) || 4;
        
        if (energy > 0.05) {
          const offset = Math.round(energy * intensity * 40);
          const currentBuf = await img.jpeg().toBuffer();
          
          // Create smudge layer: blurred and shifted
          const smudgeLayer = await sharp(currentBuf)
            .blur(noiseScale)
            .extract({ left: 0, top: 0, width: Math.max(1, 1920 - offset), height: Math.max(1, 1080 - offset) })
            .extend({ left: offset, top: offset, right: 0, bottom: 0, background: '#000' })
            .toBuffer();
            
          img = sharp(currentBuf).composite([
            { input: smudgeLayer, blend: 'lighten' }
          ]);
        }
      }

      batch.push(
        img.jpeg({ quality: 85 }).toFile(framePath).then(() => {
          completed++;
          if (completed % 30 === 0) {
            onProgress(completed / totalFrames);
          }
        })
      );
    }
    await Promise.all(batch);
  }

  return jobFramesDir;
}
