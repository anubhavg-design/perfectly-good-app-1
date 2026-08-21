import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

export function SkeletonBox({ style }: { style?: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: COLORS.skeleton, borderRadius: RADIUS.sm, opacity }, style]} />;
}

// A restaurant-card shaped skeleton row
function RestaurantSkeleton() {
  return (
    <View style={styles.restCard}>
      <SkeletonBox style={styles.restImg} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox style={{ width: '70%', height: 16 }} />
        <SkeletonBox style={{ width: '45%', height: 12 }} />
        <SkeletonBox style={{ width: '55%', height: 12 }} />
      </View>
    </View>
  );
}

// A horizontal deal-card shaped skeleton
function DealSkeleton() {
  return (
    <View style={styles.dealCard}>
      <SkeletonBox style={styles.dealImg} />
      <View style={{ padding: SPACING.sm, gap: 6 }}>
        <SkeletonBox style={{ width: '80%', height: 14 }} />
        <SkeletonBox style={{ width: '55%', height: 11 }} />
        <SkeletonBox style={{ width: '40%', height: 14 }} />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 4, variant = 'restaurant' }: { count?: number; variant?: 'restaurant' | 'deal' }) {
  return (
    <View style={variant === 'deal' ? styles.dealRow : styles.restWrap}>
      {Array.from({ length: count }).map((_, i) => (
        variant === 'deal' ? <DealSkeleton key={i} /> : <RestaurantSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  restWrap: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  restCard: { flexDirection: 'row', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  restImg: { width: 84, height: 84, borderRadius: RADIUS.md },
  dealRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, gap: SPACING.md },
  dealCard: { width: 180, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden', ...SHADOWS.small },
  dealImg: { width: '100%', height: 120, borderRadius: 0 },
});
