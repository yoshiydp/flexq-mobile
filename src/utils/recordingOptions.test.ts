import { Audio } from 'expo-av';

import { RECORDING_OPTIONS_HIGH_QUALITY } from './recordingOptions';

// expo-av はネイティブモジュール（ExponentAV）を要求するため、
// 実際の録音定数（enum）のみを取り出してモックする（jest.mock はホイストされる）
jest.mock('expo-av', () => ({
  Audio: jest.requireActual('expo-av/build/Audio/RecordingConstants'),
}));

describe('RECORDING_OPTIONS_HIGH_QUALITY', () => {
  it('iOS は AAC（MPEG4AAC）で録音する', () => {
    // outputFormat 未指定だと非圧縮リニア PCM が M4A コンテナに書き込まれ、
    // ffmpeg / torchaudio / librosa 系ツール（Replicate のモデル）が読めない
    expect(RECORDING_OPTIONS_HIGH_QUALITY.ios.outputFormat).toBe(
      Audio.IOSOutputFormat.MPEG4AAC
    );
  });

  it('iOS は 44.1kHz / 2ch / 256kbps を維持する', () => {
    expect(RECORDING_OPTIONS_HIGH_QUALITY.ios.sampleRate).toBe(44100);
    expect(RECORDING_OPTIONS_HIGH_QUALITY.ios.numberOfChannels).toBe(2);
    expect(RECORDING_OPTIONS_HIGH_QUALITY.ios.bitRate).toBe(256000);
  });

  it('Android は MPEG_4 コンテナ + AAC エンコーダで録音する', () => {
    expect(RECORDING_OPTIONS_HIGH_QUALITY.android.outputFormat).toBe(
      Audio.AndroidOutputFormat.MPEG_4
    );
    expect(RECORDING_OPTIONS_HIGH_QUALITY.android.audioEncoder).toBe(
      Audio.AndroidAudioEncoder.AAC
    );
  });
});
