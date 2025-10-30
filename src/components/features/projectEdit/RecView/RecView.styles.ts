import { StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '@/globalStyles';

const screenHeight = Dimensions.get('window').height;

const recordListHeight = screenHeight * 0.4;

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  content: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordListWrapper: {
    width: '95%',
    height: recordListHeight,
    paddingHorizontal: 12,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 8,
  },
  recordListInner: {
    paddingTop: 20,
  },
  recReadySectionWrapper: {
    marginTop: 40,
  },
});
