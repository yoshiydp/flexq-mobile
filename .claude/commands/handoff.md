Claude Code のセッション・自動メモリ・編集履歴を Mac Mini と MacBook Air の間で引き継ぐコマンドです。
実体は `scripts/claude-handoff/` のスクリプトで、本コマンドはその前後の確認（git の状態・dry-run・検証・後片付け）を自動化します。
仕組みと注意点の詳細は `docs/claude-code-session-handoff.md` を参照してください。

## 全体の流れ（4 ステップ）

| # | ステップ | 実行する端末 | 自動化 |
|---|---------|------------|--------|
| ① | 最後に作業していた端末で引き継ぎデータを作成する | 送り出し側 | `/handoff out` |
| ② | できた `.tar.gz` を AirDrop で送る（**必ず `~/Downloads` に届く**） | 手動 | — |
| ③ | `~/Downloads` から所定ディレクトリ `~/.claude/handoff/` へ移して展開する | 受け取り側 | `/handoff in`（stage.sh） |
| ④ | 展開したデータをこの端末の `~/.claude` に取り込み、検証する | 受け取り側 | `/handoff in`（restore.sh + verify.sh） |

## 使い方

```
/handoff out               # ①
/handoff in                # ③ + ④（~/Downloads の最新アーカイブを自動検出）
/handoff in <archive>      # ③ + ④（アーカイブを指定）
/handoff clean             # 取り込み後の後片付け（展開データ・退避ディレクトリの削除）
```

引数が無い場合は `out` / `in` のどちらかをユーザーに確認する。

## 前提

- 作業は常にどちらか片方の端末で行う。**① を実行した端末では、次に引き継ぎを受けるまで作業しない**（メモリは送り出し側で上書きされるため、両方で作業すると片側の更新が消える）
- 端末の判別は `/Volumes/SHPP41-2 000GM Media/projects` の有無で行う（`scripts/claude-handoff/lib.sh`）。MacBook Air に外付けドライブを繋いだまま実行しない
- アーカイブには会話ログの全文が入る。受け渡しは AirDrop のみ。クラウド共有には置かない

## `out` の手順（①）

### 1. 各リポジトリの未コミット・未 push を確認

`lib.sh` の 3 プロジェクト（mobile / web-frontend / strapi）のうち存在するものについて:

```bash
git -C <path> status --short
git -C <path> log --oneline @{u}.. 2>/dev/null   # 未 push のコミット
git -C <path> worktree list                      # worktree の作業も同様に確認
```

未コミット・未 push があれば一覧にしてユーザーに確認する（コミットして push する / そのまま続ける）。
push が必要な場合は承諾を得てから `git push` する。セッションを持って行っても git の状態は付いてこないことを伝える。

### 2. アーカイブ作成

```bash
bash scripts/claude-handoff/backup.sh      # → ~/Desktop/claude-handoff-<日付>-<mini|air>.tar.gz
```

出力されたパスとサイズ、プロジェクトごとのセッション数を報告する。

### 3. 受け渡しの案内（②へ）

```bash
open -R ~/Desktop/claude-handoff-<日付>-<mini|air>.tar.gz   # Finder で選択状態にする（AirDrop 用）
```

相手の端末で `/handoff in` を実行するよう案内し、**この端末ではここで作業をやめる**ことを伝える。

## `in` の手順（③ + ④）

### 1. 実行環境の確認

- **他の Claude Code セッション（VSCode 拡張・別ターミナル）を閉じてもらう**。取り込み中に書き込み中のセッションがあると上書きされる恐れがある
- 本コマンドを実行しているセッション自身が「以前の引き継ぎで取り込んだセッションの再開」である場合は、新しいセッションからやり直してもらう（自分の jsonl が上書き対象になり得る）

### 2. 展開（③）

```bash
bash scripts/claude-handoff/stage.sh            # ~/Downloads の最新 claude-handoff-*.tar.gz を使う
bash scripts/claude-handoff/stage.sh <archive>  # 指定する場合
```

- アーカイブを `~/.claude/handoff/` へ移動し、`~/.claude/handoff/claude-handoff-<日付>-<mini|air>/` に展開する
- 同梱の `SESSIONS.md` が表示されるので、これから取り込む内容をユーザーに見せる
- 中断される場合: `~/Downloads` にアーカイブが無い（AirDrop 未受信）／ ファイル名の端末がこの端末と同じ（自分自身のアーカイブ）／ 展開先が既にある（前回の `/handoff clean` 未実施 → 先に clean）

### 3. git の状態を報告

```bash
git fetch --all --prune
git status -sb
git rev-list --count develop..origin/develop
git rev-list --count master..origin/master
```

遅れがあれば報告する。**ブランチの切り替えや pull は自動では行わない**（未コミットの変更がある場合があるため）。develop にいて作業ツリーが clean なら `git pull` を提案する。

### 4. dry-run で内容確認（④）

```bash
bash scripts/claude-handoff/restore.sh --dry-run     # 引数なし = ~/.claude/handoff/ の最新の展開データ
```

出力を要約してユーザーに見せる（追加 / 更新されるセッション数、上書きされるメモリ、この端末にしか無いメモリ、settings.local.json の差分）。**確認を得てから**次へ進む。

### 5. 本実行

```bash
bash scripts/claude-handoff/restore.sh
```

退避先（`~/.claude/handoff-backup-<日時>/`）のパスを控える。

### 6. 検証

```bash
bash scripts/claude-handoff/verify.sh
```

`PASS` にならなければ NG の内容を報告し、退避先から戻す手順（`rsync -a <退避先>/<key>/ ~/.claude/projects/<key>/`）を案内する。

### 7. 「この端末にしか無いメモリ」の扱い

手順 4 / 5 で一覧に出たファイルがあれば、上書き後の `MEMORY.md` にその項目が載っているか確認し、載っていなければ 1 行追記する（メモリの内容自体は変更しない）。

### 8. 仕上げの案内

- Claude Code を再起動し、対象プロジェクトで `claude --resume` を実行して `SESSIONS.md` の一覧と一致することを確認してもらう
- 問題なければ `/handoff clean` で後片付けする

## `clean` の手順

```bash
ls -d ~/.claude/handoff/* ~/.claude/handoff-backup-* 2>/dev/null
```

削除対象を一覧にして**確認を得てから** `rm -rf` する。`~/.claude/handoff-backup-*` は取り込み前の退避で、`claude --resume` の確認が済むまでは消さない。
送り出し側の `~/Desktop/claude-handoff-*.tar.gz` は、次にその端末で `/handoff in` を実行するときに削除を提案する。

## 注意事項

- `restore.sh` のマージ規則: セッションは行数の多い方を残す、メモリは送り出し側で上書き、`~/.claude.json` と `settings.json` は触らない（詳細は `docs/claude-code-session-handoff.md` §5）
- スクリプトは受け取り側リポジトリのものを使う。両端末とも develop を最新にしておく
- Notion MCP の登録は端末ごとに異なる（Mini: プロジェクト単位の stdio + API キー / Air: ユーザー単位の OAuth）。引き継がなくてよい
- macOS 標準の bash 3.2 で動くように書いてある。スクリプトを編集するときは `$var` の直後に全角文字を置かない（`${var}` にする）
