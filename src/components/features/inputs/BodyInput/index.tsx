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

const isEditorEmpty = (html: string) =>
  !html || html === '<p></p>' || html === '<p><br></p>' || html.trim() === '';

// iOS WKWebView bug: when a contenteditable is empty, UITextInput connection is
// unstable. The first keystroke is processed by both UITextInput and the JS event
// handler, causing the character to appear twice.
// Fix: detect the doubled leading character in onChange and correct it via setContentHTML.
const removeFirstCharDuplicate = (html: string): string => {
  const text = html.replace(/<[^>]+>/g, '');
  if (text.length < 2 || text[0] !== text[1]) return html;
  const escaped = text[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`(<[^>]+>)${escaped}${escaped}`), `$1${text[0]}`);
};

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
  const isFirstChangeAfterEmpty = useRef(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(200);

  const SCROLL_PADDING = 32;
  const editorHeight =
    fillContainer && scrollViewHeight > 0
      ? Math.max(scrollViewHeight - SCROLL_PADDING, contentHeight)
      : contentHeight;

  const handleFocus = () => {
    if (Platform.OS !== 'ios') return;
    // Arm the dedup check if the editor is empty when focused.
    // value reflects the parent's state which stays in sync via handleChange.
    if (isEditorEmpty(value)) {
      isFirstChangeAfterEmpty.current = true;
    }
  };

  const handleChange = (html: string) => {
    if (Platform.OS === 'ios') {
      if (isEditorEmpty(html)) {
        // Content just became empty: arm the check for the next input.
        // This handles the case where the editor stays focused while the user
        // deletes all content — handleFocus is not called in that case.
        isFirstChangeAfterEmpty.current = true;
        onChangeText(html);
        return;
      }

      if (isFirstChangeAfterEmpty.current) {
        isFirstChangeAfterEmpty.current = false;
        const fixed = removeFirstCharDuplicate(html);
        if (fixed !== html) {
          onChangeText(fixed);
          editorRef?.current?.setContentHTML(fixed);
          // Restore cursor to end of content after programmatic update
          setTimeout(() => editorRef?.current?.focusContentEditor(), 10);
          return;
        }
      }
    }

    isFirstChangeAfterEmpty.current = false;
    onChangeText(html);
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
          onChange={handleChange}
          placeholder={PLACEHOLDERS.bodyInput}
          useContainer={false}
          onFocus={handleFocus}
          onHeightChange={(h) => setContentHeight(Math.max(200, h))}
        />
      </ScrollView>
    </View>
  );
}
