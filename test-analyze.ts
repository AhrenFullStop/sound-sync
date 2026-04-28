import { analyzeAudio } from './server/index.ts';
async function main() {
  try {
    const res = await analyzeAudio("/Users/ahren.posthumus/Code/sound-sync/data/uploads/1777256278825-Sardaukar.mp3", 30);
    console.log("Success! frames:", res.frameCount);
  } catch(e) {
    console.error("Failed:", e);
  }
}
main();
