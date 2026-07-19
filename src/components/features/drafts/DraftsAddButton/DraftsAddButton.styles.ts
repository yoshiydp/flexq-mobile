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
    fontFamily: 'BebasNeue',
    color: COLORS.accent.purple,
    fontSize: 30,
    fontWeight: 'bold',
    lineHeight: 30,
  },
  icon: {
    color: COLORS.accent.purple,
  },
});
