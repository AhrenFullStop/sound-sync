# 🤖 SoundSync Studio: AI Technical Blueprint

This document is a high-density reference for AI agents working on this repository. It defines the "Source of Truth" for data structures, logic mirroring between Frontend/Backend, and audio analysis mappings.

## 1. Core Data Schema (`Track` Object)

The `Track` object is the primary state unit. Every slider in the UI and every filter in the render pipeline depends on this object.

| Field | Type | Description |
| :--- | :--- | :--- |
| `title` / `artist` | `string` | Metadata for text overlays. |
| `titleScale` | `number` | Percentage (20-300). 100% = ~100px. |
| `titlePositionX/Y` | `number` | Offset in pixels relative to center (960, 540). |
| `waveformStyle` | `string` | `bars`, `cline` (pulse), `line`, `solid` (p2p). |
| `waveformAmplitude` | `number` | Multiplier for raw audio data. |
| `visualEffects` | `EffectPreset[]` | Array of reactive effects (Zoom, Shake, etc.). |
| `backdropOpacity` | `number` | 0-100. Controls the radial text backdrop. |

---

## 2. The Mirror Law (Logic Sync)

Any visual feature **MUST** be implemented in two places. If you change one, you must change the other.

### A. Typography & Overlays
*   **Frontend (Preview)**: Calculated in `App.tsx` inside the `WaveformCanvas` or the preview overlay `div`.
*   **Backend (Render)**: Generated as an SVG in `server/index.ts` (inside `/api/preview` or `/api/render`) and composited via `sharp`.

**Coordinate Mapping:**
*   **Canvas/Preview Size**: 1920x1080 (internal) / 640x360 (preview).
*   **Scale Factor**: Frontend coordinates are often multiplied by `SCALE = 2` to reach 1080p target.
*   **X/Y Origin**: Center is `(960, 540)`.

### B. Audio-Reactive Effects
*   **Frontend**: Simulated in `App.tsx` using `requestAnimationFrame`.
*   **Backend**: Executed frame-by-frame in `server/frameGenerator.ts` using `sharp` transforms.

---

## 3. Audio Frequency Mappings

We use a "Smoothing" algorithm with asymmetric attack/release. Effects map to these bands:

| Band | Freq Range | Common Use |
| :--- | :--- | :--- |
| `bass` | 20 - 250 Hz | Kick drum, sub-bass (Zoom Pulse, Camera Shake). |
| `mid` | 250 - 4000 Hz | Vocals, snares (Waveform height). |
| `treble` | 4000 - 20k Hz | High hats, sparkle (Chromatic Aberration). |
| `rms` | Average Power | Overall loudness (General pulse). |

---

## 4. FFmpeg Pipeline Architecture

The render pipeline uses a "Hybrid" approach:
1.  **Static Background**: Background image processed via `sharp`.
2.  **Dynamic Frames**: If effects are enabled, `frameGenerator.ts` exports a sequence of `.jpg` files to `data/frames/[jobId]`.
3.  **Overlay**: A static SVG-to-PNG overlay (`textOverlayPath`) is generated once per job.
4.  **Filter Graph**:
    ```text
    [0:v] (Background/Frames) -> [1:a] (Showwaves) -> [2:v] (Text Overlay) -> Output
    ```

---

## 5. Critical Constraints for Agents

1.  **No Placeholders**: Never use generic colors. Use the `track.waveformColor` or default `#00FF66`.
2.  **Deterministic PRNG**: Use `XorShift` with a fixed seed (1337) for any random-looking effects (like Shake) to ensure the preview and render are identical.
3.  **Path Safety**: Always use `path.join` for file operations. Use `rootDir` as the base.
4.  **Metadata Preservation**: When updating a track, ensure ID3 tags (`title`, `artist`, `lyrics`) are carried through to the final FFmpeg muxing.
