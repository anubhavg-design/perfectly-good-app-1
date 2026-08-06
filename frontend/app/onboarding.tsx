import React, { useRef, useState } from 'react';
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
import { useRouter } from 'expo-router';
import {
  Sparkles,
  UtensilsCrossed,
  Tag,
  ShoppingBag,
  KeyRound,
  LifeBuoy,
  ArrowRight,
} from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import { markOnboardingSeen } from '../src/utils/onboarding';

const SLIDES = [
  {
    icon: Sparkles,
    title: 'Welcome to Perfectly Good',
    body: 'Perfectly Good Food. Perfectly Low Prices. We connect you with great restaurants offering surplus meals, dine-in deals, and takeaway at unbeatable prices, so nothing goes to waste.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Surplus, Dine-In & Takeaway',
    body: 'Browse surplus meals at steep discounts, book a dine-in table, or order takeaway, all from one place. Fresh food, less waste, more savings.',
  },
  {
    icon: Tag,
    title: 'Find Deals Near You',
    body: "Browse restaurants on the home screen and look for the Surplus tag. These are limited-time offers, grab them before they're gone.",
  },
  {
    icon: ShoppingBag,
    title: 'Order in Seconds',
    body: 'Pick your items, choose a pickup window, and pay securely via Razorpay. Your order is confirmed instantly after payment.',
  },
  {
    icon: KeyRound,
    title: 'Your Pickup Code',
    body: "After payment, you'll receive a unique 6-digit pickup code. Show it to the restaurant when you arrive, they'll scan it to complete your order.",
  },
  {
    icon: LifeBuoy,
    title: "We're Here to Help",
    body: "Something went wrong? Tap Help & Support in your profile to raise an issue. We'll get back to you quickly on WhatsApp or email.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  const finish = async () => {
    await markOnboardingSeen(user?.user_id || '');
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
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
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
          const Icon = slide.icon;
          return (
            <View key={i} style={[styles.slide, { width }]} testID={`onboarding-slide-${i}`}>
              <View style={styles.iconWrap}>
                <View style={styles.iconInner}>
                  <Icon size={64} color={COLORS.primary} strokeWidth={1.75} />
                </View>
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
  iconWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  iconInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
