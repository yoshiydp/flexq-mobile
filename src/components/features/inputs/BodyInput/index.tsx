import React from 'react';
import {
  Button,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  RichEditor,
  RichToolbar,
  actions,
} from 'react-native-pell-rich-editor';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { styles } from './BodyInput.styles';

// iOS の WebView は contenteditable の最初のキー入力で autocapitalize が干渉し、
// 英字が大文字になったり日本語IMEがアルファベット入力になる問題がある。
// エディタ要素に autocapitalize="none" を設定することで回避する。
const INJECTED_JS = `
  (function() {
    var interval = setInterval(function() {
      var el = document.getElementById('zss_editor_content');
      if (el) {
        el.setAttribute('autocapitalize', 'none');
        clearInterval(interval);
      }
    }, 50);
  })();
  true;
`;

interface BodyInputProps {
  editorRef?: React.Ref<RichEditor>;
  value: string;
  onChangeText: (text: string) => void;
  richEditorAddStyle?: any;
  isEditing?: boolean;
}

export default function BodyInput({
  editorRef,
  value,
  onChangeText,
  richEditorAddStyle,
  isEditing,
}: BodyInputProps) {
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {isEditing && (
        <View style={styles.toolbarRow}>
          <RichToolbar
            editor={editorRef}
            style={[styles.toolbar, styles.toolbarFlex]}
            actions={[
              actions.setBold,
              actions.setItalic,
              actions.insertBulletsList,
              actions.insertOrderedList,
            ]}
            iconMap={{
              [actions.setBold]: () => <Button title="B" onPress={() => {}} />,
              [actions.setItalic]: () => <Button title="I" onPress={() => {}} />,
              [actions.insertBulletsList]: () => (
                <Button title="•" onPress={() => {}} />
              ),
              [actions.insertOrderedList]: () => (
                <Button title="1." onPress={() => {}} />
              ),
            }}
          />
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => Keyboard.dismiss()}
          >
            <Text style={styles.doneButtonText}>完了</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <RichEditor
          ref={editorRef}
          editorStyle={{
            ...styles.richEditor,
            placeholderColor: '#666',
            ...(richEditorAddStyle ? richEditorAddStyle : {}),
          }}
          style={styles.editor}
          initialContentHTML={value}
          onChange={onChangeText}
          placeholder={PLACEHOLDERS.bodyInput}
          useContainer={false}
          injectedJavaScript={INJECTED_JS}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
