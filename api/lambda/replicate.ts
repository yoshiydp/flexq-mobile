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

function inputFor(type: SeparationType, audioUrl: string): Record<string, unknown> {
  // モデルごとに入力キーが異なる（demucs: audio / resemble-enhance: input_audio）
  return type === 'separate' ? { audio: audioUrl } : { input_audio: audioUrl };
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
    throw new Error(`Replicate API error ${res.status}: ${text}`);
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
 * モデルによって出力形式が異なるため、文字列 / 配列 / オブジェクトに対応する。
 */
export function extractOutputAudioUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const first = output.find((v) => typeof v === 'string');
    return (first as string) ?? null;
  }
  if (typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    // separate（demucs）は vocals、denoise（resemble-enhance）は enhanced / denoised を優先
    const preferredKeys = ['vocals', 'enhanced', 'denoised', 'audio', 'output'];
    for (const key of preferredKeys) {
      if (typeof obj[key] === 'string') return obj[key] as string;
    }
    const firstString = Object.values(obj).find((v) => typeof v === 'string');
    return (firstString as string) ?? null;
  }
  return null;
}
