import React, { useState, useRef, useEffect } from 'react';
import { Settings, Upload, PlaySquare, Music, Headphones, Trash2, ChevronUp, ChevronDown, Play, FolderOpen, UploadCloud, MonitorUp, X, Plus, Type } from 'lucide-react';
import './App.css';

// Google Fonts available for selection
const AVAILABLE_FONTS = [
  { label: 'System Default', value: 'system-ui, -apple-system, sans-serif', googleFont: null },
  { label: 'Inter', value: 'Inter, sans-serif', googleFont: 'Inter' },
  { label: 'Space Grotesk', value: 'Space Grotesk, sans-serif', googleFont: 'Space+Grotesk' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace', googleFont: 'JetBrains+Mono' },
  { label: 'Oswald', value: 'Oswald, sans-serif', googleFont: 'Oswald' },
  { label: 'Bebas Neue', value: 'Bebas Neue, cursive', googleFont: 'Bebas+Neue' },
  { label: 'Playfair Display', value: 'Playfair Display, serif', googleFont: 'Playfair+Display' },
  { label: 'Cinzel', value: 'Cinzel, serif', googleFont: 'Cinzel' },
  { label: 'Rajdhani', value: 'Rajdhani, sans-serif', googleFont: 'Rajdhani' },
  { label: 'Orbitron', value: 'Orbitron, sans-serif', googleFont: 'Orbitron' },
  { label: 'Exo 2', value: 'Exo 2, sans-serif', googleFont: 'Exo+2' },
  { label: 'Russo One', value: 'Russo One, sans-serif', googleFont: 'Russo+One' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif', googleFont: 'Montserrat' },
  { label: 'Lato', value: 'Lato, sans-serif', googleFont: 'Lato' },
  { label: 'Roboto Condensed', value: 'Roboto Condensed, sans-serif', googleFont: 'Roboto+Condensed' },
];

// Inject a Google Font link tag
function loadGoogleFont(fontName: string | null) {
  if (!fontName) return;
  const id = `gfont-${fontName.replace(/\+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;500;700;800;900&display=swap`;
  document.head.appendChild(link);
}

interface CustomText {
  id: string;
  text: string;
  font: string;
  size: number;
  posX: number;
  posY: number;
  color: string;
  bold: boolean;
  italic: boolean;
  opacity: number;
}

// ---- Prompt DNA system ----
type ColorProfile = 'black_and_white' | 'color' | 'sepia' | 'neon';
type AspectRatio = '16:9' | '1:1' | '9:16' | '4:3';

interface PromptConfig {
  artType: string;
  mood: string;
  lighting: string;
  texture: string;
  focalPoint: string;
  extraNudge: string;
  colorProfile: ColorProfile;
  aspectRatio: AspectRatio;
  noText: boolean;
  noFaces: boolean;
}

interface GlobalPromptDNA {
  colorProfile: ColorProfile;
  aspectRatio: AspectRatio;
  noText: boolean;
  noFaces: boolean;
  defaultArtType: string;
  defaultMood: string;
  defaultLighting: string;
  defaultTexture: string;
  defaultFocalPoint: string;
}

const DEFAULT_DNA: GlobalPromptDNA = {
  colorProfile: 'black_and_white',
  aspectRatio: '16:9',
  noText: true,
  noFaces: false,
  defaultArtType: 'background for song art cover',
  defaultMood: 'abstract, artistic',
  defaultLighting: 'dramatic',
  defaultTexture: 'smooth yet chaotic',
  defaultFocalPoint: 'dark in centre',
};

function loadDNA(): GlobalPromptDNA {
  try {
    const s = localStorage.getItem('soundsync_prompt_dna');
    if (s) return { ...DEFAULT_DNA, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_DNA };
}

function saveDNA(dna: GlobalPromptDNA) {
  localStorage.setItem('soundsync_prompt_dna', JSON.stringify(dna));
}

function makePromptConfig(dna: GlobalPromptDNA): PromptConfig {
  return {
    artType: dna.defaultArtType,
    mood: dna.defaultMood,
    lighting: dna.defaultLighting,
    texture: dna.defaultTexture,
    focalPoint: dna.defaultFocalPoint,
    extraNudge: '',
    colorProfile: dna.colorProfile,
    aspectRatio: dna.aspectRatio,
    noText: dna.noText,
    noFaces: dna.noFaces,
  };
}

const COLOR_PROFILE_LABELS: Record<ColorProfile, string> = {
  black_and_white: 'black and white, monochrome',
  color: 'vivid, full color',
  sepia: 'sepia toned, warm vintage',
  neon: 'neon colors, vibrant, glowing',
};

function buildPrompt(config: PromptConfig, songTitle: string, tags: string): string {
  const descriptor: Record<string, string | boolean | string[]> = {
    type: config.artType,
    song_title: songTitle || '',
    genre_tags: tags || '',
    mood: config.mood,
    lighting: config.lighting,
    texture: config.texture,
    focal_point: config.focalPoint,
    color_profile: COLOR_PROFILE_LABELS[config.colorProfile],
    aspect_ratio: config.aspectRatio,
  };

  const constraints: string[] = [];
  if (config.noText) {
    constraints.push('IMPORTANT: absolutely no text, no words, no letters, no numbers, no typography, no captions, no watermarks anywhere in the image');
  }
  if (config.noFaces) {
    constraints.push('no faces, no people, no portraits');
  }
  if (constraints.length) descriptor.constraints = constraints;

  if (config.extraNudge) descriptor.additional_notes = config.extraNudge;

  // Remove empty string values to keep JSON clean
  Object.keys(descriptor).forEach(k => {
    if (descriptor[k] === '') delete descriptor[k];
  });

  return JSON.stringify(descriptor, null, 2);
}

// ---- Audio-reactive effect presets ----
type EffectType = 'chromatic_aberration' | 'zoom_pulse' | 'camera_shake' | 'vignette_pulse' | 'displacement';

interface EffectPreset {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string>;
}

const DEFAULT_EFFECT_PARAMS: Record<EffectType, Record<string, number | string>> = {
  chromatic_aberration: { intensity: 50, maxOffset: 8, frequencyBand: 'treble' },
  zoom_pulse:           { strength: 30, releaseSpeed: 0.08, frequencyBand: 'bass' },
  camera_shake:         { intensity: 40, frequency: 60, frequencyBand: 'bass' },
  vignette_pulse:       { baseOpacity: 20, pulseStrength: 40, radius: 70, frequencyBand: 'bass' },
  displacement:         { intensity: 30, noiseScale: 4, frequencyBand: 'mid' },
};

interface Track {
  id: string;
  originalName: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  comment: string;
  lyrics: string;
  tags: string;
  promptConfig: PromptConfig;
  aiModel: string;
  backgroundImage: string | null;
  // Waveform
  waveformEnabled: boolean;
  waveformStyle: string;
  waveformAmplitude: number;
  waveformOpacity: number;
  waveformPositionY: number;
  waveformThickness: number;
  waveformColor: string;
  waveformGlow: number;
  waveformFreqMode: 'linear' | 'log';
  // Image effects
  visualEffects: EffectPreset[];
  // Typography
  titleScale: number;
  artistScale: number;
  tagsScale: number;
  titleFont: string;
  artistFont: string;
  tagsFont: string;
  titlePositionY: number;
  artistPositionY: number;
  tagsPositionY: number;
  titlePositionX: number;
  artistPositionX: number;
  tagsPositionX: number;
  cornerThickness: number;
  cornerSize: number;
  cornerOpacity: number;
  backdropOpacity: number;
  backdropSpreadX: number;
  backdropSpreadY: number;
  backdropFalloff: number;
  customTexts: CustomText[];
}

export interface TrackPreset {
  id: string;
  name: string;
  isBase?: boolean;
  waveformEnabled: boolean;
  waveformStyle: string;
  waveformAmplitude: number;
  waveformOpacity: number;
  waveformPositionY: number;
  waveformThickness: number;
  waveformColor: string;
  waveformGlow: number;
  waveformFreqMode: 'linear' | 'log';
  visualEffects: EffectPreset[];
  titleScale: number;
  artistScale: number;
  tagsScale: number;
  titleFont: string;
  artistFont: string;
  tagsFont: string;
  titlePositionY: number;
  artistPositionY: number;
  tagsPositionY: number;
  titlePositionX: number;
  artistPositionX: number;
  tagsPositionX: number;
  cornerThickness: number;
  cornerSize: number;
  cornerOpacity: number;
  backdropOpacity: number;
  backdropSpreadX: number;
  backdropSpreadY: number;
  backdropFalloff: number;
  customTexts: CustomText[];
}

export const BASE_PRESET: TrackPreset = {
  id: 'base-default',
  name: 'Factory Default',
  isBase: true,
  waveformEnabled: true,
  waveformStyle: "cline",
  waveformAmplitude: 100,
  waveformOpacity: 75,
  waveformPositionY: 0,
  waveformThickness: 2,
  waveformColor: '#ffffff',
  waveformGlow: 0,
  waveformFreqMode: 'log',
  visualEffects: [],
  titleScale: 100,
  artistScale: 100,
  tagsScale: 100,
  titleFont: 'system-ui, -apple-system, sans-serif',
  artistFont: 'system-ui, -apple-system, sans-serif',
  tagsFont: 'JetBrains Mono, monospace',
  titlePositionY: 0,
  artistPositionY: 120,
  tagsPositionY: 200,
  titlePositionX: 0,
  artistPositionX: 0,
  tagsPositionX: 0,
  cornerThickness: 2,
  cornerSize: 30,
  cornerOpacity: 60,
  backdropOpacity: 40,
  backdropSpreadX: 80,
  backdropSpreadY: 40,
  backdropFalloff: 60,
  customTexts: [],
};

interface AIModel {
  id: string;
  displayName: string;
  description: string;
}

// ---- WaveformCanvas: polished audio-reactive canvas ----
// Seeded PRNG (Xorshift32) — same seed = same shake offsets every frame
function xorshift32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

interface AnalysisFrame {
  rms: number; bassEnergy: number; midEnergy: number; trebleEnergy: number;
  fftBins: number[];
}
interface Analysis { fps: number; frameCount: number; frames: AnalysisFrame[]; }

const WaveformCanvas: React.FC<{ track: Track }> = ({ track }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioDataRef = useRef<Float32Array | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<number>(0);

  // Decode static RMS for fallback waveform rendering
  useEffect(() => {
    let cancelled = false;
    audioDataRef.current = null;
    const decode = async () => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const resp = await fetch(`/uploads/${track.filename}`);
        if (!resp.ok) throw new Error('fetch failed');
        const ab = await resp.arrayBuffer();
        if (cancelled) return;
        const decoded = await audioCtx.decodeAudioData(ab);
        if (cancelled) return;
        const ch = decoded.getChannelData(0);
        const samples = 600;
        const block = Math.floor(ch.length / samples);
        const rms = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          let s = 0;
          for (let j = 0; j < block; j++) { const v = ch[i * block + j]; s += v * v; }
          rms[i] = Math.sqrt(s / block);
        }
        audioDataRef.current = rms;
        audioCtx.close();
      } catch {
        const fake = new Float32Array(600);
        for (let i = 0; i < 600; i++)
          fake[i] = Math.abs(Math.sin(i * 0.07) * 0.4 + (Math.random() - 0.5) * 0.15 + 0.1);
        if (!cancelled) audioDataRef.current = fake;
      }
    };
    decode();
    return () => { cancelled = true; };
  }, [track.filename]);

  // Animation loop — re-starts when visual config changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const data = audioDataRef.current;
      const amplitude = (track.waveformAmplitude || 100) / 100;
      const style = track.waveformStyle || 'cline';
      const thickness = track.waveformThickness || 2;
      const baseColor = track.waveformColor || (style === 'pulse' ? '#00FF66' : '#ffffff');
      const glowAmount = (track.waveformGlow ?? (style === 'pulse' ? 40 : 0)) / 100;
      const freqMode = track.waveformFreqMode || 'log';

      phaseRef.current += 0.006;
      const phase = phaseRef.current;

      if (!data) {
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = thickness;
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        ctx.globalAlpha = 1;
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const N = data.length;

      // Resolve amplitude at a canvas x position using log or linear freq mapping
      const getAmp = (xNorm: number): number => {
        let dIdx: number;
        if (freqMode === 'log') {
          // Map x (0..1) logarithmically across N samples so bass/mid/treble spread evenly
          dIdx = Math.floor(Math.pow(N, xNorm) - 1);
        } else {
          dIdx = Math.floor(xNorm * N);
        }
        dIdx = Math.max(0, Math.min(N - 1, dIdx));
        // Baseline LFO keeps animation alive during silence
        const lfo = Math.sin(phase * 0.8 + xNorm * 6) * 0.015;
        return Math.min(1, (data[dIdx] + lfo) * amplitude * 3.0);
      };

      // Build smooth Bezier path (top half)
      const buildSmoothPath = (flip: boolean) => {
        const STEPS = Math.min(W, 200);
        const pts: [number, number][] = [];
        for (let i = 0; i <= STEPS; i++) {
          const xNorm = i / STEPS;
          const amp = getAmp(xNorm);
          const y = flip
            ? H / 2 + amp * (H / 2) * 0.88
            : H / 2 - amp * (H / 2) * 0.88;
          pts.push([xNorm * W, y]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const cpx = (pts[i][0] + pts[i + 1][0]) / 2;
          const cpy = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], cpx, cpy);
        }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      };

      // Build closed waveform shape (top + bottom mirror)
      const buildClosedPath = () => {
        const STEPS = Math.min(W, 200);
        const pts: [number, number][] = [];
        // Top pass
        for (let i = 0; i <= STEPS; i++) {
          const xNorm = i / STEPS;
          pts.push([xNorm * W, H / 2 - getAmp(xNorm) * (H / 2) * 0.88]);
        }
        // Bottom pass (reversed)
        for (let i = STEPS; i >= 0; i--) {
          const xNorm = i / STEPS;
          pts.push([xNorm * W, H / 2 + getAmp(xNorm) * (H / 2) * 0.88]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const cpx = (pts[i][0] + pts[i + 1][0]) / 2;
          const cpy = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], cpx, cpy);
        }
        ctx.closePath();
      };

      // Multi-pass bloom: draw blurred glow layer behind the crisp stroke
      const drawWithGlow = (drawFn: () => void, strokeFn: () => void) => {
        if (glowAmount > 0) {
          ctx.save();
          ctx.filter = `blur(${Math.round(glowAmount * 18)}px)`;
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = thickness * 2.5;
          ctx.globalAlpha = glowAmount * 0.6;
          drawFn();
          ctx.stroke();
          ctx.filter = 'none';
          ctx.restore();
        }
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = thickness;
        ctx.globalAlpha = 1;
        strokeFn();
        ctx.stroke();
      };

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (style === 'bars') {
        const numBars = 80;
        const gap = 2;
        const barW = Math.max(1, (W / numBars) - gap);
        for (let i = 0; i < numBars; i++) {
          const xNorm = (freqMode === 'log')
            ? Math.pow(i / numBars, 1.5)  // log spacing for bars
            : i / numBars;
          const amp = getAmp(xNorm);
          const h = amp * H;
          const x = i * (W / numBars);
          // Glow layer
          if (glowAmount > 0) {
            ctx.save();
            ctx.filter = `blur(${Math.round(glowAmount * 10)}px)`;
            ctx.fillStyle = baseColor;
            ctx.globalAlpha = glowAmount * 0.5;
            ctx.fillRect(x, H / 2 - h / 2, barW, h);
            ctx.filter = 'none';
            ctx.restore();
          }
          ctx.fillStyle = baseColor;
          ctx.globalAlpha = 1;
          ctx.fillRect(x, H / 2 - h / 2, barW, h);
        }
      } else if (style === 'cline' || style === 'pulse') {
        drawWithGlow(
          () => { buildClosedPath(); },
          () => {
            // Fill
            buildClosedPath();
            ctx.fillStyle = baseColor;
            ctx.globalAlpha = 0.12;
            ctx.fill();
            ctx.globalAlpha = 1;
            buildClosedPath();
          }
        );
      } else if (style === 'line') {
        // Single smooth midline (no fill)
        drawWithGlow(
          () => { buildSmoothPath(false); },
          () => { buildSmoothPath(false); }
        );
      } else if (style === 'p2p' || style === 'solid') {
        buildClosedPath();
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [track.waveformStyle, track.waveformAmplitude, track.waveformThickness,
      track.waveformColor, track.waveformGlow, track.waveformFreqMode]);

  if (!(track.waveformEnabled ?? true)) return null;

  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={300}
      style={{
        position: 'absolute',
        left: 0,
        top: `${track.waveformPositionY}px`,
        width: '100%',
        height: '100%',
        opacity: (track.waveformOpacity || 75) / 100,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
};

// Pre-load ALL Google Fonts once at startup so option labels are styled immediately
function preloadAllFonts() {
  AVAILABLE_FONTS.forEach(f => loadGoogleFont(f.googleFont));
}
preloadAllFonts();

// ---- FontSelect: custom dropdown — each option styled in its own font ----
const FontSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chosen = AVAILABLE_FONTS.find(f => f.value === value) || AVAILABLE_FONTS[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.5rem 0.75rem',
          cursor: 'pointer',
          fontFamily: chosen.value,
          fontSize: '0.85rem',
          color: 'var(--text-main)',
          transition: 'border-color 0.15s',
          ...(open ? { borderColor: 'var(--text-main)' } : {}),
        }}
      >
        <span>{chosen.label}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, marginLeft: '0.5rem', opacity: 0.5, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#111',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
          maxHeight: '280px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {AVAILABLE_FONTS.map(f => {
            const isActive = f.value === value;
            return (
              <div
                key={f.value}
                onClick={() => { onChange(f.value); setOpen(false); }}
                style={{
                  padding: '0.6rem 0.85rem',
                  fontFamily: f.value,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  borderLeft: isActive ? '2px solid #00FF66' : '2px solid transparent',
                  transition: 'background 0.1s, color 0.1s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                    (e.currentTarget as HTMLDivElement).style.color = '#fff';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.65)';
                  }
                }}
              >
                {f.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---- TypographyTab: full text config panel ----
interface TypographyTabProps {
  track: Track;
  updateActiveTrack: (field: keyof Track, value: any) => void;
  updateCustomTexts: (texts: CustomText[]) => void;
}

const TypographyTab: React.FC<TypographyTabProps> = ({ track, updateActiveTrack, updateCustomTexts }) => {
  const addCustomText = () => {
    const newText: CustomText = {
      id: Date.now().toString(),
      text: 'Custom Text',
      font: 'system-ui, -apple-system, sans-serif',
      size: 36,
      posX: 0,
      posY: 100,
      color: '#ffffff',
      bold: false,
      italic: false,
      opacity: 100,
    };
    updateCustomTexts([...(track.customTexts || []), newText]);
  };

  const updateCustomText = (id: string, field: keyof CustomText, value: any) => {
    updateCustomTexts((track.customTexts || []).map(ct =>
      ct.id === id ? { ...ct, [field]: value } : ct
    ));
  };

  const removeCustomText = (id: string) => {
    updateCustomTexts((track.customTexts || []).filter(ct => ct.id !== id));
  };

  const sectionLabel: React.CSSProperties = {
    color: '#fff', display: 'block', marginBottom: '0.75rem', marginTop: '1.5rem',
    fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase'
  };

  const row: React.CSSProperties = { marginBottom: '1rem' };
  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' };

  return (
    <div className="flex-col gap-4">
      {/* ── TITLE ── */}
      <label style={sectionLabel}>TITLE TEXT</label>
      <div style={row}>
        <label>Font</label>
        <FontSelect value={track.titleFont || 'system-ui, -apple-system, sans-serif'} onChange={v => updateActiveTrack('titleFont', v)} />
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>Scale</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.titleScale}%</span>
          </div>
          <input type="range" min="20" max="300" value={track.titleScale} onChange={e => updateActiveTrack('titleScale', e.target.value)} />
        </div>
        <div>
          <div className="flex justify-between">
            <label>Opacity</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>100%</span>
          </div>
          <input type="range" min="0" max="100" defaultValue={100} disabled />
        </div>
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>X Offset</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.titlePositionX}px</span>
          </div>
          <input type="range" min="-960" max="960" value={track.titlePositionX || 0} onChange={e => updateActiveTrack('titlePositionX', e.target.value)} />
        </div>
        <div>
          <div className="flex justify-between">
            <label>Y Offset</label>
            <span className="mono" style={{ fontSize: '0.65rem' }}>{track.titlePositionY}px</span>
          </div>
          <input type="range" min="-540" max="540" value={track.titlePositionY} onChange={e => updateActiveTrack('titlePositionY', e.target.value)} />
        </div>
      </div>

      {/* ── ARTIST ── */}
      <label style={sectionLabel}>ARTIST TEXT</label>
      <div style={row}>
        <label>Font</label>
        <FontSelect value={track.artistFont || 'system-ui, -apple-system, sans-serif'} onChange={v => updateActiveTrack('artistFont', v)} />
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>Scale</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.artistScale}%</span>
          </div>
          <input type="range" min="20" max="300" value={track.artistScale} onChange={e => updateActiveTrack('artistScale', e.target.value)} />
        </div>
        <div />
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>X Offset</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.artistPositionX}px</span>
          </div>
          <input type="range" min="-960" max="960" value={track.artistPositionX || 0} onChange={e => updateActiveTrack('artistPositionX', e.target.value)} />
        </div>
        <div>
          <div className="flex justify-between">
            <label>Y Offset</label>
            <span className="mono" style={{ fontSize: '0.65rem' }}>{track.artistPositionY}px</span>
          </div>
          <input type="range" min="-540" max="540" value={track.artistPositionY} onChange={e => updateActiveTrack('artistPositionY', e.target.value)} />
        </div>
      </div>

      {/* ── TAGS ── */}
      <label style={sectionLabel}>TAGS TEXT</label>
      <div style={row}>
        <label>Font</label>
        <FontSelect value={track.tagsFont || 'JetBrains Mono, monospace'} onChange={v => updateActiveTrack('tagsFont', v)} />
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>Scale</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.tagsScale}%</span>
          </div>
          <input type="range" min="20" max="300" value={track.tagsScale} onChange={e => updateActiveTrack('tagsScale', e.target.value)} />
        </div>
        <div />
      </div>
      <div style={twoCol}>
        <div>
          <div className="flex justify-between">
            <label>X Offset</label>
            <span className="mono" style={{ fontSize: '0.6rem' }}>{track.tagsPositionX}px</span>
          </div>
          <input type="range" min="-960" max="960" value={track.tagsPositionX || 0} onChange={e => updateActiveTrack('tagsPositionX', e.target.value)} />
        </div>
        <div>
          <div className="flex justify-between">
            <label>Y Offset</label>
            <span className="mono" style={{ fontSize: '0.65rem' }}>{track.tagsPositionY}px</span>
          </div>
          <input type="range" min="-540" max="540" value={track.tagsPositionY} onChange={e => updateActiveTrack('tagsPositionY', e.target.value)} />
        </div>
      </div>

      {/* ── CUSTOM TEXTS ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
        <label style={{ ...sectionLabel, marginTop: 0 }}>CUSTOM TEXT LAYERS</label>
        <button
          onClick={addCustomText}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.3rem 0.6rem', fontSize: '0.6rem',
            fontFamily: 'var(--font-mono)', color: '#00FF66',
            border: '1px solid rgba(0,255,102,0.3)', borderRadius: '100px',
            letterSpacing: '0.05em', textTransform: 'uppercase',
            transition: 'all 0.15s',
          }}
        >
          <Plus size={10} /> Add Layer
        </button>
      </div>

      {(!track.customTexts || track.customTexts.length === 0) && (
        <div style={{
          padding: '1.5rem', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
          textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)'
        }}>
          <Type size={16} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
          <div>No custom text layers</div>
          <div style={{ marginTop: '0.25rem', opacity: 0.6 }}>Click Add Layer to create one</div>
        </div>
      )}

      {(track.customTexts || []).map((ct, idx) => (
        <div key={ct.id} style={{
          border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
          padding: '1rem', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#00FF66', letterSpacing: '0.1em' }}>
              LAYER {idx + 1}
            </span>
            <button onClick={() => removeCustomText(ct.id)} style={{ color: 'var(--text-muted)', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#FF3366')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <X size={14} />
            </button>
          </div>

          {/* Text content */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Text Content</label>
            <input type="text" value={ct.text} onChange={e => updateCustomText(ct.id, 'text', e.target.value)} />
          </div>

          {/* Font */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Font</label>
            <FontSelect value={ct.font} onChange={v => {
              const chosen = AVAILABLE_FONTS.find(f => f.value === v);
              if (chosen) loadGoogleFont(chosen.googleFont);
              updateCustomText(ct.id, 'font', v);
            }} />
          </div>

          {/* Size + Color */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'end' }}>
            <div>
              <div className="flex justify-between">
                <label>Size</label>
                <span className="mono" style={{ fontSize: '0.6rem' }}>{ct.size}pt</span>
              </div>
              <input type="range" min="10" max="200" value={ct.size} onChange={e => updateCustomText(ct.id, 'size', Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <label style={{ textAlign: 'center' }}>Color</label>
              <input
                type="color"
                value={ct.color}
                onChange={e => updateCustomText(ct.id, 'color', e.target.value)}
                style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: 'pointer', background: 'transparent', padding: '2px' }}
              />
            </div>
          </div>

          {/* Opacity */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="flex justify-between">
              <label>Opacity</label>
              <span className="mono" style={{ fontSize: '0.6rem' }}>{ct.opacity}%</span>
            </div>
            <input type="range" min="0" max="100" value={ct.opacity} onChange={e => updateCustomText(ct.id, 'opacity', Number(e.target.value))} />
          </div>

          {/* X + Y position */}
          <div style={twoCol}>
            <div>
              <div className="flex justify-between">
                <label>X Offset</label>
                <span className="mono" style={{ fontSize: '0.6rem' }}>{ct.posX}px</span>
              </div>
              <input type="range" min="-900" max="900" value={ct.posX} onChange={e => updateCustomText(ct.id, 'posX', Number(e.target.value))} />
            </div>
            <div>
              <div className="flex justify-between">
                <label>Y Offset</label>
                <span className="mono" style={{ fontSize: '0.6rem' }}>{ct.posY}px</span>
              </div>
              <input type="range" min="-540" max="540" value={ct.posY} onChange={e => updateCustomText(ct.id, 'posY', Number(e.target.value))} />
            </div>
          </div>

          {/* Bold + Italic toggles */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button
              onClick={() => updateCustomText(ct.id, 'bold', !ct.bold)}
              style={{
                flex: 1, padding: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                fontWeight: 800, border: '1px solid', borderRadius: 'var(--radius-sm)',
                borderColor: ct.bold ? '#fff' : 'var(--border-color)',
                background: ct.bold ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: ct.bold ? '#fff' : 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.15s',
              }}
            >Bold</button>
            <button
              onClick={() => updateCustomText(ct.id, 'italic', !ct.italic)}
              style={{
                flex: 1, padding: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                fontStyle: 'italic', border: '1px solid', borderRadius: 'var(--radius-sm)',
                borderColor: ct.italic ? '#fff' : 'var(--border-color)',
                background: ct.italic ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: ct.italic ? '#fff' : 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.15s',
              }}
            >Italic</button>
          </div>
        </div>
      ))}
    </div>
  );
};

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'metadata' | 'ai' | 'typography' | 'visuals' | 'presets'>('metadata');
  
  const [presets, setPresets] = useState<TrackPreset[]>(() => {
    try {
      const s = localStorage.getItem('soundsync_track_presets');
      if (s) return JSON.parse(s);
    } catch {}
    return [BASE_PRESET];
  });
  const [defaultPresetId, setDefaultPresetId] = useState<string>(() => {
    return localStorage.getItem('soundsync_default_preset_id') || 'base-default';
  });

  useEffect(() => {
    localStorage.setItem('soundsync_track_presets', JSON.stringify(presets));
  }, [presets]);
  
  useEffect(() => {
    localStorage.setItem('soundsync_default_preset_id', defaultPresetId);
  }, [defaultPresetId]);

  const updateActiveTrackBatch = (updates: Partial<Track>) => {
    if (!activeTrackId) return;
    setTracks(prev => prev.map(t => t.id === activeTrackId ? { ...t, ...updates } : t));
  };
  
  const [renderJobs, setRenderJobs] = useState<Record<string, any>>({});
  const [trayMinimized, setTrayMinimized] = useState(false);
  const [previewJob, setPreviewJob] = useState<any>(null);
  const [jobToDelete, setJobToDelete] = useState<{id: string, outputPath: string, title?: string} | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    if (!previewContainerRef.current) return;

    const updateScale = (entries: ResizeObserverEntry[]) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        const scale = Math.min(width / 1920, height / 1080) * 0.98; // Scale down slightly to ensure it fits nicely
        setPreviewScale(scale);
      }
    };

    const observer = new ResizeObserver(updateScale);
    observer.observe(previewContainerRef.current);
    
    // Initial call
    const { width, height } = previewContainerRef.current.getBoundingClientRect();
    setPreviewScale(Math.min(width / 1920, height / 1080) * 0.98);

    return () => observer.disconnect();
  }, []);
  const [youtubeAuth, setYoutubeAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [publishForm, setPublishForm] = useState({ title: '', description: '', tags: '', privacyStatus: 'private' });
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (previewJob && renderJobs[previewJob.id]) {
      const liveJob = renderJobs[previewJob.id];
      const sections = [];

      // 1. Basic Info
      const info = [];
      if (liveJob.title) info.push(`Track: ${liveJob.title}`);
      if (liveJob.artist) info.push(`Artist: ${liveJob.artist}`);
      if (liveJob.album) info.push(`Album: ${liveJob.album}`);
      if (liveJob.genre) info.push(`Genre: ${liveJob.genre}`);
      if (liveJob.year) info.push(`Year: ${liveJob.year}`);
      if (info.length > 0) sections.push(info.join('\n'));

      // 2. Comment / Description
      if (liveJob.comment) {
        sections.push(liveJob.comment);
      }

      // 3. Lyrics
      if (liveJob.lyrics) {
        sections.push(`Lyrics:\n${liveJob.lyrics}`);
      }

      // 4. Hashtags for discoverability
      const tagsList = liveJob.tags?.split(/[ ,•]+/).filter(Boolean) || [];
      const hashtags = tagsList.map(t => `#${t.replace(/[^a-zA-Z0-9]/g, '')}`).filter(t => t.length > 1).join(' ');
      if (hashtags) {
        sections.push(hashtags);
      }

      setPublishForm({
        title: liveJob.title || '',
        description: sections.join('\n\n').trim(),
        tags: tagsList.join(',') || 'music,visualizer,soundsync',
        privacyStatus: 'private'
      });
    }
  }, [previewJob?.id, JSON.stringify(renderJobs[previewJob?.id] || {})]);

  const [globalDNA, setGlobalDNA] = useState<GlobalPromptDNA>(loadDNA);
  const updateGlobalDNA = (updates: Partial<GlobalPromptDNA>) => {
    setGlobalDNA(prev => { const next = { ...prev, ...updates }; saveDNA(next); return next; });
  };

  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setYoutubeAuth(data.authenticated))
      .catch(console.error);
  }, []);

  const connectYouTube = async () => {
    try {
      const res = await fetch('/api/auth/google');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, 'YouTubeAuth', 'width=600,height=600');
        // Poll for auth status
        const poll = setInterval(async () => {
          const status = await fetch('/api/auth/status').then(r => r.json());
          if (status.authenticated) {
            setYoutubeAuth(true);
            clearInterval(poll);
          }
        }, 2000);
      }
    } catch (e) {
      console.error("Failed to initiate YouTube auth:", e);
    }
  };

  // Poll for render progress to avoid proxy zombie connections
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/render/jobs');
        if (res.ok) {
          const data = await res.json();
          setRenderJobs(data);
        }
      } catch (e) {
        // Silently ignore network errors during poll
      }
    }, 1000);
    return () => clearInterval(poll);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAvailableModels(data.models);
        }
      })
      .catch(err => console.error("Failed to load models", err));
  }, []);

  // Fetch gallery whenever the Background tab is opened
  useEffect(() => {
    if (activeSidebarTab !== 'ai') return;
    setGalleryLoading(true);
    fetch('/api/images/list')
      .then(r => r.json())
      .then(d => setGalleryImages(d.images || []))
      .catch(console.error)
      .finally(() => setGalleryLoading(false));
  }, [activeSidebarTab]);
  

  const activeTrack = tracks.find(t => t.id === activeTrackId);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('audioFiles', file);
    });

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (data.success && data.tracks) {
        const defPreset = presets.find(p => p.id === defaultPresetId) || BASE_PRESET;
        const newTracks: Track[] = data.tracks.map((t: any) => ({
          ...t,
          title: t.title || t.originalName.replace(/\.[^/.]+$/, ""),
          artist: t.artist || "Unknown Artist",
          album: t.album || "",
          genre: t.genre || "",
          year: t.year || "",
          comment: t.comment || "",
          lyrics: t.lyrics || "",
          tags: "SYNTHWAVE • RETRO",
          promptConfig: makePromptConfig(globalDNA),
          aiModel: availableModels.length > 0 ? availableModels[0].id : "imagen-4.0-ultra-generate-001",
          backgroundImage: null,
          
          waveformEnabled: defPreset.waveformEnabled,
          waveformStyle: defPreset.waveformStyle,
          waveformAmplitude: defPreset.waveformAmplitude,
          waveformOpacity: defPreset.waveformOpacity,
          waveformPositionY: defPreset.waveformPositionY,
          waveformThickness: defPreset.waveformThickness,
          waveformColor: defPreset.waveformColor,
          waveformGlow: defPreset.waveformGlow,
          waveformFreqMode: defPreset.waveformFreqMode,
          visualEffects: [...defPreset.visualEffects],
          titleScale: defPreset.titleScale,
          artistScale: defPreset.artistScale,
          tagsScale: defPreset.tagsScale,
          titleFont: defPreset.titleFont,
          artistFont: defPreset.artistFont,
          tagsFont: defPreset.tagsFont,
          titlePositionY: defPreset.titlePositionY,
          artistPositionY: defPreset.artistPositionY,
          tagsPositionY: defPreset.tagsPositionY,
          titlePositionX: defPreset.titlePositionX,
          artistPositionX: defPreset.artistPositionX,
          tagsPositionX: defPreset.tagsPositionX,
          cornerThickness: defPreset.cornerThickness,
          cornerSize: defPreset.cornerSize,
          cornerOpacity: defPreset.cornerOpacity,
          backdropOpacity: defPreset.backdropOpacity,
          backdropSpreadX: defPreset.backdropSpreadX,
          backdropSpreadY: defPreset.backdropSpreadY,
          backdropFalloff: defPreset.backdropFalloff,
          customTexts: defPreset.customTexts.map(ct => ({...ct})),
        }));
        
        setTracks(prev => [...prev, ...newTracks]);
        if (!activeTrackId && newTracks.length > 0) {
          setActiveTrackId(newTracks[0].id);
        }
      } else {
        console.error("Upload returned error:", data);
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUploadFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleUploadFiles(e.dataTransfer.files);
  };

  const handleGenerateImage = async () => {
    if (!activeTrackId || !activeTrack) return;
    setIsGenerating(true);
    try {
      const compiledPrompt = activeTrack.aiPrompt || buildPrompt(activeTrack.promptConfig, activeTrack.title, activeTrack.tags);
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: compiledPrompt,
          promptConfig: activeTrack.promptConfig,
          trackId: activeTrack.id,
          model: activeTrack.aiModel,
        }),
      });
      const data = await response.json();
      if (data.success) {
        updateActiveTrack('backgroundImage', data.imageUrl);
        // Prepend to gallery so the new image appears immediately at the left
        setGalleryImages(prev => [data.imageUrl, ...prev.filter(u => u !== data.imageUrl)]);
      } else {
        console.error("Image generation error:", data.error);
        alert(`Generation Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Image generation failed:", err);
      alert("Generation Request Failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProcessAll = async () => {
    if (tracks.length === 0) {
      alert("No tracks to process.");
      return;
    }
    
    let processedCount = 0;
    for (const track of tracks) {
      if (!track.backgroundImage) {
        alert(`Track "${track.title}" is missing a background image. Please generate one first before processing.`);
        continue;
      }
      
      processedCount++;
      try {
        const response = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(track),
        });
        const data = await response.json();
        if (data.success) {
          console.log(`Render started for ${track.title}:`, data.outputPath);
        } else {
          console.error(`Render failed for ${track.title}:`, data.error);
        }
      } catch (err) {
        console.error(`Render request failed for ${track.title}:`, err);
      }
    }
    
    if (processedCount > 0) {
      setTrayMinimized(false);
    }
  };

  const handleYouTubePublish = async (jobId: string, job: any) => {
    if (!youtubeAuth) {
      await connectYouTube();
      return;
    }
    
    setIsPublishing(true);
    try {
      const res = await fetch('/api/youtube/upload', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({
          path: job.outputPath,
          title: publishForm.title || job.title,
          description: publishForm.description || (job.title ? `Track: ${job.title}${job.artist ? `\nArtist: ${job.artist}` : ''}` : ''),
          tags: publishForm.tags || 'soundsync,music,visualizer',
          privacyStatus: publishForm.privacyStatus || 'private',
          jobId: jobId
        }) 
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`YouTube Upload Failed: ${data.error || 'Unknown server error'}`);
      }
    } catch (err: any) {
      alert(`YouTube Upload Request Failed: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleQuickPreview = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    if (!track.backgroundImage) {
      alert(`Track "${track.title}" needs a background image first.`);
      return;
    }
    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
      });
      const data = await response.json();
      if (data.success) { setTrayMinimized(false); }
      else { alert(`Preview failed: ${data.error}`); }
    } catch (err) { console.error('Preview request failed:', err); }
  };

  const handleProcessSingle = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    if (!track.backgroundImage) {
      alert(`Track "${track.title}" is missing a background image. Please generate one first before processing.`);
      return;
    }
    
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track),
      });
      const data = await response.json();
      if (data.success) {
        setTrayMinimized(false);
      }
    } catch (err) {
      console.error(`Render request failed for ${track.title}:`, err);
    }
  };

  const removeTrack = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTracks = tracks.filter(t => t.id !== id);
    setTracks(newTracks);
    if (activeTrackId === id) {
      setActiveTrackId(newTracks.length > 0 ? newTracks[0].id : null);
    }
  };

  const updateActiveTrack = (field: keyof Track, value: any) => {
    if (!activeTrackId) return;
    setTracks(prev => prev.map(t =>
      t.id === activeTrackId ? { ...t, [field]: value } : t
    ));
  };

  const updateActiveTrackPromptConfig = (field: keyof PromptConfig, value: any) => {
    if (!activeTrackId) return;
    setTracks(prev => prev.map(t =>
      t.id === activeTrackId ? { ...t, aiPrompt: '', promptConfig: { ...t.promptConfig, [field]: value } } : t
    ));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch('/api/images/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.imageUrl) {
        updateActiveTrack('backgroundImage', data.imageUrl);
        setGalleryImages(prev => [data.imageUrl, ...prev]);
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      if (imageUploadRef.current) imageUploadRef.current.value = '';
    }
  };

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      <header className="header">
        <div className="logo-section">
          <div className="logo-icon">
            <Music size={20} />
          </div>
          <div className="logo-text">
            <h1>SoundSync</h1>
            <span>STUDIO V3.0</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleProcessAll}>
            <PlaySquare size={16} />
            PROCESS ALL
          </button>
          <button className="btn-icon" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="main-content">
        <section className="canvas-section">
          {tracks.length > 0 && (
            <div className="track-tabs">
              {tracks.map(track => (
                <div 
                  key={track.id} 
                  className={`track-tab ${activeTrackId === track.id ? 'active' : ''}`}
                  onClick={() => setActiveTrackId(track.id)}
                >
                  <Headphones size={12} />
                  <span>{track.title}</span>
                  <Trash2 size={12} className="close-tab" onClick={(e) => removeTrack(track.id, e)} />
                </div>
              ))}
            </div>
          )}
          <div className="canvas-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="subtitle">VISUAL PREVIEW</div>
              <h2>Main <strong>Output</strong> Canvas</h2>
            </div>
            {activeTrackId && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleQuickPreview(activeTrackId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '100px',
                    color: 'rgba(255,255,255,0.7)', background: 'transparent',
                    letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#fff'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'; }}
                  title="Render first 15 seconds at low quality for quick review"
                >
                  <Play size={13} /> QUICK PREVIEW
                </button>
                <button className="btn-primary" onClick={() => handleProcessSingle(activeTrackId)}>
                  <Play size={16} />
                  RENDER
                </button>
              </div>
            )}
          </div>
          
          <div className="preview-wrapper" ref={previewContainerRef}>
            <div className="preview-container" style={{ width: 1920 * previewScale, height: 1080 * previewScale }}>
              <div className="preview-content-scaler" style={{ transform: `scale(${previewScale})` }}>
              {activeTrack?.backgroundImage ? (
                <img src={activeTrack.backgroundImage} className="preview-bg" alt="Generated background" />
              ) : (
                <div className="preview-bg" style={{ background: 'linear-gradient(45deg, #0a0a0a, #1a1a1a)' }}></div>
              )}

              {/* Text Backdrop — rendered BELOW text layers */}
              {activeTrack && (() => {
                const bOpacity = (activeTrack.backdropOpacity ?? 0) / 100;
                const bSpreadX = activeTrack.backdropSpreadX ?? 80;
                const bSpreadY = activeTrack.backdropSpreadY ?? 40;
                const bFalloff = activeTrack.backdropFalloff ?? 60;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0, left: 0, width: '100%', height: '100%',
                      pointerEvents: 'none',
                      background: `radial-gradient(ellipse ${bSpreadX}% ${bSpreadY}% at center, rgba(0,0,0,${bOpacity}) 0%, rgba(0,0,0,${bOpacity}) ${bFalloff}%, transparent 100%)`,
                      zIndex: 2,
                    }}
                  />
                );
              })()}
              
              {activeTrack && (
                <>
                  <div style={{ position: 'absolute', top: 40, left: 40, width: activeTrack.cornerSize * 2, height: activeTrack.cornerSize * 2, borderTop: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, borderLeft: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, zIndex: 10, pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', top: 40, right: 40, width: activeTrack.cornerSize * 2, height: activeTrack.cornerSize * 2, borderTop: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, borderRight: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, zIndex: 10, pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', bottom: 40, left: 40, width: activeTrack.cornerSize * 2, height: activeTrack.cornerSize * 2, borderBottom: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, borderLeft: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, zIndex: 10, pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', bottom: 40, right: 40, width: activeTrack.cornerSize * 2, height: activeTrack.cornerSize * 2, borderBottom: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, borderRight: `${activeTrack.cornerThickness * 2}px solid rgba(255,255,255,${activeTrack.cornerOpacity/100})`, zIndex: 10, pointerEvents: 'none' }}></div>
                </>
              )}
              
              {/* Text layers — position is now robustly 1:1 with 1080p SVG */}
              <div className="preview-overlay" style={{ zIndex: 6 }}>
                <h2 className="preview-title" style={{
                  transform: `translate(calc(-50% + ${activeTrack?.titlePositionX || 0}px), calc(-50% + ${activeTrack?.titlePositionY || 0}px)) scale(${activeTrack ? activeTrack.titleScale / 100 : 1})`,
                  fontFamily: activeTrack?.titleFont || undefined,
                  fontSize: '100px',
                }}>
                  {activeTrack ? activeTrack.title : "NO TRACK SELECTED"}
                </h2>
                <div className="preview-artist" style={{
                  transform: `translate(calc(-50% + ${activeTrack?.artistPositionX || 0}px), calc(-50% + ${activeTrack?.artistPositionY || 0}px)) scale(${activeTrack ? activeTrack.artistScale / 100 : 1})`,
                  fontFamily: activeTrack?.artistFont || undefined,
                  fontSize: '50px',
                }}>
                  {activeTrack ? activeTrack.artist : "AhrenFullStop"}
                </div>
                <div className="preview-tags" style={{
                  transform: `translate(calc(-50% + ${activeTrack?.tagsPositionX || 0}px), calc(-50% + ${activeTrack?.tagsPositionY || 0}px)) scale(${activeTrack ? activeTrack.tagsScale / 100 : 1})`,
                  fontFamily: activeTrack?.tagsFont || undefined,
                  fontSize: '40px',
                }}>
                  {activeTrack ? activeTrack.tags.replace(/,/g, ' • ') : "SYNTHWAVE • RETRO"}
                </div>
              </div>
              
              {/* Custom text overlays in preview */}
              {activeTrack?.customTexts?.map(ct => (
                <div
                  key={ct.id}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${ct.posX * (960/900)}px), calc(-50% + ${ct.posY}px))`,
                    fontFamily: ct.font,
                    fontSize: `${ct.size * 3.6}px`,
                    color: ct.color,
                    fontWeight: ct.bold ? 800 : 400,
                    fontStyle: ct.italic ? 'italic' : 'normal',
                    opacity: ct.opacity / 100,
                    pointerEvents: 'none',
                    zIndex: 8,
                    whiteSpace: 'nowrap',
                    textShadow: '0 2px 10px rgba(0,0,0,0.8)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {ct.text}
                </div>
              ))}
              
              {activeTrack && (
                <div style={{ position: 'absolute', bottom: '108px', left: 0, width: '100%', height: '300px', zIndex: 5 }}>
                  <WaveformCanvas track={activeTrack} />
                </div>
              )}
            </div>
          </div>
        </div>
          
          <div className="canvas-footer">
            <span>1080P NATIVE</span>
            <span>48KHZ MASTER</span>
            <span>GEMINI AI V2.5</span>
          </div>
        </section>

        <aside className="sidebar">
          <div className="sidebar-header" style={{ flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
            <div className="flex justify-between w-full" style={{ width: '100%' }}>
              <div>
                <h3>STUDIO CONFIGURATION</h3>
                <p>DROP FILES ANYWHERE</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-icon" onClick={handleUploadClick} title="Upload Track">
                  <Upload size={16} />
                </button>
                <button className="reset-btn" onClick={() => setTracks([])} style={{ marginLeft: '0.5rem' }}>
                  CLEAR
                </button>
              </div>
            </div>
          </div>
          
          <div className="sidebar-tabs">
            <div className={`sidebar-tab ${activeSidebarTab === 'metadata' ? 'active' : ''}`} onClick={() => setActiveSidebarTab('metadata')}>Metadata</div>
            <div className={`sidebar-tab ${activeSidebarTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveSidebarTab('ai')}>Background</div>
            <div className={`sidebar-tab ${activeSidebarTab === 'typography' ? 'active' : ''}`} onClick={() => setActiveSidebarTab('typography')}>Text</div>
            <div className={`sidebar-tab ${activeSidebarTab === 'visuals' ? 'active' : ''}`} onClick={() => setActiveSidebarTab('visuals')}>Visuals</div>
            <div className={`sidebar-tab ${activeSidebarTab === 'presets' ? 'active' : ''}`} onClick={() => setActiveSidebarTab('presets')}>Presets</div>
          </div>
          
          <div className="sidebar-content" style={{ paddingTop: '1.5rem' }}>
            <input 
              type="file" 
              multiple 
              accept="audio/mp3, audio/wav, audio/aac" 
              className="hidden-input" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />

            {activeTrack && activeSidebarTab === 'metadata' && (
              <div className="flex-col gap-4">
                <div>
                  <label>Track Title</label>
                  <input 
                    type="text" 
                    value={activeTrack.title} 
                    onChange={e => updateActiveTrack('title', e.target.value)} 
                  />
                </div>
                <div>
                  <label>Artist Name</label>
                  <input 
                    type="text" 
                    value={activeTrack.artist} 
                    onChange={e => updateActiveTrack('artist', e.target.value)} 
                  />
                </div>
                <div className="flex gap-2">
                  <div style={{ flex: 1 }}>
                    <label>Album</label>
                    <input 
                      type="text" 
                      value={activeTrack.album} 
                      onChange={e => updateActiveTrack('album', e.target.value)} 
                    />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label>Year</label>
                    <input 
                      type="text" 
                      value={activeTrack.year} 
                      onChange={e => updateActiveTrack('year', e.target.value)} 
                    />
                  </div>
                </div>
                <div>
                  <label>Genre</label>
                  <input 
                    type="text" 
                    value={activeTrack.genre} 
                    onChange={e => updateActiveTrack('genre', e.target.value)} 
                  />
                </div>
                <div>
                  <label>Comment</label>
                  <textarea 
                    value={activeTrack.comment} 
                    onChange={e => updateActiveTrack('comment' as any, e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      resize: 'vertical',
                      minHeight: '60px'
                    }}
                  />
                </div>
                <div>
                  <label>Lyrics</label>
                  <textarea 
                    value={activeTrack.lyrics} 
                    onChange={e => updateActiveTrack('lyrics' as any, e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      padding: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      resize: 'vertical',
                      minHeight: '100px'
                    }}
                  />
                </div>
                <div>
                  <label>Visual Tags</label>
                  <input 
                    type="text" 
                    value={activeTrack.tags} 
                    onChange={e => updateActiveTrack('tags', e.target.value)} 
                  />
                </div>
              </div>
            )}
            
            {activeTrack && activeSidebarTab === 'ai' && (() => {
              const sl: React.CSSProperties = { color: 'rgba(255,255,255,0.4)', display: 'block', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.6rem' };
              const divider: React.CSSProperties = { borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.25rem' };
              const pc = activeTrack.promptConfig;
              return (
                <div className="flex-col gap-4">
                  {/* Model selector */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={sl}>AI MODEL</label>
                    <select value={activeTrack.aiModel} onChange={e => updateActiveTrack('aiModel', e.target.value)} style={{ width: 'auto', padding: '0.2rem', fontSize: '0.65rem' }}>
                      {availableModels.length > 0 ? availableModels.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>) : <option value="imagen-4.0-ultra-generate-001">Imagen 4 Ultra</option>}
                    </select>
                  </div>

                  {/* CONSTANTS */}
                  <div style={divider}>
                    <label style={sl}>📌 CONSTANTS</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
                      <div>
                        <label>Color Profile</label>
                        <select value={pc.colorProfile} onChange={e => updateActiveTrackPromptConfig('colorProfile', e.target.value as ColorProfile)}>
                          <option value="black_and_white">Black &amp; White</option>
                          <option value="color">Full Color</option>
                          <option value="sepia">Sepia</option>
                          <option value="neon">Neon</option>
                        </select>
                      </div>
                      <div>
                        <label>Aspect Ratio</label>
                        <select value={pc.aspectRatio} onChange={e => updateActiveTrackPromptConfig('aspectRatio', e.target.value as AspectRatio)}>
                          <option value="16:9">16:9</option>
                          <option value="1:1">1:1</option>
                          <option value="9:16">9:16</option>
                          <option value="4:3">4:3</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={pc.noText} onChange={e => updateActiveTrackPromptConfig('noText', e.target.checked)} />
                        No text in image
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={pc.noFaces} onChange={e => updateActiveTrackPromptConfig('noFaces', e.target.checked)} />
                        No faces
                      </label>
                    </div>
                  </div>

                  {/* STYLE */}
                  <div style={divider}>
                    <label style={sl}>🎨 STYLE</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div>
                        <label>Art Type</label>
                        <input type="text" value={pc.artType} onChange={e => updateActiveTrackPromptConfig('artType', e.target.value)} placeholder="background for song art cover" />
                      </div>
                      <div>
                        <label>Mood / Vibe</label>
                        <input type="text" value={pc.mood} onChange={e => updateActiveTrackPromptConfig('mood', e.target.value)} placeholder="abstract, artistic" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label>Lighting</label>
                          <input type="text" value={pc.lighting} onChange={e => updateActiveTrackPromptConfig('lighting', e.target.value)} placeholder="dramatic" />
                        </div>
                        <div>
                          <label>Focal Point</label>
                          <input type="text" value={pc.focalPoint} onChange={e => updateActiveTrackPromptConfig('focalPoint', e.target.value)} placeholder="dark in centre" />
                        </div>
                      </div>
                      <div>
                        <label>Texture / Feel</label>
                        <input type="text" value={pc.texture} onChange={e => updateActiveTrackPromptConfig('texture', e.target.value)} placeholder="smooth yet chaotic" />
                      </div>
                    </div>
                  </div>

                  {/* FREEFORM NUDGE */}
                  <div style={divider}>
                    <label style={sl}>✏️ FREEFORM NUDGE</label>
                    <textarea
                      value={pc.extraNudge}
                      onChange={e => updateActiveTrackPromptConfig('extraNudge', e.target.value)}
                      placeholder="Any extra direction..."
                      style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '0.5rem', borderRadius: 'var(--radius-sm)', resize: 'vertical', minHeight: '55px' }}
                    />
                  </div>

                  {/* PREVIEW */}
                  <details style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <summary style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', cursor: 'pointer', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Preview / Edit Compiled Prompt</summary>
                    <textarea
                      value={activeTrack.aiPrompt || buildPrompt(pc, activeTrack.title, activeTrack.tags)}
                      onChange={e => updateActiveTrack('aiPrompt', e.target.value)}
                      style={{ 
                        marginTop: '0.5rem', 
                        width: '100%',
                        padding: '0.5rem', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', 
                        fontSize: '0.68rem', 
                        fontFamily: 'var(--font-mono)', 
                        color: activeTrack.aiPrompt ? '#fff' : 'var(--text-muted)', 
                        lineHeight: 1.6, 
                        minHeight: '180px',
                        resize: 'vertical'
                      }}
                    />
                    {activeTrack.aiPrompt && (
                      <div style={{ fontSize: '0.6rem', color: '#FF3366', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                        ⚠️ Manual override active. Changing any structured setting above will reset this.
                      </div>
                    )}
                  </details>

                  {/* IMAGE GALLERY */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.25rem' }}>
                    <label style={sl}>📁 USE EXISTING IMAGE</label>

                    {/* Hidden file input for image upload */}
                    <input
                      ref={imageUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden-input"
                      onChange={handleImageUpload}
                    />

                    {galleryLoading ? (
                      <div className="gallery-strip">
                        {[0,1,2,3].map(i => (
                          <div key={i} className="gallery-thumb gallery-skeleton" />
                        ))}
                      </div>
                    ) : galleryImages.length === 0 ? (
                      <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', padding: '0.75rem 0', letterSpacing: '0.05em' }}>
                        No images yet — generate one below
                      </div>
                    ) : (
                      <div className="gallery-strip">
                        {galleryImages.map(url => (
                          <button
                            key={url}
                            className={`gallery-thumb ${activeTrack.backgroundImage === url ? 'selected' : ''}`}
                            onClick={() => updateActiveTrack('backgroundImage', url)}
                            title={url.split('/').pop()}
                          >
                            <img src={url} alt="" />
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      className="btn-ghost"
                      style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                      onClick={() => imageUploadRef.current?.click()}
                    >
                      ↑ Upload Your Own Image
                    </button>
                  </div>

                  <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleGenerateImage} disabled={isGenerating}>
                    {isGenerating ? 'GENERATING...' : 'GENERATE BACKGROUND'}
                  </button>
                </div>
              );
            })()}

            {activeTrack && activeSidebarTab === 'visuals' && (() => {
              const secLabel: React.CSSProperties = {
                color: '#fff', display: 'block', marginBottom: '0.75rem', marginTop: '1.5rem',
                fontSize: '0.65rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase',
              };
              const row: React.CSSProperties = { marginBottom: '1rem' };
              const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' };
              const slider = (label: string, field: keyof Track, min: number, max: number, unit = '', step = 1) => {
                const val = activeTrack[field] as number;
                return (
                  <div style={row}>
                    <div className="flex justify-between">
                      <label>{label}</label>
                      <span className="mono" style={{ fontSize: '0.65rem' }}>{val}{unit}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val}
                      onChange={e => updateActiveTrack(field, step < 1 ? Number(e.target.value) : e.target.value)} />
                  </div>
                );
              };

              const EFFECT_META: Record<EffectType, { label: string; desc: string; params: { key: string; label: string; min: number; max: number; unit: string; step?: number }[]; bandOptions?: boolean }> = {
                chromatic_aberration: {
                  label: 'Chromatic Aberration', desc: 'RGB channel split on transients',
                  params: [
                    { key: 'intensity', label: 'Intensity', min: 0, max: 100, unit: '%' },
                    { key: 'maxOffset', label: 'Max Offset', min: 1, max: 24, unit: 'px' },
                  ], bandOptions: true,
                },
                zoom_pulse: {
                  label: 'Zoom Pulse', desc: 'Optic scale punch on bass hits',
                  params: [
                    { key: 'strength', label: 'Strength', min: 0, max: 100, unit: '%' },
                    { key: 'releaseSpeed', label: 'Release Speed', min: 1, max: 20, unit: '', step: 1 },
                  ], bandOptions: true,
                },
                camera_shake: {
                  label: 'Camera Shake', desc: 'Physical rumble simulation',
                  params: [
                    { key: 'intensity', label: 'Intensity', min: 0, max: 100, unit: '%' },
                    { key: 'frequency', label: 'Frequency', min: 1, max: 120, unit: 'Hz' },
                  ], bandOptions: true,
                },
                vignette_pulse: {
                  label: 'Vignette Pulse', desc: 'Edge darkening on beat',
                  params: [
                    { key: 'baseOpacity', label: 'Base Opacity', min: 0, max: 80, unit: '%' },
                    { key: 'pulseStrength', label: 'Pulse Strength', min: 0, max: 100, unit: '%' },
                    { key: 'radius', label: 'Inner Radius', min: 10, max: 100, unit: '%' },
                  ], bandOptions: true,
                },
                displacement: {
                  label: 'Displacement / Smudge', desc: 'Liquid pixel drift on mids',
                  params: [
                    { key: 'intensity', label: 'Intensity', min: 0, max: 100, unit: '%' },
                    { key: 'noiseScale', label: 'Noise Scale', min: 1, max: 16, unit: 'x' },
                  ], bandOptions: true,
                },
              };

              const updateEffect = (id: string, patch: Partial<EffectPreset> | { paramKey: string; paramVal: number | string }) => {
                const effects = (activeTrack.visualEffects || []).map(ef => {
                  if (ef.id !== id) return ef;
                  if ('paramKey' in patch) return { ...ef, params: { ...ef.params, [patch.paramKey]: patch.paramVal } };
                  return { ...ef, ...patch };
                });
                updateActiveTrack('visualEffects', effects);
              };

              const addEffect = (type: EffectType) => {
                const newEff: EffectPreset = {
                  id: Date.now().toString(), type, enabled: true,
                  params: { ...DEFAULT_EFFECT_PARAMS[type] },
                };
                updateActiveTrack('visualEffects', [...(activeTrack.visualEffects || []), newEff]);
              };

              const removeEffect = (id: string) => {
                updateActiveTrack('visualEffects', (activeTrack.visualEffects || []).filter(e => e.id !== id));
              };

              const existingTypes = new Set((activeTrack.visualEffects || []).map(e => e.type));
              const availableToAdd = (Object.keys(EFFECT_META) as EffectType[]).filter(t => !existingTypes.has(t));

              return (
                <div className="flex-col gap-4">

                  {/* ── WAVEFORM ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <label style={{ ...secLabel, marginTop: 0, marginBottom: 0 }}>WAVEFORM VISUALISER</label>
                    <button
                      onClick={() => updateActiveTrack('waveformEnabled', !(activeTrack.waveformEnabled ?? true))}
                      style={{
                        padding: '0.25rem 0.6rem', fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
                        border: '1px solid', borderRadius: '100px', letterSpacing: '0.05em',
                        borderColor: (activeTrack.waveformEnabled ?? true) ? '#00FF66' : 'var(--border-color)',
                        color: (activeTrack.waveformEnabled ?? true) ? '#00FF66' : 'var(--text-muted)',
                        background: 'transparent', transition: 'all 0.15s',
                      }}
                    >
                      {(activeTrack.waveformEnabled ?? true) ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div style={row}>
                    <label>Style</label>
                    <select value={activeTrack.waveformStyle} onChange={e => updateActiveTrack('waveformStyle', e.target.value)}>
                      <option value="cline">Smooth Wave</option>
                      <option value="line">Single Line</option>
                      <option value="bars">Frequency Bars</option>
                      <option value="p2p">Solid Fill</option>
                      <option value="pulse">Neon Pulse</option>
                    </select>
                  </div>

                  <div style={row}>
                    <label>Frequency Scale</label>
                    <select value={activeTrack.waveformFreqMode || 'log'} onChange={e => updateActiveTrack('waveformFreqMode', e.target.value)}>
                      <option value="log">Logarithmic (Perceptual)</option>
                      <option value="linear">Linear (Raw FFT)</option>
                    </select>
                  </div>

                  <div style={twoCol}>
                    <div>
                      <div className="flex justify-between"><label>Colour</label></div>
                      <input type="color" value={activeTrack.waveformColor || '#ffffff'}
                        onChange={e => updateActiveTrack('waveformColor', e.target.value)}
                        style={{ width: '100%', height: '36px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent', cursor: 'pointer', padding: '2px' }} />
                    </div>
                    <div>
                      <div className="flex justify-between"><label>Glow</label><span className="mono" style={{ fontSize: '0.65rem' }}>{activeTrack.waveformGlow ?? 0}%</span></div>
                      <input type="range" min={0} max={100} value={activeTrack.waveformGlow ?? 0}
                        onChange={e => updateActiveTrack('waveformGlow', Number(e.target.value))} />
                    </div>
                  </div>

                  {slider('Amplitude', 'waveformAmplitude', 0, 200, '%')}
                  {slider('Opacity', 'waveformOpacity', 0, 100, '%')}
                  {slider('Thickness', 'waveformThickness', 1, 8, 'px')}
                  {slider('Y Position', 'waveformPositionY', -200, 200, 'px')}

                  {/* ── IMAGE EFFECTS ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <label style={{ ...secLabel, marginTop: 0, marginBottom: 0 }}>IMAGE EFFECTS</label>
                    {availableToAdd.length > 0 && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) addEffect(e.target.value as EffectType); }}
                        style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', padding: '0.25rem 0.5rem',
                          background: 'transparent', border: '1px solid rgba(0,255,102,0.4)', borderRadius: '100px',
                          color: '#00FF66', cursor: 'pointer', maxWidth: '120px' }}
                      >
                        <option value="">+ Add Effect</option>
                        {availableToAdd.map(t => <option key={t} value={t}>{EFFECT_META[t].label}</option>)}
                      </select>
                    )}
                  </div>

                  {(!activeTrack.visualEffects || activeTrack.visualEffects.length === 0) && (
                    <div style={{ padding: '1.25rem', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-sm)',
                      textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                      No effects active — add one above
                    </div>
                  )}

                  {(activeTrack.visualEffects || []).map(eff => {
                    const meta = EFFECT_META[eff.type];
                    return (
                      <div key={eff.id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                        padding: '1rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button onClick={() => updateEffect(eff.id, { enabled: !eff.enabled })}
                              style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none',
                                background: eff.enabled ? '#00FF66' : 'rgba(255,255,255,0.2)', flexShrink: 0, cursor: 'pointer' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: eff.enabled ? '#fff' : 'var(--text-muted)', letterSpacing: '0.05em' }}>
                              {meta.label}
                            </span>
                          </div>
                          <button onClick={() => removeEffect(eff.id)} style={{ color: 'var(--text-muted)', transition: 'color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#FF3366')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                            <X size={14} />
                          </button>
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                          {meta.desc}
                        </div>
                        {meta.params.map(p => (
                          <div key={p.key} style={{ marginBottom: '0.75rem' }}>
                            <div className="flex justify-between">
                              <label>{p.label}</label>
                              <span className="mono" style={{ fontSize: '0.6rem' }}>{eff.params[p.key]}{p.unit}</span>
                            </div>
                            <input type="range" min={p.min} max={p.max} step={p.step ?? 1}
                              value={eff.params[p.key] as number}
                              onChange={e => updateEffect(eff.id, { paramKey: p.key, paramVal: Number(e.target.value) })} />
                          </div>
                        ))}
                        {meta.bandOptions && (
                          <div style={{ marginBottom: '0.25rem' }}>
                            <label>Frequency Band</label>
                            <select value={eff.params.frequencyBand as string}
                              onChange={e => updateEffect(eff.id, { paramKey: 'frequencyBand', paramVal: e.target.value })}>
                              <option value="bass">Bass (20–250 Hz)</option>
                              <option value="mid">Mids (250–4kHz)</option>
                              <option value="treble">Treble (4–20kHz)</option>
                              <option value="rms">Full RMS</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── CORNER ACCENTS ── */}
                  <label style={secLabel}>CORNER ACCENTS</label>
                  {slider('Corner Size', 'cornerSize', 0, 150, 'px')}
                  {slider('Corner Thickness', 'cornerThickness', 0, 10, 'px')}
                  {slider('Corner Opacity', 'cornerOpacity', 0, 100, '%')}

                  {/* ── BACKDROP ── */}
                  <label style={secLabel}>TEXT BACKDROP</label>
                  {slider('Backdrop Opacity', 'backdropOpacity', 0, 100, '%')}
                  {slider('Backdrop Width (X)', 'backdropSpreadX', 10, 200, '%')}
                  {slider('Backdrop Height (Y)', 'backdropSpreadY', 10, 200, '%')}
                  {slider('Backdrop Falloff', 'backdropFalloff', 0, 100, '%')}
                </div>
              );
            })()}

            {activeTrack && activeSidebarTab === 'typography' && (
              <TypographyTab
                track={activeTrack}
                updateActiveTrack={updateActiveTrack}
                updateCustomTexts={(texts) => {
                  setTracks(prev => prev.map(t =>
                    t.id === activeTrackId ? { ...t, customTexts: texts } : t
                  ));
                }}
              />
            )}

            {activeTrack && activeSidebarTab === 'presets' && (
              <div className="flex-col gap-4">
                <div style={{ marginBottom: '1rem' }}>
                  <label>Select Preset</label>
                  <select 
                    value={defaultPresetId} 
                    onChange={e => setDefaultPresetId(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                  >
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.isBase ? '(Base)' : ''}</option>
                    ))}
                  </select>
                </div>

                <button 
                  className="btn-primary full-width" 
                  onClick={() => {
                    const preset = presets.find(p => p.id === defaultPresetId);
                    if (preset) {
                      updateActiveTrackBatch({
                        waveformEnabled: preset.waveformEnabled,
                        waveformStyle: preset.waveformStyle,
                        waveformAmplitude: preset.waveformAmplitude,
                        waveformOpacity: preset.waveformOpacity,
                        waveformPositionY: preset.waveformPositionY,
                        waveformThickness: preset.waveformThickness,
                        waveformColor: preset.waveformColor,
                        waveformGlow: preset.waveformGlow,
                        waveformFreqMode: preset.waveformFreqMode,
                        visualEffects: [...preset.visualEffects],
                        titleScale: preset.titleScale,
                        artistScale: preset.artistScale,
                        tagsScale: preset.tagsScale,
                        titleFont: preset.titleFont,
                        artistFont: preset.artistFont,
                        tagsFont: preset.tagsFont,
                        titlePositionY: preset.titlePositionY,
                        artistPositionY: preset.artistPositionY,
                        tagsPositionY: preset.tagsPositionY,
                        titlePositionX: preset.titlePositionX,
                        artistPositionX: preset.artistPositionX,
                        tagsPositionX: preset.tagsPositionX,
                        cornerThickness: preset.cornerThickness,
                        cornerSize: preset.cornerSize,
                        cornerOpacity: preset.cornerOpacity,
                        backdropOpacity: preset.backdropOpacity,
                        backdropSpreadX: preset.backdropSpreadX,
                        backdropSpreadY: preset.backdropSpreadY,
                        backdropFalloff: preset.backdropFalloff,
                        customTexts: preset.customTexts.map(ct => ({...ct})),
                      });
                    }
                  }}
                >
                  APPLY PRESET TO TRACK
                </button>

                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', marginTop: '1rem' }}>
                  <label style={{ fontSize: '0.65rem', color: '#00FF66', marginBottom: '0.5rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Save Current Settings</label>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Save the active track's typography and visuals as a new preset.
                  </p>
                  <button 
                    className="btn-primary full-width" 
                    style={{ backgroundColor: 'transparent', border: '1px solid #00FF66', color: '#00FF66' }}
                    onClick={() => {
                      const name = window.prompt("Enter name for new preset:");
                      if (name) {
                        const newPreset: TrackPreset = {
                          id: Date.now().toString(),
                          name,
                          waveformEnabled: activeTrack.waveformEnabled,
                          waveformStyle: activeTrack.waveformStyle,
                          waveformAmplitude: activeTrack.waveformAmplitude,
                          waveformOpacity: activeTrack.waveformOpacity,
                          waveformPositionY: activeTrack.waveformPositionY,
                          waveformThickness: activeTrack.waveformThickness,
                          waveformColor: activeTrack.waveformColor,
                          waveformGlow: activeTrack.waveformGlow,
                          waveformFreqMode: activeTrack.waveformFreqMode,
                          visualEffects: [...activeTrack.visualEffects],
                          titleScale: activeTrack.titleScale,
                          artistScale: activeTrack.artistScale,
                          tagsScale: activeTrack.tagsScale,
                          titleFont: activeTrack.titleFont,
                          artistFont: activeTrack.artistFont,
                          tagsFont: activeTrack.tagsFont,
                          titlePositionY: activeTrack.titlePositionY,
                          artistPositionY: activeTrack.artistPositionY,
                          tagsPositionY: activeTrack.tagsPositionY,
                          titlePositionX: activeTrack.titlePositionX,
                          artistPositionX: activeTrack.artistPositionX,
                          tagsPositionX: activeTrack.tagsPositionX,
                          cornerThickness: activeTrack.cornerThickness,
                          cornerSize: activeTrack.cornerSize,
                          cornerOpacity: activeTrack.cornerOpacity,
                          backdropOpacity: activeTrack.backdropOpacity,
                          backdropSpreadX: activeTrack.backdropSpreadX,
                          backdropSpreadY: activeTrack.backdropSpreadY,
                          backdropFalloff: activeTrack.backdropFalloff,
                          customTexts: activeTrack.customTexts.map(ct => ({...ct})),
                        };
                        setPresets(prev => [...prev, newPreset]);
                        setDefaultPresetId(newPreset.id);
                      }
                    }}
                  >
                    SAVE AS NEW PRESET
                  </button>

                  {defaultPresetId !== 'base-default' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button 
                        className="btn-primary full-width" 
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontSize: '0.65rem' }}
                        onClick={() => {
                          setPresets(prev => prev.map(p => {
                            if (p.id === defaultPresetId) {
                              return {
                                ...p,
                                waveformEnabled: activeTrack.waveformEnabled,
                                waveformStyle: activeTrack.waveformStyle,
                                waveformAmplitude: activeTrack.waveformAmplitude,
                                waveformOpacity: activeTrack.waveformOpacity,
                                waveformPositionY: activeTrack.waveformPositionY,
                                waveformThickness: activeTrack.waveformThickness,
                                waveformColor: activeTrack.waveformColor,
                                waveformGlow: activeTrack.waveformGlow,
                                waveformFreqMode: activeTrack.waveformFreqMode,
                                visualEffects: [...activeTrack.visualEffects],
                                titleScale: activeTrack.titleScale,
                                artistScale: activeTrack.artistScale,
                                tagsScale: activeTrack.tagsScale,
                                titleFont: activeTrack.titleFont,
                                artistFont: activeTrack.artistFont,
                                tagsFont: activeTrack.tagsFont,
                                titlePositionY: activeTrack.titlePositionY,
                                artistPositionY: activeTrack.artistPositionY,
                                tagsPositionY: activeTrack.tagsPositionY,
                                titlePositionX: activeTrack.titlePositionX,
                                artistPositionX: activeTrack.artistPositionX,
                                tagsPositionX: activeTrack.tagsPositionX,
                                cornerThickness: activeTrack.cornerThickness,
                                cornerSize: activeTrack.cornerSize,
                                cornerOpacity: activeTrack.cornerOpacity,
                                backdropOpacity: activeTrack.backdropOpacity,
                                backdropSpreadX: activeTrack.backdropSpreadX,
                                backdropSpreadY: activeTrack.backdropSpreadY,
                                backdropFalloff: activeTrack.backdropFalloff,
                                customTexts: activeTrack.customTexts.map(ct => ({...ct})),
                              };
                            }
                            return p;
                          }));
                          alert("Preset overwritten with current track settings.");
                        }}
                      >
                        OVERWRITE
                      </button>
                      <button 
                        className="btn-primary full-width" 
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444', fontSize: '0.65rem' }}
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this preset?")) {
                            setPresets(prev => prev.filter(p => p.id !== defaultPresetId));
                            setDefaultPresetId('base-default');
                          }
                        }}
                      >
                        DELETE
                      </button>
                    </div>
                  )}
                </div>
                
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                  The selected preset will be automatically applied to all newly uploaded tracks.
                </p>
              </div>
            )}

            
          </div>
          
          <div className="system-status">
            <span>SYSTEM READINESS</span>
            <div className="flex items-center gap-2">
               <span style={{ fontSize: '0.6rem', color: '#00FF66' }}>ONLINE</span>
               <div className="status-dot"></div>
            </div>
          </div>
        </aside>
      </main>

      {/* Render Tray Widget */}
      <div className={`render-tray ${trayMinimized ? 'minimized' : ''}`}>
        <div className="render-tray-header" onClick={() => setTrayMinimized(!trayMinimized)}>
          <div className="render-tray-title">
            <MonitorUp size={16} />
            Render Queue
            {Object.keys(renderJobs).length > 0 && (
               <span className="render-badge">{Object.values(renderJobs).filter((j: any) => j.status === 'rendering').length}</span>
            )}
          </div>
          {trayMinimized ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        <div className="render-tray-content">
          {Object.entries(renderJobs).length === 0 ? (
            <div style={{ padding: '20px', width: '100%', textAlign: 'center', color: 'var(--text-secondary)' }}>No renders in queue.</div>
          ) : (
            Object.entries(renderJobs)
              .sort(([, a]: [string, any], [, b]: [string, any]) => (b.createdAt || 0) - (a.createdAt || 0))
              .map(([id, job]: [string, any]) => (
              <div key={id} className="render-item">
                <div className="render-item-header" style={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: '12px' }}>
                  {job.thumbnail ? (
                    <div className="render-item-thumb" onClick={() => job.status === 'completed' && setPreviewJob({ id, ...job })} style={{ flexShrink: 0 }}>
                      <img src={job.thumbnail} alt="thumb" />
                      {job.status === 'completed' && (
                        <div className="thumb-overlay">
                          <Play size={16} fill="white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="render-item-thumb empty" style={{ flexShrink: 0 }}>
                      <Music size={14} />
                    </div>
                  )}
                  
                  <div className="render-item-info" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span 
                        className="render-item-title clickable" 
                        title={job.title}
                        onClick={() => job.status === 'completed' && setPreviewJob({ id, ...job })}
                        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {job.title}
                      </span>
                      {job.youtubeId && (
                        <span style={{ fontSize: '9px', padding: '2px 6px', background: '#FF0000', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}>YouTube</span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>ID: {id}</span>
                      {job.createdAt && <span>• {new Date(job.createdAt).toLocaleString()}</span>}
                      {job.filesize && <span>• {(job.filesize / 1024 / 1024).toFixed(1)} MB</span>}
                    </div>
                    
                    {job.visualEffects && job.visualEffects.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        {job.visualEffects.map((effect: string) => (
                          <span key={effect} style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', borderRadius: '10px', textTransform: 'capitalize' }}>
                            {effect.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {job.status === 'rendering' && (
                    <div className="render-progress-bar" style={{ flexShrink: 0, width: '100px', alignSelf: 'center', margin: '0 10px' }}>
                      <div className="render-progress-fill" style={{ width: job.progress || '100%', animation: 'pulse-opacity 1.5s infinite' }}></div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}>
                    <span className={`render-status ${job.status}`}>
                      {(job.status === 'rendering' || job.status === 'uploading') ? (job.progress || 'PREPARING') : job.status.toUpperCase()}
                    </span>
                    {job.status === 'error' && job.error && (
                      <span style={{ color: '#ef4444', fontSize: '10px', maxWidth: '200px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={job.error}>
                        {job.error}
                      </span>
                    )}
                  </div>
                </div>

                <div className="render-item-actions">
                  {job.status === 'completed' && !job.youtubeId && (
                    <button className="action-btn" title="Publish to YouTube" onClick={() => handleYouTubePublish(id, job)}>
                      <UploadCloud size={14} />
                    </button>
                  )}
                  {job.youtubeId && (
                    <button className="action-btn primary" title="View on YouTube" onClick={() => window.open(`https://youtube.com/watch?v=${job.youtubeId}`, '_blank')}>
                      <UploadCloud size={14} />
                    </button>
                  )}
                  {job.status === 'completed' && (
                    <button className="action-btn" title="Open Folder" onClick={() => fetch('/api/open-file', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({path: job.outputPath}) })}>
                      <FolderOpen size={14} />
                    </button>
                  )}
                  {job.outputPath && (
                    <button className="action-btn danger" title="Delete File" onClick={() => {
                      setJobToDelete({ id, outputPath: job.outputPath, title: job.title });
                    }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Video Preview Modal */}
      {previewJob && renderJobs[previewJob.id] && (() => {
        const liveJob = renderJobs[previewJob.id];
        return (
        <div className="modal-overlay" onClick={() => setPreviewJob(null)}>
          <div className="modal-content expanded" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{liveJob.title}</h3>
              <button className="close-btn" onClick={() => setPreviewJob(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body-split">
              <div className="video-container flex-1">
                <video 
                  src={`/renders/${liveJob.outputPath.split(/[\/\\]/).pop()}`} 
                  controls 
                  autoPlay 
                  className="preview-video"
                />
              </div>
              <div className="modal-sidebar">
                <div className="sidebar-section">
                  <h4 className="section-title">YouTube Metadata</h4>
                  
                  <div className="metadata-field">
                    <label>Title</label>
                    <input 
                      type="text" 
                      value={publishForm.title} 
                      onChange={e => setPublishForm({...publishForm, title: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px' }}
                    />
                  </div>
                  
                  <div className="metadata-field">
                    <label>Description</label>
                    <textarea 
                      value={publishForm.description}
                      onChange={e => setPublishForm({...publishForm, description: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', minHeight: '120px', resize: 'vertical' }}
                    />
                  </div>
                  
                  <div className="metadata-field">
                    <label>Tags (comma separated)</label>
                    <input 
                      type="text" 
                      value={publishForm.tags}
                      onChange={e => setPublishForm({...publishForm, tags: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px' }}
                    />
                  </div>

                  <div className="metadata-field">
                    <label>Privacy Status</label>
                    <select 
                      value={publishForm.privacyStatus}
                      onChange={e => setPublishForm({...publishForm, privacyStatus: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px' }}
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <div className="sidebar-actions">
                  {!liveJob.youtubeId && liveJob.status !== 'uploading' && (
                    <button 
                      className={`btn-primary full-width ${isPublishing ? 'disabled' : ''}`}
                      disabled={isPublishing}
                      onClick={() => handleYouTubePublish(previewJob.id, liveJob)}
                    >
                      <UploadCloud size={16} />
                      {isPublishing ? 'INITIALIZING...' : 'SHIP TO YOUTUBE'}
                    </button>
                  )}
                  {liveJob.status === 'uploading' && (
                    <button className="btn-primary full-width disabled" disabled>
                      <UploadCloud size={16} />
                      {liveJob.progress || 'UPLOADING...'}
                    </button>
                  )}
                  {liveJob.youtubeId && (
                    <button 
                      className="btn-primary full-width" 
                      style={{ backgroundColor: '#2563eb' }}
                      onClick={() => window.open(`https://youtube.com/watch?v=${liveJob.youtubeId}`, '_blank')}
                    >
                      <Play size={16} fill="white" />
                      VIEW ON YOUTUBE
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Settings Side Panel */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              {/* ── PROMPT DNA ── */}
              <div className="settings-section">
                <h4 className="section-title">Prompt DNA — Global Defaults</h4>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  These defaults pre-fill every new track. All fields remain editable per-track.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label>Color Profile</label>
                    <select value={globalDNA.colorProfile} onChange={e => updateGlobalDNA({ colorProfile: e.target.value as ColorProfile })}>
                      <option value="black_and_white">Black &amp; White</option>
                      <option value="color">Full Color</option>
                      <option value="sepia">Sepia</option>
                      <option value="neon">Neon</option>
                    </select>
                  </div>
                  <div>
                    <label>Aspect Ratio</label>
                    <select value={globalDNA.aspectRatio} onChange={e => updateGlobalDNA({ aspectRatio: e.target.value as AspectRatio })}>
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                      <option value="9:16">9:16</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={globalDNA.noText} onChange={e => updateGlobalDNA({ noText: e.target.checked })} />
                    No text in image
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={globalDNA.noFaces} onChange={e => updateGlobalDNA({ noFaces: e.target.checked })} />
                    No faces
                  </label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div><label>Default Art Type</label><input type="text" value={globalDNA.defaultArtType} onChange={e => updateGlobalDNA({ defaultArtType: e.target.value })} /></div>
                  <div><label>Default Mood / Vibe</label><input type="text" value={globalDNA.defaultMood} onChange={e => updateGlobalDNA({ defaultMood: e.target.value })} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    <div><label>Default Lighting</label><input type="text" value={globalDNA.defaultLighting} onChange={e => updateGlobalDNA({ defaultLighting: e.target.value })} /></div>
                    <div><label>Default Focal Point</label><input type="text" value={globalDNA.defaultFocalPoint} onChange={e => updateGlobalDNA({ defaultFocalPoint: e.target.value })} /></div>
                  </div>
                  <div><label>Default Texture / Feel</label><input type="text" value={globalDNA.defaultTexture} onChange={e => updateGlobalDNA({ defaultTexture: e.target.value })} /></div>
                </div>
              </div>
              {/* ── INTEGRATIONS ── */}
              <div className="settings-section">
                <h4 className="section-title">Integrations</h4>
                <div className="integration-card">
                  <div className="integration-header">
                    <div className="integration-info">
                      <div className="flex align-center gap-2">
                        <UploadCloud size={18} />
                        <span className="integration-name">YouTube</span>
                      </div>
                      <span className={`integration-status ${youtubeAuth ? 'connected' : 'disconnected'}`}>
                        {youtubeAuth ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>
                    {youtubeAuth ? (
                      <div className="integration-ready">
                        <div className="pulse-dot green"></div>
                        <span>Ready to Publish</span>
                      </div>
                    ) : (
                      <p className="integration-desc">
                        Connect your YouTube account to unlock one-click shipping directly from SoundSync Studio.
                      </p>
                    )}
                  </div>
                  {!youtubeAuth && (
                    <button className="btn-primary full-width" onClick={connectYouTube}>
                      Connect Account
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {jobToDelete && (
        <div className="modal-overlay" onClick={() => setJobToDelete(null)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', width: '100%', padding: '24px', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <Trash2 size={24} strokeWidth={1.5} />
              </div>
              <div style={{ paddingTop: '4px' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#fff', letterSpacing: '0.01em' }}>Delete Render</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginTop: '8px', marginBottom: 0 }}>
                  Are you sure you want to permanently delete <strong style={{ color: '#fff', fontWeight: 500 }}>{jobToDelete.title || 'this render'}</strong>? This will remove the video file and all associated metadata. This action cannot be undone.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button 
                onClick={() => setJobToDelete(null)} 
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
              >
                Cancel
              </button>
              <button 
                style={{ background: '#ef4444', color: 'white', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', transition: 'background 0.2s ease', boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.39)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ef4444'; }}
                onClick={() => {
                  fetch('/api/file', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({path: jobToDelete.outputPath, jobId: jobToDelete.id}) });
                  setJobToDelete(null);
                }}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
