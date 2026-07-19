import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    position: 'relative',
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 64,
    backgroundColor: COLORS.base.bgDefault,
  },
  titleContainer: {
    flexDirection: 'column',
    paddingTop: 30,
    paddingLeft: 10,
    paddingRight: 50,
    marginBottom: 24,
  },
  title: {
    fontFamily: 'BebasNeue',
    fontSize: 100,
    lineHeight: 100,
    color: COLORS.font.pageTitle,
    marginRight: 10,
  },
});
