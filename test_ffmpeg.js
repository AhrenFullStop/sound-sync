import ffmpeg from 'fluent-ffmpeg';
const filterGraph = [
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080[bg_scaled]`,
    `[1:a]showwaves=s=1920x300:mode=cline:colors=white:scale=sqrt[wave]`,
    `[wave]colorchannelmixer=aa=0.5[wave_alpha]`,
    `[bg_scaled][wave_alpha]overlay=0:600[bg_wave]`,
    `[bg_wave][2:v]overlay=0:0[final]`
  ];

ffmpeg()
    .input('/Users/ahren.posthumus/Code/sound-sync/data/images/img_1777222590508607_1777222631296.jpg')
    .inputOptions(['-loop 1', '-framerate 30'])
    .input('/Users/ahren.posthumus/Code/sound-sync/data/uploads/1777222590502-Cuddle or f off_.mp3')
    .input('/Users/ahren.posthumus/Code/sound-sync/data/images/text_test_track.png')
    .inputOptions(['-loop 1', '-framerate 30'])
    .complexFilter(filterGraph.join(';'), 'final')
    .outputOptions([
      '-map [final]',
      '-map 1:a',
      '-c:v libx264',
      '-preset fast',
      '-crf 26',
      '-c:a aac',
      '-b:a 192k',
      '-pix_fmt yuv420p',
      '-shortest'
    ])
    .on('error', (err) => console.log('ERROR:', err.message))
    .on('end', () => console.log('DONE'))
    .save('output.mp4');
