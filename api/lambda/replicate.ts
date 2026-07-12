/**
 * Replicate API クライアント（AI クリーンアップ用）
 *
 * - separate: ボーカル分離（イヤホンなし録音でトラック音が混入したケース）
 * - denoise: ノイズ除去（イヤホンあり録音の環境ノイズ低減）
 *
 * モデルは環境変数で差し替え可能。バージョン指定を不要にするため
 * `POST /v1/models/{owner}/{name}/predictions`（最新バージョン実行）を使う。
 */

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

const DEFAULT_SEPARATE_MODEL = 'ryan5453/demucs';
const DEFAULT_DENOISE_MODEL = 'lucataco/resemble-enhance';

export type SeparationType = 'separate' | 'denoise';

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
}

/** Replicate API が非 2xx を返したときのエラー（status で一時/永続を判別する） */
export class ReplicateApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ReplicateApiError';
    this.status = status;
  }
}

/**
 * リトライしても回復しない永続エラーかどうかを判定する。
 * 4xx（prediction が存在しない・リクエスト不正など）は永続、
 * 5xx やネットワークエラーは一時エラーとして扱う。
 * ただし 408（タイムアウト）/ 429（レート制限）はリトライで回復し得るため除く。
 */
export function isPermanentReplicateError(err: unknown): boolean {
  return err instanceof ReplicateApiError && isPermanentHttpStatus(err.status);
}

/** HTTP ステータスがリトライしても回復しない永続エラーかどうか */
export function isPermanentHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

export function isReplicateConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

/**
 * 録音時のイヤホン接続状態から適用する処理タイプを決める。
 * イヤホンあり（トラック音がマイクに乗らない）→ denoise、それ以外 → separate
 */
export function resolveSeparationType(
  recordedWithHeadphones?: string,
): SeparationType {
  return recordedWithHeadphones === 'wired' ||
    recordedWithHeadphones === 'bluetooth'
    ? 'denoise'
    : 'separate';
}

function modelFor(type: SeparationType): string {
  return type === 'separate'
    ? process.env.REPLICATE_SEPARATE_MODEL || DEFAULT_SEPARATE_MODEL
    : process.env.REPLICATE_DENOISE_MODEL || DEFAULT_DENOISE_MODEL;
}

export function inputFor(
  type: SeparationType,
  audioUrl: string,
): Record<string, unknown> {
  // モデルごとに入力スキーマが異なる
  if (type === 'separate') {
    // demucs: stem 指定でボーカルのみ処理する（未指定だと 4 ステム全処理で時間・コスト増）。
    // output_format を固定して出力拡張子を決定的にする
    return { audio: audioUrl, stem: 'vocals', output_format: 'mp3' };
  }
  // resemble-enhance: denoise_flag: true で環境ノイズ除去を有効化する
  return { input_audio: audioUrl, denoise_flag: true };
}

async function replicateFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${REPLICATE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ReplicateApiError(
      res.status,
      `Replicate API error ${res.status}: ${text}`,
    );
  }
  return res.json();
}

/** prediction を作成して処理を開始する */
export async function createPrediction(
  type: SeparationType,
  audioUrl: string,
): Promise<ReplicatePrediction> {
  return replicateFetch(`/models/${modelFor(type)}/predictions`, {
    method: 'POST',
    body: JSON.stringify({ input: inputFor(type, audioUrl) }),
  });
}

/** prediction の現在のステータスを取得する */
export async function getPrediction(
  predictionId: string,
): Promise<ReplicatePrediction> {
  return replicateFetch(`/predictions/${predictionId}`);
}

/**
 * prediction の output から処理済み音源の URL を取り出す。
 * モデルによって出力形式が異なるため、防御的な優先順位で解決する:
 * - オブジェクト（demucs: {vocals, drums, bass, other}）→ vocals / denoised / enhanced を優先
 * - 配列（resemble-enhance: [denoised, enhanced]）→ 先頭の文字列（denoised）を選択
 * - 文字列 → そのまま返す
 * 将来モデルを差し替えても（SAM パラメータ）壊れにくいよう、
 * 優先キーに該当しない場合は最初に見つかった文字列にフォールバックする。
 */
export function extractOutputAudioUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    // resemble-enhance は [denoised, enhanced] を返す。
    // 環境ノイズ除去が目的なので先頭（denoised）を選ぶ（配列長 1 でも成立）
    const first = output.find((v) => typeof v === 'string');
    return (first as string) ?? null;
  }
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    // separate（demucs）は vocals、denoise 系は denoised → enhanced の順に優先
    const preferredKeys = ['vocals', 'denoised', 'enhanced', 'audio', 'output'];
    for (const key of preferredKeys) {
      if (typeof obj[key] === 'string') return obj[key] as string;
    }
    const firstString = Object.values(obj).find((v) => typeof v === 'string');
    return (firstString as string) ?? null;
  }
  return null;
}
