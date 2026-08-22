import { useEffect, useState } from 'react';

// 認証コード再送ボタンのカウントダウン管理 (TASK-85)。
// start(seconds) で開始し、secondsLeft が 0 になるまで 1 秒ごとに減算する。
export function useResendCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = (seconds: number) => setSecondsLeft(seconds);

  return { secondsLeft, canResend: secondsLeft <= 0, start };
}
