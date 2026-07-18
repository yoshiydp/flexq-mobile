# ffmpeg 静的ビルド（Linux arm64 / Lambda 用）をダウンロードして Layer に配置する。
# `sam build` が BuildMethod: makefile でこの build-FfmpegLayer ターゲットを実行する。
# tarball（約 40MB）は $(HOME)/.cache 配下にキャッシュし、2 回目以降のビルドでは
# ダウンロードを省略する（sam build はソースを一時ディレクトリへコピーしてから
# make を実行するため、キャッシュはこのディレクトリ内には置けない）
FFMPEG_URL = https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
CACHE_DIR = $(HOME)/.cache/lyrics-mobile
CACHE_FILE = $(CACHE_DIR)/ffmpeg-release-arm64-static.tar.xz

build-FfmpegLayer:
	mkdir -p "$(CACHE_DIR)"
	[ -s "$(CACHE_FILE)" ] || curl -fL --retry 3 -o "$(CACHE_FILE)" "$(FFMPEG_URL)"
	mkdir -p "$(ARTIFACTS_DIR)/bin"
	tmp=$$(mktemp -d) && \
	  tar -xJf "$(CACHE_FILE)" -C "$$tmp" && \
	  install -m 755 "$$tmp"/ffmpeg-*-static/ffmpeg "$(ARTIFACTS_DIR)/bin/ffmpeg" && \
	  rm -rf "$$tmp"
