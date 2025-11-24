import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  infoWrapper: {
    marginTop: 30,
    textAlign: 'center',
  },
  title: {
    textAlign: 'center',
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 20,
    lineHeight: 30,
    fontWeight: 700,
  },
  dataInfo: {
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    marginTop: 16,
  },
  updateAt: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  seekBarWrapper: {
    marginTop: 32,
  },
  playerControlsWrapper: {
    marginTop: 16,
  },
  volumeSliderWrapper: {
    marginTop: 28,
  },
  repeatButtonPosition: {
    top: -144,
    right: 28,
  },
  text: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
});
