// 撮影用の一定時間の待ち（WAIT_MS ミリ秒）。録音中は画面のタイマーが動き続け、Maestro の要素の読み取り
// （waitForAnimationToEnd / extendedWaitUntil）が大きく遅れるため、端末に触れずにこちらで待つ
const end = Date.now() + Number(WAIT_MS);
while (Date.now() < end) {
  // busy wait
}
