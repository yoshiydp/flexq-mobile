#!/usr/bin/env node
/**
 * ストア審査用デモアカウントにテストデータを投入する。
 *
 * 素材（音源・アートワーク）は demo-assets/ に置いたローカルファイルを使い、
 * アプリと同じ経路（Presigned URL への PUT → メタデータ POST）で登録する。
 * 何度実行しても同じ結果になるよう、既存のトラック / プロジェクト / メモ /
 * レコードは投入前にすべて削除する。
 *
 *   node scripts/seed-demo-account.mjs --env stg --email <mail> --password <pass>
 *
 * --dry-run を付けると API を呼ばずに投入予定の内容だけを表示する。
 *
 * 未登録のメールアドレスを指定した場合は新規登録になる。新規登録には
 * メールで届く 6 桁の認証コードが必要（TASK-85）なため、スクリプトが
 * 認証コードを送信したあと入力を求める（--code <6桁> で非対話的にも渡せる。
 * 有効期限内に同じメールへ再送はできないので、届いたコードをそのまま入力する）。
 */

import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const API_BASE = {
  dev: 'https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1',
  stg: 'https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1',
  prod: 'https://7ez5duggcc.execute-api.ap-northeast-1.amazonaws.com/v1',
};

const ASSETS = path.resolve('demo-assets');
const WAVEFORM_BARS = 300; // src/utils/generateWaveform.ts の TARGET_BARS と揃える

// ---------------------------------------------------------------------------
// 投入内容。曲順は demo-assets/tracks/ をファイル名でソートした順に対応する
// ---------------------------------------------------------------------------

/**
 * トラックのタイトルと、対応するアートワーク（demo-assets/artworks/）。
 * match は demo-assets/tracks/ 内のファイル名に含まれる文字列（大文字小文字は無視）。
 */
const TRACKS = [
  { title: 'One Night In France', match: 'One Night In France', artwork: 'track-01-grooves.jpg' },
  { title: 'Ghost Town', match: 'Ghost Town', artwork: 'track-02-waveform.jpg' },
  { title: 'Canon Event', match: 'Canon Event', artwork: 'track-03-horizon.jpg' },
  { title: 'Fractured', match: 'Fractured', artwork: 'track-04-mesh.jpg' },
];

/** プロジェクト。trackIndex は TRACKS の添字。 */
const PROJECTS = [
  { projectName: '夜明けのデモ', trackIndex: 0 },
  { projectName: 'サビ案 A / B 比較', trackIndex: 1 },
  { projectName: '仮歌 テイク集', trackIndex: 2 },
  { projectName: 'ワンコーラス通し', trackIndex: 3 },
];

const MEMOS = [
  {
    title: '1 番 A メロ',
    body: '眠らない街の灯りが\n窓の縁でにじんでいく\n返せなかった言葉だけ\nポケットの奥で鳴っている',
    isBookmarked: true,
  },
  {
    title: 'サビ候補',
    body: 'このまま朝が来なくていい\n君の声で目を覚ますなら\n遠回りした分だけ\n強く歌える気がしている',
    isBookmarked: true,
  },
  {
    title: '2 番の言い回し',
    body: '「すれ違う」→「見失う」の方が語感が良いかも。\n2 番は視点を相手側に変えて書き直す。',
    isBookmarked: false,
  },
  {
    title: 'アレンジのメモ',
    body: '・落ちサビはピアノとボーカルだけ\n・2 番はドラムを 8 分から 16 分へ\n・アウトロにギターのフレーズを足す',
    isBookmarked: false,
  },
];

/** 単体のクイックレコード。demo-assets/voice/ のファイル名で対応させる。 */
const VOICE_RECORDS = [
  { file: 'humming-idea.m4a', title: 'ハミングのアイデア', isBookmarked: true },
  { file: 'melody-sketch.m4a', title: 'メロディ下書き', isBookmarked: false },
];

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const env = opt('env', 'stg');
const email = opt('email', process.env.DEMO_EMAIL);
const password = opt('password', process.env.DEMO_PASSWORD);
const username = opt('username', 'FlexQ Demo');
const presetCode = opt('code', process.env.DEMO_VERIFICATION_CODE);
const dryRun = args.includes('--dry-run');

const base = API_BASE[env];
if (!base) throw new Error(`unknown env: ${env} (dev / stg / prod)`);
if (!dryRun && (!email || !password)) {
  throw new Error('--email と --password（または DEMO_EMAIL / DEMO_PASSWORD）が必要です');
}

let token = '';

async function api(method, endpoint, body) {
  const res = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Presigned URL を取ってローカルファイルを S3 に置き、S3 キーを返す。 */
async function upload(endpoint, filePath, contentType) {
  const filename = path.basename(filePath);
  const { uploadUrl, key } = await api(
    'GET',
    `${endpoint}?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
  );
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: await readFile(filePath),
  });
  if (!res.ok) throw new Error(`PUT ${filename} -> ${res.status}`);
  return key;
}

async function uploadJson(endpoint, filename, data) {
  const { uploadUrl, key } = await api(
    'GET',
    `${endpoint}?filename=${filename}&contentType=application/json`,
  );
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT ${filename} -> ${res.status}`);
  return key;
}

/**
 * ffmpeg で音源をモノラル 8kHz の生 PCM にデコードし、300 本のバーに畳む。
 * アプリの generateWaveform は mp3 をパースできずフォールバックの波形を返すため、
 * デモでは実際の音量カーブを見せられるようこちらで作って S3 に上げる。
 */
function buildWaveform(filePath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-i', filePath,
      '-ac', '1', '-ar', '8000', '-f', 's16le', '-',
    ]);
    const chunks = [];
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (c) => process.stderr.write(c));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}`));
      const buf = Buffer.concat(chunks);
      const samples = Math.floor(buf.length / 2);
      const per = Math.floor(samples / WAVEFORM_BARS);
      if (per < 1) return reject(new Error(`音源が短すぎます: ${filePath}`));
      const bars = [];
      for (let b = 0; b < WAVEFORM_BARS; b++) {
        let sum = 0;
        for (let i = 0; i < per; i++) sum += buf.readInt16LE((b * per + i) * 2) ** 2;
        bars.push(Math.sqrt(sum / per) / 32768); // RMS を 0..1 に正規化
      }
      const max = Math.max(...bars) || 1;
      resolve(bars.map((v) => Math.min(1, Math.max(0.04, v / max))));
    });
  });
}

async function listFiles(dir, exts) {
  try {
    const names = await readdir(dir);
    return names
      .filter((n) => exts.includes(path.extname(n).toLowerCase()) && !n.startsWith('.'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * 新規登録用の認証コードを用意する。--code で渡されていればそれを使い、
 * なければ API に送信を依頼してメールに届いた 6 桁の入力を待つ (TASK-85)。
 */
async function obtainRegistrationCode() {
  if (presetCode) return presetCode;
  try {
    await api('POST', '/data/auth/verification-code', { email, purpose: 'register' });
    console.log(`${email} に認証コードを送信しました`);
  } catch (e) {
    // 有効期限内の再送は 429 で拒否される。届いているコードをそのまま入力してもらう
    if (!String(e.message).includes('-> 429')) throw e;
    console.log('有効な認証コードが送信済みです（再送の待ち時間中）。届いているコードを入力してください');
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question('メールに届いた 6 桁の認証コード: ')).trim();
    if (!/^\d{6}$/.test(answer)) throw new Error('認証コードは 6 桁の数字で入力してください');
    return answer;
  } finally {
    rl.close();
  }
}

/** 再実行できるよう、既存データを全部消してから投入する。 */
async function wipe() {
  const [tracks, projects, memos, records] = await Promise.all([
    api('GET', '/data/track'),
    api('GET', '/data/project'),
    api('GET', '/data/memo'),
    api('GET', '/data/record'),
  ]);
  const items = [
    ...records.map((r) => ['/data/record', r.id]),
    ...projects.map((p) => ['/data/project', p.id]),
    ...tracks.map((t) => ['/data/track', t.id]),
    ...memos.map((m) => ['/data/memo', m.id]),
  ];
  for (const [endpoint, id] of items) await api('DELETE', `${endpoint}/${id}`);
  console.log(`既存データを削除: track ${tracks.length} / project ${projects.length} / memo ${memos.length} / record ${records.length}`);
}

async function main() {
  const audioFiles = await listFiles(path.join(ASSETS, 'tracks'), ['.mp3', '.wav']);
  const voiceFiles = await listFiles(path.join(ASSETS, 'voice'), ['.m4a', '.mp3', '.wav', '.aac']);

  // TRACKS の match でファイルを引き当てる（ファイル名の並び順に依存させない）
  for (const t of TRACKS) {
    t.file = audioFiles.find((f) => f.toLowerCase().includes(t.match.toLowerCase()));
    if (!t.file) {
      throw new Error(
        `demo-assets/tracks/ に "${t.match}" を含む音源がありません（見つかったのは: ${audioFiles.join(', ') || 'なし'}）`,
      );
    }
  }

  console.log(`環境: ${env} (${base})`);
  for (const t of TRACKS) console.log(`  トラック「${t.title}」 <- ${t.file} / ${t.artwork}`);
  for (const p of PROJECTS) console.log(`  プロジェクト「${p.projectName}」 <- ${TRACKS[p.trackIndex].title}`);
  console.log(`  メモ ${MEMOS.length} 件`);
  console.log(`  声素材: ${voiceFiles.join(', ') || '（なし。クイックレコードはスキップ）'}`);
  if (dryRun) {
    console.log('\n--dry-run のため API は呼びません。');
    return;
  }

  // 1. ログイン（未登録なら認証コード付きで登録してそのままトークンを受け取る）
  try {
    const auth = await api('POST', '/data/auth/login', { email, password });
    token = auth.token.accessToken;
    console.log('既存のデモアカウントにログインしました');
  } catch {
    const code = await obtainRegistrationCode();
    const auth = await api('POST', '/data/auth/register', { username, email, password, code });
    token = auth.token.accessToken;
    console.log('デモアカウントを新規登録しました');
  }

  await wipe();

  // 2. プロフィール画像
  const thumbnailKey = await upload(
    '/data/track/upload-url',
    path.join(ASSETS, 'artworks', 'profile.jpg'),
    'image/jpeg',
  );
  await api('PUT', '/data/profile', { username, thumbnailKey });
  console.log('プロフィールを更新しました');

  // 3. トラック（音源 + アートワーク + 波形 JSON）
  const created = [];
  for (const meta of TRACKS) {
    const audioPath = path.join(ASSETS, 'tracks', meta.file);
    const ext = path.extname(audioPath).slice(1).toLowerCase();
    const s3Key = await upload(
      '/data/track/upload-url',
      audioPath,
      ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
    );
    const artworkKey = await upload(
      '/data/track/upload-url',
      path.join(ASSETS, 'artworks', meta.artwork),
      'image/jpeg',
    );
    const waveformJsonKey = await uploadJson(
      '/data/track/upload-url',
      'waveform.json',
      await buildWaveform(audioPath),
    );
    const track = await api('POST', '/data/track', {
      title: meta.title,
      s3Key,
      extention: ext,
      artworkKey,
    });
    created.push({ ...track, artworkKey, waveformJsonKey });
    console.log(`トラック: ${meta.title}`);
  }

  // 4. プロジェクト（トラックに紐付け）
  for (const p of PROJECTS) {
    const t = created[p.trackIndex];
    await api('POST', '/data/project', {
      projectName: p.projectName,
      trackId: t.id,
      trackName: t.title,
      artworkKey: t.artworkKey,
      waveformJsonKey: t.waveformJsonKey,
    });
    console.log(`プロジェクト: ${p.projectName}`);
  }

  // 5. クイックメモ
  for (const m of MEMOS) {
    await api('POST', '/data/memo', m);
    console.log(`メモ: ${m.title}`);
  }

  // 6. クイックレコード（demo-assets/voice/ に素材がある場合のみ）
  for (const r of VOICE_RECORDS) {
    if (!voiceFiles.includes(r.file)) {
      console.log(`レコード: ${r.file} が無いのでスキップ`);
      continue;
    }
    const voicePath = path.join(ASSETS, 'voice', r.file);
    const ext = path.extname(voicePath).slice(1).toLowerCase();
    const contentType = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : 'audio/m4a';
    const s3Key = await upload('/data/record/upload-url', voicePath, contentType);
    await api('POST', '/data/record', {
      title: r.title,
      s3Key,
      isBookmarked: r.isBookmarked,
      recordedWithHeadphones: 'none',
    });
    console.log(`レコード: ${r.title}`);
  }

  console.log('\n投入が完了しました。');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
