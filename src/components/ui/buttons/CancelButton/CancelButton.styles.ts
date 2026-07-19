import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.button.bgCancel,
  },
  label: {
    fontFamily: 'BebasNeue',
    color: COLORS.form.default.text,
    fontSize: 32,
  },
});
