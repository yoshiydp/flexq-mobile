#!/usr/bin/env bash
# restore.sh の取り込み結果を検証する（受け取り側で実行）
#
#   bash scripts/claude-handoff/verify.sh                    # 最新の展開ディレクトリで検証
#   bash scripts/claude-handoff/verify.sh <展開ディレクトリ>
#
# 検証項目:
#   1. 展開データ内の全セッションが受け取り側に存在し、行数が同じかそれ以上
#   2. 取り込んだ jsonl に送り出し側のプロジェクトパスが残っていない
#   3. memory/ の全ファイルが受け取り側と一致（restore が「送り出し側で上書き」するため）
# いずれかが失敗すると exit 1
set -euo pipefail
cd "$(dirname "$0")"; source ./lib.sh

MACHINE=$(detect_machine)
SRC=$(resolve_staged "${1:-}")
FROM=$(machine_from_name "$SRC")
FROM_ROOT=$(root_of "$FROM")
echo "検証: ${SRC}（$FROM → ${MACHINE}）"

fail=0; ok=0
report() { if [ "$1" = ok ]; then ok=$((ok+1)); else fail=$((fail+1)); echo "  NG  $2"; fi; }

while IFS=$'\t' read -r p from_path; do
  to_path=$(project_path "$p" "$MACHINE"); dst="$HOME/.claude/projects/$(project_key "$to_path")"
  echo "== $p → $dst"
  for f in "$SRC/projects/$p"/*.jsonl; do
    [ -e "$f" ] || continue
    sid=$(basename "$f" .jsonl); d="$dst/$sid.jsonl"
    if [ ! -f "$d" ]; then report ng "セッション無し: $sid"; continue; fi
    if [ "$(wc -l < "$d")" -lt "$(wc -l < "$f")" ]; then report ng "行数不足: $sid ($(wc -l < "$d" | tr -d ' ') < $(wc -l < "$f" | tr -d ' '))"; else report ok; fi
    if [ "$FROM" != "$MACHINE" ] && grep -q "$FROM_ROOT" "$d"; then report ng "旧パスが残存: $sid"; else report ok; fi
  done
  if [ -d "$SRC/projects/$p/memory" ]; then
    for m in "$SRC/projects/$p/memory"/*; do
      [ -e "$m" ] || continue
      if cmp -s "$m" "$dst/memory/$(basename "$m")"; then report ok; else report ng "memory 不一致: $(basename "$m")"; fi
    done
  fi
done < "$SRC/manifest.txt"

echo
if [ $fail -eq 0 ]; then echo "PASS（チェック $ok 件）"; else echo "FAIL（NG $fail 件 / OK $ok 件）"; exit 1; fi
