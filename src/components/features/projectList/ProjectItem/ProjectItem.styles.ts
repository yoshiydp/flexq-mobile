import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 12,
    marginBottom: 24,
  },
  artworkContainer: {
    width: 120,
    height: 120,
    borderRadius: 4,
    overflow: 'hidden',
  },
  artwork: {
    width: 120,
    height: 120,
  },
  infoContainer: {
    flex: 1,
    paddingRight: 56,
  },
  projectName: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
    flexShrink: 1,
  },
  soundSourceName: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
    flexShrink: 1,
  },
  tags: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    flexShrink: 1,
  },
  updatedAt: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    flexShrink: 1,
  },
  iconContainer: {
    position: 'absolute',
    top: 0,
    right: 10,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  icon: {
    color: COLORS.icon.default,
  },
  artworkLoadingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
