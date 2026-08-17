import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

const MESSAGES = ['Rescuing good food…', 'Reducing your bill…', 'Finding deals near you…'];

// Branded full-screen loader: the Perfectly Good logo gently fades + scales
// while short brand messages rotate underneath.
export default function BrandedLoader({ message }: { message?: string }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;
  const msgOpacity = useRef(new Animated.Value(1)).current;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.06, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.92, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  useEffect(() => {
    if (message) return;
    const t = setInterval(() => {
      Animated.timing(msgOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % MESSAGES.length);
        Animated.timing(msgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 1600);
    return () => clearInterval(t);
  }, [message, msgOpacity]);

  return (
    <View style={styles.wrap}>
      <Animated.Image
        source={require('../../assets/images/splash-icon.png')}
        style={[styles.logo, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
        accessibilityLabel="Perfectly Good"
      />
      <Animated.Text style={[styles.msg, { opacity: message ? 1 : msgOpacity }]}>
        {message || MESSAGES[idx]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, paddingHorizontal: SPACING.xl },
  logo: { width: 170, height: 64, marginBottom: SPACING.lg },
  msg: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, textAlign: 'center' },
});
