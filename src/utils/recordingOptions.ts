import { Audio } from 'expo-av';

const ANDROID_OUTPUT_FORMAT_MPEG_4 = 2; // MPEG_4
const ANDROID_AUDIO_ENCODER_AAC = 3;    // AAC
const IOS_AUDIO_QUALITY_MAX = 127;      // AVAudioQualityMax

export const RECORDING_OPTIONS_HIGH_QUALITY: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: ANDROID_OUTPUT_FORMAT_MPEG_4,
    audioEncoder: ANDROID_AUDIO_ENCODER_AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 256000,
  },
  ios: {
    extension: '.m4a',
    // outputFormat 未指定だと非圧縮リニア PCM が M4A コンテナに書き込まれ、
    // ffmpeg / torchaudio / librosa 系のツールで読めないファイルになるため
    // AAC を明示する
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: IOS_AUDIO_QUALITY_MAX,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 256000,
    // AAC では linearPCM 系フィールドは使用されないが、
    // expo-av 標準の HIGH_QUALITY プリセットに合わせて残している
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 256000,
  },
};
