# expo-av 移行計画（TASK-114）

expo-av（録音・トラック再生・音声セッション管理）を撤去し、react-native-audio-api（候補 B）または expo-audio（候補 A）へ移行するための計画書。**推奨は候補 B（react-native-audio-api への一本化・expo-av 完全撤去）**。理由と手順は第 4 章以降を参照。

調査日: 2026-09-26。根拠は本リポジトリの `node_modules`（react-native-audio-api 0.13.4）・`npm pack expo-audio@1.1.1`（SDK 54 同梱版）の型定義とネイティブソース・npm レジストリ・公式ドキュメント（docs.expo.dev / expo.dev/changelog / docs.swmansion.com）。確認できなかった項目は **「未確認」** と明記している（推測で断定しない）。

---

## 1. 背景と期限感

### 1.1 expo-av のリリース状況

| 項目 | 事実 | 根拠 |
|------|------|------|
| プロジェクトの Expo | SDK 54（`expo ^54.0.0`、react-native 0.81.5） | `package.json` |
| expo-av の最終安定版 | **16.0.8（2025-12-05 公開）**。以降は `16.0.9-canary-20260119` のみで安定版なし | `npm view expo-av time` / `dist-tags`（latest = 16.0.8） |
| SDK 54 ドキュメントの告知 | 「`expo-av` is not receiving patches and **will be removed in SDK 55**」 | docs.expo.dev/versions/v54.0.0/sdk/av |
| SDK 55（2026-02-25・RN 0.83） | `bundledNativeModules.json` に **expo-av の項目が無い**（expo-audio `~55.0.18`、react-native-worklets `0.7.4`）。changelog: 「expo-av was removed from Expo Go … is no longer receiving patches and may not continue working in your apps」 | github expo/expo `sdk-55` ブランチ / expo.dev/changelog/sdk-55 |
| npm 上の最新 Expo | 57.0.25（SDK 55 / 56 / 57 がリリース済み） | `npm view expo dist-tags` |
| expo-audio | SDK 54 同梱版は **`~1.1.1`**（`node_modules/expo/bundledNativeModules.json`）。SDK 55 以降は `55.x` / `56.x` / `57.x` に採番方式が変わった（latest 57.0.5） | `npm view expo-audio dist-tags` |

要点: **SDK 55 以降へ更新するには expo-av の撤去が前提条件**になる。SDK 54 に留まっている間は動作するが、パッチは出ないため iOS / Android の OS 更新で壊れても修正されない。

### 1.2 ビルドへの影響（runtimeVersion / TestFlight・Play）

- expo-av の撤去（ネイティブモジュールの削除）・expo-audio の追加はどちらも**ネイティブ変更**。`CLAUDE.md`「デプロイフロー」の規則どおり `app.json` の `runtimeVersion`（現在 `1.1.0`）を **`1.2.0` に上げる**。上げずにマージすると旧ビルドに OTA が届いて起動時にクラッシュしうる
- 移行後は開発ビルドの再作成（`yarn ios` / `yarn android`）と TestFlight / Play 内部テストの新ビルド（`/testflight` / `/playstore`）が必要で、**OTA だけでは届かない**。新 runtimeVersion のビルドが出るまで OTA は誰にも届かない
- 現在 iOS の音声セッションを書き換えている **Yarn パッチ `.yarn/patches/expo-av-npm-16.0.8-3f40a40d18.patch` も同時に消える**（第 2 章参照）。代替の担保がないまま消すと Bluetooth イヤホン + スピーカー録音の挙動が変わる
- 推奨する順序: **SDK 54 のまま移行を完了 → 実機検証 → 別タスクで SDK 55+ へ更新**（変数を分離する）。SDK 55 更新と同時に行うと不具合の切り分けができない

---

## 2. expo-av 依存箇所の棚卸し

`grep -rn "expo-av" src __mocks__ jest.setup.js app.json package.json .yarn/patches` の結果（2026-09-26・`origin/develop` 基点）。

### 2.1 コード依存（実行時）

| # | ファイル:行 | 使用 API | 用途 | 依存している挙動（移行時に維持すべき点） |
|---|-------------|----------|------|--------------------------------------------|
| 1 | `src/components/features/record/RecRecordingSection/index.tsx:3, 64-68, 95-100, 113, 189-206, 214-300, 342-345, 372, 424-441` | `Audio.requestPermissionsAsync` / `Audio.setAudioModeAsync` / `new Audio.Recording` + `prepareToRecordAsync` + `startAsync` + `stopAndUnloadAsync` + `getURI` / `Audio.Sound.createAsync` / `getStatusAsync` / `InterruptionModeAndroid` | **録音本体 + 録音中のトラック再生 + 録音開始位置の実測** | (a) 録音前に `allowsRecordingIOS: true` + `InterruptionModeAndroid.DoNotMix`（playAndRecord・フォーカス専有）、アンマウント時に `allowsRecordingIOS: false` + `DuckOthers` へ戻す（戻さないと以降のトラック再生が他アプリの音を止める）。(b) マイク許可はカウントダウン前に取得し、`AppState` が `active` になるまで待って 1 回リトライ。(c) トラックを `positionMillis: startPositionMs` から先に再生 → 録音 `startAsync`。(d) **開始位置の実測**: `recording.getStatusAsync().durationMillis` と `track.getStatusAsync().positionMillis` を **100ms 間隔・最大 100 回（10 秒）** 同時刻に取り、`track − rec` を保存（負値を保持 / TASK-89）。Android は **0.8 秒後に取り直す**（ExoPlayer の先走った位置報告 / TASK-121）。(e) `__DEV__` の `[rec-start-measure]` ログ。(f) 停止・アンマウント時に prepare 済み録音も解放（マイクを掴んだままにしない） |
| 2 | `src/screens/AudioPlayerScreen/index.tsx:3, 49, 91-97, 101-104, 114-145, 200-240` | `Audio.setAudioModeAsync`（`staysActiveInBackground: false`・`DuckOthers`）/ `Audio.Sound.createAsync` / `setOnPlaybackStatusUpdate` / `setVolumeAsync` / `setIsLoopingAsync` / `getStatusAsync` / `playAsync` / `pauseAsync` / `setPositionAsync` / `stopAsync` / `unloadAsync` | トラック一覧からの再生（AP） | Presigned URL の**ストリーミング再生**、曲送り時の再生継続、`didJustFinish && !isLooping` で先頭に戻して停止、位置・尺の状態更新はステータスコールバック（既定 500ms） |
| 3 | `src/screens/ProjectEditScreen/index.tsx:30, 371-381, 398-411, 471, 487-500, 508-514, 578-595, 607-615, 625, 786, 832, 1032-1034` | `Audio.Sound.createAsync({shouldPlay:false, volume, isLooping})` / `setOnPlaybackStatusUpdate(didJustFinish)` / `playAsync` / `pauseAsync` / `setStatusAsync({volume})` / `setVolumeAsync` / `getStatusAsync` / `setPositionAsync` / `setIsLoopingAsync` / `unloadAsync` | EDIT / REC モードのトラック再生・波形シーク・CUE・ループ | **`setAudioModeAsync` を呼ばない**（直前の画面のグローバル設定に依存）。`safeSeekTo` は「一時停止 → seek → 再生」。CUE 登録時に `positionMillis` を取得。`sound` を `RecView` → `WaveformPlayer` に渡す。`blur` 時に一時停止 |
| 4 | `src/components/features/projectEdit/WaveformPlayer/index.tsx:10, 82-136, 176-184` | `sound: any` / `setOnPlaybackStatusUpdate` / `getStatusAsync`（尺の取得を最大 10 回リトライ）/ `setPositionAsync(0)` | 波形の再生位置表示・シーク | 位置（`positionMillis`）と尺（`durationMillis`）の供給源が Sound オブジェクトに固定されている。**Sound を抽象化した「位置・尺・シーク」インターフェースに置き換えるのが移行の要** |
| 5 | `src/components/ui/modals/RecStartModal/index.tsx:4, 36, 50-71, 86-103, 114, 146` | `Audio.Sound.createAsync({shouldPlay:false, positionMillis:0})` / `getStatusAsync` / `playAsync` / `pauseAsync` / `setPositionAsync` / `stopAsync` / `unloadAsync` | 録音開始位置の選択画面での試聴（PR-03 / PR-04） | モーダル表示中だけ独立した Sound を作り、閉じるときに解放。停止位置を「現在位置」として選択肢に加える |
| 6 | `src/components/features/projectEdit/RecView/index.tsx:6, 31` | `import type { Audio }`（`Audio.Sound | null` の props 型） | 型のみ | 実行時依存なし。#4 のインターフェース化に合わせて型を差し替える |
| 7 | `src/hooks/useHeadphonesConnected.ts:84-90` | 遅延 `require('expo-av')` → `Audio.Sound.createAsync(silence.wav, {shouldPlay:true, volume:0})` → `unloadAsync` | **無音再生による iOS 音声セッションの活性化（TASK-66）** | セッションが一度もアクティブ化されていないと `react-native-device-info` の `isBluetoothHeadphonesConnected()` が false を返すため、起動後 1 回だけ無音を鳴らす。`setAudioModeAsync` は**呼ばない**（録音の playAndRecord と競合させないため）。失敗しても検知は続行 |
| 8 | `src/hooks/useRecordPlayer.ts:2, 27, 64` | `Audio.setIsEnabledAsync(false)`（`SyncedAudioPlayer` の `prepare`）/ `setIsEnabledAsync(true)`（アンマウント） | **録音再生画面にいる間 expo-av を止める**（TASK-121） | expo-av（AVPlayer）と audio-api（AVAudioEngine）が同時に音声セッションを操作すると iOS のオーディオサーバーがデッドロックする回避策。**expo-av を完全撤去すればこの呼び出し自体が不要になる** |
| 9 | `src/utils/recordingOptions.ts:1, 7, 21` | `Audio.RecordingOptions` 型 / `Audio.IOSOutputFormat.MPEG4AAC` | 録音オプション定数 | **m4a / AAC 44.1kHz ステレオ 256kbps**（iOS: `audioQuality` 127 = Max。Android: `outputFormat` 2 = MPEG_4・`audioEncoder` 3 = AAC）。iOS で AAC を明示しないと PCM-in-M4A になり Replicate の全モデルが読めない（TASK-42）。**移行後もこのフォーマット・パラメータを維持すること** |
| 10 | `.yarn/patches/expo-av-npm-16.0.8-3f40a40d18.patch`（`package.json:42` の `patch:` プロトコル） | `ios/EXAV/EXAV.m` の `setCategory` 部分 | **iOS の playAndRecord に `AllowBluetoothA2DP` + `DefaultToSpeaker` を付与**（既定の `AllowBluetooth`(HFP) を置き換え） | Bluetooth イヤホンへ **A2DP（高音質）で出力しつつ録音入力は本体マイク**、イヤホン非接続時は**受話口ではなくスピーカー**へ出力。HFP のままだと録音中のトラックが電話品質（8/16kHz モノラル）になる。expo-av 撤去で自動的に消えるため**同等の設定を新エンジン側で必ず入れる** |
| 11 | `app.json` | （expo-av の設定プラグインは未使用） | — | マイクの用途文字列は `expo-speech-recognition` プラグインの `microphonePermission` で供給されている。Android の `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` / `BLUETOOTH_CONNECT` は `android.permissions` に直書き。`react-native-audio-api` プラグインはオプションなし（既定値）で登録済み |

### 2.2 テスト・モック依存

| ファイル | 内容 |
|----------|------|
| `src/utils/recordingOptions.test.ts:1-8` | `expo-av/build/Audio/RecordingConstants` を実体で読み込んで AAC 指定を検証 |
| `src/components/features/record/RecRecordingSection/RecRecordingSection.test.tsx:18-24` | `Audio.Recording` / `Audio.Sound` / `setAudioModeAsync` / `requestPermissionsAsync` をモック（`RecordingConstants` は実体） |
| `src/screens/AudioPlayerScreen/AudioPlayerScreen.changeArtwork.test.tsx:44` | `Audio.Sound.createAsync` などをモック |
| `src/components/ui/modals/RecStartModal/RecStartModal.test.tsx:6` | 同上 |
| `src/components/features/projectEdit/WaveformPlayer/WaveformPlayer.test.tsx:12` | 同上 |
| `src/hooks/useHeadphonesConnected.test.ts:10-18` | 無音再生（TASK-66）の `Audio.Sound.createAsync` をモック |
| `__mocks__/react-native-audio-api.js` | 既存の audio-api モック（`AudioContext` / `AudioManager` / `GainNode` / `AudioBufferSourceNode` のみ。**`AudioRecorder` / `<Audio>` / `FileFormat` / `FilePreset` / `requestRecordingPermissions` は未定義**） |

`jest.setup.js` / `jest.config.js` に expo-av 固有の設定はない（各テストが `jest.mock('expo-av', …)` している）。

### 2.3 コメント上の言及のみ（コード依存なし）

`src/utils/recordAudioCache.ts:19`、`src/utils/syncedAudioPlayer.ts:11, 37, 369`、`src/utils/syncStartPosition.ts:11`、`src/hooks/useSyncedTrackPlayback.ts:41`。移行後に文言を更新する。

### 2.4 依存していない箇所（確認済み）

- 録音の再生・同時再生（`RecordPlayerScreen` / `useRecordPlayer` / `useSyncedTrackPlayback` / `syncedAudioPlayer.ts`）は TASK-121 で audio-api 化済み。expo-av 依存は #8 の `setIsEnabledAsync` だけ
- イヤホン検知そのもの（`react-native-device-info` のイベント + 3 秒ポーリング）は expo-av に依存しない（#7 は iOS の初回活性化のみ）

---

## 3. 候補ごとの機能対応表

候補 A: **expo-audio 1.1.1**（SDK 54 同梱版。`npm pack expo-audio@1.1.1` の `build/*.d.ts`・`ios/*.swift`・`android/**/*.kt`・`plugin/build/withAudio.js` を確認）
候補 B: **react-native-audio-api 0.13.4**（導入済み。`node_modules/react-native-audio-api/lib/typescript/**`・`ios/**`・`android/**`・`common/**`・`lib/commonjs/plugin/withAudioAPI.js` を確認）

凡例: ○ = 同等機能あり（根拠確認済み） / △ = 制約つき or 回避策が必要 / × = なし / **未確認** = 根拠を確認できなかった

### 3.1 録音

| 項目 | 現状（expo-av） | A: expo-audio 1.1.1 | B: react-native-audio-api 0.13.4 |
|------|-----------------|---------------------|----------------------------------|
| 実装基盤 | iOS `AVAudioRecorder` / Android `MediaRecorder` | ○ 同じ（`ios/AudioRecorder.swift`・`android/.../AudioRecorder.kt` は `MediaRecorder`） | △ iOS: 共有 `AVAudioEngine` の `inputNode` に `AVAudioSinkNode` を付けて PCM を受け取り、`AVAudioFile` 系のファイルライターで書き出す（`NativeAudioRecorder.m:99-120`・`AudioEngine.mm:174-231`）。Android: **Oboe 入力ストリーム**（Exclusive・LowLatency・Float、`AndroidAudioRecorder.cpp:66-80`）+ FFmpeg で AAC エンコード（`ffmpegBackend/utils.cpp:43-44`） |
| AAC / m4a 出力 | iOS `IOSOutputFormat.MPEG4AAC`・Android MPEG_4 + AAC | ○ `RecordingOptions.ios.outputFormat: IOSOutputFormat.MPEG4AAC`（値 `'aac '`）・`android: { outputFormat: 'mpeg4', audioEncoder: 'aac' }`。`RecordingPresets.HIGH_QUALITY` がこの組み合わせ（ただし 128kbps） | ○ `enableFileOutput({ format: FileFormat.M4A })` → iOS は `kAudioFormatMPEG4AAC`（`FileOptions.mm:21-22`）、Android は `AV_CODEC_ID_AAC` + MP4 muxer（FFmpeg 同梱が前提。`isFfmpegEnabled()`。本プロジェクトは m4a デコードのため FFmpeg 有効） |
| サンプルレート・ch・ビットレート | 44.1kHz / 2ch / 256kbps | ○ `sampleRate` / `numberOfChannels` / `bitRate` を直接指定（現行値をそのまま移せる） | △ `preset: FilePresetType`（`{ bitRate, sampleRate, bitDepth, iosQuality, flacCompressionLevel }` の**プレーンオブジェクト**）と `channelCount` で指定。組み込みは Low/Medium/High(48k/192k/24bit)/Lossless のみだが、型上は独自オブジェクトを渡せる。iOS は `AVSampleRateKey` / `AVEncoderBitRateKey`（AAC 時）に反映される（`FileOptions.mm:114-124`）。**Android の FFmpeg エンコーダが `bitRate` / `sampleRate` を反映するかは未確認**（Oboe ストリームはデバイスのネイティブレートで開く。`AndroidAudioRecorder.cpp:87-89`） |
| 保存先・URI | `getURI()`（キャッシュ配下） | ○ `recorder.uri`（`RecorderState.url`） | ○ `stop()` が `FileInfo { paths: string[], size(MB), duration(s) }` を返す。`directory: FileDirectory.Cache | Document` + `subDirectory` + `fileNamePrefix` |
| 録音中の経過時間の粒度 | `getStatusAsync().durationMillis`（非同期・ms） | ○ `recorder.currentTime`（秒・**同期プロパティ**）と `getStatus().durationMillis`（同期）。`useAudioRecorderState` は既定 500ms ポーリング | ○ `getCurrentDuration()`（秒・同期）。iOS は **ファイルに書き込んだフレーム数 ÷ sampleRate**（`IOSFileWriter.mm:341-345`）で、エンコーダの遅延ぶんは含まない。`onAudioReady` コールバックの `when`（秒）でバッファ単位のタイムスタンプも取れる |
| 開始タイミングの制御 | なし（`startAsync` の完了を待つ） | △ iOS のみ `record({ atTime })`（`AVAudioRecorder.record(atTime:)`） | ○ 録音と再生が**同じ AudioContext 時計**上にある（後述 3.7）。`ctx.currentTime` を基準に `start(when)` でトラックを予約し、録音開始時刻も同じ時計で記録できる |
| マイク許可 | `Audio.requestPermissionsAsync()` | ○ `requestRecordingPermissionsAsync()` / `getRecordingPermissionsAsync()` | ○ `AudioManager.requestRecordingPermissions()` / `checkRecordingPermissions()`（`'Undetermined' | 'Denied' | 'Granted'`） |
| 入力デバイス選択 | なし | ○ `getAvailableInputs()` / `setInput()` | ○ `AudioManager.getDevicesInfo()` / `setInputDevice()` / `useAudioInput()`（iOS のみと明記） |
| Android の入力プリセット / AGC | `MediaRecorder.AudioSource.MIC` | ○ `android.audioSource`（`mic` / `unprocessed` / `voice_performance` など） | **未確認**（Oboe の `InputPreset` を明示していない。`AndroidAudioRecorder.cpp:66-80` に `setInputPreset` なし。既定プリセットの音質・AGC の有無は実機で要確認） |

### 3.2 再生

| 項目 | 現状（expo-av） | A: expo-audio 1.1.1 | B: react-native-audio-api 0.13.4 |
|------|-----------------|---------------------|----------------------------------|
| 実装基盤 | iOS `AVPlayer` / Android `ExoPlayer` | ○ 同じ（`ios/AudioPlayer.swift`・Android は Media3 `ExoPlayer`。`AudioPlayer.kt:14, 44`） | △ 2 系統: (1) `<Audio>` コンポーネント / `AudioFileSourceNode`（**HTTP Range ストリーミング**または `forceDownload`。`Audio/types.d.ts`）。(2) `decodeAudioData` → `AudioBufferSourceNode`（全体を PCM 展開。`SyncedAudioPlayer` で使用中） |
| ストリーミング（Presigned URL） | ○ | ○ `useAudioPlayer({ uri })`。`downloadFirst: true` で先読み | ○ (1) の `<Audio source={{ uri, headers }}>`。`onWaiting` / `onPlaying` でバッファリングを検知 |
| ローカルファイル | ○ | ○ | ○ |
| シーク | `setPositionAsync(ms)` | ○ `seekTo(seconds, toleranceBefore?, toleranceAfter?)`（Promise） | ○ (1) `seekToTime(seconds)`、(2) ノード再作成 + `start(when, offset)`（現行の `SyncedAudioPlayer` と同じ） |
| 音量 / ループ / 速度 | `setVolumeAsync` / `setIsLoopingAsync` / `setRateAsync` | ○ `volume` / `loop` / `setPlaybackRate(rate, pitchQuality)` プロパティ | ○ (1) `setVolume` / `loop` prop / `setPlaybackRate` / `preservesPitch`、(2) `GainNode` / `loop` / `playbackRate` |
| 位置・尺・終了の通知 | `setOnPlaybackStatusUpdate`（既定 500ms） | ○ `useAudioPlayerStatus` / `addListener('playbackStatusUpdate')`（`updateInterval` で 100ms などに変更可）。`AudioStatus` に `currentTime` / `duration` / `didJustFinish` / `isBuffering` | ○ (1) `onPositionChange` / `onEnded` / `getCurrentTime()` / `getDuration()`、(2) `onPositionChanged` + コンテキスト時計 |
| Android のシーク挙動 | ExoPlayer（TASK-120 で判明したシーク後の停止・楽観的な位置報告） | △ **同じ ExoPlayer**。同時再生では不採用になった理由がそのまま残る（トラック単体再生の AP / PE では実用上問題なし） | ○ Oboe 出力。同時再生で実績あり |

### 3.3 iOS オーディオセッション

| 項目 | 現状（expo-av + パッチ） | A: expo-audio 1.1.1 | B: react-native-audio-api 0.13.4 |
|------|--------------------------|---------------------|----------------------------------|
| カテゴリ | `allowsRecordingIOS` で `playAndRecord` / `playback` を切替 | ○ `setAudioModeAsync({ allowsRecording })` → `.playAndRecord` / `.playback`（`AudioModule.swift:552`）。**録音側の `prepare` も自前で `.playAndRecord` + `setActive(true)` を実行**（`AudioRecorder.swift:75-76`） | ○ `AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord' | 'playback' | 'record' | … })`。**既定は `playback`**（`AudioSessionManager.mm:37`）。録音開始時にカテゴリは自動変更されない（`IOSAudioRecorder.mm:296-330`）ため、**録音前に明示的に `playAndRecord` へ切り替える必要がある** |
| `allowBluetoothA2DP` | **パッチで付与** | × `AudioMode` に該当オプションなし。`playAndRecord` 時は `allowBluetoothHFP`（Xcode 26）/ `allowBluetooth` を**固定で付与**（`AudioModule.swift:565-569`）。A2DP にするには **expo-audio 側にも Swift パッチが必要** | ○ `iosOptions: ['allowBluetoothA2DP']`（`AudioSessionManager.mm:510`）。**パッチ不要** |
| `defaultToSpeaker` | **パッチで付与** | × 同上（設定手段なし。Android の `shouldRouteThroughEarpiece` は別物） | ○ `iosOptions: ['defaultToSpeaker']`（`AudioSessionManager.mm:528`） |
| `mixWithOthers` / `duckOthers` | `interruptionModeIOS`（現状は既定値） | ○ `interruptionMode: 'mixWithOthers' | 'doNotMix' | 'duckOthers'`（iOS / Android 共通） | ○ `iosOptions: ['mixWithOthers' | 'duckOthers' | 'interruptSpokenAudioAndMixWithOthers']` |
| モード | 既定 | △ `.default` 固定（`AudioModule.swift:578`） | ○ `iosMode: 'default' | 'measurement' | 'voiceChat' | …` |
| サイレントスイッチ | `playsInSilentModeIOS: true` | ○ `playsInSilentMode`（false だと `ambient` 系になる） | ○ `playback` / `playAndRecord` カテゴリはサイレントスイッチの影響を受けない（AVAudioSession の仕様） |
| セッションの活性化 / 停止 | 内部で自動 | ○ 内部で自動 + `setIsAudioActiveAsync(bool)`（全プレイヤー停止・セッション解放） | ○ `setAudioSessionActivity(bool)`（Promise・失敗時 `SessionActivationError`）+ `disableSessionManagement()`（他ライブラリに管理を委ねるモード） |
| 他ライブラリとの共存 | `setIsEnabledAsync(false)` で回避（#8） | **未確認**（`setIsAudioActiveAsync(false)` が expo-av の `setIsEnabledAsync(false)` と同等に AVPlayer を止めてセッションから手を引くかは未検証） | ○ expo-av を撤去すれば共存問題そのものが消える |
| iOS 26 の注意 | — | — | `playback` + `allowBluetoothA2DP` は setCategory が失敗する（`CLAUDE.md`・TASK-121）。`playAndRecord` + A2DP の組み合わせは AVAudioSession 仕様上有効だが **iOS 26 実機での動作は未確認（PoC ゲート）**。`bluetoothHighQualityRecording`（iOS 26+・EU 非対応）というオプションも用意されている |

### 3.4 Android のオーディオフォーカス / 割り込み

| 項目 | 現状（expo-av） | A: expo-audio 1.1.1 | B: react-native-audio-api 0.13.4 |
|------|-----------------|---------------------|----------------------------------|
| 録音中: 専有 | `InterruptionModeAndroid.DoNotMix` + `shouldDuckAndroid: false` | ○ `interruptionMode: 'doNotMix'`（`AudioFocusRequest` を使用。`AudioModule.kt:8`。**フォーカス種別への具体的な対応は未確認**） | ○ `AudioManager.observeAudioInterruptions('gain')` → `AUDIOFOCUS_GAIN`（`AudioAPIModule.kt:144-148`・`AudioFocusListener.kt:57-67`） |
| 再生中: 他アプリをダッキング | `DuckOthers` + `shouldDuckAndroid: true` | ○ `'duckOthers'` | ○ `observeAudioInterruptions('gainTransientMayDuck')` → `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` |
| 電話などの割り込み通知 | ステータスコールバック経由 | **未確認**（プレイヤーの自動一時停止・再開の有無） | ○ `addSystemEventListener('interruption', { type: 'began' | 'ended', shouldResume })` / `'duck'` / `'routeChange'`（`events/types.d.ts`）。`useRecordPlayer` で実装済み |
| フォーカス解放 | 内部 | 内部 | `observeAudioInterruptions(false)` → `abandonAudioFocus()`（`AudioAPIModule.kt:140`） |

### 3.5 バックグラウンド継続（TASK-111 / TASK-112 との関係）

| 項目 | 現状 | A: expo-audio 1.1.1 | B: react-native-audio-api 0.13.4 |
|------|------|---------------------|----------------------------------|
| iOS `UIBackgroundModes: audio` | **audio-api プラグインが既定で追加済み**（`withAudioAPI.js` の `iosBackgroundMode: true` 既定 → Info.plist に `audio`）。expo-av の `staysActiveInBackground` は `false` 指定 | ○ プラグイン `enableBackgroundRecording: true` でも追加。`AudioMode.shouldPlayInBackground` / `allowsBackgroundRecording`（1.1.0 で「Add support background recording」） | ○ 既に有効。セッションを `playAndRecord` のまま維持すればバックグラウンド録音は OS 的に許可される（**実機での継続動作は未確認 → TASK-111 で検証**） |
| Android フォアグラウンドサービス（14+ は種別必須） | なし | ○ パッケージの `AndroidManifest.xml` に `AudioRecordingService`（`foregroundServiceType="microphone"`）と `AudioControlsService`（`mediaPlayback`）を宣言済み。プラグイン `enableBackgroundRecording` で `FOREGROUND_SERVICE_MICROPHONE` + `POST_NOTIFICATIONS` を追加。1.1.0 で「Use correct method to start foreground service on android 14+」 | △ プラグインの `androidForegroundService: true`（既定）で `CentralizedForegroundService` を登録し、`androidFSTypes` の配列を `|` 連結して `android:foregroundServiceType` に書く（`withAudioAPI.js`）。既定は `['mediaPlayback']`。**`['mediaPlayback', 'microphone']` を渡せば microphone 型を足せる**（プラグイン実装上は可能）。ただし `androidPermissions` 既定は `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` のみなので **`FOREGROUND_SERVICE_MICROPHONE` を明示的に追加する必要がある**。**録音開始時にライブラリがそのサービスを microphone 型で起動するか（`ForegroundServiceManager.kt` の起動条件）は未確認** → TASK-112 の PoC 項目 |

### 3.6 イヤホン検知（`useHeadphonesConnected`）への影響

| 項目 | 現状 | A | B |
|------|------|---|---|
| iOS のセッション活性化（TASK-66） | expo-av で無音 0.1 秒を再生 | △ 無音再生は `useAudioPlayer(require(silence.wav))` で再現可能。**プレイヤーなしで活性化する API は未確認**（`setIsAudioActiveAsync(true)` が `setActive(true)` を呼ぶかは未検証） | ○ `AudioManager.setAudioSessionActivity(true)` で**無音再生なしに活性化**できる（`AudioSessionManager.mm:180-197` で `configureAudioSession` → `setActive:true`）。さらに `getDevicesInfo().currentOutputs` や `'routeChange'` イベントで iOS の出力経路変化を直接取れるため、3 秒ポーリングを減らせる余地がある（**`category` 文字列で有線 / Bluetooth を判別できるかは未確認**。当面は device-info を維持） |
| Android | `react-native-device-info` + `BLUETOOTH_CONNECT` | 影響なし | 影響なし |

### 3.7 「録音 + 同時にトラック再生」の時計（開始位置実測の精度）

| 観点 | 現状 | A | B |
|------|------|---|---|
| 録音と再生の時計 | 別々（`AVAudioRecorder` と `AVPlayer` / `MediaRecorder` と `ExoPlayer`）。両者を 100ms 間隔で非同期に取って差分を求める | 同じ構造（`recorder.currentTime` と `player.currentTime` が**同期プロパティ**になるぶん同時刻性は改善するが、時計は別のまま。Android の ExoPlayer の先走り報告（TASK-121 の 0.8 秒待ち）も残る） | **同一 AVAudioEngine / AudioContext**。録音は engine の `inputNode` から、トラックは同じ engine の出力へ流れる。トラックは `start(when)` で `ctx.currentTime` 基準に予約でき、録音側は `getCurrentDuration()`（書き込み済みフレーム）や `onAudioReady` の `when` で同じ時計に対応づけられる → **ポーリングと OS 別ヒューリスティックを設計上なくせる**（精度は PoC で相互相関により確認） |

### 3.8 Jest

| | A | B |
|---|---|---|
| モック | `jest-expo` に expo-audio の自動モックがあるかは**未確認**。無ければ `__mocks__/expo-audio.js`（`useAudioPlayer` / `useAudioRecorder` / `setAudioModeAsync` / `RecordingPresets` / `IOSOutputFormat`）を新設 | 既存の `__mocks__/react-native-audio-api.js` を拡張（`AudioRecorder` / `FileFormat` / `FilePreset` / `FileDirectory` / `AudioManager.requestRecordingPermissions` / `setAudioSessionActivity` / `getDevicesInfo` / `<Audio>` または `AudioFileSourceNode`） |
| 既存テストの書き換え | 2.2 の 6 ファイルすべて | 同左 |

### 3.9 その他

| 項目 | A | B |
|------|---|---|
| 追加のネイティブ依存 | expo-audio（Media3 / ExoPlayer を再度同梱） | なし（導入済み） |
| ピア依存 | `expo` / `expo-asset` | `react-native-worklets >= 0.7.0`（optional・`package.json`）。プロジェクトは 0.5.1 で、ビルド時の版判定により worklet 系ノードだけ無効化されている（`CLAUDE.md`）。SDK 55 は worklets 0.7.4 を同梱するため更新で自然に満たす |
| Expo Go | 両者ともネイティブモジュール（開発ビルド前提。現状と同じ） | 同左 |
| iOS 26.5 シミュレーター | AVPlayer 系のため影響なし | **AVAudioEngine の起動が abort する既知事象**（`CLAUDE.md`）。移行範囲が AP / PE / PR まで広がると**シミュレーター E2E（PE / CU / AP / PR / QR）が全滅する恐れ** → 第 6 章 |

---

## 4. 推奨案と理由

### 4.1 推奨: 候補 B — react-native-audio-api へ一本化し expo-av を完全撤去する（expo-audio は導入しない）

理由（重要度順）:

1. **音声セッションの管理者を 1 つにできる**。TASK-121 で判明した「expo-av（AVPlayer）と audio-api（AVAudioEngine）が同時にセッションを操作すると iOS のオーディオサーバーがデッドロックする」問題は、2 エンジン構成そのものが原因。候補 A は AVPlayer / ExoPlayer を再び持ち込むため、`setIsEnabledAsync(false)` 相当の回避（`setIsAudioActiveAsync(false)`・効果は未確認）を維持し続けることになる
2. **iOS のパッチが不要になる**。現行パッチが付与している `allowBluetoothA2DP` と `defaultToSpeaker` は audio-api の `iosOptions` で**そのまま指定できる**。候補 A は両オプションを設定する手段がなく（`AudioModule.swift:565-569` で HFP 固定）、Swift のパッチを新たに書いて保守する必要がある
3. **録音開始位置の実測を「同一時計上の予約」に置き換えられる**。録音とトラック再生が同じ AVAudioEngine / AudioContext に載るため、TASK-89 / TASK-121 の 100ms ポーリング・10 秒上限・Android 0.8 秒待ちといった OS 別ヒューリスティックを設計上なくせる余地がある（精度は PoC で確認。少なくとも現状の −12ms（有線）/ −72ms（スピーカー）を下回らないことをゲートにする）
4. **追加のネイティブ依存がない**。runtimeVersion の bump と再ビルドは expo-av 撤去だけでも必要になるが、アプリサイズは増えず、Media3 / ExoPlayer を再同梱しない
5. **Android 14+ の microphone 型フォアグラウンドサービスが設定プラグインの `androidFSTypes` で足せる**（TASK-112 と方向が揃う）

候補 A（expo-audio）を採らない理由: 公式サポートと AVPlayer / ExoPlayer 由来の低い移植リスク（AP / PE のトラック再生はほぼ 1:1 で移せる）は魅力だが、上記 1・2 のコストが恒久的に残る。Android のトラック再生を ExoPlayer に戻すことにもなる（同時再生では不採用になった実装）。

### 4.2 候補 A を選ぶべきケース（フォールバック条件）

以下のいずれかが PoC（第 5 章フェーズ 0）で満たせない場合は、**録音 + トラック再生を含めて候補 A へ切り替える**（部分的なハイブリッドは 2 エンジン問題が残るため採らない）:

- audio-api の `AudioRecorder` で **m4a / AAC 44.1kHz 2ch 256kbps** 相当のファイルが両 OS で作れない、または Replicate（demucs）/ `audio-align.ts` の位置合わせ（TASK-44）が壊れる
- `playAndRecord` + `allowBluetoothA2DP` + `defaultToSpeaker` が iOS 17 / 18 / 26 の実機で有効にならない
- 開始位置の精度（相互相関）が現状を下回る
- `<Audio>`（ストリーミング）の実機挙動（出だし・シーク・メモリ）が AP / PE の要件を満たさない

### 4.3 パッチの扱い

- `.yarn/patches/expo-av-npm-16.0.8-3f40a40d18.patch` は expo-av と一緒に削除する（`package.json` の `patch:` 参照も削除）
- 同等設定は **`src/utils/audioSession.ts`（新設）に集約**する: `configureRecordingSession()` = `{ iosCategory: 'playAndRecord', iosMode: 'default', iosOptions: ['allowBluetoothA2DP', 'defaultToSpeaker'] }` + Android `observeAudioInterruptions('gain')`、`configurePlaybackSession()` = `{ iosCategory: 'playback', iosMode: 'default', iosOptions: [] }`（iOS 26 で A2DP を付けない・`useRecordPlayer` と同じ）+ Android `observeAudioInterruptions('gainTransientMayDuck')`。各画面が個別に `setAudioModeAsync` を呼ぶ現状の分散をやめる

---

## 5. 段階的な移行手順

前提: SDK 54 のまま実施する。各フェーズは feature ブランチ → dev（実機確認）→ develop の通常フローに載せるが、**フェーズ 1〜3 は同じ runtimeVersion（1.2.0）で 1 回の TestFlight / Play ビルドにまとめてもよい**（expo-av を消すのはフェーズ 3 で、フェーズ 1・2 の段階では expo-av も残っているため既存ビルドで OTA 確認できる）。

### フェーズ 0: PoC（マージしない検証ブランチ）

対象: `scripts/` または一時画面での検証コード。実機 iPhone（iOS 17 / 18 / 26 のうち手元にあるもの）+ Android 実機。

ゲート項目（すべて満たしたらフェーズ 1 へ。満たせなければ 4.2 のフォールバック判断）:

| # | ゲート | 確認方法 |
|---|--------|----------|
| G0-1 | `AudioRecorder` + `FileFormat.M4A` + 独自 preset（44.1k / 256k / 2ch）で両 OS とも AAC の m4a が出る | 生成ファイルを `ffprobe` で確認（codec = aac, sample_rate 44100, channels 2, bit_rate ≈ 256k）。**Android で bitRate / sampleRate が反映されない場合は、その値で許容できるか（Replicate・ファイルサイズ）を判断** |
| G0-2 | 新ファイルが既存パイプラインを通る | dev の `POST /data/record` → AI クリーンアップ（separate / denoise）→ `audio-align.ts` の位置合わせ → 声のみ再生。`sync-offset-debug` の `offset` が ±39ms 以内（SY-05 相当） |
| G0-3 | iOS セッション: `playAndRecord` + `allowBluetoothA2DP` + `defaultToSpeaker` | Bluetooth イヤホン接続で録音中のトラックが A2DP 品質で鳴る（HFP の電話品質にならない）・録音入力は本体マイク・イヤホン非接続時はスピーカーから出る。iOS 26 実機で `setCategory` が失敗しない |
| G0-4 | 開始位置の精度 | 有線 / スピーカー / Bluetooth で「はじめから」「CUE 位置から」録音し、S3 のテイクとトラックを相互相関（`CLAUDE.md`「トラブルシューティング」の手順）。**有線 ±15ms・スピーカー ±40ms 以内**（現状 −12 / −72ms を下回らない）。Android は 0.8 秒待ちなしで達成できるか |
| G0-5 | `<Audio>` / `AudioFileSourceNode` による Presigned URL のストリーミング再生 | 出だしの引っかかり・シーク・ループ・音量・`onEnded`。3 分の曲でのメモリ（Xcode / Android Studio のプロファイラ） |
| G0-6 | iOS シミュレーターでの動作 | iOS 26.x と、可能なら iOS 18.x ランタイムで `<Audio>` 再生と `AudioRecorder` が abort しないか。**abort する場合は E2E の実行環境（Android エミュレーター / 旧ランタイム）を決める** |
| G0-7 | Android 14+ の microphone 型 FGS | `androidFSTypes: ['mediaPlayback', 'microphone']` + `FOREGROUND_SERVICE_MICROPHONE` でビルドが通り、録音中にバックグラウンドへ回しても録音が継続するか（TASK-112 の一次判定。継続しなくても移行自体のブロッカーにはしない） |
| G0-8 | Jest | `__mocks__/react-native-audio-api.js` に `AudioRecorder` などを足した状態で既存テストが通る |

### フェーズ 1: トラック再生画面を audio-api へ（expo-av はまだ残す）

対象ファイル:
- `src/screens/AudioPlayerScreen/index.tsx`
- `src/screens/ProjectEditScreen/index.tsx`
- `src/components/features/projectEdit/WaveformPlayer/index.tsx`（`sound: any` → 位置・尺・シーク・終了通知を持つ **`TrackPlayerHandle` 型**へ）
- `src/components/features/projectEdit/RecView/index.tsx`（props 型）
- `src/components/ui/modals/RecStartModal/index.tsx`
- 新設: `src/hooks/useTrackPlayer.ts`（`<Audio>` / `AudioFileSourceNode` をラップし `{ positionMs, durationMs, isPlaying, isBuffering, play, pause, seekTo, setVolume, setLoop, onEnded }` を返す）・`src/utils/audioSession.ts`
- テスト: `AudioPlayerScreen.changeArtwork.test.tsx` / `RecStartModal.test.tsx` / `WaveformPlayer.test.tsx` を audio-api モックへ

注意: この段階では `RecRecordingSection` が expo-av のまま `playAndRecord` へ切り替えるため、**`audioSession.ts` の設定と expo-av の `setAudioModeAsync` が同一画面で交差する**。ProjectEdit の REC モードでは録音モーダルを開く前にトラックを停止・解放し、閉じた後に `configurePlaybackSession()` を呼び直す（`useRecordPlayer` の `setIsEnabledAsync` パターンを逆向きに適用）。交差が解決できない場合はフェーズ 1 と 2 を同じ PR にまとめる。

検証（`docs/test-cases.md`）: **AP-01〜03**（再生・曲送り・リピート）、**PE-05〜07**（波形シーク・再生 / 一時停止・音量）、**CU-01〜06**（CUE 登録 / ジャンプ / リピート）、**PR-03 / PR-04**（開始位置選択の試聴）、**SY-27**（再生画面と他画面の行き来）。E2E: `.maestro/flows/08-project-edit` / `09-cue` / `20-audio-player` 相当の既存フロー。

### フェーズ 2: 録音を audio-api へ

対象ファイル:
- `src/components/features/record/RecRecordingSection/index.tsx`（`AudioRecorder` + 同一 AudioContext 上のトラック再生）
- `src/utils/recordingOptions.ts`（`RECORDING_OPTIONS_HIGH_QUALITY` → audio-api の `AudioRecorderFileOptions`（`format: FileFormat.M4A`・独自 preset・`channelCount: 2`）に置き換え。**「iOS は AAC 必須」のコメントと意図を引き継ぐ**）
- `src/utils/recordingOptions.test.ts` / `RecRecordingSection.test.tsx`
- `useRecordPlayer` はまだ `setIsEnabledAsync` を残す（expo-av が `useHeadphonesConnected` に残っているため）

設計の要点:
1. 許可: `AudioManager.requestRecordingPermissions()`。`'Denied'` なら現行どおり `REC_PERMISSION_MESSAGES.micPermissionDenied` + `onAbort`
2. セッション: `configureRecordingSession()`（playAndRecord + A2DP + defaultToSpeaker / Android `gain`）。アンマウント・失敗時に `configurePlaybackSession()` へ戻す（現行 95-100 行の責務）
3. 起動順序: トラックを `start(when = ctx.currentTime + 先行)` で予約 → `recorder.start()` → 実測は **予約時刻と録音開始時刻の差**から算出（`startPositionMs = 選択位置 − (トラック予約時刻 − 録音開始時刻) × 1000`。負値を保持）。`getCurrentDuration()` と `ctx.currentTime` の突き合わせで妥当性を検証し、`__DEV__` の `[rec-start-measure]` ログは残す
4. `AppState` の `active` 待ちリトライ（`SessionActivationError` を含む）と「起動シーケンス中の停止・アンマウントでマイクを掴んだままにしない」ガードは現行ロジックを移植する
5. `stop()` の `FileInfo.paths[0]` を `onStop(durationMs, uri, measuredStartPositionMs)` に渡す（`file://` 接頭辞の有無を確認。`AndroidAudioRecorder.cpp` のコメントにパス表記の揺れの記述あり）
6. トラックは `decodeAudioData`（全体 PCM）ではなく、可能なら `<Audio context={ctx}>` / `AudioFileSourceNode` でコンテキストを共有する。**`AudioFileSourceNode` が `start(when)` 相当の予約に対応するかは未確認**（`play()` のみ確認）。非対応なら decode 方式（`recordAudioCache` と同じローカルキャッシュ + `AudioBufferSourceNode`）で、メモリ上限を PoC で確認する

検証: **PR-01〜09**（特に PR-05 イヤホン・PR-08 マイク許可なし）、**QR-01**（カウントダウンなし即録音）、**RP-01 / RP-04**、**AI-03 / AI-12**（新エンコードのファイルで separate / denoise が通る）、**SY-05 / SY-07 / SY-08 / SY-11〜14**（Bluetooth 補正・はじめから・Android・CUE 位置のテイクの開始位置）、**SH**（共有ファイルが m4a として開ける）。相互相関で G0-4 と同じ基準を再確認。E2E: `.maestro/flows/13-sync-playback/SY-05-separated-timing.yaml` と録音系フロー。

### フェーズ 3: expo-av の撤去

対象ファイル:
- `src/hooks/useHeadphonesConnected.ts`（無音再生 → `AudioManager.setAudioSessionActivity(true)`。失敗しても検知続行・起動中 1 回のみのキャッシュは維持）と `useHeadphonesConnected.test.ts`
- `src/hooks/useRecordPlayer.ts`（`Audio.setIsEnabledAsync` と `prepare` オプションを削除。`SyncedAudioPlayer` の `prepare` は互換のため残しても可）
- `package.json`（`expo-av` と `patch:` 参照の削除）・`.yarn/patches/expo-av-npm-16.0.8-3f40a40d18.patch` の削除・`yarn install`（`yarn.lock` 更新。**パッケージ削除は本タスクの実装フェーズで行う。計画段階では触らない**）
- `app.json`: `runtimeVersion` を `1.2.0` へ。`react-native-audio-api` プラグインにオプションを付ける場合（`iosMicrophonePermission` / `androidFSTypes` / `androidPermissions`）はここで
- `__mocks__/react-native-audio-api.js` の整理、2.3 のコメント更新、`CLAUDE.md`（「クライアント側の再生」節の `setIsEnabledAsync` の記述・AAC 必須の記述の参照先・runtimeVersion の例）
- `docs/test-cases.md`: 期待結果の文言に expo-av 固有の挙動があれば更新

検証: **SY-01 / SY-21 / SY-22**（イヤホン検知・出力切替）、**PR-05**（HeadphoneIndicator の初回表示）、**SY-29**（割り込み）、**CM**（バックグラウンド復帰）。`yarn test:ci` / `yarn lint --max-warnings=0`。開発ビルドを `yarn ios` / `yarn android` で再作成して確認。

### フェーズ 4: ビルド配布と全件回帰

- `/testflight` / `/playstore` で runtimeVersion 1.2.0 のビルドを配布し、**AI-01〜16 / SY-01〜29 を両 OS で全件**（TASK-121 と同じ基準）+ PR / QR / RP / AP / PE / CU
- 完了後に別タスクとして SDK 55+ への更新を起票する（expo-audio は入れないので `npx expo install --fix` で expo-av が引っかからないことを確認）

---

## 6. リスクと未解決事項

| # | リスク / 未解決 | 影響 | 対応方針 |
|---|-----------------|------|----------|
| R1 | **iOS 26.5 シミュレーターの AVAudioEngine 起動失敗**（`CLAUDE.md`）が AP / PE / PR / QR の全画面に広がる | シミュレーター前提の E2E（Maestro）が大量に失敗する | G0-6 で確認。回避策候補: (a) iOS 18 系ランタイムの iPhone シミュレーターで E2E を回す（`docs/e2e-develop-run-notes` の 42F14F05 は iOS 26）、(b) 音声を伴うフローは Android エミュレーターで回す、(c) Apple 側の修正を待つ。いずれも**未確認** |
| R2 | audio-api の録音ファイルの品質・互換（Android の FFmpeg AAC の bitRate / sampleRate 反映、iOS `AVAudioFile` 書き出しの AAC priming） | Replicate の分離結果・`audio-align.ts` の位置合わせ・ファイルサイズが変わる | G0-1 / G0-2。priming 量は `audio-align.ts` が「出力長 − 元の長さ」で吸収する設計なので原理上は影響しないが実測で確認 |
| R3 | 開始位置の精度が現状を下回る（Oboe 入力の起動遅延、`getCurrentDuration()` がエンコーダ遅延を含まない等） | SY-05 / 07 / 11〜14 の劣化。**保存されたテイクは後から補正できない** | G0-4。予約時刻方式で達成できない場合は現行のポーリング方式を audio-api の同期 API で再実装する |
| R4 | メモリ: `decodeAudioData` 方式は 3 分ステレオ 44.1kHz float で 1 本 60MB 前後。同時再生（2 本）で 100MB 前後の実績あり。録音中にもトラックを PCM 展開すると録音バッファと合わせて増える | 低メモリ端末での強制終了 | トラック再生は `<Audio>`（ストリーミング）を第一候補にする。録音時のみ decode を許容 |
| R5 | **TASK-90（Bluetooth 出力遅延の実測保存）**: audio-api の `AudioManager` / `getDevicesInfo` の型に出力遅延（`AVAudioSession.outputLatency`）を返す API は**見当たらない（未確認）** | `BLUETOOTH_RECORDING_LATENCY_MS = 220` の代表値方式が続く | 本移行では `getEffectiveStartPositionMs` を維持。TASK-90 は別途ネイティブ（Expo Modules）で実装する前提を変えない |
| R6 | **TASK-111（iOS バックグラウンド録音継続）**: `UIBackgroundModes: audio` は audio-api プラグインの既定で既に付いている。セッションを `playAndRecord` で維持したままバックグラウンドへ回したときに録音・トラック再生が続くかは**未確認** | — | 移行後に TASK-111 で実機確認。expo-audio の `allowsBackgroundRecording` のような専用フラグは audio-api にないため、OS の挙動に依存する |
| R7 | **TASK-112（Android 14 マイク制限）**: `androidFSTypes` に `microphone` を足せることはプラグイン実装で確認したが、**録音開始時にライブラリがフォアグラウンドサービスを microphone 型で起動するかは未確認**（`ForegroundServiceManager.kt`） | バックグラウンド録音が Android 14+ で停止する | G0-7。ライブラリが起動しない場合は自前のフォアグラウンドサービス（Expo Modules / `expo-foreground-service` 系）を検討 |
| R8 | audio-api の `AudioRecorder` は比較的新しい API（ソース内に「alpha version mistakes」の言及・ファイルパス表記の揺れの注記） | 端末差の不具合 | PoC を複数端末で行う。`onError` コールバックを必ず購読しユーザーに通知する |
| R9 | worklets ピア要件 `>= 0.7.0`（`package.json`）に対しプロジェクトは 0.5.1 | 現状ビルド時の版判定で worklet 系ノードのみ無効化されており録音・再生には影響しない（`CLAUDE.md`）。SDK 55 で 0.7.4 に上がる | 移行では触らない |
| R10 | Android の Oboe 入力プリセット / AGC / ノイズ抑制の既定が `MediaRecorder.AudioSource.MIC` と異なる可能性（**未確認**） | 録音の音質・音量感が変わる | G0-1 で A/B 試聴。必要ならライブラリへの `InputPreset` 露出を要望 |
| R11 | expo-audio を将来使わない判断により、Expo 公式のロックスクリーン操作・通知連携（expo-audio 1.1.0 で追加）は使えない | 現状要件になし | audio-api にも通知システムがあり（README「Playback and recording notification system」）、必要時に検討 |
| R12 | `useHeadphonesConnected` の `setAudioSessionActivity(true)` は `configureAudioSession`（既定 `playback`）を伴う。起動直後の画面によっては録音セッションと順序が交差する | イヤホン検知の初回値が取れない / セッションカテゴリの取り合い | `audioSession.ts` で「現在の望ましいカテゴリ」を一元管理し、活性化はその設定で行う |

---

## 7. 見積もり（規模感）

| フェーズ | 内容 | 規模 | 備考 |
|----------|------|------|------|
| 0 | PoC（G0-1〜G0-8） | **3〜5 人日** | 実機（iOS 複数バージョン + Android）と相互相関の計測が律速。ここで候補 A へのフォールバック判断 |
| 1 | トラック再生 4 画面 + `useTrackPlayer` + `audioSession.ts` + テスト書き換え | **3〜4 人日** | AP / PE / CU / PR-03,04 の手動確認と既存 E2E |
| 2 | 録音（`RecRecordingSection` / `recordingOptions`）+ 開始位置の新方式 + テスト | **5〜8 人日** | 最大のリスク。相互相関による再検証・AI-03 / AI-12 の Replicate 実行費（数円 × 数十回） |
| 3 | expo-av / パッチ撤去・`useHeadphonesConnected`・`useRecordPlayer`・runtimeVersion・ドキュメント | **1〜2 人日** | `yarn install` と開発ビルド再作成を含む |
| 4 | TestFlight / Play 配布・両 OS 全件回帰（AI / SY 45 件 + PR / QR / RP / AP / PE / CU） | **2〜3 人日** | TASK-121 の実績ベース |
| 合計 | | **約 14〜22 人日（実働 3〜4 週間）** | 端末調達・テスター待ちで暦日はさらに延びる。SDK 55+ 更新は含まない |

候補 A（expo-audio）を採った場合の目安: フェーズ 1 は同程度、フェーズ 2 は 3〜5 人日に縮むが、A2DP / defaultToSpeaker の Swift パッチ作成・保守（1〜2 人日）と 2 エンジン共存の検証（`setIsAudioActiveAsync` の効果確認）が加わり、合計はほぼ同じ。恒久的な保守コスト（パッチ・2 エンジン）が残る点で不利。

---

## 付録: 根拠として確認したファイル

- 本リポジトリ: 第 2 章の各ファイル、`app.json`、`package.json`、`jest.config.js`、`jest.setup.js`、`__mocks__/react-native-audio-api.js`、`docs/test-cases.md`、`CLAUDE.md`
- react-native-audio-api 0.13.4（`node_modules/react-native-audio-api/`）: `lib/typescript/core/AudioRecorder.d.ts`、`lib/typescript/types.d.ts`（`FileFormat` / `FilePresetType` / `AudioRecorderFileOptions` / `FileInfo`）、`lib/commonjs/utils/filePresets.js`、`lib/typescript/system/AudioManager.d.ts`、`lib/typescript/system/types.d.ts`（`IOSCategory` / `IOSOption` / `AudioFocusType`）、`lib/typescript/events/types.d.ts`、`lib/typescript/Audio/types.d.ts`、`lib/typescript/Audio/AudioFileSourceNode.d.ts`、`lib/typescript/hooks/useAudioInput.d.ts`、`lib/commonjs/plugin/withAudioAPI.js`、`ios/audioapi/ios/system/AudioSessionManager.mm`、`ios/audioapi/ios/system/AudioEngine.mm`、`ios/audioapi/ios/core/IOSAudioRecorder.mm`、`ios/audioapi/ios/core/NativeAudioRecorder.m`、`ios/audioapi/ios/core/utils/FileOptions.mm`、`ios/audioapi/ios/core/utils/IOSFileWriter.mm`、`common/cpp/audioapi/core/inputs/AudioRecorder.cpp`、`android/src/main/cpp/audioapi/android/core/AndroidAudioRecorder.cpp`、`android/src/main/cpp/audioapi/android/core/utils/ffmpegBackend/utils.cpp`、`android/src/main/java/com/swmansion/audioapi/AudioAPIModule.kt`、`android/src/main/java/com/swmansion/audioapi/system/AudioFocusListener.kt`、`package.json`（peerDependencies）
- expo-audio 1.1.1（`npm pack` で取得）: `build/Audio.types.d.ts`、`build/AudioModule.types.d.ts`、`build/ExpoAudio.d.ts`、`build/RecordingConstants.js`、`plugin/build/withAudio.js`、`ios/AudioModule.swift`、`ios/AudioRecorder.swift`、`android/src/main/AndroidManifest.xml`、`android/src/main/java/expo/modules/audio/AudioPlayer.kt` / `AudioRecorder.kt` / `AudioModule.kt`、`CHANGELOG.md`
- 公式ドキュメント: docs.expo.dev/versions/v54.0.0/sdk/av（非推奨告知）、expo.dev/changelog/sdk-55、github.com/expo/expo `sdk-55` の `packages/expo/bundledNativeModules.json`、docs.swmansion.com/react-native-audio-api（`system/audio-manager`・`inputs/audio-recorder`）
- npm レジストリ: `npm view expo dist-tags`、`npm view expo-av time / dist-tags`、`npm view expo-audio dist-tags / versions`
