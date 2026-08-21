import React from 'react';
import { View } from 'react-native';
import { COLORS } from '../constants/theme';

type Props = {
  size?: number;
  /** Border + dot color. Non-veg should pass COLORS.error. */
  color?: string;
};

/**
 * Industry-standard vegetarian indicator: a coloured square outline with a
 * filled dot in the centre (green = veg, red = non-veg). Replaces the old
 * leaf icon so it matches Indian FSSAI dietary conventions.
 */
export default function VegDot({ size = 14, color = COLORS.success }: Props) {
  const border = Math.max(1.5, size * 0.12);
  const inner = Math.max(5, size * 0.42);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        borderWidth: border,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }} />
    </View>
  );
}
