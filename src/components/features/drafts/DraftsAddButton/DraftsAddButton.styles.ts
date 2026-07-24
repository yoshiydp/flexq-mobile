import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 315,
    paddingTop: 20,
    paddingBottom: 12,
    borderStyle: 'solid',
    borderWidth: 4,
    borderColor: COLORS.accent.purple,
    borderRadius: 8,
  },
  label: {
    // BebasNeue は単一ウェイトのため fontWeight は指定しない
    // （iOS は無視・Android は擬似ボールド合成となり見た目が食い違う）
    fontFamily: 'BebasNeue',
    color: COLORS.accent.purple,
    fontSize: 30,
    lineHeight: 30,
  },
  icon: {
    color: COLORS.accent.purple,
  },
});
