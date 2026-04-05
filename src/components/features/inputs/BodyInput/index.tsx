import React from 'react';
import {
  Button,
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

// iOS WebView の contenteditable は初回フォーカス時に autocapitalize が干渉し、
// 英字が大文字になったり日本語 IME がアルファベット入力になる問題がある。
// setTimeout(fn, 0) で次の tick に一度だけ属性をセットすることで回避する。
// setInterval（ポーリング）と異なり入力バッファに干渉しない。
const INJECTED_JS =
  Platform.OS === 'ios'
    ? `
  (function() {
    setTimeout(function() {
      var el = document.getElementById('zss_editor_content');
      if (el) el.setAttribute('autocapitalize', 'none');
    }, 0);
  })();
  true;
`
    : undefined;

interface BodyInputProps {
  editorRef?: React.RefObject<RichEditor>;
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
            onPress={() => editorRef?.current?.blurContentEditor()}
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
