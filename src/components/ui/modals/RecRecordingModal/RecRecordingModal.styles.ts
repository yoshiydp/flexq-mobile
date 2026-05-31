import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.base.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '85%',
    minHeight: 195,
    backgroundColor: COLORS.navigation.bg,
    borderRadius: 8,
    padding: 24,
  },
  containerWithLyrics: {
    justifyContent: 'flex-start',
  },
  lyricsContainer: {
    width: '100%',
    height: 200,
    marginBottom: 16,
  },
});
