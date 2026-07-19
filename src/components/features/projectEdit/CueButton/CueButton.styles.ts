import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
    paddingVertical: 11,
    borderRadius: 2,
    backgroundColor: COLORS.accent.purple,
    opacity: 0.5,
  },
  active: {
    opacity: 1,
  },
  text: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.navigation,
  },
  label: {
    // ユーザー入力文字列を表示するため、小文字・日本語グリフを持つ Noto Sans JP の
    // ボールドを使用する (Bebas Neue は大文字専用かつ日本語非対応)。
    // 時間表示は数字のみのため BebasNeue を維持
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 16,
    lineHeight: 18,
  },
  time: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 16,
  },
});
