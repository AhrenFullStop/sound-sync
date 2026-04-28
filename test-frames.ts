import { generateFrames } from './server/frameGenerator.js';

async function main() {
  console.log("Starting...");
  // Dummy test
  try {
    await generateFrames("testJob", "./data/generated_images/img_1777250367639872_1777250981316.jpg", "./data/analysis/1777254873343-Section - Chilled rap edit.mp3_30fps.json", [{type: 'zoom_pulse', enabled: true}], (p) => console.log(p), 30);
    console.log("Success!");
  } catch(e) {
    console.error("Failed:", e);
  }
}
main();
