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
    width: '85%',
    backgroundColor: COLORS.accent.purple,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  buttonWrapper: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: 24,
    marginTop: 20,
  },
  buttonContainer: {
    minWidth: 86,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 0,
  },
  buttonText: {
    fontSize: 28,
    lineHeight: 28,
  },
  // 日本語ラベル用（BebasNeue は Latin 専用のため NotoSansJP ボールドに切替）。
  // BebasNeue 向けの非対称パディング（paddingTop: 7）を打ち消して上下中央に配置する
  buttonContainerJa: {
    paddingTop: 7,
    paddingBottom: 7,
  },
  buttonTextJa: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 16,
    lineHeight: 22,
  },
  cancelButton: {
    backgroundColor: COLORS.form.default.background,
  },
  cancelButtonText: {
    color: COLORS.accent.purple,
  },
  submitButton: {
    backgroundColor: COLORS.accent.goldPrimary,
  },
  submitButtonText: {
    color: COLORS.accent.purple,
  },
});
