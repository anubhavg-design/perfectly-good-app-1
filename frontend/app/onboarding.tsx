import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ArrowRight } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import {
  markOnboardingSeen,
  saveOnboardingProgress,
  loadOnboardingProgress,
  clearOnboardingProgress,
} from '../src/utils/onboarding';
import { ONBOARDING_ART } from '../src/components/OnboardingArt';

const SLIDES = [
  {
    title: 'Welcome to Perfectly Good',
    body: 'Perfectly Good Food. Perfectly Low Prices. We connect you with great restaurants offering surplus meals, dine-in deals, and takeaway at unbeatable prices, so nothing goes to waste.',
  },
  {
    title: 'Surplus, Dine-In & Takeaway',
    body: 'Browse surplus meals at steep discounts, book a dine-in table, or order takeaway, all from one place. Fresh food, less waste, more savings.',
  },
  {
    title: 'Find Deals Near You',
    body: "Browse restaurants on the home screen and look for the Surplus tag. These are limited-time offers, grab them before they're gone.",
  },
  {
    title: 'Order in Seconds',
    body: 'Pick your items, choose a pickup window, and pay securely via Razorpay. Your order is confirmed instantly after payment.',
  },
  {
    title: 'Your Pickup Code',
    body: "After payment, you'll receive a unique 6-digit pickup code. Show it to the restaurant when you arrive, they'll scan it to complete your order.",
  },
  {
    title: "We're Here to Help",
    body: "Something went wrong? Tap Help & Support in your profile to raise an issue. We'll get back to you quickly on WhatsApp or email.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ replay?: string }>();
  const isReplay = params?.replay === '1';
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  // Progress memory: resume on the slide the customer stopped at (first run only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isReplay && user?.user_id) {
        const saved = await loadOnboardingProgress(user.user_id);
        if (!cancelled && saved > 0 && saved < SLIDES.length) {
          setIndex(saved);
          // jump to the saved slide once layout is ready
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: saved * width, animated: false }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id, width, isReplay]);

  const finish = async () => {
    if (isReplay) {
      // Revisited from Profile: just return, don't touch flags/progress.
      router.back();
      return;
    }
    await markOnboardingSeen(user?.user_id || '');
    await clearOnboardingProgress(user?.user_id || '');
    // End the intro by asking to enable location so nearby deals load right away.
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // never block entry on a permission prompt
    }
    router.replace('/(tabs)/home');
  };

  const goNext = () => {
    if (isLast) {
      finish();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
    if (!isReplay && user?.user_id) saveOnboardingProgress(user.user_id, next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      if (!isReplay && user?.user_id) saveOnboardingProgress(user.user_id, i);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Skip - shown top right on every slide */}
      <View style={styles.topBar}>
        <TouchableOpacity testID="onboarding-skip" onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => {
          const Art = ONBOARDING_ART[i];
          return (
            <View key={i} style={[styles.slide, { width }]} testID={`onboarding-slide-${i}`}>
              <View style={styles.artWrap}>
                <Art />
              </View>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {/* Footer controls */}
      <View style={styles.footer}>
        {isLast ? (
          <TouchableOpacity testID="onboarding-get-started" style={styles.getStartedBtn} activeOpacity={0.85} onPress={finish}>
            <Text style={styles.getStartedText}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <Text style={styles.stepText}>{index + 1} of {SLIDES.length}</Text>
            <TouchableOpacity testID="onboarding-next" style={styles.nextBtn} activeOpacity={0.85} onPress={goNext}>
              <ArrowRight size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  skipText: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  artWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Outfit_700Bold',
    color: COLORS.primaryDark,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  body: {
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { width: 22, backgroundColor: COLORS.primary },
  footer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  nextBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  getStartedText: { color: '#fff', fontSize: 17, fontFamily: 'Outfit_600SemiBold' },
});
