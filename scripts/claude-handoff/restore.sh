#!/usr/bin/env bash
# ④ stage.sh で展開したデータをこの端末の ~/.claude に取り込む（受け取り側で実行）
#
#   bash scripts/claude-handoff/restore.sh --dry-run          # 最新の展開ディレクトリで、何をするかだけ表示
#   bash scripts/claude-handoff/restore.sh                    # 最新の展開ディレクトリを取り込む
#   bash scripts/claude-handoff/restore.sh <展開ディレクトリ> [--dry-run]
#
# マージ規則:
#   セッション jsonl : 無ければ追加。同じ ID があれば行数の多い方を残す（パスは受け取り側に書き換え）
#   memory/          : 送り出し側で上書き（送り出し側が常に最新という前提。受け取り側にしか無いファイルは残す）
#   file-history/    : 無いものだけ追加
#   settings.local   : 無ければ配置。あれば差分を表示して触らない
# 実行前に ~/.claude/projects/<key> を ~/.claude/handoff-backup-<日時>/ に退避する
set -euo pipefail
cd "$(dirname "$0")"; source ./lib.sh

DRY=""; ARG=""
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) ARG=$a ;; esac; done
[ -n "$DRY" ] && echo "### DRY RUN（書き込みしない）"

MACHINE=$(detect_machine)
SRC=$(resolve_staged "$ARG")
FROM=$(machine_from_name "$SRC")
[ "$FROM" = "$MACHINE" ] && echo "警告: データの端末（${FROM}）とこの端末（${MACHINE}）が同じです" >&2
echo "取り込み: $FROM → ${MACHINE}（${SRC}）"

# 全プロジェクトの「元パス → この端末のパス」の sed 式（他プロジェクトのパスが混ざるセッションもあるので全件）
SED_EXPR=""
for p in "${PROJECTS[@]}"; do
  from=$(project_path "$p" "$FROM"); to=$(project_path "$p" "$MACHINE")
  SED_EXPR="$SED_EXPR -e s#$(printf '%s' "$from" | sed 's/ /\\ /g')#$(printf '%s' "$to" | sed 's/ /\\ /g')#g"
done
rewrite() { eval sed $SED_EXPR "\"\$1\"" > "$2"; }

BACKUP_DIR="$HOME/.claude/handoff-backup-$(date +%Y-%m-%d-%H%M)"

while IFS=$'\t' read -r p from_path; do
  to_path=$(project_path "$p" "$MACHINE"); key=$(project_key "$to_path")
  src="$SRC/projects/$p"; dst="$HOME/.claude/projects/$key"
  echo; echo "== $p → $dst"
  if [ -d "$dst" ] && [ -z "$DRY" ]; then mkdir -p "$BACKUP_DIR"; cp -a "$dst" "$BACKUP_DIR/$key"; echo "  退避: $BACKUP_DIR/$key"; fi
  [ -z "$DRY" ] && mkdir -p "$dst"

  # --- セッション本体 ---
  add=0; upd=0; keep=0
  for f in "$src"/*.jsonl; do
    [ -e "$f" ] || continue
    sid=$(basename "$f" .jsonl); d="$dst/$sid.jsonl"
    if [ ! -f "$d" ]; then
      echo "  追加  $sid ($(wc -l < "$f" | tr -d ' ') 行)"; add=$((add+1))
      [ -z "$DRY" ] && rewrite "$f" "$d"
    elif [ "$(wc -l < "$f")" -gt "$(wc -l < "$d")" ]; then
      echo "  更新  $sid ($(wc -l < "$d" | tr -d ' ') → $(wc -l < "$f" | tr -d ' ') 行)"; upd=$((upd+1))
      [ -z "$DRY" ] && rewrite "$f" "$d"
    else
      keep=$((keep+1))
    fi
    # tool-results / subagents などの付随ディレクトリ
    if [ -d "$src/$sid" ] && [ -z "$DRY" ]; then
      rsync -a "$src/$sid/" "$dst/$sid/"
      find "$dst/$sid" -name '*.jsonl' -print0 | while IFS= read -r -d '' j; do rewrite "$j" "$j.tmp" && mv "$j.tmp" "$j"; done
    fi
  done
  echo "  セッション: 追加 $add / 更新 $upd / そのまま $keep"

  # --- memory ---
  if [ -d "$src/memory" ]; then
    changed=$(rsync -rcn --out-format='%n' "$src/memory/" "$dst/memory/" 2>/dev/null | grep -v '/$' || true)
    if [ -n "$changed" ]; then
      echo "  memory 上書き/追加:"; echo "$changed" | sed 's/^/    /'
      [ -z "$DRY" ] && rsync -ac "$src/memory/" "$dst/memory/"
    else
      echo "  memory: 差分なし"
    fi
    only_dst=$(comm -13 <(ls "$src/memory" | sort) <(ls "$dst/memory" 2>/dev/null | sort) || true)
    [ -n "$only_dst" ] && { echo "  memory この端末にしか無い（残す。MEMORY.md に載っているか確認）:"; echo "$only_dst" | sed 's/^/    /'; }
  fi

  # --- settings.local.json ---
  sl="$SRC/settings-local/$p.json"
  if [ -f "$sl" ]; then
    if [ ! -f "$to_path/.claude/settings.local.json" ]; then
      echo "  settings.local.json: 配置"
      [ -z "$DRY" ] && { mkdir -p "$to_path/.claude"; cp "$sl" "$to_path/.claude/settings.local.json"; }
    elif ! cmp -s "$sl" "$to_path/.claude/settings.local.json"; then
      echo "  settings.local.json: 既存と差分あり（触らない）"; diff "$to_path/.claude/settings.local.json" "$sl" | sed 's/^/    /' || true
    fi
  fi
done < "$SRC/manifest.txt"

# --- file-history ---
if [ -d "$SRC/file-history" ]; then
  n=$(comm -23 <(ls "$SRC/file-history" | sort) <(ls "$HOME/.claude/file-history" 2>/dev/null | sort) | wc -l | tr -d ' ')
  echo; echo "== file-history: $n セッション分を追加"
  [ -z "$DRY" ] && rsync -a --ignore-existing "$SRC/file-history/" "$HOME/.claude/file-history/"
fi

echo
if [ -n "$DRY" ]; then
  echo "dry-run 終了。問題なければ --dry-run を外して実行"
else
  echo "完了。次: bash scripts/claude-handoff/verify.sh で検証 → Claude Code を再起動して claude --resume で確認"
  [ -d "$BACKUP_DIR" ] && echo "問題なければ退避先を削除: rm -rf '$BACKUP_DIR'"
fi
exit 0
