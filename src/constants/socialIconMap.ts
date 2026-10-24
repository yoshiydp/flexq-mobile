// TODO: X連携を実装したら x: XIcon のコメントアウトを解除する
// import XIcon from '@/assets/icons/x-icon.svg';

// TODO: Instagram連携を実装したら instagram: InstagramIcon のコメントアウトを解除する
// import InstagramIcon from '@/assets/icons/instagram-icon.svg';

import GoogleIcon from '@/assets/icons/google-icon.svg';
import AppleIcon from '@/assets/icons/apple-icon.svg';

export const SOCIAL_ICON_MAP = {
  // TODO: X連携を実装したら下記を追加する
  // x: XIcon,

  // TODO: Instagram連携を実装したら下記を追加する
  // instagram: InstagramIcon,

  google: GoogleIcon,
  // Apple ID 連携（TASK-132）。連携できるのは iOS のみだが、Android でも連携済みの
  // 表示と socialAccounts の保存内容を保つため一覧には常に含める（useLinkAppleAccount 参照）
  apple: AppleIcon,
} as const;
