import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
    paddingHorizontal: 20,
  },
  recordListWrapper: {
    height: 190,
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 8,
    marginBottom: 20,
  },
  recordListInner: {
    flex: 1,
  },
  recordListContent: {
    paddingTop: 20,
    paddingBottom: 0,
    paddingHorizontal: 12,
  },
  recordListContentEmpty: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    marginTop: -12,
    color: COLORS.font.label,
    fontSize: 15,
    fontFamily: 'NotoSans_400Regular',
  },
  seekBarWrapper: {
    marginTop: 8,
  },
  cueButtonListWrapper: {
    marginTop: 20,
  },
  playerControlsWrapper: {
    marginTop: 20,
  },
  recReadySectionWrapper: {
    alignItems: 'center',
  },
});
