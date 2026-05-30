import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  richText: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navigation.bg,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navigation.bg,
    paddingVertical: 4,
  },
  toolbarFlex: {
    flex: 1,
  },
  micButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
