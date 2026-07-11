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
    paddingTop: 10,
    paddingBottom: 20,
  },
  titleInputWrapper: {
    marginHorizontal: 20,
  },
  seekBarWrapper: {
    marginTop: 60,
  },
  playerControlsWrapper: {
    marginTop: 16,
  },
  repeatButtonPosition: {
    position: 'static',
  },
  volumeSliderWrapper: {
    marginTop: 28,
  },
  syncPlaybackWrapper: {
    marginTop: 28,
    marginHorizontal: 20,
  },
  syncToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncToggleLabel: {
    color: COLORS.font.default,
    fontSize: 14,
  },
  syncHintText: {
    marginTop: 8,
    color: COLORS.font.label,
    fontSize: 12,
  },
  trackVolumeSliderWrapper: {
    marginTop: 16,
    marginHorizontal: -20,
  },
  submitButton: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
});
