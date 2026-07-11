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
  submitButton: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sourceSegmentWrapper: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: -36,
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sourceSegmentItem: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: COLORS.form.default.background,
  },
  sourceSegmentItemActive: {
    backgroundColor: COLORS.accent.goldPrimary,
  },
  sourceSegmentLabel: {
    color: COLORS.font.navigation,
    fontSize: 12,
  },
  sourceSegmentLabelActive: {
    color: COLORS.font.pageTitle,
    fontWeight: 'bold',
  },
  aiCleanupWrapper: {
    marginTop: 28,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  aiCleanupButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent.goldPrimary,
  },
  aiCleanupButtonDisabled: {
    opacity: 0.3,
  },
  aiCleanupButtonLabel: {
    color: COLORS.accent.goldPrimary,
    fontSize: 14,
  },
  aiCleanupProcessing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    gap: 8,
  },
  aiCleanupProcessingText: {
    color: COLORS.font.default,
    fontSize: 13,
  },
  aiCleanupHint: {
    marginTop: 6,
    color: COLORS.font.label,
    fontSize: 11,
  },
});
