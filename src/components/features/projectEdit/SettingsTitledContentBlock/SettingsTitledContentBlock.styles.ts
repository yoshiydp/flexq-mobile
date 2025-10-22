import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  heading: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 30,
    borderBottomColor: COLORS.base.borderWhite,
    borderBottomWidth: 1,
  },
  content: {
    marginTop: 18,
  },
});
