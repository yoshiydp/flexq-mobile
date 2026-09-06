import React, { useState, useRef, useEffect } from 'react';
import { View, Pressable, Text, Animated } from 'react-native';
import RippleButton from '@/components/ui/buttons/RippleButton';
import Icon from '@/components/ui/Icon';
import { FontAwesome6 } from '@expo/vector-icons';
import styles from './ActionButtonWithMenu.styles';

export interface MenuItem {
  label: string;
  onPress: () => void | Promise<void>;
}

interface Props {
  menuItems: MenuItem[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function ActionButtonWithMenu({
  menuItems,
  isOpen,
  onToggle,
}: Props) {
  const [shouldRender, setShouldRender] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleSelect = async (action: () => void | Promise<void>) => {
    onToggle();
    try {
      await action();
    } catch (e) {
      console.error('Menu action failed:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShouldRender(false));
    }
  }, [isOpen, fadeAnim]);

  return (
    <View>
      <RippleButton
        onPress={onToggle}
        size={52}
        testID="action-button-with-menu"
        accessibilityRole="button"
      >
        <Icon
          component={FontAwesome6}
          name="ellipsis-vertical"
          size={24}
          style={styles.defaultColor}
        />
      </RippleButton>

      {shouldRender && (
        // testID はラベル文言に依存せずメニューの開閉を検証できるようにするため（TASK-92 / E2E CM-05）
        <Animated.View
          testID="action-menu"
          style={[styles.menuContainer, { opacity: fadeAnim }]}
        >
          {menuItems.map((item, idx) => {
            const isLast = idx === menuItems.length - 1;
            return (
              <Pressable
                key={idx}
                testID={`action-menu-item-${idx}`}
                style={[styles.menuItem, isLast && styles.menuItemLast]}
                onPress={() => handleSelect(item.onPress)}
              >
                <Text
                  style={[styles.menuLabel, isLast && styles.menuLabelLast]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}
