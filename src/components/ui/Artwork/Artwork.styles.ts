import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    backgroundColor: COLORS.base.bgDefault,
  },
  artwork: {
    width: 260,
    height: 260,
    borderRadius: 4,
    marginHorizontal: 'auto',
  },
  loadingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
