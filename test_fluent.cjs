const ffmpeg = require('fluent-ffmpeg');

const cmd3 = ffmpeg().input('color=c=black:s=1920x1080').inputFormat('lavfi').outputOptions('-metadata', 'title="Yap Yap"').save('/tmp/yap_yap.mp4');
console.log('3:', cmd3._getArguments());

const cmd4 = ffmpeg().input('color=c=black:s=1920x1080').inputFormat('lavfi').outputOptions(['-metadata title="Yap Yap"']).save('/tmp/yap_yap.mp4');
console.log('4:', cmd4._getArguments());

const cmd5 = ffmpeg().input('color=c=black:s=1920x1080').inputFormat('lavfi').outputOptions([['-metadata', 'title=Yap Yap']]).save('/tmp/yap_yap.mp4');
console.log('5:', cmd5._getArguments());
