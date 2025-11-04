import { StyleSheet } from 'react-native';
import { COLORS } from '@/globalStyles';

export default StyleSheet.create({
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 80,
    backgroundColor: COLORS.base.bgDefault,
  },
  appLogoContainer: {
    alignSelf: 'center',
  },
  formControlContainer: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 16,
    marginTop: 40,
  },
  signInButtonWrapper: {
    marginTop: 48,
  },
});
