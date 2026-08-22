import { StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '@/globalStyles';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default StyleSheet.create({
  // RN の Modal を使わず絶対配置で重ねる（TrackPickerModal の Modal 内からも
  // 開くため、Modal のネストを避ける必要がある）
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    backgroundColor: COLORS.form.default.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.9,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.base.borderDefault,
  },
  headerTitle: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 22,
  },
  closeText: {
    color: COLORS.font.default,
    fontSize: 18,
    paddingHorizontal: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  artworkContainer: {
    alignItems: 'center',
  },
  artworkImage: {
    width: 160,
    height: 160,
    borderRadius: 8,
  },
  artworkPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 8,
    backgroundColor: COLORS.surface.waveform,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.base.borderDefault,
  },
  artworkActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  artworkActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.form.default.border,
    borderRadius: 6,
  },
  artworkActionText: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.default,
    fontSize: 15,
    letterSpacing: 1,
  },
  artworkHint: {
    color: COLORS.font.label,
    fontSize: 13,
    marginTop: 12,
  },
  sectionLabel: {
    fontFamily: 'BebasNeue',
    color: COLORS.font.label,
    fontSize: 18,
    marginBottom: 8,
    marginTop: 28,
  },
  titleInput: {
    height: 52,
    borderWidth: 1,
    borderColor: COLORS.form.default.border,
    borderRadius: 8,
    backgroundColor: COLORS.base.bgDefault,
    color: COLORS.form.default.text,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },
  fileName: {
    flex: 1,
    color: COLORS.font.label,
    fontSize: 13,
  },
  submitButton: {
    marginHorizontal: 20,
    marginBottom: 28,
  },
});
