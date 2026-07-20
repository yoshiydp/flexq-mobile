/**
 * getAudioMimeType のユニットテスト (TASK-55)
 *
 * - 録音・分離音源で扱う拡張子（m4a / mp3 / wav / aac / flac）を正しい mime タイプに変換する
 * - 大文字拡張子も判定できる
 * - 不明な拡張子は汎用 mime タイプにフォールバックする
 */
import { getAudioMimeType, FALLBACK_MIME_TYPE } from './getAudioMimeType';

describe('getAudioMimeType', () => {
  it.each([
    ['My Take.m4a', 'audio/mp4'],
    ['recording.mp4', 'audio/mp4'],
    ['recording.aac', 'audio/aac'],
    ['song.mp3', 'audio/mpeg'],
    ['separated.wav', 'audio/wav'],
    ['old-separated.flac', 'audio/flac'],
  ])('%s は %s を返す', (fileName, expected) => {
    expect(getAudioMimeType(fileName)).toBe(expected);
  });

  it('大文字の拡張子も判定できる', () => {
    expect(getAudioMimeType('TAKE.M4A')).toBe('audio/mp4');
  });

  it('不明な拡張子は汎用 mime タイプにフォールバックする', () => {
    expect(getAudioMimeType('unknown.xyz')).toBe(FALLBACK_MIME_TYPE);
  });
});
