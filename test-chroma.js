import sharp from 'sharp';
import fs from 'fs';

async function test() {
  const currentBuf = await sharp('test.png').resize(1920, 1080).jpeg().toBuffer();
  const offset = 20;

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
      
  await sharp(r).joinChannel([g, b]).toFile('test-chroma-out.jpg');
  console.log('Done');
}
test();
