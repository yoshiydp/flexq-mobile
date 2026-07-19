import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 315,
    paddingTop: 20,
    paddingBottom: 12,
    borderStyle: 'solid',
    borderWidth: 4,
    borderColor: COLORS.accent.purple,
    borderRadius: 8,
  },
  label: {
    // フォント自体がボールド (700Bold) のため fontWeight 指定は不要
    fontFamily: 'NotoSansJP_700Bold',
    color: COLORS.accent.purple,
    fontSize: 30,
    lineHeight: 30,
  },
  icon: {
    color: COLORS.accent.purple,
  },
});
