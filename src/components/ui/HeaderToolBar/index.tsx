import React, { useState } from 'react';
import { View, Pressable, Text, useWindowDimensions } from 'react-native';
import { FontAwesome, FontAwesome6 } from '@expo/vector-icons';
import RippleButton from '@/components/ui/buttons/RippleButton';
import LinkedProjectsButtonWithMenu from '@/components/features/audioPlayer/LinkedProjectsButtonWithMenu';
import ActionButtonWithMenu from '@/components/ui/ActionButtonWithMenu';
import HeadphoneIndicator from '@/components/ui/HeadphoneIndicator';
import Icon from '@/components/ui/Icon';
import type { HeaderToolBarButton } from '@/constants/headerToolBarButtons';
import styles, { HEADER_HORIZONTAL_PADDING } from './HeaderToolBar.styles';

interface HeaderToolBarProps {
  items: HeaderToolBarButton[];
  isBookmarked?: boolean;
}

export default function HeaderToolBar({
  items,
  isBookmarked = false,
}: HeaderToolBarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const toggleMenu = (menuId: string) => {
    setOpenMenuId((prev) => (prev === menuId ? null : menuId));
  };

  const closeMenu = () => setOpenMenuId(null);

  const leftItems = items.filter((item) => item.type === 'back');

  const centerItem = items.find(
    (item) =>
      item.type === 'headerTitle' ||
      item.type === 'linkedProjects' ||
      item.type === 'headphoneIndicator',
  );

  const rightItems = items.filter(
    (item) =>
      item.type === 'bookmark' ||
      item.type === 'share' ||
      item.type === 'navigationListScreen' ||
      item.type === 'action' ||
      item.type === 'create' ||
      item.type === 'hamburger' ||
      item.type === 'buttonGroup',
  );

  return (
    <View style={styles.container}>
      {/* メニュー表示中に画面のどこかをタップすると閉じる（TASK-92）。
          ヘッダー内のボタンより先に描画するため、ボタン自体のタップは従来どおり動作する */}
      {openMenuId !== null && (
        <Pressable
          testID="header-toolbar-menu-overlay"
          accessibilityRole="button"
          accessibilityLabel="メニューを閉じる"
          style={[
            styles.menuOverlay,
            {
              width: windowWidth + HEADER_HORIZONTAL_PADDING * 2,
              height: windowHeight,
            },
          ]}
          onPress={closeMenu}
        />
      )}

      <View style={styles.left}>
        {leftItems.map((item) => (
          <Pressable key={item.id} testID={item.id} style={styles.button} onPress={item.onPress}>
            <Icon
              component={FontAwesome}
              name="angle-left"
              size={40}
              style={[styles.defaultColor, styles.iconAngleLeft]}
            />
          </Pressable>
        ))}
      </View>

      <View style={styles.center}>
        {centerItem?.type === 'headerTitle' && (
          <Text style={styles.headerTitle}>{centerItem.headerTitle}</Text>
        )}
        {centerItem?.type === 'linkedProjects' &&
          centerItem.projectItems &&
          centerItem.projectItems.length > 0 && (
            <LinkedProjectsButtonWithMenu
              key={centerItem.id}
              projectItems={centerItem.projectItems}
              isOpen={openMenuId === centerItem.id}
              onToggle={() => toggleMenu(centerItem.id)}
            />
          )}
        {centerItem?.type === 'headphoneIndicator' && (
          <HeadphoneIndicator key={centerItem.id} />
        )}
      </View>

      <View style={styles.right}>
        {rightItems.map((item) => {
          if (item.type === 'buttonGroup' && item.buttons) {
            return (
              <View key={item.id} style={styles.buttonGroup}>
                {item.buttons.map((btn) => {
                  switch (btn.type) {
                    case 'bookmark':
                      return (
                        <Pressable
                          key={btn.id}
                          style={styles.button}
                          onPress={btn.onPress}
                        >
                          <Icon
                            component={FontAwesome}
                            name={isBookmarked ? 'bookmark' : 'bookmark-o'}
                            size={30}
                            style={[
                              styles.defaultColor,
                              isBookmarked && styles.primaryColor,
                            ]}
                          />
                        </Pressable>
                      );

                    case 'share':
                      return (
                        <Pressable
                          key={btn.id}
                          testID={btn.id}
                          style={styles.button}
                          onPress={btn.onPress}
                        >
                          <Icon
                            component={FontAwesome}
                            name="share-square-o"
                            size={26}
                            style={styles.defaultColor}
                          />
                        </Pressable>
                      );

                    case 'delete':
                      return (
                        <Pressable
                          key={btn.id}
                          style={styles.button}
                          onPress={btn.onPress}
                        >
                          <Icon
                            component={FontAwesome}
                            name="trash-o"
                            size={28}
                            style={styles.defaultColor}
                          />
                        </Pressable>
                      );

                    case 'navigationListScreen':
                      return (
                        <Pressable
                          key={btn.id}
                          style={styles.button}
                          onPress={btn.onPress}
                        >
                          <Icon
                            component={FontAwesome}
                            name="list-ul"
                            size={24}
                            style={styles.defaultColor}
                          />
                        </Pressable>
                      );

                    case 'action':
                      return (
                        <ActionButtonWithMenu
                          key={btn.id}
                          menuItems={btn.menuItems || []}
                          isOpen={openMenuId === btn.id}
                          onToggle={() => toggleMenu(btn.id)}
                        />
                      );

                    default:
                      return (
                        <Pressable
                          key={btn.id}
                          style={styles.button}
                          onPress={btn.onPress}
                        >
                          <Text style={styles.defaultColor}>{btn.type}</Text>
                        </Pressable>
                      );
                  }
                })}
              </View>
            );
          }

          switch (item.type) {
            case 'bookmark':
              return (
                <Pressable
                  key={item.id}
                  style={styles.button}
                  onPress={item.onPress}
                >
                  <Icon
                    component={FontAwesome}
                    name={isBookmarked ? 'bookmark' : 'bookmark-o'}
                    size={30}
                    style={[
                      styles.defaultColor,
                      isBookmarked && styles.primaryColor,
                    ]}
                  />
                </Pressable>
              );

            case 'share':
              return (
                <Pressable
                  key={item.id}
                  testID={item.id}
                  style={styles.button}
                  onPress={item.onPress}
                >
                  <Icon
                    component={FontAwesome}
                    name="share-square-o"
                    size={26}
                    style={styles.defaultColor}
                  />
                </Pressable>
              );

            case 'navigationListScreen':
              return (
                <Pressable
                  key={item.id}
                  style={styles.button}
                  onPress={item.onPress}
                >
                  <Icon
                    component={FontAwesome}
                    name="list-ul"
                    size={24}
                    style={styles.defaultColor}
                  />
                </Pressable>
              );

            case 'action':
              return (
                <ActionButtonWithMenu
                  key={item.id}
                  menuItems={item.menuItems || []}
                  isOpen={openMenuId === item.id}
                  onToggle={() => toggleMenu(item.id)}
                />
              );

            case 'create':
              return (
                <RippleButton
                  key={item.id}
                  testID={item.id}
                  onPress={item.onPress}
                  size={52}
                >
                  <Icon
                    component={FontAwesome6}
                    name="pen-to-square"
                    size={22}
                    style={styles.defaultColor}
                  />
                </RippleButton>
              );

            case 'hamburger':
              return (
                <RippleButton key={item.id} testID={item.id} onPress={item.onPress} size={52}>
                  <Icon
                    component={FontAwesome}
                    name="bars"
                    size={26}
                    style={styles.defaultColor}
                  />
                </RippleButton>
              );
          }
        })}
      </View>
    </View>
  );
}
