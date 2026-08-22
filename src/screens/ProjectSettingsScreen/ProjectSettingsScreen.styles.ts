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
  deleteButton: {
    marginTop: 32,
    marginBottom: 16,
  },
});
