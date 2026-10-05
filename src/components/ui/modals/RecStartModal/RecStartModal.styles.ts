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
    // 画面の高さを超えないようにする（超える分は optionList がスクロールする）
    maxHeight: '84%',
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
  optionListWrapper: {
    // 中身の高さまでしか広がらず、container の maxHeight に達したら縮んでスクロールする
    flexGrow: 0,
    flexShrink: 1,
    borderTopWidth: 1,
    borderTopColor: COLORS.base.borderDefault,
  },
  optionList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollbarTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.base.borderDefault,
  },
  scrollbarThumb: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.form.default.border,
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
  optionItemSelected: {
    backgroundColor: COLORS.form.default.background,
  },
  optionLabel: {
    color: COLORS.font.default,
    fontSize: 14,
    // ユーザー入力の Cue ラベルを表示するため、日本語グリフを持つ Noto Sans JP を使用する
    // (NotoSans_400Regular は Latin 系グリフのみで日本語はフォールバック表示になる)。
    // CueButton のラベルとウェイトを揃えてボールドにする
    fontFamily: 'NotoSansJP_700Bold',
  },
  optionLabelSelected: {
    color: COLORS.accent.goldPrimary,
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
  startButton: {
    marginTop: 20,
  },
  startButtonLabel: {
    fontSize: 32,
  },
  cancelButton: {
    marginTop: 12,
    backgroundColor: COLORS.form.default.background,
  },
  cancelButtonLabel: {
    color: COLORS.font.navigation,
  },
});
