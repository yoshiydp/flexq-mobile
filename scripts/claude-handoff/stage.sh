#!/usr/bin/env bash
# ③ AirDrop で ~/Downloads に届いたアーカイブを所定ディレクトリ（~/.claude/handoff/）へ移して展開する（受け取り側で実行）
#
#   bash scripts/claude-handoff/stage.sh                 # ~/Downloads の最新の claude-handoff-*.tar.gz を使う
#   bash scripts/claude-handoff/stage.sh <archive.tar.gz>
#
# 結果: ~/.claude/handoff/claude-handoff-<日付>-<mini|air>/ に展開され、アーカイブ本体も同じ場所へ移動される
set -euo pipefail
cd "$(dirname "$0")"; source ./lib.sh

MACHINE=$(detect_machine)
ARCHIVE=${1:-}
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(ls -t "$DOWNLOADS"/claude-handoff-*.tar.gz 2>/dev/null | head -1)
  [ -n "$ARCHIVE" ] || { echo "$DOWNLOADS に claude-handoff-*.tar.gz がありません（AirDrop で受け取り済みか確認）" >&2; exit 1; }
fi
[ -f "$ARCHIVE" ] || { echo "ファイルがありません: $ARCHIVE" >&2; exit 1; }
FROM=$(machine_from_name "$ARCHIVE")
if [ "$FROM" = "$MACHINE" ]; then
  echo "中断: アーカイブの端末（${FROM}）とこの端末（${MACHINE}）が同じです（自分自身のアーカイブ）" >&2; exit 1
fi

NAME=$(basename "$ARCHIVE" .tar.gz)
DEST="$HANDOFF_DIR/$NAME"
if [ -d "$DEST" ]; then
  echo "中断: 展開先が既にあります: ${DEST}（取り込み済みなら clean で削除してから再実行）" >&2; exit 1
fi
mkdir -p "$HANDOFF_DIR"
echo "アーカイブ: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
# 展開先の親に移動してから展開（tar 内のトップディレクトリ名 = NAME）
mv "$ARCHIVE" "$HANDOFF_DIR/" 2>/dev/null || cp "$ARCHIVE" "$HANDOFF_DIR/"
tar xzf "$HANDOFF_DIR/$NAME.tar.gz" -C "$HANDOFF_DIR"
[ -f "$DEST/manifest.txt" ] || { echo "展開結果に manifest.txt がありません: $DEST" >&2; exit 1; }

echo "展開先: ${DEST}（送り出し側: ${FROM}）"
echo
cat "$DEST/SESSIONS.md"
echo
echo "次: bash scripts/claude-handoff/restore.sh --dry-run で内容確認 → restore.sh で取り込み"
