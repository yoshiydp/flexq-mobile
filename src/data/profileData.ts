export const PROFILE_DATA = {
  thumbnail: 'https://lyrics-mock-assets.s3.ap-northeast-1.amazonaws.com/images/sample/profile.jpg',
  username: 'User Profile Name',
  email: 'testuser@example.com',
  socialAccounts: [
    // TODO: X連携を実装したら下記を追加する
    // { provider: 'x', username: '@user_name', isLinked: true },

    // TODO: Instagram連携を実装したら下記を追加する
    // { provider: 'instagram', username: '', isLinked: false },

    { provider: 'google', username: '', isLinked: false },
  ],
};
