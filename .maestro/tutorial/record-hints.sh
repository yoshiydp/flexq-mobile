#!/usr/bin/env bash
# 画面ごとの初回ヒントの動画（TASK-140）をまとめて撮影 + 変換する。
#
# 使い方: .maestro/tutorial/record-hints.sh <udid|booted> [project-edit|drafts|all]
#
# 前提: 開発ビルドをインストール済み・ffmpeg あり・Metro を次のように起動済み
#       （タップ位置の印を出すため。EAS の配信には含まれない）:
#         EXPO_PUBLIC_SHOW_TOUCHES=1 npx expo start
# プロジェクト編集は 5 シーンを続けて撮る（CUE の状態を次のシーンへ引き継ぐ）。
# 出力: src/assets/video/hint-<シーン名>.mp4 と -poster.jpg
set -euo pipefail

UDID="${1:-booted}"
TARGET="${2:-all}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HINTS="$DIR/hints"
OUT_DIR="src/assets/video"
# 再生中の小さな動き（再生位置・波形）やタップの印を静止とみなして切り落とさないよう、
# 静止の判定を厳しくし、途中の間を長めに残す（trim.py の既定は TASK-139 の動画向け）
export TRIM_NOISE="${TRIM_NOISE:-0.0005}" TRIM_HOLD="${TRIM_HOLD:-1.5}" TRIM_LEAD="${TRIM_LEAD:-1.2}" TRIM_TAIL="${TRIM_TAIL:-2.0}"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
DEVICE_ARG=(); [ "$UDID" != booted ] && DEVICE_ARG=(--device "$UDID")
run() { "$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$@"; }
scene() { "$DIR/record-scene.sh" "$UDID" "$HINTS/$1.yaml" "$OUT_DIR/hint-$2.mp4"; }
# 2 つの区間を 1 本につなげる（$1 + $2 → $3）。区間ごとのファイルとポスターは消す
concat() {
  local list; list="$(mktemp)"
  printf "file '%s'\nfile '%s'\n" "$PWD/$1" "$PWD/$2" > "$list"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -an -c:v libx264 -crf 26 -preset slow \
    -pix_fmt yuv420p -movflags +faststart "$3"
  ffmpeg -y -loglevel error -i "$3" -frames:v 1 -q:v 4 "${3%.mp4}-poster.jpg"
  rm -f "$1" "$2" "${1%.mp4}-poster.jpg" "${2%.mp4}-poster.jpg"
  ls -lh "$3"
}

if [ "$TARGET" = all ] || [ "$TARGET" = project-edit ]; then
  run "$HINTS/prepare-project-edit.yaml"
  scene pe-1-lyrics project-edit-lyrics
  # 歌詞の編集状態と再生を閉じてから CUE のシーンへ
  run "$HINTS/reopen-project.yaml"
  scene pe-2-cue-tap project-edit-cue-tap
  scene pe-3-cue-double-tap project-edit-cue-double-tap
  scene pe-4-cue-long-press project-edit-cue-long-press
  scene pe-5-rec project-edit-rec
fi

if [ "$TARGET" = all ] || [ "$TARGET" = drafts ]; then
  run "$HINTS/prepare-drafts.yaml"
  # 本文のエディタは自動入力できないため、タイトル入力までと「本文入り → SAVE」を別に撮ってつなげる
  scene drafts-1a-quick-memo-title drafts-quick-memo-a
  run "$HINTS/drafts-memo-open.yaml"
  scene drafts-1b-quick-memo-save drafts-quick-memo-b
  concat "$OUT_DIR/hint-drafts-quick-memo-a.mp4" "$OUT_DIR/hint-drafts-quick-memo-b.mp4" \
    "$OUT_DIR/hint-drafts-quick-memo.mp4"
  run "$HINTS/back-to-drafts.yaml"
  scene drafts-2-quick-record drafts-quick-record
fi

xcrun simctl status_bar "$UDID" clear
