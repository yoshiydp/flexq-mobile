import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  inputContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  bodyInputWrapper: {
    flex: 1,
    marginTop: 16,
  },
  submitButton: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  checkmarkButton: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent.goldPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
