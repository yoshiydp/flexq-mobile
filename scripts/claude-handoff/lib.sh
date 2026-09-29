#!/usr/bin/env bash
# Claude Code セッション引き継ぎ用の共通定義（backup / stage / restore / verify から source される）
#
# 端末ごとのプロジェクト配置:
#   Mac Mini    : /Volumes/SHPP41-2 000GM Media/projects/<name>
#   MacBook Air : /Users/yoshiydp/projects/<name>
# 論理名 → 端末ごとのディレクトリ名（mobile だけ名前が違う）

MINI_ROOT="/Volumes/SHPP41-2 000GM Media/projects"
AIR_ROOT="/Users/yoshiydp/projects"

# 受け渡しの置き場所
DOWNLOADS="$HOME/Downloads"            # AirDrop の着地点（固定）
HANDOFF_DIR="$HOME/.claude/handoff"    # 受け取ったアーカイブを移して展開する所定ディレクトリ
OUT_DIR_DEFAULT="$HOME/Desktop"        # backup.sh の出力先（AirDrop で送りやすい場所）

# 論理名の一覧（順序固定）
PROJECTS=(mobile web-frontend strapi)

# 論理名 → ディレクトリ名
dir_name() {
  case "$1:$2" in
    mobile:mini)       echo "flexq-mobile" ;;
    mobile:air)        echo "lyrics-mobile" ;;
    web-frontend:*)    echo "lyrics-web-frontend" ;;
    strapi:*)          echo "lyrics-web-strapi" ;;
    *) echo "unknown project: $1" >&2; return 1 ;;
  esac
}

# この端末が mini / air のどちらか
detect_machine() {
  if [ -d "$MINI_ROOT" ]; then echo mini; else echo air; fi
}

root_of() { [ "$1" = mini ] && echo "$MINI_ROOT" || echo "$AIR_ROOT"; }

# 論理名 + 端末 → プロジェクトの絶対パス
project_path() { echo "$(root_of "$2")/$(dir_name "$1" "$2")"; }

# 絶対パス → ~/.claude/projects 配下のキー名（英数字とハイフン以外はハイフンに置換）
project_key() { echo "$1" | sed -E 's/[^A-Za-z0-9-]/-/g'; }

# アーカイブ名 / 展開ディレクトリ名（claude-handoff-<日付>-<mini|air>）→ 送り出し側の端末
machine_from_name() {
  case "$(basename "$1" .tar.gz)" in
    *-mini) echo mini ;; *-air) echo air ;;
    *) echo "名前から送り出し側の端末を判別できません: $1" >&2; return 1 ;;
  esac
}

# 展開済みディレクトリを解決する（restore / verify 共通）
#   引数なし      → $HANDOFF_DIR 内の最新の展開ディレクトリ
#   ディレクトリ  → そのまま
#   .tar.gz       → stage.sh で展開してから使う旨を案内して終了
resolve_staged() {
  local arg=${1:-}
  if [ -z "$arg" ]; then
    arg=$(ls -td "$HANDOFF_DIR"/claude-handoff-*/ 2>/dev/null | head -1)
    [ -n "$arg" ] || { echo "$HANDOFF_DIR に展開済みデータがありません。先に stage.sh を実行してください" >&2; return 1; }
  fi
  case "$arg" in
    *.tar.gz) echo "アーカイブは先に stage.sh で展開してください: bash stage.sh '$arg'" >&2; return 1 ;;
  esac
  arg=${arg%/}
  [ -f "$arg/manifest.txt" ] || { echo "manifest.txt が無い（backup.sh 以外で作られたデータ？）: $arg" >&2; return 1; }
  echo "$arg"
}
