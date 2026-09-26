#!/usr/bin/env bash
# ① Claude Code のセッション・メモリを別端末へ持ち出すためのアーカイブを作る（最後に作業していた端末で実行）
#
#   bash scripts/claude-handoff/backup.sh            # ~/Desktop/claude-handoff-<日付>-<端末>.tar.gz
#   OUT_DIR=/path bash scripts/claude-handoff/backup.sh
#
# 含めるもの: 各プロジェクトの ~/.claude/projects/<key>/（セッション jsonl・memory・tool-results）、
#             それらのセッションに対応する ~/.claude/file-history/<sessionId>/、
#             各プロジェクトの .claude/settings.local.json
# 含めないもの: ~/.claude.json（端末固有）、settings.json、認証情報、skills/plugins（claude.ai 同期）
set -euo pipefail
cd "$(dirname "$0")"; source ./lib.sh

MACHINE=$(detect_machine)
DATE=$(date +%Y-%m-%d)
OUT_DIR=${OUT_DIR:-$OUT_DIR_DEFAULT}
NAME="claude-handoff-$DATE-$MACHINE"
STAGE=$(mktemp -d)/$NAME
mkdir -p "$STAGE/projects" "$STAGE/file-history" "$STAGE/settings-local"

echo "端末: $MACHINE"
MANIFEST="$STAGE/manifest.txt"   # 1 行 = <論理名>\t<元パス>
: > "$MANIFEST"

for p in "${PROJECTS[@]}"; do
  path=$(project_path "$p" "$MACHINE"); key=$(project_key "$path")
  src="$HOME/.claude/projects/$key"
  if [ ! -d "$src" ]; then echo "  $p: セッション無し（${src}）→ スキップ"; continue; fi
  printf '%s\t%s\n' "$p" "$path" >> "$MANIFEST"
  rsync -a "$src/" "$STAGE/projects/$p/"
  n=$(ls "$src"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')
  m=$(ls "$src/memory" 2>/dev/null | wc -l | tr -d ' ')
  echo "  $p: セッション $n 件 / メモリ $m ファイル"
  # /rewind 用の編集履歴（このプロジェクトのセッション ID ぶんだけ）
  for f in "$src"/*.jsonl; do
    sid=$(basename "$f" .jsonl)
    [ -d "$HOME/.claude/file-history/$sid" ] && rsync -a "$HOME/.claude/file-history/$sid" "$STAGE/file-history/" || true
  done
  [ -f "$path/.claude/settings.local.json" ] && cp "$path/.claude/settings.local.json" "$STAGE/settings-local/$p.json" || true
done

# 確認用のセッション一覧
python3 - "$STAGE" <<'PY' > "$STAGE/SESSIONS.md"
import json, os, sys, glob, datetime
stage = sys.argv[1]
print('# セッション一覧\n')
for proj in sorted(os.listdir(f'{stage}/projects')):
    print(f'## {proj}\n')
    print('| セッション ID | 最終更新 | 行数 | サイズ | 最初のユーザー入力 |')
    print('|---|---|---|---|---|')
    rows = []
    for f in glob.glob(f'{stage}/projects/{proj}/*.jsonl'):
        sid = os.path.basename(f)[:-6]
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(f)).strftime('%Y-%m-%d %H:%M')
        size = os.path.getsize(f) / 1024 / 1024
        n = 0; first = ''
        with open(f) as fh:
            for line in fh:
                n += 1
                if first: continue
                try: o = json.loads(line)
                except Exception: continue
                if o.get('type') == 'user':
                    c = o.get('message', {}).get('content')
                    if isinstance(c, list): c = ' '.join(x.get('text', '') for x in c if isinstance(x, dict))
                    if isinstance(c, str) and c.strip() and not c.startswith('<'):
                        first = c.strip().replace('\n', ' ').replace('|', '/')[:60]
        rows.append((mtime, sid, n, size, first))
    for mtime, sid, n, size, first in sorted(rows, reverse=True):
        print(f'| {sid} | {mtime} | {n} | {size:.1f} MB | {first} |')
    print()
PY

mkdir -p "$OUT_DIR"
tar czf "$OUT_DIR/$NAME.tar.gz" -C "$(dirname "$STAGE")" "$NAME"
rm -rf "$(dirname "$STAGE")"
echo
echo "作成: $OUT_DIR/$NAME.tar.gz ($(du -h "$OUT_DIR/$NAME.tar.gz" | cut -f1))"
echo "次: このファイルを相手の端末へ AirDrop で送る（~/Downloads に届く）→ 相手側で /handoff in"
