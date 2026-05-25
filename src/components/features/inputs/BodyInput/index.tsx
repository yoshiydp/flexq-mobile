import React, { useRef, useState } from 'react';
import {
  Button,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  RichEditor,
  RichToolbar,
  actions,
} from 'react-native-pell-rich-editor';
import { Ionicons } from '@expo/vector-icons';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { COLORS } from '@/globalStyles';
import { styles } from './BodyInput.styles';

interface BodyInputProps {
  editorRef?: React.RefObject<RichEditor>;
  value: string;
  onChangeText: (text: string) => void;
  richEditorAddStyle?: any;
  isEditing?: boolean;
  fillContainer?: boolean;
  isListening?: boolean;
  onMicPress?: () => void;
}

export default function BodyInput({
  editorRef,
  value,
  onChangeText,
  richEditorAddStyle,
  isEditing,
  fillContainer = false,
  isListening = false,
  onMicPress,
}: BodyInputProps) {
  const hasFirstFocused = useRef(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(200);

  const SCROLL_PADDING = 32;
  const editorHeight =
    fillContainer && scrollViewHeight > 0
      ? Math.max(scrollViewHeight - SCROLL_PADDING, contentHeight)
      : contentHeight;

  const handleFocus = () => {
    if (Platform.OS !== 'ios' || hasFirstFocused.current) return;
    hasFirstFocused.current = true;
    // iOS WebView は最初のフォーカス時に入力接続が未確立で最初の1文字が二重送信される。
    // 初回フォーカス時のみ即座に blur して再フォーカスすることで入力接続を確立する。
    editorRef?.current?.blurContentEditor();
    setTimeout(() => editorRef?.current?.focusContentEditor(), 50);
  };

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
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
          {onMicPress && (
            <Pressable
              style={styles.micButton}
              onPress={onMicPress}
              accessibilityLabel={isListening ? '録音停止' : '音声入力開始'}
            >
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={20}
                color={isListening ? COLORS.accent.goldPrimary : COLORS.form.default.text}
              />
            </Pressable>
          )}
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onLayout={
          fillContainer
            ? (e) => setScrollViewHeight(e.nativeEvent.layout.height)
            : undefined
        }
      >
        <RichEditor
          ref={editorRef}
          editorStyle={{
            ...styles.richEditor,
            placeholderColor: '#666',
            ...(richEditorAddStyle ? richEditorAddStyle : {}),
          }}
          style={[styles.editor, { height: editorHeight }]}
          initialContentHTML={value}
          onChange={onChangeText}
          placeholder={PLACEHOLDERS.bodyInput}
          useContainer={false}
          onFocus={handleFocus}
          onHeightChange={(h) => setContentHeight(Math.max(200, h))}
        />
      </ScrollView>
    </View>
  );
}
