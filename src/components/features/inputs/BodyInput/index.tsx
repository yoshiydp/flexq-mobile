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
          editorInitializedCallback={() => {
            if (Platform.OS === 'ios') {
              // iOS WebView contenteditable の初回フォーカス時に最初の1文字が
              // 二重入力される既知のバグを回避するため、ロード直後に focus/blur を
              // 実行して iOS のテキスト入力接続をウォームアップする。
              editorRef?.current?.focusContentEditor();
              setTimeout(() => editorRef?.current?.blurContentEditor(), 50);
            }
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
