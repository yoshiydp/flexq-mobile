import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

// 文字サイズを最大まで大きくしても 1 ページの内容が読める範囲に収めるための上限倍率
export const MAX_FONT_SCALE = 1.6;

export default StyleSheet.create({
  overlay: {
    flex: 1,
    // 初回の案内なので一覧の上でも内容に集中できるよう、通常のモーダルより濃く覆う
    backgroundColor: 'rgba(13, 13, 13, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '88%',
    maxWidth: 420,
    // 画面の高さを超えない（超える分は内容の ScrollView でスクロールする）
    maxHeight: '90%',
    backgroundColor: COLORS.accent.purple,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  scrollContent: {
    alignItems: 'center',
  },
  title: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 20,
    lineHeight: 28,
    color: COLORS.font.default,
    textAlign: 'center',
  },
  lead: {
    fontFamily: 'NotoSans_400Regular',
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.font.default,
    textAlign: 'center',
  },
  points: {
    alignSelf: 'stretch',
    marginTop: 20,
    rowGap: 14,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
  },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.base.bgDefault,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointIconGlyph: {
    color: COLORS.accent.goldPrimary,
  },
  pointBody: {
    flex: 1,
  },
  pointLabel: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 20,
    lineHeight: 22,
    color: COLORS.accent.goldPrimary,
  },
  pointDescription: {
    fontFamily: 'NotoSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.font.default,
  },
  videoFrame: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
    overflow: 'hidden',
    backgroundColor: COLORS.base.bgDefault,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  dots: {
    flexDirection: 'row',
    columnGap: 8,
    marginTop: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dotActive: {
    backgroundColor: COLORS.accent.goldPrimary,
  },
  buttonWrapper: {
    flexDirection: 'row',
    // 文字サイズを大きくしてボタンが横に並ばないときは 2 段に折り返す
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 16,
    rowGap: 10,
    marginTop: 18,
  },
  // ラベルが日本語のため BaseModal の日本語ボタン（NotoSansJP ボールド + 上下中央）に揃える。
  // SubmitButton は既定で高さ 52 に固定されており、Android では Noto Sans JP のフォント余白で
  // 中身が伸びる CancelButton とだけ高さが変わり、ラベルも上下にずれていた。固定の高さを外し、
  // 同じ行の 2 つのボタンが行の高さにそろうようにする（flexWrap の行内で stretch される）
  buttonContainer: {
    height: 'auto',
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
  },
  // 行の高さは固定しない（文字サイズを大きくしたときにラベルの上下が切れるため）。
  // Android はフォントの上下の余白を除いて中央に置く（iOS では無視されるプロパティ）
  buttonText: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 15,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.form.default.background,
  },
  cancelButtonText: {
    color: COLORS.font.navigation,
  },
  submitButton: {
    backgroundColor: COLORS.accent.goldPrimary,
  },
  submitButtonText: {
    color: COLORS.accent.purple,
  },
  // PROFILE の「HOW TO USE」の一覧（TASK-140）
  guideList: {
    alignSelf: 'stretch',
    marginTop: 20,
    rowGap: 10,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(13, 13, 13, 0.35)',
  },
  // 見出しに日本語が入るため BebasNeue（英字のみ）ではなく NotoSansJP にする
  guideLabel: {
    fontFamily: 'NotoSansJP_700Bold',
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.accent.goldPrimary,
  },
  guideItemPressed: {
    opacity: 0.7,
  },
  guideChevron: {
    color: COLORS.font.default,
    opacity: 0.6,
  },
});
