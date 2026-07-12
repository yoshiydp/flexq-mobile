import {
  extractOutputAudioUrl,
  inputFor,
  isPermanentReplicateError,
  ReplicateApiError,
  resolveSeparationType,
} from './replicate';

describe('inputFor', () => {
  const audioUrl = 'https://example.com/audio.m4a';

  it('separate（demucs）は audio + stem: vocals を渡す', () => {
    const input = inputFor('separate', audioUrl);
    expect(input.audio).toBe(audioUrl);
    // stem 未指定だと 4 ステム全処理になり時間・コストが増えるため必須
    expect(input.stem).toBe('vocals');
    expect(input.output_format).toBe('mp3');
  });

  it('denoise（resemble-enhance）は input_audio + denoise_flag: true を渡す', () => {
    const input = inputFor('denoise', audioUrl);
    expect(input.input_audio).toBe(audioUrl);
    expect(input.denoise_flag).toBe(true);
  });
});

describe('extractOutputAudioUrl', () => {
  it('demucs のオブジェクト出力から vocals を抽出する', () => {
    const output = {
      vocals: 'https://example.com/vocals.mp3',
      drums: 'https://example.com/drums.mp3',
      bass: 'https://example.com/bass.mp3',
      other: 'https://example.com/other.mp3',
    };
    expect(extractOutputAudioUrl(output)).toBe('https://example.com/vocals.mp3');
  });

  it('resemble-enhance の配列出力 [denoised, enhanced] から先頭（denoised）を選ぶ', () => {
    const output = [
      'https://example.com/denoised.wav',
      'https://example.com/enhanced.wav',
    ];
    expect(extractOutputAudioUrl(output)).toBe('https://example.com/denoised.wav');
  });

  it('配列長 1 でも先頭要素を返す', () => {
    expect(extractOutputAudioUrl(['https://example.com/only.wav'])).toBe(
      'https://example.com/only.wav'
    );
  });

  it('文字列出力はそのまま返す', () => {
    expect(extractOutputAudioUrl('https://example.com/audio.wav')).toBe(
      'https://example.com/audio.wav'
    );
  });

  it('オブジェクト出力で vocals がない場合は denoised → enhanced の順に優先する', () => {
    expect(
      extractOutputAudioUrl({
        enhanced: 'https://example.com/enhanced.wav',
        denoised: 'https://example.com/denoised.wav',
      })
    ).toBe('https://example.com/denoised.wav');
    expect(
      extractOutputAudioUrl({ enhanced: 'https://example.com/enhanced.wav' })
    ).toBe('https://example.com/enhanced.wav');
  });

  it('優先キーに該当しないオブジェクトは最初の文字列値にフォールバックする', () => {
    expect(
      extractOutputAudioUrl({ something: 'https://example.com/out.wav' })
    ).toBe('https://example.com/out.wav');
  });

  it('demucs が未処理ステムに null を返しても抽出できる', () => {
    const output = {
      vocals: 'https://example.com/vocals.mp3',
      drums: null,
      bass: null,
      other: null,
    };
    expect(extractOutputAudioUrl(output)).toBe('https://example.com/vocals.mp3');
  });

  it('URL が取れない場合は null を返す', () => {
    expect(extractOutputAudioUrl(null)).toBeNull();
    expect(extractOutputAudioUrl(undefined)).toBeNull();
    expect(extractOutputAudioUrl([])).toBeNull();
    expect(extractOutputAudioUrl({})).toBeNull();
    expect(extractOutputAudioUrl({ vocals: 123 })).toBeNull();
    expect(extractOutputAudioUrl(42)).toBeNull();
  });
});

describe('isPermanentReplicateError', () => {
  it('4xx の ReplicateApiError は永続エラー', () => {
    expect(
      isPermanentReplicateError(new ReplicateApiError(404, 'not found'))
    ).toBe(true);
    expect(
      isPermanentReplicateError(new ReplicateApiError(422, 'invalid input'))
    ).toBe(true);
  });

  it('408 / 429 はリトライで回復し得るため一時エラー', () => {
    expect(
      isPermanentReplicateError(new ReplicateApiError(429, 'rate limited'))
    ).toBe(false);
    expect(
      isPermanentReplicateError(new ReplicateApiError(408, 'timeout'))
    ).toBe(false);
  });

  it('5xx の ReplicateApiError は一時エラー', () => {
    expect(
      isPermanentReplicateError(new ReplicateApiError(500, 'server error'))
    ).toBe(false);
    expect(
      isPermanentReplicateError(new ReplicateApiError(503, 'unavailable'))
    ).toBe(false);
  });

  it('通常の Error（ネットワークエラー等）は一時エラー', () => {
    expect(isPermanentReplicateError(new Error('fetch failed'))).toBe(false);
    expect(isPermanentReplicateError(undefined)).toBe(false);
  });
});

describe('resolveSeparationType', () => {
  it('イヤホンあり録音は denoise', () => {
    expect(resolveSeparationType('wired')).toBe('denoise');
    expect(resolveSeparationType('bluetooth')).toBe('denoise');
  });

  it('イヤホンなし・不明は separate', () => {
    expect(resolveSeparationType('none')).toBe('separate');
    expect(resolveSeparationType(undefined)).toBe('separate');
  });
});
