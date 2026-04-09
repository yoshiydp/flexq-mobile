import { StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '@/globalStyles';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default StyleSheet.create({
  container: {
    paddingVertical: 30,
  },
  contentBlockWrapper: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audioContentBox: {
    position: 'relative',
    width: '50%',
  },
  audioTitle: {
    color: COLORS.font.default,
    fontSize: 20,
  },
  audioButtonWrapper: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  changeTrackButtonContainer: {
    width: 110,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.form.default.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.65,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.base.borderDefault,
  },
  modalTitle: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 22,
  },
  modalCloseText: {
    color: COLORS.font.default,
    fontSize: 18,
    paddingHorizontal: 8,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.base.borderDefault,
  },
  trackItemArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.surface.waveform,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackItemTitle: {
    color: COLORS.font.default,
    fontSize: 15,
    flex: 1,
  },
  deleteButton: {
    marginTop: 32,
    marginBottom: 16,
  },
});
