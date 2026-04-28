# SoundSync Studio v3

![SoundSync Studio Header](https://via.placeholder.com/1200x400?text=SoundSync+Studio+v3)

**SoundSync Studio** is a complete, self-hosted web application for music producers, beatmakers, and artists who want to generate high-fidelity, audio-reactive YouTube videos directly from their `.mp3` or `.wav` masters. 

Built with an advanced FFmpeg rendering engine, an integrated Gemini AI background generator, and a premium React UI, SoundSync turns raw tracks into polished, YouTube-ready `.mp4` visualizers with zero subscription fees.

## Features
- **Global Drag-and-Drop Ingestion:** Drag audio files directly onto the browser to instantly load them into the studio.
- **Granular Typography Engine:** Complete layout decoupling. Move, scale, and align the Track Title, Artist, and Tags individually.
- **Audio-Reactive Waveforms:** Generates fully synced visual waveforms from your audio with multiple style options (Bars, Pulse, Jagged), opacity, and positioning controls.
- **Gemini AI Visual Generation:** Direct integration with Google's Imagen API. Just type a prompt, and it generates a beautiful 16:9 background image directly in your canvas.
- **Visual FX & Overlays:** Enhance your renders with global vignette intensity and high-tech dynamic corner bracket overlays.
- **Batch Processing:** Configure an entire album's worth of tracks in separate tabs, hit "PROCESS ALL", and the server will encode them sequentially.
- **YouTube Integration:** *(Coming Soon)* Seamless authenticated YouTube batch uploading.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Vanilla CSS.
- **Backend**: Node.js, Express, TypeScript, `fluent-ffmpeg`, `@google/genai`.
- **Infrastructure**: Concurrent DEV servers utilizing `dotenv` and standard `multer` disk storage.

---

## 🚀 Quick Start Guide

### Prerequisites
Before running SoundSync Studio, ensure you have the following installed on your system:
1. **Node.js** (v18+)
2. **FFmpeg**: Required for the rendering engine. 
   - *Mac:* `brew install ffmpeg`
   - *Windows:* [Download here](https://ffmpeg.org/download.html)
   - *Linux:* `sudo apt install ffmpeg`

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/sound-sync.git
cd sound-sync
npm install
```

### 2. Environment Variables
Create a `.env` file in the root of the project with your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8085
# Future YouTube integration variables:
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
```

### 3. Run the Studio
Start both the Vite frontend and Express backend concurrently:
```bash
npm run dev
```

Open your browser to the local URL provided by Vite (e.g. `http://localhost:5173`) to start mixing! All frontend `/api` requests will automatically be proxied to your designated backend `PORT`.

---

## Architecture & Directory Structure
```text
sound-sync/
├── data/
│   ├── fonts/              # Inter OTF fonts used for FFmpeg drawtext
│   ├── generated_images/   # Local storage for Imagen API responses
│   ├── renders/            # The final encoded .mp4 output files
│   └── uploads/            # Temporary storage for ingested audio tracks
├── server/
│   └── index.ts            # Express API, GenAI integration, and FFmpeg filter-graphs
├── src/
│   ├── App.tsx             # Primary Studio UI and layout configuration state
│   └── App.css             # Vanilla CSS design tokens and layout
└── vite.config.ts          # Dynamically linked proxy configuration
```

## Contributing
Contributions are extremely welcome! When creating new PRs for the FFmpeg rendering pipeline, please test across multiple audio inputs and ensure standard YouTube compatibility (`libx264`, `yuv420p`).
