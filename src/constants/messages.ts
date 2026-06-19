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
    submitButtonLabel: 'OK',
  },
  confirmLogout: {
    message: 'このままログアウトしても良いですか？',
    description:
      '現現在のアカウントで作成されたプロジェクト、トラック、プロフィールデータは自動保存されますので、再度サインインしてもデータは保持されます。',
    submitButtonLabel: 'OK',
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
};
