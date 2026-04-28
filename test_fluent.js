const ffmpeg = require('fluent-ffmpeg');
const cmd = ffmpeg().input('color=c=black:s=1920x1080').inputFormat('lavfi').outputOptions(['-metadata', 'title="Yap Yap"']).save('/tmp/yap_yap.mp4');
console.log(cmd._getArguments().join(' '));
