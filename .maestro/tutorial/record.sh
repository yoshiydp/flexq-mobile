#!/usr/bin/env bash
# 初回チュートリアルの動画（TASK-139）の撮影 + 変換。
#
# 使い方: .maestro/tutorial/record.sh [udid] [出力先]
#   udid   既定: 起動中のシミュレーター（booted）
#   出力先 既定: src/assets/video/tutorial-new-project.mp4
#
# 前提: 開発ビルドをインストール済み・yarn start（dev API）で Metro 起動済み・ffmpeg あり
# 流れ: 01-login → 01b（編集画面のヒントを出さないための準備）（ここまで録画しない）
#       → 02-new-project を録画・変換（record-scene.sh）
set -euo pipefail

UDID="${1:-booted}"
OUT="${2:-src/assets/video/tutorial-new-project.mp4}"
DIR="$(cd "$(dirname "$0")" && pwd)"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
DEVICE_ARG=(); [ "$UDID" != booted ] && DEVICE_ARG=(--device "$UDID")

"$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$DIR/01-login.yaml"
"$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$DIR/01b-skip-project-edit-hint.yaml"
"$DIR/record-scene.sh" "$UDID" "$DIR/02-new-project.yaml" "$OUT"
xcrun simctl status_bar "$UDID" clear
