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

  // Pre-load background image to a raw buffer for faster processing
  const baseImage = sharp(imagePath).resize(1920, 1080, { fit: 'cover' });
  const baseBuffer = await baseImage.toBuffer();

  // Active effects
  const zoom = effects.find(e => e.type === 'zoom_pulse' && e.enabled);
  const shake = effects.find(e => e.type === 'camera_shake' && e.enabled);
  const prng = new XorShift(1337);

  const CONCURRENCY = 8;
  let completed = 0;

  for (let i = 0; i < totalFrames; i += CONCURRENCY) {
    const batch = [];
    for (let j = 0; j < CONCURRENCY && i + j < totalFrames; j++) {
      const frameIndex = i + j;
      const data = frames[frameIndex];
      const framePath = path.join(jobFramesDir, `frame_${String(frameIndex).padStart(5, '0')}.jpg`);
      
      let img = sharp(baseBuffer);

      // --- Apply Effects ---
      let cropWidth = 1920;
      let cropHeight = 1080;
      let left = 0;
      let top = 0;

      if (zoom) {
        const strength = (zoom.intensity || 50) / 100;
        const zoomFactor = 1.0 + (data.bassEnergy * strength * 0.3); // max 30% zoom
        cropWidth = Math.max(2, Math.floor(1920 / zoomFactor));
        cropHeight = Math.max(2, Math.floor(1080 / zoomFactor));
        left = Math.floor((1920 - cropWidth) / 2);
        top = Math.floor((1080 - cropHeight) / 2);
      }

      if (shake) {
        const intensity = (shake.intensity || 50) / 100;
        // Jitter amount based on bass energy
        const jitterX = (prng.next() - 0.5) * 2 * data.bassEnergy * intensity * 50;
        const jitterY = (prng.next() - 0.5) * 2 * data.bassEnergy * intensity * 50;
        
        // Adjust crop window. If we hit the bounds, we clamp.
        left = Math.max(0, Math.min(1920 - cropWidth, left + Math.floor(jitterX)));
        top = Math.max(0, Math.min(1080 - cropHeight, top + Math.floor(jitterY)));
      }

      if (zoom || shake) {
        img = img.extract({ left, top, width: cropWidth, height: cropHeight }).resize(1920, 1080);
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
