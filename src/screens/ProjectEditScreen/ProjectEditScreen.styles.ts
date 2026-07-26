import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';
import { KEYBOARD_CHECKMARK_BUTTON_SIZE } from '@/constants/keyboardCheckmarkButton';

export default StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  content: {
    flex: 1,
  },
  recHeaderButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  lyricsCloseButton: {
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
