import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

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
  audioExt: {
    position: 'absolute',
    top: -40,
    left: 96,
    padding: 4,
    textAlign: 'center',
    color: COLORS.font.default,
    fontSize: 14,
    borderRadius: 2,
    backgroundColor: COLORS.font.label,
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
});
