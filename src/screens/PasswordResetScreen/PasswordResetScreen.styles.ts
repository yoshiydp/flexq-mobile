import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 16,
    marginTop: 32,
    paddingHorizontal: 20,
  },
  submitButton: {
    marginHorizontal: 20,
    marginTop: 40,
  },
});
