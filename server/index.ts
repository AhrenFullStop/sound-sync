import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { exec } from 'child_process';
import os from 'os';
import { google } from 'googleapis';
import { generateFrames } from './frameGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Google OAuth2 Setup
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:8085/api/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const TOKEN_PATH = path.join(rootDir, 'data', 'youtube_token.json');

// Load token if exists
if (fs.existsSync(TOKEN_PATH)) {
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
    console.log('[YouTube] Loaded existing OAuth token from disk.');
  } catch (err) {
    console.error('[YouTube] Failed to load token from disk:', err);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(rootDir, 'data', 'uploads');
const RENDERS_DIR = path.join(rootDir, 'data', 'renders');
const IMAGES_DIR = path.join(rootDir, 'data', 'generated_images');
const ANALYSIS_DIR = path.join(rootDir, 'data', 'analysis');

// Serve static images so the frontend can display them
app.use('/images', express.static(IMAGES_DIR));
// Serve uploaded audio files so the browser can decode them for the waveform preview
app.use('/uploads', express.static(UPLOADS_DIR));

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ensure directories exist
[UPLOADS_DIR, RENDERS_DIR, IMAGES_DIR, ANALYSIS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Separate multer instance for image uploads → saves into IMAGES_DIR
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `img_upload_${Date.now()}${ext}`);
  }
});
const uploadImage = multer({ storage: imageStorage });

// Global Render Progress State
const renderProgress: Record<string, any> = {};

// Pre-populate renderProgress from disk
try {
  if (fs.existsSync(RENDERS_DIR)) {
    const files = fs.readdirSync(RENDERS_DIR);
    files.forEach(file => {
      if (file.endsWith('.mp4')) {
        const jobId = file.replace('.mp4', '');
        const metaPath = path.join(RENDERS_DIR, `${jobId}.json`);
        
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            renderProgress[jobId] = meta;
            return;
          } catch (e) {}
        }

        const titleParts = jobId.split('_');
        titleParts.pop(); // Remove timestamp
        const title = titleParts.join(' ').toUpperCase();
        
        renderProgress[jobId] = {
          status: 'completed',
          progress: 'DONE',
          title: title || jobId,
          outputPath: path.join(RENDERS_DIR, file)
        };
      }
    });
  }
} catch (e) {
  console.error('[API] Error populating initial render queue:', e);
}

// REST Endpoint for tracking render progress (replaces SSE)
app.get('/api/render/jobs', (req, res) => {
  res.json(renderProgress);
});

// API Routes
app.use('/renders', express.static(RENDERS_DIR));

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'SoundSync Studio Local Server Running' });
});

// YouTube OAuth Routes
app.get('/api/auth/google', (req, res) => {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'YouTube client credentials not configured in .env' });
  }
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force to get refresh token
  });
  res.json({ url: authUrl });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('[YouTube] Token acquired and saved to disk.');
    res.send('<script>window.close();</script>Authentication successful! You can close this window.');
  } catch (err) {
    console.error('[YouTube] Error retrieving access token', err);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/status', async (req, res) => {
  try {
    const token = oauth2Client.credentials;
    if (token && token.access_token) {
      return res.json({ authenticated: true });
    }
  } catch(e) {}
  res.json({ authenticated: false });
});

app.post('/api/youtube/upload', async (req, res) => {
  const { path: filePath, title, description, tags, privacyStatus = 'private', jobId } = req.body;
  if (!fs.existsSync(filePath)) {
    console.error(`[YouTube] File not found: ${filePath}`);
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
    console.error('[YouTube] Not authenticated with YouTube (Missing credentials)');
    return res.status(401).json({ error: 'Not authenticated with YouTube' });
  }

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  
  try {
    console.log(`[YouTube] Starting upload for ${title}...`);
    // Provide early response to avoid timeout
    res.json({ success: true, message: 'Upload started' });
    
    // Update local state to uploading
    if (jobId && renderProgress[jobId]) {
      const jobState = { ...renderProgress[jobId], status: 'uploading' };
      renderProgress[jobId] = jobState;
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));
    }

    const fileSize = fs.statSync(filePath).size;
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title,
          description: description,
          tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
        },
        status: {
          privacyStatus: privacyStatus,
        },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    }, {
      onUploadProgress: evt => {
        const progress = (evt.bytesRead / fileSize) * 100;
        console.log(`[YouTube] Upload Progress: ${Math.round(progress)}%`);
        if (jobId && renderProgress[jobId]) {
          renderProgress[jobId].progress = `UPLOAD: ${Math.round(progress)}%`;
        }
      },
    });

    console.log('[YouTube] Video uploaded! ID:', response.data.id);
    
    if (jobId && renderProgress[jobId]) {
      const jobState = { ...renderProgress[jobId], status: 'completed', progress: 'DONE', youtubeId: response.data.id };
      renderProgress[jobId] = jobState;
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));
    }
  } catch (error) {
    console.error('[YouTube] Upload failed:', error);
    if (jobId && renderProgress[jobId]) {
      const jobState = { ...renderProgress[jobId], status: 'error', error: 'YouTube upload failed' };
      renderProgress[jobId] = jobState;
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));
    }
  }
});

app.post('/api/open-file', (req, res) => {
  const { path: filePath } = req.body;
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  
  const platform = os.platform();
  const command = platform === 'win32' ? `explorer /select,"${filePath}"` :
                  platform === 'darwin' ? `open -R "${filePath}"` :
                  `xdg-open "${path.dirname(filePath)}"`;
  
  exec(command);
  res.json({ success: true });
});

app.delete('/api/file', (req, res) => {
  const { path: filePath } = req.body;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  res.json({ success: true });
});

app.post('/api/upload', upload.array('audioFiles'), async (req, res) => {
  if (!req.files) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const files = req.files as Express.Multer.File[];
  
  const uploadedTracks = await Promise.all(files.map(async (file) => {
    // Extract metadata using ffprobe
    const metadata: any = await new Promise((resolve) => {
      ffmpeg.ffprobe(file.path, (err, data) => {
        if (err) {
          console.error('[ffprobe] Error:', err);
          resolve({});
        } else {
          resolve(data.format.tags || {});
        }
      });
    });

    console.log(`[API] Extracted metadata for ${file.originalname}:`, metadata);

    return {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      originalName: file.originalname,
      filename: file.filename,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      // Metadata fields
      title: metadata.title || file.originalname.replace(/\.[^/.]+$/, ""),
      artist: metadata.artist || "Unknown Artist",
      album: metadata.album || "",
      genre: metadata.genre || "",
      year: metadata.date || metadata.year || "",
      comment: metadata.comment || "",
      lyrics: metadata['lyrics-eng'] || metadata.lyrics || ""
    };
  }));
  
  res.json({ success: true, tracks: uploadedTracks });
});

app.get('/api/models', async (req, res) => {
  try {
    const modelsResponse = await ai.models.list();
    const imagenModels = [];
    for await (const model of modelsResponse) {
      if (model.name.includes('imagen')) {
        // Strip 'models/' prefix
        imagenModels.push({
          id: model.name.replace('models/', ''),
          displayName: model.displayName || model.name,
          description: model.description || ''
        });
      }
    }
    res.json({ success: true, models: imagenModels });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.post('/api/generate-image', async (req, res) => {
  const { prompt, promptConfig, trackId, model } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Resolve aspect ratio from structured config or fall back
  const aspectRatio: string = promptConfig?.aspectRatio || '16:9';

  // We send the prompt EXACTLY as it came from the client, with no hidden mutations.
  // The frontend preview JSON is exactly what the model receives.
  const finalPrompt = prompt;

  try {
    const response = await ai.models.generateImages({
      model: model || 'imagen-4.0-ultra-generate-001',
      prompt: finalPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio as any,
      }
    });

    const imageBytes = response.generatedImages[0].image.imageBytes;
    const filename = `img_${trackId || 'global'}_${Date.now()}.jpg`;
    const filepath = path.join(IMAGES_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(imageBytes, 'base64'));

    res.json({ success: true, imageUrl: `/images/${filename}` });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// ── Gallery endpoints ────────────────────────────────────────────────────────

app.get('/api/images/list', (_req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR)
      .filter(f => f.startsWith('img_') && /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .reverse(); // newest first (timestamps are in the filenames)
    res.json({ images: files.map(f => `/images/${f}`) });
  } catch (err) {
    console.error('[API] images/list error:', err);
    res.status(500).json({ images: [] });
  }
});

app.post('/api/images/upload', uploadImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file received' });
  const imageUrl = `/images/${req.file.filename}`;
  console.log(`[API] Image uploaded: ${imageUrl}`);
  res.json({ success: true, imageUrl });
});

// ── Audio Analysis Pipeline ──────────────────────────────────────────────────
// Minimal Cooley-Tukey FFT (no external lib required)
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly operations
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
        [curRe, curIm] = [curRe * wRe - curIm * wIm, curRe * wIm + curIm * wRe];
      }
    }
  }
}

export function analyzeAudio(audioPath: string, fps: number): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const { spawn } = await import('child_process');
      // Use ffmpeg to decode audio to raw PCM at 44100 Hz mono
      const rawChunks: Buffer[] = [];
      const proc = spawn('ffmpeg', [
        '-i', audioPath,
        '-f', 's16le',  // signed 16-bit little-endian PCM
        '-ac', '1',     // mono
        '-ar', '44100', // sample rate
        '-'
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      
      proc.on('error', (err) => reject(err));


    proc.stdout.on('data', (chunk: Buffer) => rawChunks.push(chunk));
    proc.stdout.on('end', () => {
      const raw = Buffer.concat(rawChunks);
      const sampleCount = raw.length / 2; // 2 bytes per int16 sample
      const samples = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = raw.readInt16LE(i * 2) / 32768.0;
      }

      const sampleRate = 44100;
      const samplesPerFrame = Math.floor(sampleRate / fps);
      // FFT window size — must be power of 2
      const FFT_SIZE = 2048;
      const frameCount = Math.floor(sampleCount / samplesPerFrame);
      const NUM_BINS = 128; // log-compressed output bins

      // Hann window coefficients
      const hannWindow = new Float64Array(FFT_SIZE);
      for (let i = 0; i < FFT_SIZE; i++) {
        hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
      }

      // Smoothed state for asymmetric attack/release
      let sB = 0, sM = 0, sT = 0, sR = 0;
      const ATTACK = 0.8;   // fast attack (fraction of new value to accept)
      const RELEASE = 0.06; // slow release

      const frames: any[] = [];
      for (let f = 0; f < frameCount; f++) {
        const offset = f * samplesPerFrame;

        // Build FFT input with Hann window
        const re = new Float64Array(FFT_SIZE);
        const im = new Float64Array(FFT_SIZE);
        for (let i = 0; i < FFT_SIZE; i++) {
          const s = offset + i < sampleCount ? samples[offset + i] : 0;
          re[i] = s * hannWindow[i];
        }
        fft(re, im);

        // Compute magnitudes for first half (Nyquist)
        const halfSize = FFT_SIZE / 2;
        const mags = new Float32Array(halfSize);
        for (let i = 0; i < halfSize; i++) {
          mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / FFT_SIZE;
        }

        // Frequency resolution
        const freqRes = sampleRate / FFT_SIZE;

        // Band energy helpers
        const bandEnergy = (loHz: number, hiHz: number): number => {
          const lo = Math.max(0, Math.floor(loHz / freqRes));
          const hi = Math.min(halfSize - 1, Math.ceil(hiHz / freqRes));
          let sum = 0;
          for (let i = lo; i <= hi; i++) sum += mags[i] * mags[i];
          return Math.sqrt(sum / Math.max(1, hi - lo + 1));
        };

        const rawBass = bandEnergy(20, 250);
        const rawMid = bandEnergy(250, 4000);
        const rawTreble = bandEnergy(4000, 20000);

        // RMS of window
        let rmsSum = 0;
        for (let i = 0; i < FFT_SIZE; i++) rmsSum += re[i] * re[i]; // (pre-FFT windowed samples already in re before FFT overwrites)
        // Use sample window directly
        let rawRms = 0;
        for (let i = 0; i < samplesPerFrame; i++) {
          const s = offset + i < sampleCount ? samples[offset + i] : 0;
          rawRms += s * s;
        }
        rawRms = Math.sqrt(rawRms / samplesPerFrame);

        // Asymmetric attack/release smoothing
        const smooth = (prev: number, raw: number) => {
          if (raw > prev) return prev + (raw - prev) * ATTACK;
          return prev + (raw - prev) * RELEASE;
        };
        sB = smooth(sB, rawBass);
        sM = smooth(sM, rawMid);
        sT = smooth(sT, rawTreble);
        sR = smooth(sR, rawRms);

        // Log-compressed FFT bins (NUM_BINS output bins)
        const logBins = new Float32Array(NUM_BINS);
        for (let b = 0; b < NUM_BINS; b++) {
          // Map output bin b to a log-scaled position in [1, halfSize]
          const lo = Math.floor(Math.pow(halfSize, b / NUM_BINS));
          const hi = Math.floor(Math.pow(halfSize, (b + 1) / NUM_BINS));
          let peak = 0;
          for (let i = lo; i <= Math.min(hi, halfSize - 1); i++) {
            if (mags[i] > peak) peak = mags[i];
          }
          // Normalise roughly to 0-1 range
          logBins[b] = Math.min(1, peak * 20);
        }

        frames.push({
          rms: parseFloat(sR.toFixed(4)),
          bassEnergy: parseFloat(sB.toFixed(4)),
          midEnergy: parseFloat(sM.toFixed(4)),
          trebleEnergy: parseFloat(sT.toFixed(4)),
          fftBins: Array.from(logBins).map(v => parseFloat(v.toFixed(3))),
        });
      }

      resolve({ fps, frameCount: frames.length, frames });
    });
    proc.on('error', reject);
    proc.stdout.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

app.post('/api/analyze', async (req, res) => {
  const { filename, fps = 30 } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });

  const cacheKey = `${filename}_${fps}fps`;
  const cachePath = path.join(ANALYSIS_DIR, `${cacheKey}.json`);

  // Return cached analysis if available
  if (fs.existsSync(cachePath)) {
    console.log(`[Analysis] Cache hit for ${cacheKey}`);
    return res.json({ success: true, analysisKey: cacheKey, cached: true });
  }

  const audioPath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  try {
    console.log(`[Analysis] Starting analysis for ${filename} at ${fps}fps...`);
    const analysis = await analyzeAudio(audioPath, fps);
    fs.writeFileSync(cachePath, JSON.stringify(analysis));
    console.log(`[Analysis] Done. ${analysis.frameCount} frames. Cached to ${cachePath}`);
    res.json({ success: true, analysisKey: cacheKey, frameCount: analysis.frameCount });
  } catch (err: any) {
    console.error('[Analysis] Failed:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

// Serve analysis JSON directly
app.get('/api/analysis/:key', (req, res) => {
  const cachePath = path.join(ANALYSIS_DIR, `${req.params.key}.json`);
  if (!fs.existsSync(cachePath)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(cachePath);
});

// ── Quick Preview (15s, 640x360) ─────────────────────────────────────────────
app.post('/api/preview', async (req, res) => {
  const track = req.body;
  if (!track || !track.path || !track.backgroundImage) {
    return res.status(400).json({ error: 'Missing track data or background image.' });
  }

  const audioPath = track.path;
  const imageFileName = path.basename(track.backgroundImage);
  const isUpload = track.backgroundImage.startsWith('/uploads/');
  const imagePath = path.join(isUpload ? UPLOADS_DIR : IMAGES_DIR, imageFileName);

  const safeTitle = (track.title || 'track').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const jobId = `preview_${safeTitle}_${Date.now()}`;
  const outputPath = path.join(RENDERS_DIR, `${jobId}.mp4`);

  if (!fs.existsSync(audioPath) || !fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Source files not found' });
  }

  res.json({ success: true, jobId, outputPath, message: 'Preview render started' });

  const SCALE = 2;
  const titleY = (track.titlePositionY || 0) * SCALE;
  const artistY = (track.artistPositionY || 0) * SCALE + 120;
  const tagsY = (track.tagsPositionY || 0) * SCALE + 200; // Fixed: was -200, but tags render below artist
  const titleX = (track.titlePositionX || 0) * SCALE;
  const artistX = (track.artistPositionX || 0) * SCALE;
  const tagsX = (track.tagsPositionX || 0) * SCALE;
  const titleSize = Math.round(100 * ((track.titleScale || 100) / 100));
  const artistSize = Math.round(50 * ((track.artistScale || 100) / 100));
  const tagsSize = Math.round(40 * ((track.tagsScale || 100) / 100));
  const svgFont = (f: string | undefined) => (f || 'system-ui').replace(/'/g, '"');
  const escXml = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const displayTags = (track.tags || '').replace(/,/g, ' • ');
  const cSize = (track.cornerSize || 60) * 2;
  const cThick = (track.cornerThickness || 6) * 2;
  const cOpacity = (track.cornerOpacity ?? 100) / 100;
  const cMargin = 40;
  const backOpacity = (track.backdropOpacity ?? 0) / 100;
  const backRx = Math.round(960 * ((track.backdropSpreadX ?? 80) / 100));
  const backRy = Math.round(540 * ((track.backdropSpreadY ?? 40) / 100));
  const backFalloff = track.backdropFalloff ?? 60;

  let waveMode = 'cline';
  let waveColor = 'white';
  if (track.waveformStyle === 'p2p' || track.waveformStyle === 'solid') waveMode = 'p2p';
  if (track.waveformStyle === 'bars' || track.waveformStyle === 'line') waveMode = 'line';
  if (track.waveformStyle === 'pulse') { waveMode = 'cline'; waveColor = track.waveformColor?.replace('#','') || '00FF66'; }
  else if (track.waveformColor && track.waveformColor !== '#ffffff') waveColor = track.waveformColor.replace('#','');
  const waveOpacity = (track.waveformOpacity ?? 75) / 100;
  const waveY = 1080 - 300 - 108 + (track.waveformPositionY || 0) * 2;

  const customTexts: any[] = Array.isArray(track.customTexts) ? track.customTexts : [];
  const customTextSvg = customTexts.map(ct => {
    const ctX = 960 + Math.round((ct.posX || 0) * (960/900));
    const ctY = 540 + Math.round((ct.posY || 0));
    return `<text x="${ctX}" y="${ctY}" font-family="${svgFont(ct.font)}" font-size="${Math.round((ct.size||36)*3.6)}px" font-weight="${ct.bold?800:400}" font-style="${ct.italic?'italic':'normal'}" fill="${ct.color||'#ffffff'}" opacity="${(ct.opacity??100)/100}" text-anchor="middle" dominant-baseline="middle">${escXml(ct.text)}</text>`;
  }).join('\n');

  const overlaySvg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bd" cx="50%" cy="50%" r="${Math.max(backRx, backRy) / 1920 * 100}%">
        <stop offset="0%" stop-color="black" stop-opacity="${backOpacity}"/>
        <stop offset="${backFalloff}%" stop-color="black" stop-opacity="${backOpacity}"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bd)"/>
    <g stroke="rgba(255,255,255,${cOpacity})" stroke-width="${cThick}" fill="none" stroke-linecap="square">
      <path d="M ${cMargin+cSize} ${cMargin} L ${cMargin} ${cMargin} L ${cMargin} ${cMargin+cSize}"/>
      <path d="M ${1920-cMargin-cSize} ${cMargin} L ${1920-cMargin} ${cMargin} L ${1920-cMargin} ${cMargin+cSize}"/>
      <path d="M ${cMargin+cSize} ${1080-cMargin} L ${cMargin} ${1080-cMargin} L ${cMargin} ${1080-cMargin-cSize}"/>
      <path d="M ${1920-cMargin-cSize} ${1080-cMargin} L ${1920-cMargin} ${1080-cMargin} L ${1920-cMargin} ${1080-cMargin-cSize}"/>
    </g>
    <text x="${960+titleX}" y="${540+titleY}" font-family="${svgFont(track.titleFont)}" font-size="${titleSize}px" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="middle">${escXml(track.title||'')}</text>
    <text x="${960+artistX}" y="${540+artistY}" font-family="${svgFont(track.artistFont)}" font-size="${artistSize}px" font-weight="500" fill="white" text-anchor="middle" dominant-baseline="middle">${escXml('by '+(track.artist||''))}</text>
    <text x="${960+tagsX}" y="${540+tagsY}" font-family="${svgFont(track.tagsFont)}" font-size="${tagsSize}px" font-weight="400" fill="#aaaaaa" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${escXml(displayTags)}</text>
    ${customTextSvg}
  </svg>`;

  const textOverlayPath = path.join(IMAGES_DIR, `text_prev_${track.id}_${Date.now()}.png`);
  const sharp = (await import('sharp')).default;
  try { await sharp(Buffer.from(overlaySvg)).png().toFile(textOverlayPath); } catch(e) { console.error('[Preview] SVG failed:', e); return; }

  const jobState: any = { status: 'rendering', progress: '00:00:00.00', title: `[PREVIEW] ${track.title}`, outputPath, thumbnail: track.backgroundImage, isPreview: true };
  renderProgress[jobId] = jobState;
  fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));

  (async () => {
    try {
      let finalImagePath = imagePath;
      let useFrameSequence = false;
      let framesDir = '';

      const hasEffects = track.visualEffects?.some((e: any) => e.enabled && (e.type === 'zoom_pulse' || e.type === 'camera_shake'));

      if (hasEffects) {
        renderProgress[jobId].progress = 'Generating effect frames (preview)...';
        fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        
        const audioFilename = path.basename(audioPath);
        const fps = 30;
        const cacheKey = `${audioFilename}_${fps}fps`;
        const analysisPath = path.join(ANALYSIS_DIR, `${cacheKey}.json`);
        
        if (!fs.existsSync(analysisPath)) {
          console.log(`[Preview] Analysis not found. Running analyzeAudio...`);
          const analysis = await analyzeAudio(audioPath, fps);
          fs.writeFileSync(analysisPath, JSON.stringify(analysis));
        }

        console.log(`[Preview] Generating frames for ${jobId}...`);
        framesDir = await generateFrames(jobId, imagePath, analysisPath, track.visualEffects || [], (p) => {
          renderProgress[jobId] = { ...renderProgress[jobId], progress: `Frames: ${Math.round(p * 100)}%` };
          fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        }, 450); // MAX 15 SECONDS (15 * 30fps)
        finalImagePath = path.join(framesDir, `frame_%05d.jpg`);
        useFrameSequence = true;
        renderProgress[jobId].progress = 'Encoding video...';
        fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
      }

      const filterGraph = [
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,hue=s=0,eq=contrast=1.2[bg_scaled]`
      ];

  if (track.waveformEnabled !== false) {
    filterGraph.push(`[1:a]showwaves=s=1920x300:mode=${waveMode}:colors=${waveColor}:scale=sqrt:draw=full[wave_base]`);
    const waveGlow = (track.waveformGlow ?? 0) / 100;
    if (waveGlow > 0) {
      const blurRadius = Math.max(1, Math.round(waveGlow * 30));
      filterGraph.push(
        `[wave_base]split[wave_sharp][wave_blur_src]`,
        `[wave_blur_src]boxblur=lr=${blurRadius}:cr=${blurRadius}[wave_blur]`,
        `[wave_blur][wave_sharp]blend=all_mode=addition[wave_merged]`,
        `[wave_merged]colorchannelmixer=aa=${waveOpacity}[wave_alpha]`
      );
    } else {
      filterGraph.push(`[wave_base]colorchannelmixer=aa=${waveOpacity}[wave_alpha]`);
    }
    filterGraph.push(`[bg_scaled][wave_alpha]overlay=0:${waveY}[bg_wave]`);
  } else {
    filterGraph.push(`[bg_scaled]copy[bg_wave]`);
  }

  filterGraph.push(`[bg_wave][2:v]overlay=0:0,scale=640:360[final]`);

      const ffmpeg = (await import('fluent-ffmpeg')).default;
      let command = ffmpeg();

      if (useFrameSequence) {
        command.input(finalImagePath).inputOptions(['-framerate 30']);
      } else {
        command.input(finalImagePath).inputOptions(['-loop 1', '-framerate 30']);
      }

      command
        .input(audioPath).inputOptions(['-t 15']) // first 15 seconds only
        .input(textOverlayPath).inputOptions(['-loop 1', '-framerate 30'])
        .complexFilter(filterGraph.join(';'))
        .outputOptions(['-map [final]','-map 1:a','-c:v libx264','-preset ultrafast','-crf 35',
          '-c:a aac','-b:a 96k','-pix_fmt yuv420p','-shortest'])
        .save(outputPath)
        .on('progress', p => { 
          renderProgress[jobId] = { ...jobState, progress: p.timemark }; 
          fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        })
        .on('end', () => {
          const done = { ...jobState, status: 'completed', progress: 'DONE' };
          renderProgress[jobId] = done;
          fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(done));
          console.log(`[Preview] Done: ${outputPath}`);
        })
        .on('error', (err: any) => {
          console.error('[Preview] FFmpeg error:', err.message);
          renderProgress[jobId] = { ...jobState, status: 'error', error: err.message };
          fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        });
    } catch (err: any) {
      console.error('[Preview] Background processing failed:', err);
      renderProgress[jobId] = { ...renderProgress[jobId], status: 'error', error: err.message || 'Background processing failed' };
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
    }
  })();
});

// ── Render pipeline ───────────────────────────────────────────────────────────

app.post('/api/render', async (req, res) => {
  const track = req.body;
  console.log(`[API] Received render request for track: ${track?.title}`);
  
  if (!track || !track.path || !track.backgroundImage) {
    console.error(`[API] Missing track data or background image for ${track?.title}`);
    return res.status(400).json({ error: 'Missing track data or background image.' });
  }

  const audioPath = track.path;
  const imageFileName = path.basename(track.backgroundImage);
  const isUpload = track.backgroundImage.startsWith('/uploads/');
  const imagePath = path.join(isUpload ? UPLOADS_DIR : IMAGES_DIR, imageFileName);
  
  const safeTitle = track.title ? track.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'track';
  const jobId = `${safeTitle}_${Date.now()}`;
  const outputPath = path.join(RENDERS_DIR, `${jobId}.mp4`);

  console.log(`[API] Audio Path: ${audioPath}`);
  console.log(`[API] Image Path: ${imagePath}`);
  console.log(`[API] Output Path: ${outputPath}`);

  if (!fs.existsSync(audioPath) || !fs.existsSync(imagePath)) {
    console.error(`[API] Source files not found locally for ${track.title}`);
    return res.status(404).json({ error: 'Source files not found locally' });
  }

  res.json({ success: true, message: 'Render started', outputPath, jobId });

  console.log(`[API] Bootstrapping FFmpeg for ${track.title}...`);
 
  const jobState = { 
    status: 'rendering', 
    progress: '00:00:00.00', 
    title: track.title, 
    artist: track.artist,
    comment: track.comment,
    lyrics: track.lyrics,
    tags: track.tags,
    outputPath, 
    thumbnail: track.backgroundImage 
  };
  renderProgress[jobId] = jobState;
  fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));

  // Base text sizes for 1920x1080
  const titleSize = Math.round(100 * ((track.titleScale || 100) / 100));
  const artistSize = Math.round(50 * ((track.artistScale || 100) / 100));
  const tagsSize = Math.round(40 * ((track.tagsScale || 100) / 100));

  // Y offsets (relative to center 540)
  // User offsets are in preview-pixel space (~540px tall). Scale ×2 to map to 1080p.
  const SCALE = 2;
  const titleY = (track.titlePositionY || 0) * SCALE;
  const artistY = (track.artistPositionY || 0) * SCALE + 120;
  // Tags default: render above title to match preview layout (tags sit above title in flex-col)
  const tagsY = (track.tagsPositionY || 0) * SCALE + 200;

  // X offsets (relative to center 960) — same ×2 scale
  const titleX = (track.titlePositionX || 0) * SCALE;
  const artistX = (track.artistPositionX || 0) * SCALE;
  const tagsX = (track.tagsPositionX || 0) * SCALE;

  // Font families — map UI values to SVG-safe web-safe equivalents
  const svgFont = (f: string | undefined) => {
    // Just pass through; SVG will use system fallback
    return (f || 'system-ui, -apple-system, sans-serif').replace(/'/g, '"');
  };

  // L Corners properties (scaled up for 1080p, approx x2)
  const cSize = (track.cornerSize || 60) * 2;
  const cThick = (track.cornerThickness || 6) * 2;
  const cOpacity = (track.cornerOpacity ?? 100) / 100;
  const cMargin = 40;

  // Backdrop mapping
  const backOpacity = (track.backdropOpacity ?? 0) / 100;
  // spreadX/Y are percentages (0–200), map to fraction of half-canvas dimensions
  // rx = half-width  * spreadX/100 → full radius in pixels
  // ry = half-height * spreadY/100
  const backRx = Math.round(960  * ((track.backdropSpreadX ?? 80)  / 100));
  const backRy = Math.round(540  * ((track.backdropSpreadY ?? 40)  / 100));
  // Falloff: percentage where the full-opacity hold ends and the drop to transparent begins
  const backFalloff = track.backdropFalloff ?? 60;

  let waveMode = 'cline';
  let waveColor = 'white';
  if (track.waveformStyle === 'p2p' || track.waveformStyle === 'solid') waveMode = 'p2p';
  if (track.waveformStyle === 'bars') waveMode = 'line';
  if (track.waveformStyle === 'line') waveMode = 'line';
  if (track.waveformStyle === 'pulse') {
    waveMode = 'cline';
    waveColor = track.waveformColor?.replace('#', '') || '00FF66';
  } else if (track.waveformColor && track.waveformColor !== '#ffffff') {
    waveColor = track.waveformColor.replace('#', '');
  }

  const waveThickness = Math.max(1, Math.round((track.waveformThickness || 2) * 2)); // scale up for 1080p

  const waveOpacity = (track.waveformOpacity ?? 75) / 100;
  const waveGlow = (track.waveformGlow ?? 0) / 100;
  // Offset waveform from the bottom 10% (108px) + waveY * 2 for 1080p scale
  const waveY = 1080 - 300 - 108 + (track.waveformPositionY || 0) * 2;
  
  const displayTags = (track.tags || '').replace(/,/g, ' • ');
  
  // Create an SVG overlay instead of using drawtext
  const escXml = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeTitleText = escXml(track.title || '');
  const safeArtistText = escXml(`by ${track.artist || ''}`);
  const safeTagsText = escXml(displayTags);

  // Custom text layers
  const customTexts: Array<{
    id: string; text: string; font: string; size: number;
    posX: number; posY: number; color: string; bold: boolean; italic: boolean; opacity: number;
  }> = Array.isArray(track.customTexts) ? track.customTexts : [];

  const customTextSvg = customTexts.map(ct => {
    const ctFont = svgFont(ct.font);
    const ctWeight = ct.bold ? 800 : 400;
    const ctStyle = ct.italic ? 'italic' : 'normal';
    // size is 10-200pt in the UI; scale to 1920x1080 (36pt ≈ 130px at 1080p)
    const ctSize = Math.round((ct.size || 36) * 3.6);
    // posX: -900..900 maps to -960..960 around center 960 → clamp to 1920 width
    const ctX = 960 + Math.round((ct.posX || 0) * (960 / 900));
    const ctY = 540 + Math.round((ct.posY || 0));
    return `<text x="${ctX}" y="${ctY}" font-family="${ctFont}" font-size="${ctSize}px" font-weight="${ctWeight}" font-style="${ctStyle}" fill="${ct.color || '#ffffff'}" opacity="${(ct.opacity ?? 100) / 100}" text-anchor="middle" dominant-baseline="middle">${escXml(ct.text)}</text>`;
  }).join('\n      ');

  const overlaySvg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bd" cx="50%" cy="50%" r="${Math.max(backRx, backRy) / 1920 * 100}%">
        <stop offset="0%" stop-color="black" stop-opacity="${backOpacity}"/>
        <stop offset="${backFalloff}%" stop-color="black" stop-opacity="${backOpacity}"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bd)"/>
    <g stroke="rgba(255,255,255,${cOpacity})" stroke-width="${cThick}" fill="none" stroke-linecap="square">
      <path d="M ${cMargin+cSize} ${cMargin} L ${cMargin} ${cMargin} L ${cMargin} ${cMargin+cSize}"/>
      <path d="M ${1920-cMargin-cSize} ${cMargin} L ${1920-cMargin} ${cMargin} L ${1920-cMargin} ${cMargin+cSize}"/>
      <path d="M ${cMargin+cSize} ${1080-cMargin} L ${cMargin} ${1080-cMargin} L ${cMargin} ${1080-cMargin-cSize}"/>
      <path d="M ${1920-cMargin-cSize} ${1080-cMargin} L ${1920-cMargin} ${1080-cMargin} L ${1920-cMargin} ${1080-cMargin-cSize}"/>
    </g>
    <text x="${960+titleX}" y="${540+titleY}" font-family="${svgFont(track.titleFont)}" font-size="${titleSize}px" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="middle">${safeTitleText}</text>
    <text x="${960+artistX}" y="${540+artistY}" font-family="${svgFont(track.artistFont)}" font-size="${artistSize}px" font-weight="500" fill="white" text-anchor="middle" dominant-baseline="middle">${safeArtistText}</text>
    <text x="${960+tagsX}" y="${540+tagsY}" font-family="${svgFont(track.tagsFont)}" font-size="${tagsSize}px" font-weight="400" fill="#aaaaaa" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${safeTagsText}</text>
    ${customTextSvg}
  </svg>`;

  const textOverlayPath = path.join(IMAGES_DIR, `text_${track.id}_${Date.now()}.png`);
  
  try {
    await sharp(Buffer.from(overlaySvg)).png().toFile(textOverlayPath);
  } catch (err) {
    console.error(`[API] Failed to generate SVG text overlay:`, err);
    renderProgress[track.id] = { status: 'error', error: 'Text rendering failed', title: track.title };
    return;
  }

  (async () => {
    try {
      let finalImagePath = imagePath;
      let useFrameSequence = false;
      let framesDir = '';

      const hasEffects = track.visualEffects?.some((e: any) => e.enabled && (e.type === 'zoom_pulse' || e.type === 'camera_shake'));

      if (hasEffects) {
        renderProgress[jobId].progress = 'Generating effect frames...';
        fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        
        const audioFilename = path.basename(audioPath);
        const fps = 30;
        const cacheKey = `${audioFilename}_${fps}fps`;
        const analysisPath = path.join(ANALYSIS_DIR, `${cacheKey}.json`);
        
        if (!fs.existsSync(analysisPath)) {
          console.log(`[Render] Analysis not found for frame generator. Please wait...`);
          const analysis = await analyzeAudio(audioPath, fps);
          fs.writeFileSync(analysisPath, JSON.stringify(analysis));
        }

        console.log(`[Render] Generating frames for ${jobId}...`);
        framesDir = await generateFrames(jobId, imagePath, analysisPath, track.visualEffects || [], (p) => {
          renderProgress[jobId] = { ...renderProgress[jobId], progress: `Frames: ${Math.round(p * 100)}%` };
          fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
        });
        finalImagePath = path.join(framesDir, `frame_%05d.jpg`);
        useFrameSequence = true;
        renderProgress[jobId].progress = 'Encoding video...';
        fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
      }

      const filterGraph = [
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,hue=s=0,eq=contrast=1.2[bg_scaled]`
      ];

  if (track.waveformEnabled !== false) {
    filterGraph.push(`[1:a]showwaves=s=1920x300:mode=${waveMode}:colors=${waveColor}:scale=sqrt:draw=full[wave_base]`);
    if (waveGlow > 0) {
      const blurRadius = Math.max(1, Math.round(waveGlow * 30));
      filterGraph.push(
        `[wave_base]split[wave_sharp][wave_blur_src]`,
        `[wave_blur_src]boxblur=lr=${blurRadius}:cr=${blurRadius}[wave_blur]`,
        `[wave_blur][wave_sharp]blend=all_mode=addition[wave_merged]`,
        `[wave_merged]colorchannelmixer=aa=${waveOpacity}[wave_alpha]`
      );
    } else {
      filterGraph.push(`[wave_base]colorchannelmixer=aa=${waveOpacity}[wave_alpha]`);
    }
    filterGraph.push(`[bg_scaled][wave_alpha]overlay=0:${waveY}[bg_wave]`);
  } else {
    filterGraph.push(`[bg_scaled]copy[bg_wave]`);
  }

  filterGraph.push(`[bg_wave][2:v]overlay=0:0[final]`);

  // FFmpeg pipeline
  let command = ffmpeg();

  if (useFrameSequence) {
    command.input(finalImagePath).inputOptions(['-framerate 30']);
  } else {
    command.input(finalImagePath).inputOptions(['-loop 1', '-framerate 30']);
  }

  command
    .input(audioPath)
    .input(textOverlayPath)
    .inputOptions(['-loop 1', '-framerate 30'])
    .complexFilter(filterGraph.join(';'))
    .outputOptions([
      '-map [final]',
      '-map 1:a',
      '-c:v libx264',
      '-preset fast',
      '-crf 26',
      '-c:a aac',
      '-b:a 192k',
      '-pix_fmt yuv420p',
      '-shortest',
      '-map_metadata', '-1' // Strip original metadata to respect user deletions
    ]);

  // Add metadata options safely by passing arguments directly to avoid space splitting
  if (track.title) command = command.outputOptions('-metadata', `title=${track.title}`);
  if (track.artist) command = command.outputOptions('-metadata', `artist=${track.artist}`);
  if (track.album) command = command.outputOptions('-metadata', `album=${track.album}`);
  if (track.genre) command = command.outputOptions('-metadata', `genre=${track.genre}`);
  if (track.comment) command = command.outputOptions('-metadata', `comment=${track.comment}`);
  if (track.lyrics) command = command.outputOptions('-metadata', `lyrics-eng=${track.lyrics}`);
  if (track.year) command = command.outputOptions('-metadata', `date=${track.year}`);

  command
    .save(outputPath)
    .on('start', (commandLine) => {
      console.log('\n================ FFmpeg START ================');
      console.log('Command:', commandLine);
      console.log('==============================================\n');
    })
    .on('progress', (progress) => {
      renderProgress[jobId] = { status: 'rendering', progress: progress.timemark, title: track.title, outputPath, thumbnail: track.backgroundImage };
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
    })
    .on('stderr', (stderrLine) => {
      // Optional: log every line of FFmpeg stderr for deep debugging
      // console.log('[FFmpeg stderr]', stderrLine);
    })
    .on('error', (err, stdout, stderr) => {
      console.error('\n================ FFmpeg ERROR ================');
      console.error('Error message:', err.message);
      console.error('FFmpeg stderr output:\n', stderr);
      console.error('==============================================\n');
      
      const jobState = { status: 'error', error: err.message, title: track.title, outputPath, thumbnail: track.backgroundImage, stderr };
      renderProgress[jobId] = jobState;
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));
    })
    .on('end', () => {
      console.log(`\n✅ Render complete! Saved to ${outputPath}\n`);
      const jobState = { status: 'completed', outputPath, title: track.title, thumbnail: track.backgroundImage };
      renderProgress[jobId] = jobState;
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(jobState));
      // Optional: cleanup the text PNG here if desired
    });
    } catch (err: any) {
      console.error('[Render] Background processing failed:', err);
      renderProgress[jobId] = { status: 'error', error: err.message || 'Background processing failed', title: track.title, outputPath, thumbnail: track.backgroundImage };
      fs.writeFileSync(path.join(RENDERS_DIR, `${jobId}.json`), JSON.stringify(renderProgress[jobId]));
    }
  })();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Backend API Server listening on port ${PORT}\n`);
});
