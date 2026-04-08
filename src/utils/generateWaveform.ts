import * as FileSystem from 'expo-file-system';

const TARGET_BARS = 300;
const MAX_READ_BYTES = 512 * 1024; // 500KB

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseWavAmplitudes(bytes: Uint8Array): number[] {
  // Find "data" chunk
  let dataStart = 44;
  for (let i = 12; i < Math.min(bytes.length - 4, 200); i++) {
    if (
      bytes[i] === 0x64 && // 'd'
      bytes[i + 1] === 0x61 && // 'a'
      bytes[i + 2] === 0x74 && // 't'
      bytes[i + 3] === 0x61 // 'a'
    ) {
      dataStart = i + 8;
      break;
    }
  }

  const totalSamples = Math.floor((bytes.length - dataStart) / 2);
  if (totalSamples <= 0) return [];

  const result: number[] = [];
  const step = Math.max(1, Math.floor(totalSamples / TARGET_BARS));
  for (let i = 0; i < totalSamples && result.length < TARGET_BARS; i += step) {
    const byteIndex = dataStart + i * 2;
    if (byteIndex + 1 >= bytes.length) break;
    const sample = (bytes[byteIndex + 1] << 8) | bytes[byteIndex];
    const signed = sample > 32767 ? sample - 65536 : sample;
    result.push(Math.abs(signed));
  }
  return result;
}


function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  // If all values are the same there is nothing to visualize → caller uses FALLBACK
  if (range === 0) return [];
  return values.map((v) => (v - min) / range);
}

// Seeded pseudo-random for consistent-looking (but varied) bars across remounts
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function buildFallbackWaveform(): number[] {
  const rand = seededRandom(42);
  return Array.from({ length: TARGET_BARS }, (_, i) => {
    // slow-moving base (simulates song sections) + fast random variation
    const base = 0.3 + 0.35 * Math.abs(Math.sin(i * 0.07));
    const noise = (rand() - 0.5) * 0.5;
    return Math.min(1, Math.max(0.05, base + noise));
  });
}

const FALLBACK_WAVEFORM = buildFallbackWaveform();

export async function generateWaveform(
  uri: string,
  ext: string,
): Promise<number[]> {
  try {
    // base64 は元サイズの約4/3。500KB分を読むため約680KB文字を使用
    const MAX_BASE64_CHARS = Math.ceil((MAX_READ_BYTES * 4) / 3);

    const fullBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // MP3 compressed data bytes have no reliable correlation with audio amplitude,
    // so skip byte-level parsing and use the fallback sine pattern immediately.
    if (ext.toLowerCase() !== 'wav') return FALLBACK_WAVEFORM;

    const base64 = fullBase64.slice(0, MAX_BASE64_CHARS);
    const bytes = base64ToBytes(base64);
    const amplitudes = parseWavAmplitudes(bytes);
    const normalized = normalize(amplitudes);
    return normalized.length > 0 ? normalized : FALLBACK_WAVEFORM;
  } catch (e) {
    console.warn('generateWaveform failed:', e);
    return FALLBACK_WAVEFORM;
  }
}
