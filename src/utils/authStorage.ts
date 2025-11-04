import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export async function saveAuthTokens(token: {
  accessToken: string;
  refreshToken: string;
}) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token.refreshToken);
}

export async function getAccessToken() {
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAuthTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
