const fs = require('fs');
let code = fs.readFileSync('server/frameGenerator.ts', 'utf8');
// Fix the shake room issue
const search = `      if (zoomEffect) {`;
const replacement = `      // Ensure there's room to shake by slightly zooming in if shake is active
      if (shakeEffect && !zoomEffect) {
        cropWidth = 1920 - 100; // Leave 50px on each side
        cropHeight = 1080 - 60;
        left = 50;
        top = 30;
      }
      
      if (zoomEffect) {`;
code = code.replace(search, replacement);
fs.writeFileSync('server/frameGenerator.ts', code);
