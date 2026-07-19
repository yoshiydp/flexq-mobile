import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  heading: {
    fontFamily: 'NotoSansJP_700Bold',
    color: COLORS.font.default,
    fontSize: 30,
    lineHeight: 36,
    borderBottomColor: COLORS.base.borderWhite,
    borderBottomWidth: 1,
  },
  content: {
    marginTop: 18,
  },
});
