import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    width: 150,
    height: 150,
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 4,
    marginHorizontal: 'auto',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  uploadButton: {
    position: 'absolute',
    bottom: -12,
    right: -12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    backgroundColor: COLORS.icon.navigation,
    borderRadius: '50%',
    padding: 5,
  },
  uploadButtonIcon: {
    color: COLORS.accent.purple,
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
