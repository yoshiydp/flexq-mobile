import React from 'react';
import { View, Text } from 'react-native';
import styles from './SettingsTitledContentBox.styles';

interface SettingsTitledContentBoxProps {
  heading?: string;
  headingBadge?: string;
  children?: React.ReactNode;
  containerStyle?: object;
}

export default function SettingsTitledContentBox({
  heading,
  headingBadge,
  children,
  containerStyle,
}: SettingsTitledContentBoxProps) {
  return (
    <View style={containerStyle ?? {}}>
      {heading && (
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{heading}</Text>
          {headingBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{headingBadge}</Text>
            </View>
          ) : null}
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}
