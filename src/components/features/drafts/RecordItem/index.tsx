import React from 'react';
import { Pressable, Text, View, GestureResponderEvent } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import styles from './RecordItem.styles';

interface RecordItemProps {
  title: string;
  updatedAt: Date;
  isBookmarked: boolean;
  onPress: (event: GestureResponderEvent) => void;
}

export default function RecordItem({
  title,
  updatedAt,
  isBookmarked,
  onPress,
}: RecordItemProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.infoWrapper}>
        <View style={styles.infoRow}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          <Text style={styles.updatedAt}>
            {updatedAt.toLocaleDateString()} RECORDED
          </Text>
        </View>
      </View>
      <Icon
        component={FontAwesome}
        name="angle-right"
        size={30}
        style={styles.arrowIcon}
      />
      {isBookmarked && (
        <Icon
          component={FontAwesome}
          name="bookmark"
          size={24}
          style={styles.bookmarkIcon}
        />
      )}
    </Pressable>
  );
}
