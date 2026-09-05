import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

// container の左右パディング。メニューのオーバーレイを画面全幅に広げる計算に使う（TASK-92）
export const HEADER_HORIZONTAL_PADDING = 8;

export default StyleSheet.create({
  container: {
    height: 70,
    backgroundColor: COLORS.base.bgDefault,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    position: 'relative',
  },
  // メニュー表示中に画面外タップを拾う透明オーバーレイ（TASK-92）
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: -HEADER_HORIZONTAL_PADDING,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  button: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },
  defaultColor: {
    color: COLORS.icon.default,
  },
  primaryColor: {
    color: COLORS.accent.goldPrimary,
  },
  headerTitle: {
    fontFamily: 'BebasNeue',
    color: COLORS.icon.default,
    fontSize: 28,
  },
  iconAngleLeft: {
    marginRight: 3,
    marginBottom: 2,
  },
});
