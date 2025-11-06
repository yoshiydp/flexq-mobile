import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Animated, LayoutChangeEvent } from 'react-native';
import RippleButton from '@/components/ui/buttons/RippleButton';
import Icon from '@/components/ui/Icon';
import { FontAwesome6 } from '@expo/vector-icons';
import styles from './LinkedProjectsButtonWithMenu.styles';

interface LinkedProjectsButtonWithMenuProps {
  projectItems: string[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function LinkedProjectsButtonWithMenu({
  projectItems,
  isOpen,
  onToggle,
}: LinkedProjectsButtonWithMenuProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [menuWidth, setMenuWidth] = useState(0);
  const [buttonCenterX, setButtonCenterX] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
  }, [isOpen]);

  const handleButtonLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setButtonCenterX(x + width / 2);
  };

  const handleMenuLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setMenuWidth(width);
  };

  return (
    <View>
      <View onLayout={handleButtonLayout}>
        <RippleButton
          onPress={onToggle}
          size={52}
          testId="linked-projects-button"
        >
          <Icon
            component={FontAwesome6}
            name="link"
            size={22}
            style={styles.primaryColor}
          />
        </RippleButton>
      </View>

      {shouldRender && (
        <Animated.View
          onLayout={handleMenuLayout}
          style={[
            styles.menuContainer,
            {
              opacity: fadeAnim,
              left: buttonCenterX - menuWidth / 2,
            },
          ]}
        >
          <Text style={styles.text}>Linked Projects:</Text>
          <View style={styles.projectList}>
            {projectItems.map((item, index) => (
              <Text key={index} style={styles.text}>
                {item}
                {index < projectItems.length - 1 && ' / '}
              </Text>
            ))}
          </View>
          <View style={styles.triangle} />
        </Animated.View>
      )}
    </View>
  );
}
