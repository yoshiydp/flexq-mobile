import { verificationCodeFailureMessage } from './verificationCode';

describe('verificationCodeFailureMessage', () => {
  it('コード不一致の文言を返す', () => {
    expect(verificationCodeFailureMessage('code_invalid')).toContain(
      '正しくありません',
    );
  });

  it('期限切れ・試行超過は再送を促す文言を返す', () => {
    expect(verificationCodeFailureMessage('code_expired')).toContain('再送');
    expect(verificationCodeFailureMessage('code_attempts_exceeded')).toContain(
      '再送',
    );
  });

  it('認証コード起因でない理由は null を返す（既存エラー処理に委ねる）', () => {
    expect(verificationCodeFailureMessage(undefined)).toBeNull();
    expect(verificationCodeFailureMessage('other')).toBeNull();
    expect(verificationCodeFailureMessage(null)).toBeNull();
  });
});
