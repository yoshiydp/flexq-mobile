# Claude Code セッション引き継ぎ手順【Mac Mini ⇄ MacBook Air】

> **状態: 運用中**（2026-09-26 作成。同日の MacBook Air → Mac Mini の手動移行で判明した注意点を反映し、
> `scripts/claude-handoff/` にスクリプト化した）
>
> 本書は、Claude Code の会話セッション・自動メモリ・編集履歴を 2 台の Mac の間で行き来させる手順をまとめたもの。
> どちらの方向（Mini → Air / Air → Mini）でも同じ手順で行える。
>
> **通常は `/handoff out`（①）→ AirDrop（②）→ `/handoff in`（③④）→ `/handoff clean` で完結する**
> （`.claude/commands/handoff.md`）。本書はその中身と、手動で行う場合の手順。
>
> | # | ステップ | 端末 | 自動化 |
> |---|---------|------|--------|
> | ① | 最後に作業していた端末で引き継ぎデータを作成 | 送り出し側 | `backup.sh` |
> | ② | `.tar.gz` を AirDrop で送る（必ず `~/Downloads` に届く） | 手動 | — |
> | ③ | `~/Downloads` から `~/.claude/handoff/` へ移して展開 | 受け取り側 | `stage.sh` |
> | ④ | 展開データを `~/.claude` に取り込み・検証 | 受け取り側 | `restore.sh` + `verify.sh` |

## 1. 仕組みの前提

Claude Code はプロジェクトごとのデータを `~/.claude/projects/<キー>/` に保存する。
**キーはプロジェクトの絶対パスをハイフン区切りにしたもの**で、2 台でプロジェクトの置き場所が違うため
キー名が一致しない。そのままコピーしても `claude --resume` の一覧には出ない。

| 論理名 | Mac Mini | MacBook Air |
|--------|----------|-------------|
| mobile | `/Volumes/SHPP41-2 000GM Media/projects/flexq-mobile` | `/Users/yoshiydp/projects/lyrics-mobile` |
| web-frontend | `/Volumes/SHPP41-2 000GM Media/projects/lyrics-web-frontend` | `/Users/yoshiydp/projects/lyrics-web-frontend` |
| strapi | `/Volumes/SHPP41-2 000GM Media/projects/lyrics-web-strapi` | `/Users/yoshiydp/projects/lyrics-web-strapi` |

- キー名の例: Mini の mobile は `-Volumes-SHPP41-2-000GM-Media-projects-flexq-mobile`、Air は `-Users-yoshiydp-projects-lyrics-mobile`
- セッション本体（`<セッションID>.jsonl`）の各行にも `cwd` として絶対パスが記録されているため、**ディレクトリ名だけでなく中身のパスも書き換える**必要がある
- 端末の判別は `/Volumes/SHPP41-2 000GM Media/projects` の有無で行う（外付けドライブを Air に繋いだ状態では誤判定するので繋がない）
- 受け取ったアーカイブの置き場所は `~/.claude/handoff/` に固定する（`~/.claude/handoff/claude-handoff-<日付>-<mini|air>/` に展開。Claude Code はこのディレクトリを読まない）

### 引き継ぐもの / 引き継がないもの

| 対象 | 場所 | 扱い |
|------|------|------|
| 会話セッション | `~/.claude/projects/<キー>/*.jsonl` と付随ディレクトリ（tool-results / subagents） | **引き継ぐ**（パス書き換え） |
| 自動メモリ | `~/.claude/projects/<キー>/memory/` | **引き継ぐ**（送り出し側で上書き） |
| 編集履歴（`/rewind` 用） | `~/.claude/file-history/<セッションID>/` | **引き継ぐ**（無いものだけ追加） |
| プロジェクトのローカル権限 | `<プロジェクト>/.claude/settings.local.json` | 無ければ配置、あれば差分表示のみ |
| グローバル設定 | `~/.claude/settings.json` | 引き継がない（差はモデル名の表記程度） |
| ユーザー設定 | `~/.claude.json` | **引き継がない**（端末固有。Notion MCP の登録方法も端末で異なる。§7 参照） |
| スキル・プラグイン | `~/.claude/skills/` `~/.claude/plugins/` | 引き継がない（claude.ai から自動同期される） |
| 認証 | macOS キーチェーン | 引き継がない（各端末で `/login` 済み） |
| Codex CLI・AWS・`.env.local`・`credentials/` | `~/.codex/` `~/.aws/` など | 対象外。必要なら別途安全な経路で |

## 2. 運用ルール

1. **作業は常にどちらか片方の端末で行い、切り替える前に必ず引き継ぐ。**
   メモリは「送り出し側が最新」として上書きするため、両方で同時に作業すると受け取り側のメモリ更新が消える。
2. **切り替える前に git を push する。** セッションを持って行っても、ブランチや未コミットの変更は付いてこない。
   受け取り側では `git pull` してから作業を再開する。
3. **アーカイブは会話ログの全文を含む**（API キーやメールアドレスが写っていることもある）。
   受け渡しは AirDrop か USB メモリで行い、クラウド共有には置かない。取り込みが済んだら両端末で削除する。
4. スクリプトは**受け取り側のリポジトリ**にあるものを使う（両端末とも `develop` を最新にしておけば同じ版になる）。

## 3. 手順（送り出し側・①②）

```bash
# 1. 作業中の変更を push（未コミットがあれば commit するか stash メモを残す）
git status
git push

# 2. アーカイブ作成（~/Desktop/claude-handoff-<日付>-<mini|air>.tar.gz）
bash scripts/claude-handoff/backup.sh
```

出力例:

```
端末: air
  mobile: セッション 13 件 / メモリ 30 ファイル
  web-frontend: セッション 4 件 / メモリ 2 ファイル
  strapi: セッション無し（…）→ スキップ
作成: /Users/yoshiydp/Desktop/claude-handoff-2026-09-26-air.tar.gz (110M)
```

3. できた `.tar.gz` を AirDrop で相手の端末へ送る。**受け取り側では必ず `~/Downloads` に届く**ので、移動や改名はしない。

> アーカイブ名の末尾（`-mini` / `-air`）で送り出し側を判別するので、**ファイル名は変えない**。

## 4. 手順（受け取り側・③④）

```bash
# 1. リポジトリを最新にする
git checkout develop && git pull

# 2. Claude Code をすべて終了する（VSCode の拡張・ターミナルの両方）

# ③ ~/Downloads の最新アーカイブを ~/.claude/handoff/ へ移して展開（同梱の SESSIONS.md が表示される）
bash scripts/claude-handoff/stage.sh

# ④-1 まず dry-run で何が起きるか確認（引数なし = ~/.claude/handoff/ の最新の展開データ）
bash scripts/claude-handoff/restore.sh --dry-run

# ④-2 本実行（既存データは ~/.claude/handoff-backup-<日時>/ に退避される）
bash scripts/claude-handoff/restore.sh

# ④-3 検証（全セッションの存在・行数、旧パスの残存、メモリの一致をチェック）
bash scripts/claude-handoff/verify.sh

# 3. Claude Code を起動し、各プロジェクトで一覧を確認
claude --resume     # SESSIONS.md と突き合わせる（~/.claude/handoff/<name>/SESSIONS.md）

# 4. 問題なければ後片付け
rm -rf ~/.claude/handoff/* ~/.claude/handoff-backup-<日時>
```

## 5. マージ規則（restore.sh の挙動）

同じセッションが両端末にあるのが普通（前回の引き継ぎで渡した分）なので、単純な上書きではなく次の規則で合流させる。

| 対象 | 規則 |
|------|------|
| セッション jsonl | 受け取り側に無ければ追加。同じ ID があれば**行数の多い方**を残す（続きがある側が勝つ）。同数なら受け取り側のまま |
| セッションの付随ディレクトリ | rsync で合流。中の jsonl（subagents）もパス書き換え |
| memory/ | 送り出し側で上書き（チェックサム比較）。受け取り側にしか無いファイルは残し、一覧に表示する |
| file-history/ | 無いセッション ID の分だけ追加 |
| settings.local.json | 無ければ配置。あれば差分を表示するだけで触らない |

- パス書き換えは §1 の表の**全プロジェクト分**を一括で行う（mobile のセッションに web-frontend のパスが混ざることがあるため）
- 受け取り側にしか無いメモリが表示されたら、その内容が `MEMORY.md`（上書き済み）から参照されているかを確認し、必要なら追記する

## 6. 手動で行う場合（スクリプトが使えないとき）

```bash
mkdir -p ~/.claude/handoff && mv ~/Downloads/claude-handoff-*-air.tar.gz ~/.claude/handoff/ && tar xzf ~/.claude/handoff/claude-handoff-*-air.tar.gz -C ~/.claude/handoff
SRC=~/.claude/handoff/claude-handoff-<日付>-air/projects/mobile
DST=~/.claude/projects/-Volumes-SHPP41-2-000GM-Media-projects-flexq-mobile    # 受け取り側のキー
OLD='/Users/yoshiydp/projects/lyrics-mobile'                                   # 送り出し側のパス
NEW='/Volumes/SHPP41-2 000GM Media/projects/flexq-mobile'                      # 受け取り側のパス

cp -a "$DST" ~/.claude/handoff-backup-manual                     # 退避
for f in "$SRC"/*.jsonl; do                                      # 無いもの・長いものだけパス書き換えコピー
  id=$(basename "$f")
  if [ ! -f "$DST/$id" ] || [ "$(wc -l < "$f")" -gt "$(wc -l < "$DST/$id")" ]; then
    sed "s#$OLD#$NEW#g" "$f" > "$DST/$id"
  fi
done
rsync -ac "$SRC/memory/" "$DST/memory/"                          # メモリは送り出し側で上書き
rsync -a --ignore-existing ~/.claude/handoff/claude-handoff-<日付>-air/file-history/ ~/.claude/file-history/
```

## 7. トラブルシューティング

| 症状 | 原因 / 対処 |
|------|------------|
| `claude --resume` に出ない | キー名がプロジェクトパスと一致していない。`ls ~/.claude/projects/` で受け取り側のキーに入っているか確認 |
| 再開したセッションで `cd` や `Read` が旧パスを指す | jsonl 内のパス書き換え漏れ。`grep -c '/Users/yoshiydp/projects' <jsonl>` が 0 になっているか確認 |
| `unbound variable` などでスクリプトが落ちる | macOS 標準の bash 3.2 は `$var` の直後に全角文字があると変数名を誤認する。スクリプト内では `${var}` を使う |
| 「アーカイブの端末とこの端末が同じ」で中断 | Air に外付けドライブを繋いだまま実行している、またはファイル名を変えた |
| `stage.sh` が「展開先が既にあります」で中断 | 前回の取り込み後に `/handoff clean` をしていない。`~/.claude/handoff/` の古い展開データを削除して再実行 |
| `stage.sh` が「~/Downloads に … がありません」 | AirDrop の受信が完了していない、または別の場所に保存した。`~/Downloads` に置き直すか、パスを引数で渡す |
| Notion MCP が繋がらない / 挙動が違う | 登録方法が端末で異なる。**Mini** はプロジェクト単位の stdio 登録（`~/.claude.json` の `projects[...].mcpServers.notion` にキー入り）。**Air** はユーザー単位の OAuth（`claude mcp add --transport http --scope user notion https://mcp.notion.com/mcp`）。どちらもそのままでよく、引き継がない |
| `.claude/settings.local.json` の差分が出る | 端末ごとに許可した権限の履歴。必要な行を手で足す |

## 8. 経緯

- **2026-09-12** Mini → Air へ初回移行（7 セッション + メモリ）。`~/.claude` を丸ごと `rsync` する方式
- **2026-09-26** Air → Mini へ逆方向の移行。README の手順（丸ごと `rsync` + `~/.claude.json` マージ）は
  受け取り側に既存データがある前提に合わず、以下を手動で行った:
  - 13 セッション中 7 件が重複。うち 3 件は Air で続きがあったため行数の多い方を採用
  - メモリは Air 側が完全な上位互換（13 ファイル新規・5 ファイル更新）→ 上書き
  - `~/.claude.json` は触らない（マージすると Mini の他プロジェクト設定が消える）
  - 「Notion API キーの所在」メモが端末固有の記述だったため、両端末の違いを追記
- 上記を規則化して `scripts/claude-handoff/` を作成（本書 §5）
