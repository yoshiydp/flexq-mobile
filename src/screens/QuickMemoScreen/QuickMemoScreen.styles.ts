import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';
import { KEYBOARD_CHECKMARK_BUTTON_SIZE } from '@/constants/keyboardCheckmarkButton';

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
    width: KEYBOARD_CHECKMARK_BUTTON_SIZE,
    height: KEYBOARD_CHECKMARK_BUTTON_SIZE,
    borderRadius: KEYBOARD_CHECKMARK_BUTTON_SIZE / 2,
    backgroundColor: COLORS.accent.goldPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
