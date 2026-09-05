import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 20,
    paddingTop: 150,
    marginBottom: 200,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 80,
    rowGap: 24,
  },
  emptyText: {
    color: COLORS.font.label,
    fontSize: 14,
  },
  addButton: {
    width: '90%',
  },
  // ADD TRACK ボタン直下の形式の案内（mp3 推奨）
  emptyHint: {
    // rowGap（24）だとボタンから離れすぎるため、案内文だけ間隔を詰める
    marginTop: -12,
    paddingHorizontal: 40,
    color: COLORS.font.label,
    fontSize: 12,
    textAlign: 'center',
  },
});
