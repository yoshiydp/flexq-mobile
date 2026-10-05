export const REC_LABELS = {
  emptyState: '録音データがありません',
  readyInstruction:
    'デバイスのマイク、または外部接続のマイクに近づいてからRECボタンをタップして下さい',
  startModalTitle: '録音開始位置を選択',
  fromBeginning: 'はじめから',
  currentPosition: '現在位置',
  startButton: 'REC START',
};

export const TRACK_UPLOAD_LABELS = {
  // wav も引き続きサポートするが、ファイルサイズが大きくアップロードに時間がかかるため
  // 追加シート・空状態で mp3 を推奨する旨を案内する (TASK-94)
  formatHint:
    'mp3 推奨（wav はファイルサイズが大きくアップロードに時間がかかります）',
  formatHintShort: 'mp3 推奨（wav は時間がかかります）',
  uploading: '音源データをアップロード中…',
  uploadingProgress: (percent: number) =>
    `音源データをアップロード中… ${percent}%`,
};

export const SEPARATION_LABELS = {
  button: 'AI クリーンアップ',
  processing: '処理中…',
  unsavedHint: '保存すると実行できます',
  original: '元の録音',
  cleaned: '声のみ',
  toggleLabel: 'AI クリーンアップ',
  startFailed: 'AI クリーンアップの開始に失敗しました。',
  failed: 'AI クリーンアップに失敗しました。時間をおいて再度お試しください。',
  // サーバー側で AI クリーンアップが未設定のとき（503）。再試行しても回復しないため
  // 「開始に失敗」ではなく利用不可の案内を出す (TASK-88)
  unavailable: 'AI クリーンアップは現在ご利用いただけません。復旧までしばらくお待ちください。',
};

export const SHARE_LABELS = {
  failed: '共有の準備に失敗しました。時間をおいて再度お試しください。',
  // Android は共有シートに「ファイルに保存」相当の項目がないため、
  // 共有とデバイス保存を選択肢として提示する (TASK-55)
  chooseActionTitle: '共有・保存',
  actionShare: '共有',
  actionSave: 'デバイスに保存',
  actionCancel: 'キャンセル',
  saveDoneTitle: '保存完了',
  saveDone: '選択したフォルダに保存しました。',
  saveFailed: 'デバイスへの保存に失敗しました。時間をおいて再度お試しください。',
};

export const MIX_LABELS = {
  chooseTitle: '共有する音源',
  chooseSaveTitle: '保存する音源',
  shareCurrent: '再生中の音源',
  shareMix: 'ミックス版（声＋トラック）',
  cancel: 'キャンセル',
  failed: 'ミックス版の作成に失敗しました。時間をおいて再度お試しください。',
};

export const REC_PERMISSION_MESSAGES = {
  micPermissionDenied:
    'マイクの使用が許可されていないため録音できません。設定アプリからこのアプリのマイクへのアクセスを許可してください。',
  recordingStartFailed:
    '録音を開始できませんでした。もう一度お試しください。',
  trackPlaybackFailed:
    'トラックの再生を開始できませんでした。もう一度お試しください。',
};

/**
 * Android はバックグラウンドでのマイクアクセスが OS に制限される（Android 14 以降は
 * microphone 型のフォアグラウンドサービスが必須）ため、録音中にバックグラウンドへ
 * 移ったら録音を停止して、そこまでの録音を保存経路へ渡す。バックグラウンド中の
 * Alert は表示されないため、フォアグラウンド復帰時に案内する (TASK-112)
 *
 * 停止した時点ではテイクはまだ永続化されていない（呼び出し元は録音再生画面へ
 * 遷移するだけで、アップロードは画面下部の「SAVE」ボタンで実行される）ため、
 * 案内では保存操作が必要であることを明示する。停止に失敗した場合・保存できる
 * 長さがない場合はテイクが破棄されるため `cancelledBeforeStart` を使う
 */
export const REC_BACKGROUND_MESSAGES = {
  noticeTitle: 'お知らせ',
  stoppedNeedsSave:
    'バックグラウンドに移動したため録音を停止しました。ここまでの録音は再生して確認できます。残す場合は「SAVE」ボタンで保存してください。',
  cancelledBeforeStart:
    'バックグラウンドに移動したため録音を中止しました。もう一度 REC ボタンから録音してください。',
};

export const HEADPHONE_LABELS = {
  wired: '有線イヤホン接続中',
  bluetooth: 'Bluetoothイヤホン接続中',
  // Android 12+ で「付近のデバイス」が未許可のときの表示（TASK-115）
  bluetoothDetectionOff: 'Bluetooth 検知オフ',
  bluetoothDetectionOffHint:
    '端末の設定で「付近のデバイス」を許可すると Bluetooth イヤホンを検知できます',
};

// Android 12+ の BLUETOOTH_CONNECT 権限ダイアログの前に出す事前説明（TASK-115）
export const BLUETOOTH_PERMISSION_MESSAGES = {
  rationaleTitle: 'Bluetooth イヤホンの検知',
  rationaleBody:
    'Bluetooth イヤホンの接続を検知して録音の同期補正に使います。次の画面で「付近のデバイス」へのアクセスを許可してください。',
  allow: '許可する',
  notNow: '今はしない',
};

export const SYNC_PLAYBACK_LABELS = {
  toggleLabel: 'トラック同時再生',
  headphonesRequired: 'イヤホン（有線 / Bluetooth）接続時に使用できます',
  // スピーカーで録音したテイク（recordedWithHeadphones: none）の「元の録音」は
  // トラックのかぶり音が入っているため同時再生を無効化する (TASK-126)
  speakerTakeOriginal: 'スピーカーで録音したテイクは「声のみ」で使用できます',
  noTrack: 'プロジェクトにトラック音源がないため同時再生できません。',
  loadFailed: 'トラック音源の読み込みに失敗しました。',
  // ローカルキャッシュへのダウンロードに 2 回（最新 URL の再取得込み）失敗し、
  // ストリーミング再生に切り替えたときの案内 (TASK-117)
  streamingFallback:
    'トラック音源のダウンロードに失敗したため、ストリーミングで再生します。出だしが引っかかる場合は、通信環境と端末の空き容量を確認して録音を開き直してください。',
};

export const RECORD_PLAYBACK_LABELS = {
  // 元の録音 / 声のみ音源のローカルキャッシュへのダウンロードに 2 回
  // （最新 URL の再取得込み）失敗し、ストリーミング再生に切り替えたときの案内 (TASK-117)
  streamingFallback:
    '音源のダウンロードに失敗したため、ストリーミングで再生します。冒頭が途切れる場合は、通信環境と端末の空き容量を確認して録音を開き直してください。',
};

export const FETCH_ERROR_MESSAGES = {
  // 一覧取得の失敗時に表示する文言（TASK-97 / CM-01）。
  // 現状このアプリは日本語固定で、文言はこのファイルに集約する方針のため
  // i18n ライブラリは導入せずここに追加する
  offline: '通信できません。接続を確認してください',
  offlineDescription: '機内モードや電波状況を確認して、再度お試しください。',
  failed: 'データを取得できませんでした',
  failedDescription: '時間をおいて再度お試しください。',
  retry: '再試行',
};

export const MODAL_MESSAGES = {
  confirmProjectEditSave: {
    message: '編集中のプロジェクトを保存してプロジェクトリストに戻りますか？',
    description:
      '編集中のデータを保存するため、完了までに数秒かかる場合があります。',
  },
  confirmDeleteTrack: {
    message: 'このトラックを削除してもいいですか？',
    description:
      'プロジェクトの音源に設定している場合、再度プロジェクト編集で音源を設定し直す必要があります。',
    linkedProjectsWarning: (count: number) =>
      `このトラックは ${count} 個のプロジェクトで使用されています。削除するとプロジェクトの音源も再生できなくなります。`,
    submitButtonLabel: 'OK',
  },
  confirmLogout: {
    message: 'このままログアウトしても良いですか？',
    description:
      '現現在のアカウントで作成されたプロジェクト、トラック、プロフィールデータは自動保存されますので、再度サインインしてもデータは保持されます。',
    submitButtonLabel: 'OK',
  },
  confirmDeleteAccount: {
    message: 'アカウントを削除しますか？',
    description:
      'プロジェクト、トラック、録音データ、メモ、プロフィールなどすべてのデータが完全に削除されます。削除したデータは復元できません。',
    submitButtonLabel: 'OK',
  },
  confirmDeleteAccountFinal: {
    message: '本当にアカウントを削除しますか？',
    description:
      'この操作は取り消せません。削除が完了するとログイン画面に戻り、同じアカウントでログインできなくなります。',
    submitButtonLabel: 'OK',
  },
  deleteAccountFailed: {
    title: 'エラー',
    message:
      'アカウントの削除に失敗しました。時間をおいて再度お試しください。',
  },
  confirmRemoveLink: {
    message: (service: string) => `${service}のアカウント連携を解除しますか？`,
    description: '再度プロフィール画面でアカウント連携が可能です。',
    submitButtonLabel: 'OK',
  },
  confirmLinkAccount: {
    placeholder: (service: string) => `${service}のユーザー名を入力`,
    submitButtonLabel: 'SAVE',
  },
  confirmQuickMemoGoBack: {
    message: '編集中のメモは保存されませんが、よろしいですか？',
    submitButtonLabel: 'OK',
  },
  confirmDeleteMemo: {
    message: 'このメモを削除してもいいですか？',
    description: '削除したメモは復元できません。',
    submitButtonLabel: 'OK',
  },
  confirmDeleteProject: {
    message: 'このプロジェクトを削除してもいいですか？',
    description: 'このプロジェクトに紐づいているRecデータも全て削除されます。削除したデータは復元できませんのでご注意ください。',
    submitButtonLabel: 'OK',
  },
  confirmRecordPlayerGoBack: (source?: string) => {
    if (source === 'Drafts') {
      return {
        message: '録音データを保存せずに終了しますか？',
        description: '再度レコーディング画面で録音が可能です。',
        submitButtonLabel: 'OK',
      };
    }
    return {
      message: '編集内容を保存せずに終了しますか？',
      description: '編集された内容は下書きにはならずに破棄されます。',
      submitButtonLabel: 'OK',
    };
  },
  confirmRecordDelete: {
    message: 'この録音データを削除してもいいですか？',
    description: '削除した録音データは復元できません。',
    submitButtonLabel: 'OK',
  },
  confirmAllCueReset: {
    message: 'ALL CUE RESET',
    description: '全てのCUEポイントをリセットしますか？',
    submitButtonLabel: 'OK',
  },
  reviewPrompt: {
    message: 'FlexQ を楽しんでいただけていますか？',
    description: 'よろしければストアでのレビューにご協力ください。',
    submitButtonLabel: 'レビューする',
    closeLabel: 'あとで',
  },
};
