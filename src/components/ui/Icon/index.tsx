import React from 'react';
import type { ComponentProps, ComponentType } from 'react';
import type { StyleProp, ViewStyle, TextStyle, ImageStyle } from 'react-native';

interface IconBaseProps {
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle | TextStyle | ImageStyle>;
}

interface Props<T extends ComponentType<IconBaseProps>> {
  component: any;
  name: ComponentProps<T>['name'];
  size: number;
  style?: StyleProp<ViewStyle | TextStyle | ImageStyle>;
}

export default function Icon<T extends ComponentType<IconBaseProps>>({
  component: Component,
  name,
  size,
  style,
  ...rest
}: Props<T>) {
  return <Component name={name} size={size} style={style} {...rest} />;
}
