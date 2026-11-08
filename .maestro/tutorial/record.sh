#!/usr/bin/env bash
# チュートリアル動画（TASK-139）の撮影 + 変換。
#
# 使い方: .maestro/tutorial/record.sh [udid] [出力先]
#   udid   既定: 起動中のシミュレーター（booted）
#   出力先 既定: src/assets/video/tutorial-new-project.mp4
#
# 前提: 開発ビルドをインストール済み・yarn start（dev API）で Metro 起動済み・ffmpeg あり
# 流れ: ステータスバー固定 → 01-login（録画しない）→ 録画開始 → 02-new-project → 録画停止
#       → ffmpeg で上端のステータスバー（62pt）を切り落とし、750 幅・無音 H.264 に変換
set -euo pipefail

UDID="${1:-booted}"
OUT="${2:-src/assets/video/tutorial-new-project.mp4}"
DIR="$(cd "$(dirname "$0")" && pwd)"
RAW="$(mktemp -d)/raw.mp4"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
FFMPEG="${FFMPEG:-ffmpeg}"
DEVICE_ARG=(); [ "$UDID" != booted ] && DEVICE_ARG=(--device "$UDID")

xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiBars 3 --dataNetwork wifi

"$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$DIR/01-login.yaml"

xcrun simctl io "$UDID" recordVideo --codec h264 --force "$RAW" &
REC_PID=$!
sleep 1.5

"$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$DIR/02-new-project.yaml" || { kill -INT "$REC_PID"; wait "$REC_PID" || true; exit 1; }

kill -INT "$REC_PID"
wait "$REC_PID" || true
xcrun simctl status_bar "$UDID" clear

# 1206×2622（402×874pt @3x）の上端 186px（62pt）を落とし、750 幅に縮小（既存の preview 素材と同じ比率）
# → trim.py で Maestro の操作待ちによる静止区間を詰める
mkdir -p "$(dirname "$OUT")"
SCALED="$(dirname "$RAW")/scaled.mp4"
"$FFMPEG" -y -loglevel error -i "$RAW" \
  -vf "crop=iw:ih-ih*186/2622:0:ih*186/2622,scale=750:-2:flags=lanczos,fps=30" \
  -an -c:v libx264 -crf 12 -preset fast "$SCALED"
python3 "$DIR/trim.py" "$SCALED" "$OUT"
# 読み込み中に表示するポスター（先頭フレーム）
"$FFMPEG" -y -loglevel error -i "$OUT" -frames:v 1 -q:v 4 "${OUT%.mp4}-poster.jpg"

echo "raw: $RAW"
ls -lh "$OUT"
