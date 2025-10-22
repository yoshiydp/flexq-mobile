import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  content: {
    flex: 1,
  },
  recHeaderButton: {
    position: 'absolute',
    top: 0, // HeaderToolBar の位置
    left: 0,
    right: 0,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    // 必要なら背景や影など調整
    // backgroundColor: '#000',
  },
});
