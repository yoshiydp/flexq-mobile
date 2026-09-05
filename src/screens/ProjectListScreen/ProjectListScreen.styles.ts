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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 一覧コンテナが left: 20 + width: 100% で画面右端まではみ出すため、
  // エラー表示は右側に余白を確保して収める（TASK-97）
  fetchError: {
    paddingRight: 40,
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
});
