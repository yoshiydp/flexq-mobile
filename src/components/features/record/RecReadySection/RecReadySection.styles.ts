import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  textWrapper: {
    width: '100%',
    maxWidth: 300,
    padding: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.base.borderDefault,
  },
  text: {
    color: COLORS.font.default,
    fontFamily: 'NotoSans_400Regular',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 21,
    textAlign: 'center',
  },
  readyButton: {
    position: 'relative',
    marginTop: 40,
    width: 62,
    height: 62,
  },
  readyButtonCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 62,
    height: 62,
    borderWidth: 4,
    borderColor: COLORS.action.record,
    borderRadius: '50%',
  },
  readyButtonInnerCircle: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 46,
    height: 46,
    backgroundColor: COLORS.action.record,
    borderRadius: '50%',
  },
});
