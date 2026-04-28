import { generateFrames } from './server/frameGenerator.ts';
import { analyzeAudio } from './server/index.ts';
import fs from 'fs';

async function main() {
  try {
    const audioPath = "/Users/ahren.posthumus/Code/sound-sync/data/uploads/1777256278825-Sardaukar.mp3";
    const imagePath = "/Users/ahren.posthumus/Code/sound-sync/data/generated_images/img_1777252973645426_1777253154056.jpg"; // A dummy existing image or whatever image I can find
    const analysisPath = "./data/analysis/test_analysis.json";
    
    // Check if we need a dummy image
    if (!fs.existsSync(imagePath)) {
      console.log("Dummy image missing. Please make sure the image exists.");
      // Just test analysis
      const res = await analyzeAudio(audioPath, 30);
      fs.writeFileSync(analysisPath, JSON.stringify(res));
      console.log("Analysis saved!");
      return;
    }

    const res = await analyzeAudio(audioPath, 30);
    fs.writeFileSync(analysisPath, JSON.stringify(res));
    console.log("Analysis saved!");

    console.log("Testing generateFrames...");
    await generateFrames("testJob123", imagePath, analysisPath, [{type: 'zoom_pulse', enabled: true}], (p) => {
        console.log(`Progress: ${Math.round(p * 100)}%`);
    }, 15);
    console.log("Success generating frames!");
  } catch(e) {
    console.error("Failed:", e);
  }
}
main();
