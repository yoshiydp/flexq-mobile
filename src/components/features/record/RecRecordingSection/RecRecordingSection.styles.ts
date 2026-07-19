import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timer: {
    textAlign: 'center',
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 55,
  },
  stopButton: {
    position: 'relative',
    marginTop: 20,
    width: 62,
    height: 62,
  },
  stopButtonCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 62,
    height: 62,
    borderWidth: 4,
    borderColor: COLORS.action.record,
    borderRadius: '50%',
  },
  stopButtonInnerSquare: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 26,
    height: 26,
    backgroundColor: COLORS.action.record,
    borderRadius: 4,
  },
});
