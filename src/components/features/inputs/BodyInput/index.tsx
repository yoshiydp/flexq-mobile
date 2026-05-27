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

// iOS WKWebView bug: first character typed in an empty editor gets duplicated.
// When duplication occurs the HTML starts with <tag>XX... where X is the first char.
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
  const isFocusFixInProgress = useRef(false);
  const isFirstChangeAfterEmptyFocus = useRef(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(200);

  const SCROLL_PADDING = 32;
  const editorHeight =
    fillContainer && scrollViewHeight > 0
      ? Math.max(scrollViewHeight - SCROLL_PADDING, contentHeight)
      : contentHeight;

  const handleFocus = () => {
    if (Platform.OS !== 'ios') return;

    // blur→refocus サイクル中の再入を防ぐ
    if (isFocusFixInProgress.current) {
      isFocusFixInProgress.current = false;
      return;
    }

    if (!isEditorEmpty(value)) return;

    // iOS WKWebView は空コンテンツへの初回入力時に UITextInput 接続が未確立で
    // 最初の1文字が二重送信される。blur→refocus で接続を確立してから入力を受け付ける。
    // 300ms はキーボードアニメーション完了（約250ms）を超えるタイムアウトで設定。
    isFirstChangeAfterEmptyFocus.current = true;
    isFocusFixInProgress.current = true;
    editorRef?.current?.blurContentEditor();
    setTimeout(() => editorRef?.current?.focusContentEditor(), 300);
  };

  const handleChange = (html: string) => {
    if (Platform.OS === 'ios') {
      // blur→refocus タイムアウト内に入力された場合のフォールバック。
      // isFocusFixInProgress が true の間に onChange が来たとき先頭文字の重複を検出して修正する。
      if (isFirstChangeAfterEmptyFocus.current && isFocusFixInProgress.current) {
        isFirstChangeAfterEmptyFocus.current = false;
        const fixed = removeFirstCharDuplicate(html);
        if (fixed !== html) {
          onChangeText(fixed);
          editorRef?.current?.setContentHTML(fixed);
          setTimeout(() => editorRef?.current?.focusContentEditor(), 10);
          return;
        }
      }

      // フォーカスを保ったままコンテンツが空になった場合、同じ blur→refocus サイクルを
      // 再実行して UITextInput 接続を再確立する。
      // handleFocus は呼ばれないためここでフラグをセットする。
      // キーボードは既に出ているため 50ms の短いタイムアウトを使用する。
      if (isEditorEmpty(html) && !isFocusFixInProgress.current) {
        isFirstChangeAfterEmptyFocus.current = true;
        isFocusFixInProgress.current = true;
        editorRef?.current?.blurContentEditor();
        setTimeout(() => editorRef?.current?.focusContentEditor(), 50);
        onChangeText(html);
        return;
      }
    }

    isFirstChangeAfterEmptyFocus.current = false;
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
