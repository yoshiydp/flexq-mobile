import { resolveHeadphonesAtRecordStart } from './headphonesAtRecordStart';

describe('resolveHeadphonesAtRecordStart (TASK-126)', () => {
  it('Bluetooth 検知の権限が未許可で未接続と検知された場合は値なし（null）にする', () => {
    expect(resolveHeadphonesAtRecordStart('none', 'denied')).toBeNull();
  });

  it('権限が未許可でも有線イヤホンはそのまま記録する', () => {
    expect(resolveHeadphonesAtRecordStart('wired', 'denied')).toBe('wired');
  });

  it.each(['not-required', 'granted', 'unknown'] as const)(
    '権限状態が %s のときは検知結果をそのまま記録する',
    (status) => {
      expect(resolveHeadphonesAtRecordStart('none', status)).toBe('none');
      expect(resolveHeadphonesAtRecordStart('wired', status)).toBe('wired');
      expect(resolveHeadphonesAtRecordStart('bluetooth', status)).toBe(
        'bluetooth',
      );
    },
  );

  it('検知不可（null）はそのまま null を返す', () => {
    expect(resolveHeadphonesAtRecordStart(null, 'denied')).toBeNull();
    expect(resolveHeadphonesAtRecordStart(null, 'granted')).toBeNull();
  });
});
