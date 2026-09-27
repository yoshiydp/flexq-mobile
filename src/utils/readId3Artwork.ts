import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

function decodeSynchsafeInt(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

/**
 * ID3v2タグから APIC (アートワーク) フレームを探して data URI を返す。
 * ファイル全体は読まず、先頭のID3タグ部分のみ部分読み込みする。
 */
export async function readId3Artwork(uri: string): Promise<string | null> {
  try {
    // Step 1: 先頭10バイトでID3v2ヘッダーを確認
    const headerB64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
      position: 0,
      length: 10,
    });
    const header = base64ToBytes(headerB64);

    // "ID3" マーカー確認
    if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null;

    const version = header[3]; // ID3v2.x の x
    const tagBodySize = decodeSynchsafeInt(header[6], header[7], header[8], header[9]);
    const totalTagSize = tagBodySize + 10;

    // Step 2: タグ部分のみ読み込む
    const tagB64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
      position: 0,
      length: totalTagSize,
    });
    const tag = base64ToBytes(tagB64);

    // Step 3: フレームを順番に走査してAPICを探す
    let pos = 10;
    // ID3v2.2 は3バイトフレームID + 3バイトサイズ、v2.3/v2.4 は4+4
    const isV22 = version === 2;
    const frameIdLen = isV22 ? 3 : 4;
    const frameSizeLen = isV22 ? 3 : 4;
    const frameHeaderLen = frameIdLen + frameSizeLen + (isV22 ? 0 : 2); // flags 2bytes (v2.3+)

    while (pos + frameHeaderLen < totalTagSize) {
      const frameId = readString(tag, pos, frameIdLen);

      // ヌルバイトはパディング → 終了
      if (tag[pos] === 0x00) break;

      const frameSize = isV22
        ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5]
        : readUint32BE(tag, pos + 4);

      if (frameSize <= 0 || pos + frameHeaderLen + frameSize > totalTagSize) break;

      const dataStart = pos + frameHeaderLen;

      if (frameId === 'APIC' || frameId === 'PIC') {
        // APIC フレーム構造:
        //   1byte  : テキストエンコーディング
        //   N bytes: MIMEタイプ (null終端) ※ PIC(v2.2)は3バイト固定
        //   1byte  : 画像タイプ
        //   N bytes: 説明 (null終端)
        //   残り   : 画像データ
        let offset = dataStart;
        const encoding = tag[offset++];

        let mimeType = 'image/jpeg';
        if (isV22) {
          // v2.2 PIC: 3バイト形式 ("JPG" or "PNG")
          const fmt = readString(tag, offset, 3);
          mimeType = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
          offset += 3;
        } else {
          // v2.3+ APIC: null終端MIMEタイプ
          const mimeEnd = tag.indexOf(0x00, offset);
          mimeType = readString(tag, offset, mimeEnd - offset) || 'image/jpeg';
          offset = mimeEnd + 1;
        }

        offset++; // 画像タイプ (0=その他, 3=フロントカバー等)

        // 説明のnull終端をスキップ (encoding=1はUTF-16で2バイトnull)
        const nullSize = encoding === 1 ? 2 : 1;
        while (offset < dataStart + frameSize) {
          if (nullSize === 2) {
            if (tag[offset] === 0x00 && tag[offset + 1] === 0x00) { offset += 2; break; }
            offset += 2;
          } else {
            if (tag[offset] === 0x00) { offset += 1; break; }
            offset += 1;
          }
        }

        // 画像データをbase64に変換
        const imageData = tag.slice(offset, dataStart + frameSize);
        const base64 = btoa(Array.from(imageData, (b) => String.fromCharCode(b)).join(''));
        return `data:${mimeType};base64,${base64}`;
      }

      pos = dataStart + frameSize;
    }

    return null;
  } catch {
    return null;
  }
}
