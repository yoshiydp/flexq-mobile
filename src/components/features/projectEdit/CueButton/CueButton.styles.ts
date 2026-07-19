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
    // 小文字・日本語グリフを持つ Noto Sans JP のボールドを使用する
    // (以前の Bebas Neue は大文字専用かつ日本語非対応だった)
    fontFamily: 'NotoSansJP_700Bold',
    color: COLORS.font.navigation,
  },
  label: {
    fontSize: 16,
    lineHeight: 18,
  },
  time: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 16,
  },
});
