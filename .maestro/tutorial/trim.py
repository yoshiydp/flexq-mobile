#!/usr/bin/env python3
"""チュートリアル動画（TASK-139）の静止区間を詰める。

Maestro は 1 操作ごとに待ちが入るため、録画には 1〜3 秒の静止が何度も入る。
ffmpeg の freezedetect で静止区間を検出し、次のように残して他を切り捨てる:
  - 冒頭の静止（録画開始〜最初の操作）: 最後の LEAD 秒だけ
  - 途中の静止: 先頭から HOLD 秒まで（画面を読む間）
  - 末尾の静止: 先頭から TAIL 秒まで（編集画面の長さ表示が遅れて更新されるのを含める）

  python3 .maestro/tutorial/trim.py <入力.mp4> <出力.mp4>
"""

import os
import re
import subprocess
import sys

# 環境変数で上書きできる（ヒント動画〈TASK-140〉は再生中の小さな動きやタップの印を静止とみなして
# 切り落とさないよう、record-hints.sh が NOISE を下げ HOLD を伸ばして呼ぶ）
LEAD = float(os.environ.get('TRIM_LEAD', 1.0))
HOLD = float(os.environ.get('TRIM_HOLD', 1.3))
TAIL = float(os.environ.get('TRIM_TAIL', 2.6))
NOISE = float(os.environ.get('TRIM_NOISE', 0.003))
MIN_FREEZE = float(os.environ.get('TRIM_MIN_FREEZE', 0.8))
FFMPEG = 'ffmpeg'


def probe_duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'csv=p=0', path], capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def freezes(path, duration):
    log = subprocess.run([FFMPEG, '-hide_banner', '-i', path, '-vf',
                          f'freezedetect=n={NOISE}:d={MIN_FREEZE}', '-map', '0:v', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'freeze_start: ([0-9.]+)', log)]
    ends = [float(x) for x in re.findall(r'freeze_end: ([0-9.]+)', log)]
    ends += [duration] * (len(starts) - len(ends))  # 末尾まで続く静止は end が出ない
    return list(zip(starts, ends))


def keep_ranges(duration, frozen):
    cut = []
    for i, (s, e) in enumerate(frozen):
        if i == 0 and s <= 0.05:
            cut.append((s, max(s, e - LEAD)))
        elif e >= duration - 0.05:
            cut.append((min(e, s + TAIL), e))
        else:
            cut.append((min(e, s + HOLD), e))
    keep, t = [], 0.0
    for s, e in cut:
        if s > t:
            keep.append((t, s))
        t = max(t, e)
    if t < duration:
        keep.append((t, duration))
    return [(a, b) for a, b in keep if b - a > 0.01]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    duration = probe_duration(src)
    keep = keep_ranges(duration, freezes(src, duration))
    expr = '+'.join(f'between(t,{a:.3f},{b:.3f})' for a, b in keep)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src,
                    '-vf', f"select='{expr}',setpts=N/FRAME_RATE/TB",
                    '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                    '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', dst], check=True)
    print(f'{duration:.1f}s -> {probe_duration(dst):.1f}s ({len(keep)} segments)')


if __name__ == '__main__':
    main()
