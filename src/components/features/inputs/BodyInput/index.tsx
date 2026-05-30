import React, { useEffect } from 'react';
import { Button, Pressable, View } from 'react-native';
import {
  RichText,
  useEditorContent,
  type EditorBridge,
} from '@10play/tentap-editor';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/globalStyles';
import { styles } from './BodyInput.styles';

interface BodyInputProps {
  editor: EditorBridge;
  onChangeText: (text: string) => void;
  isEditing?: boolean;
  fillContainer?: boolean;
  isListening?: boolean;
  onMicPress?: () => void;
}

export default function BodyInput({
  editor,
  onChangeText,
  isEditing,
  fillContainer = false,
  isListening = false,
  onMicPress,
}: BodyInputProps) {
  const html = useEditorContent(editor, { type: 'html' });

  useEffect(() => {
    if (html !== undefined) onChangeText(html);
  }, [html, onChangeText]);

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
    >
      {isEditing && (
        <View style={styles.toolbarRow}>
          <View style={[styles.toolbar, styles.toolbarFlex]}>
            <Button title="B" onPress={() => editor.toggleBold()} />
            <Button title="I" onPress={() => editor.toggleItalic()} />
            <Button title="•" onPress={() => editor.toggleBulletList()} />
            <Button title="1." onPress={() => editor.toggleOrderedList()} />
          </View>
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
      <RichText editor={editor} style={styles.richText} />
    </View>
  );
}
