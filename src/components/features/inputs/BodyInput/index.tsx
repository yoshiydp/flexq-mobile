import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  RichText,
  useEditorContent,
  useBridgeState,
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

type ToolItem = {
  label: string;
  onPress: () => void;
  isActive: boolean;
  fontWeight?: 'bold';
  fontStyle?: 'italic';
  textDecorationLine?: 'underline';
};

export default function BodyInput({
  editor,
  onChangeText,
  isEditing,
  fillContainer = false,
  isListening = false,
  onMicPress,
}: BodyInputProps) {
  const html = useEditorContent(editor, { type: 'html' });
  const editorState = useBridgeState(editor);

  useEffect(() => {
    if (html !== undefined) onChangeText(html);
  }, [html, onChangeText]);

  const tools: ToolItem[] = [
    {
      label: 'H1',
      onPress: () => editor.toggleHeading(1),
      isActive: editorState.headingLevel === 1,
    },
    {
      label: 'H2',
      onPress: () => editor.toggleHeading(2),
      isActive: editorState.headingLevel === 2,
    },
    {
      label: 'B',
      onPress: () => editor.toggleBold(),
      isActive: editorState.isBoldActive,
      fontWeight: 'bold',
    },
    {
      label: 'I',
      onPress: () => editor.toggleItalic(),
      isActive: editorState.isItalicActive,
      fontStyle: 'italic',
    },
    {
      label: 'U',
      onPress: () => editor.toggleUnderline(),
      isActive: editorState.isUnderlineActive,
      textDecorationLine: 'underline',
    },
    {
      label: '•',
      onPress: () => editor.toggleBulletList(),
      isActive: editorState.isBulletListActive,
    },
    {
      label: '1.',
      onPress: () => editor.toggleOrderedList(),
      isActive: editorState.isOrderedListActive,
    },
  ];

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
    >
      {isEditing && (
        <View style={styles.toolbarRow}>
          {tools.map((tool) => (
            <Pressable
              key={tool.label}
              style={[styles.toolbarButton, tool.isActive && styles.toolbarButtonActive]}
              onPress={tool.onPress}
            >
              <Text
                style={[
                  styles.toolbarButtonText,
                  tool.isActive && styles.toolbarButtonTextActive,
                  tool.fontWeight ? { fontWeight: tool.fontWeight } : undefined,
                  tool.fontStyle ? { fontStyle: tool.fontStyle } : undefined,
                  tool.textDecorationLine
                    ? { textDecorationLine: tool.textDecorationLine }
                    : undefined,
                ]}
              >
                {tool.label}
              </Text>
            </Pressable>
          ))}
          {onMicPress && (
            <Pressable
              style={[styles.toolbarButton, isListening && styles.toolbarButtonActive]}
              onPress={onMicPress}
              accessibilityLabel={isListening ? '録音停止' : '音声入力開始'}
            >
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={18}
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
