import {
  createPrediction,
  extractOutputAudioUrl,
  inputFor,
  isPermanentReplicateError,
  ReplicateApiError,
  resolveSeparationType,
} from './replicate';

describe('inputFor', () => {
  const audioUrl = 'https://example.com/audio.m4a';

  it('demucs 系モデルは audio + stem: vocals を渡す', () => {
    const input = inputFor('ryan5453/demucs', audioUrl);
    expect(input.audio).toBe(audioUrl);
    // stem 未指定だと 4 ステム全処理になり時間・コストが増えるため必須
    expect(input.stem).toBe('vocals');
    // mp3 はエンコーダ遅延で同時再生がズレるため flac 固定（TASK-44）
    expect(input.output_format).toBe('flac');
  });

  it('resemble 系モデルは input_audio + denoise_flag: true を渡す', () => {
    const input = inputFor('lucataco/resemble-enhance', audioUrl);
    expect(input.input_audio).toBe(audioUrl);
    expect(input.denoise_flag).toBe(true);
  });

  it('未知のモデルは audio キーにフォールバックする', () => {
    expect(inputFor('some-owner/unknown-model', audioUrl)).toEqual({
      audio: audioUrl,
    });
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

describe('createPrediction', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE_DENOISE_MODEL;
  });

  it('モデルの最新バージョンを解決し /predictions にバージョン指定で作成する（バージョンはキャッシュ）', async () => {
    // コミュニティモデルは /models/{owner}/{name}/predictions（最新バージョン実行）が
    // 404 になるため、バージョン ID を解決して /predictions に渡す必要がある
    process.env.REPLICATE_API_TOKEN = 'test-token';
    process.env.REPLICATE_DENOISE_MODEL = 'test-owner/test-resemble';
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/models/test-owner/test-resemble')) {
        return {
          ok: true,
          json: async () => ({ latest_version: { id: 'ver-123' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ id: 'pred-1', status: 'starting' }),
      };
    }) as unknown as typeof fetch;

    await createPrediction('denoise', 'https://example.com/a.m4a');
    await createPrediction('denoise', 'https://example.com/b.m4a');

    const modelCalls = calls.filter((c) =>
      c.url.endsWith('/models/test-owner/test-resemble'),
    );
    expect(modelCalls).toHaveLength(1);

    const predictionCalls = calls.filter((c) => c.url.endsWith('/predictions'));
    expect(predictionCalls).toHaveLength(2);
    expect(predictionCalls[0].init?.method).toBe('POST');
    const body = JSON.parse(String(predictionCalls[0].init?.body));
    expect(body.version).toBe('ver-123');
    // resemble 系モデル名なので resemble-enhance 用の入力スキーマになる
    expect(body.input.input_audio).toBe('https://example.com/a.m4a');
    expect(body.input.denoise_flag).toBe(true);
  });

  it('denoise がデフォルト（demucs 代用）のときは demucs 用の入力を渡す', async () => {
    // resemble-enhance が m4a を読めないため、denoise パスは demucs で代用する
    process.env.REPLICATE_API_TOKEN = 'test-token';
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/models/ryan5453/demucs')) {
        return {
          ok: true,
          json: async () => ({ latest_version: { id: 'ver-demucs' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ id: 'pred-2', status: 'starting' }),
      };
    }) as unknown as typeof fetch;

    await createPrediction('denoise', 'https://example.com/rec.m4a');

    const predictionCalls = calls.filter((c) => c.url.endsWith('/predictions'));
    expect(predictionCalls).toHaveLength(1);
    const body = JSON.parse(String(predictionCalls[0].init?.body));
    expect(body.version).toBe('ver-demucs');
    expect(body.input.audio).toBe('https://example.com/rec.m4a');
    expect(body.input.stem).toBe('vocals');
    expect(body.input.output_format).toBe('flac');
  });

  it('旧デフォルト（resemble-enhance）が環境変数に残っていても demucs に差し替える', async () => {
    // デプロイ済みスタックは SAM パラメータの Default 変更では旧値を保持し続けるため、
    // コード側で m4a 非対応の旧デフォルトを demucs に置き換える
    process.env.REPLICATE_API_TOKEN = 'test-token';
    process.env.REPLICATE_DENOISE_MODEL = 'lucataco/resemble-enhance';
    const calls: { url: string; init?: RequestInit }[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/models/')) {
        return {
          ok: true,
          json: async () => ({ latest_version: { id: 'ver-demucs' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ id: 'pred-3', status: 'starting' }),
      };
    }) as unknown as typeof fetch;

    await createPrediction('denoise', 'https://example.com/rec.m4a');

    // resemble-enhance には一切問い合わせず demucs 用の入力を送る
    expect(
      calls.some((c) => c.url.includes('lucataco/resemble-enhance')),
    ).toBe(false);
    const predictionCalls = calls.filter((c) => c.url.endsWith('/predictions'));
    expect(predictionCalls).toHaveLength(1);
    const body = JSON.parse(String(predictionCalls[0].init?.body));
    expect(body.input.audio).toBe('https://example.com/rec.m4a');
    expect(body.input.stem).toBe('vocals');
  });
});
