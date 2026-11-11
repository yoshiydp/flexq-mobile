#!/usr/bin/env bash
# チュートリアル / ヒント動画（TASK-139 / TASK-140）の 1 シーンを録画して変換する。
#
# 使い方: .maestro/tutorial/record-scene.sh <udid|booted> <シーン.yaml> <出力.mp4>
#   FROM_RAW=<録画.mp4> を付けると撮影せず、前回の録画（実行時に表示される raw:）から変換だけをやり直す
#
# 前提: 開発ビルドをインストール済み・Metro 起動済み・ffmpeg あり・シーンの前準備（ログインなど）を実行済み。
#       タップ位置を映すには Metro を EXPO_PUBLIC_SHOW_TOUCHES=1 で起動しておく（TASK-140）
# 流れ: ステータスバー固定 → 録画開始 → シーンを実行 → 録画停止
#       → ffmpeg で上端のステータスバー（62pt）を切り落とし、750 幅・無音 H.264 に変換
#       → trim.py で静止区間を詰める → 先頭フレームのポスター（-poster.jpg）を書き出す
set -euo pipefail

UDID="${1:?udid}"
SCENE="${2:?scene yaml}"
OUT="${3:?output mp4}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
RAW="$TMP/raw.mp4"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
FFMPEG="${FFMPEG:-ffmpeg}"
DEVICE_ARG=(); [ "$UDID" != booted ] && DEVICE_ARG=(--device "$UDID")

if [ -n "${FROM_RAW:-}" ]; then
  RAW="$FROM_RAW"
else
  xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
    --cellularMode active --cellularBars 4 --wifiBars 3 --dataNetwork wifi

  xcrun simctl io "$UDID" recordVideo --codec h264 --force "$RAW" &
  REC_PID=$!
  sleep 1.5

  "$MAESTRO" ${DEVICE_ARG[@]+"${DEVICE_ARG[@]}"} test "$SCENE" || { kill -INT "$REC_PID"; wait "$REC_PID" || true; exit 1; }

  # 録画の書き出しは実時間より遅れるため、最後の画面が収まるよう少し待ってから止める（末尾の静止は trim.py が詰める）
  sleep 3
  kill -INT "$REC_PID"
  wait "$REC_PID" || true
fi

# 1206×2622（402×874pt @3x）の上端 186px（62pt）を落とし、750 幅に縮小（既存の preview 素材と同じ比率）。
# 録画は画面が変わったときだけコマを書くため、最後の静止画面の長さが失われる。最後のコマを 3 秒延ばして残す
# （末尾の静止は trim.py が TAIL 秒に詰める）
mkdir -p "$(dirname "$OUT")"
SCALED="$TMP/scaled.mp4"
"$FFMPEG" -y -loglevel error -i "$RAW" \
  -vf "crop=iw:ih-ih*186/2622:0:ih*186/2622,scale=750:-2:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=3" \
  -an -c:v libx264 -crf 12 -preset fast "$SCALED"
python3 "$DIR/trim.py" "$SCALED" "$OUT"
"$FFMPEG" -y -loglevel error -i "$OUT" -frames:v 1 -q:v 4 "${OUT%.mp4}-poster.jpg"

echo "raw: $RAW"
ls -lh "$OUT"
