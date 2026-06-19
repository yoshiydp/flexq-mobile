import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    paddingHorizontal: 8,
  },
  text: {
    fontFamily: 'NotoSans_400Regular',
    color: COLORS.font.default,
  },
  message: {
    fontSize: 18,
    fontWeight: 700,
  },
  description: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
  },
  centered: {
    textAlign: 'center',
  },
});
