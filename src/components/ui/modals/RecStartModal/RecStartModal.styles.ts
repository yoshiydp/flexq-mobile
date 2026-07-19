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
    width: '90%',
    backgroundColor: COLORS.base.bgDefault,
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    color: COLORS.font.default,
    fontSize: 14,
    fontFamily: 'NotoSans_400Regular',
    textAlign: 'center',
    marginBottom: 16,
  },
  seekSection: {
    marginBottom: 16,
  },
  controls: {
    marginTop: 8,
  },
  optionList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.base.borderDefault,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.base.borderDefault,
  },
  optionItemCustom: {
    borderBottomWidth: 0,
  },
  optionLabel: {
    color: COLORS.font.default,
    fontSize: 14,
    // ユーザー入力の Cue ラベルを表示するため、日本語グリフを持つ Noto Sans JP を使用する
    // (NotoSans_400Regular は Latin 系グリフのみで日本語はフォールバック表示になる)。
    // CueButton のラベルとウェイトを揃えてボールドにする
    fontFamily: 'NotoSansJP_700Bold',
  },
  optionTime: {
    color: COLORS.font.label,
    fontSize: 13,
    fontFamily: 'NotoSans_400Regular',
  },
  aiCleanupToggleWrapper: {
    marginTop: 12,
    paddingHorizontal: 8,
  },
  cancelButton: {
    marginTop: 20,
    backgroundColor: COLORS.form.default.background,
  },
  cancelButtonLabel: {
    color: COLORS.font.navigation,
  },
});
