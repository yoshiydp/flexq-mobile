import React from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { FontAwesome, FontAwesome6, Octicons } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type {
  FontAwesomeIconName,
  FontAwesome6IconName,
  OcticonsIconName,
} from '@/types/iconTypes';
import { useAnimatedSequence } from '@/hooks/useAnimatedSequence';
import styles from './HeaderActionButton.styles';

type IconModule = 'FontAwesome' | 'FontAwesome6' | 'Octicons';

type IconNameMap = {
  FontAwesome: FontAwesomeIconName;
  FontAwesome6: FontAwesome6IconName;
  Octicons: OcticonsIconName;
};

const ICON_COMPONENTS = {
  FontAwesome: FontAwesome,
  FontAwesome6: FontAwesome6,
  Octicons: Octicons,
} as const;

interface HeaderActionButtonProps<M extends IconModule = IconModule> {
  label?: string | React.ReactNode;
  iconModule?: M;
  icon: IconNameMap[M];
  iconSize?: number;
  onPress: () => void;
  index?: number;
  startAnimation?: boolean;
  testID?: string;
}

export default function HeaderActionButton<M extends IconModule>({
  label,
  iconModule = 'FontAwesome' as M,
  icon,
  iconSize = 16,
  onPress,
  index,
  startAnimation = false,
  testID,
}: HeaderActionButtonProps<M>) {
  const buttonContainerStyle = [
    styles.buttonContainer,
    label ? styles.labeledContainer : null,
  ].filter(Boolean);

  const anim = useAnimatedSequence({
    start: startAnimation,
    fromX: 50,
    index,
  });

  const IconComponent = ICON_COMPONENTS[iconModule];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: anim.translateX }],
          opacity: anim.opacity,
        },
      ]}
    >
      <Pressable
        style={buttonContainerStyle}
        onPress={onPress}
        testID={testID || 'header-action-button'}
      >
        {label && <Text style={styles.label}>{label}</Text>}
        <Icon
          component={IconComponent}
          name={icon}
          size={iconSize}
          style={styles.icon}
        />
      </Pressable>
    </Animated.View>
  );
}
