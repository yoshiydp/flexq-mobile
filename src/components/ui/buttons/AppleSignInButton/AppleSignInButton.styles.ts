import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    // 上の Google ボタンとの間隔（詰めすぎると 2 つのボタンが 1 つに見える）
    marginTop: 20,
  },
  button: {
    // 隣の Google ボタン・SubmitButton と同じ高さに揃える
    height: 52,
    width: '100%',
  },
});
