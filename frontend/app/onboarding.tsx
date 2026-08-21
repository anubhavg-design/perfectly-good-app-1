import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
  Platform,
  Image,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ArrowRight, ChevronsRight, Clock, Bell, ChevronRight, Check } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { useAuth } from '../src/context/AuthContext';
import {
  markOnboardingSeen,
  saveOnboardingProgress,
  loadOnboardingProgress,
  clearOnboardingProgress,
} from '../src/utils/onboarding';
import { ONBOARDING_ART, ArtFindDeals } from '../src/components/OnboardingArt';
import { dropsApi, dealAlertsApi, resolveMediaUrl } from '../src/api/client';

// Bengaluru default so we can surface a nearby deal before location is granted.
const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;

// Live "ends in Xh Ym" until the deal's pickup end time.
function getTimeRemaining(endTime?: string): string {
  if (!endTime) return '';
  const now = new Date();
  const [h, m] = endTime.split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  const diff = end.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

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

const DEAL_INDEX = SLIDES.length; // the extra "deal preview" page
const TOTAL = SLIDES.length + 1;
const USE_NATIVE = Platform.OS !== 'web';

export default function Onboarding() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ replay?: string }>();
  const isReplay = params?.replay === '1';
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [deals, setDeals] = useState<any[]>([]);
  const [dealIdx, setDealIdx] = useState(0);
  const [dealLoading, setDealLoading] = useState(true);
  const [showHint, setShowHint] = useState(!isReplay);
  const [tick, setTick] = useState(0);
  const [area, setArea] = useState('');
  const [optedIn, setOptedIn] = useState(false);
  const isLast = index === TOTAL - 1;

  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  const welcomeTitle = firstName ? `Welcome, ${firstName}!` : 'Welcome to Perfectly Good';

  const floatAnim = useRef(new Animated.Value(0)).current;
  const hintAnim = useRef(new Animated.Value(0)).current;

  // Subtle looping float so the illustrations feel alive.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  // Progress memory: resume on the slide the customer stopped at (first run only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isReplay && user?.user_id) {
        const saved = await loadOnboardingProgress(user.user_id);
        if (!cancelled && saved > 0 && saved < TOTAL) {
          setIndex(saved);
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: saved * width, animated: false }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.user_id, width, isReplay]);

  // One-time swipe nudge on the first slide (first-run only; hidden once the
  // customer advances). First-run onboarding itself only ever shows once.
  useEffect(() => {
    if (isReplay) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
        Animated.timing(hintAnim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isReplay, hintAnim]);

  // Fetch top nearby surplus deals to preview on the final slide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await dropsApi.list({ lat: DEFAULT_LAT, lon: DEFAULT_LON, sort_by: 'discount' });
        if (!cancelled) setDeals(Array.isArray(list) ? list.slice(0, 3) : []);
      } catch {
        if (!cancelled) setDeals([]);
      } finally {
        if (!cancelled) setDealLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Rotate through the top picks so the last slide feels alive.
  useEffect(() => {
    if (deals.length < 2) return;
    const id = setInterval(() => setDealIdx((i) => (i + 1) % deals.length), 4000);
    return () => clearInterval(id);
  }, [deals.length]);

  // Refresh the countdown label each minute.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Best-effort area name for the warm empty state (only if already granted).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const places = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        const p = places?.[0];
        const name = p?.district || p?.subregion || p?.city || p?.region || '';
        if (!cancelled && name) setArea(name);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const finish = async () => {
    if (isReplay) {
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

  const openDeal = async (itemId: string) => {
    if (!isReplay) {
      await markOnboardingSeen(user?.user_id || '');
      await clearOnboardingProgress(user?.user_id || '');
    }
    router.replace(`/drop/${itemId}`);
  };

  const seeAllDeals = async () => {
    if (!isReplay) {
      await markOnboardingSeen(user?.user_id || '');
      await clearOnboardingProgress(user?.user_id || '');
    }
    router.replace('/(tabs)/home?focus=surplus');
  };

  const notifyMe = async () => {
    setOptedIn(true);
    try {
      await dealAlertsApi.optIn(area || undefined);
    } catch {
      // opt-in is best-effort; keep the confirmed state either way
    }
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
    if (i > 0) setShowHint(false);
    if (!isReplay && user?.user_id) saveOnboardingProgress(user.user_id, i);
  };

  const goNext = () => {
    if (isLast) { finish(); return; }
    goTo(index + 1);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      if (i > 0) setShowHint(false);
      if (!isReplay && user?.user_id) saveOnboardingProgress(user.user_id, i);
    }
  };

  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const hintX = hintAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const currentDeal = deals.length ? deals[dealIdx % deals.length] : null;
  const discount = currentDeal && currentDeal.original_price
    ? Math.round(((currentDeal.original_price - currentDeal.discounted_price) / currentDeal.original_price) * 100)
    : 0;
  const timeLeft = currentDeal ? getTimeRemaining(currentDeal.pickup_end_time) : '';
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  tick; // referenced so the countdown recomputes each minute

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
              <Animated.View style={[styles.artWrap, { transform: [{ translateY: floatY }] }]}>
                <Art />
              </Animated.View>
              {i === 0 ? <Text style={styles.tagline}>Better Choices. Perfectly Good.</Text> : null}
              <Text style={styles.title}>{i === 0 ? welcomeTitle : slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>

              {i === 0 && showHint ? (
                <Animated.View style={[styles.hint, { transform: [{ translateX: hintX }] }]} testID="onboarding-swipe-hint">
                  <Text style={styles.hintText}>Swipe to explore</Text>
                  <ChevronsRight size={18} color={COLORS.primary} />
                </Animated.View>
              ) : null}
            </View>
          );
        })}

        {/* Deal preview - the final page */}
        <View style={[styles.slide, { width }]} testID={`onboarding-slide-${DEAL_INDEX}`}>
          {dealLoading ? (
            <>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={[styles.body, { marginTop: SPACING.md }]}>Finding deals near you…</Text>
            </>
          ) : currentDeal ? (
            <>
              <Text style={styles.title}>Deals waiting for you</Text>
              <Text style={[styles.body, { marginBottom: SPACING.lg }]}>
                {deals.length > 1 ? 'Top surplus picks nearby. Grab one to place your very first order.' : 'A live surplus deal nearby. Grab it to place your very first order.'}
              </Text>
              <TouchableOpacity testID="onboarding-deal-card" activeOpacity={0.9} style={styles.dealCard} onPress={() => openDeal(currentDeal.item_id)}>
                <View style={styles.dealImageWrap}>
                  {currentDeal.image_url ? (
                    <Image source={{ uri: resolveMediaUrl(currentDeal.image_url) }} style={styles.dealImage} />
                  ) : (
                    <View style={[styles.dealImage, styles.dealImagePlaceholder]}><ArtFindDeals /></View>
                  )}
                  {discount > 0 ? (
                    <View style={styles.dealBadge}><Text style={styles.dealBadgeText}>{discount}% OFF</Text></View>
                  ) : null}
                  {timeLeft ? (
                    <View style={styles.dealTimer} testID="onboarding-deal-timer">
                      <Clock size={12} color="#fff" />
                      <Text style={styles.dealTimerText}>Ends in {timeLeft}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.dealInfo}>
                  <Text style={styles.dealName} numberOfLines={1}>{currentDeal.name}</Text>
                  <Text style={styles.dealVendor} numberOfLines={1}>{currentDeal.vendor_name}</Text>
                  <View style={styles.dealPriceRow}>
                    <Text style={styles.dealPrice}>₹{currentDeal.discounted_price}</Text>
                    {currentDeal.original_price ? <Text style={styles.dealStrike}>₹{currentDeal.original_price}</Text> : null}
                  </View>
                </View>
                <View style={styles.dealCta}>
                  <Text style={styles.dealCtaText}>Grab this deal</Text>
                  <ArrowRight size={18} color="#fff" />
                </View>
              </TouchableOpacity>

              {deals.length > 1 ? (
                <View style={styles.dealDots}>
                  {deals.map((_, i) => (
                    <View key={i} style={[styles.dealDot, i === dealIdx % deals.length && styles.dealDotActive]} />
                  ))}
                </View>
              ) : null}

              <TouchableOpacity testID="onboarding-see-all-deals" style={styles.seeAll} onPress={seeAllDeals} activeOpacity={0.7}>
                <Text style={styles.seeAllText}>See all deals</Text>
                <ChevronRight size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Animated.View style={[styles.artWrap, { transform: [{ translateY: floatY }] }]}>
                <ArtFindDeals />
              </Animated.View>
              <Text style={styles.title}>{area ? `No live deals in ${area} yet` : 'No live deals just yet'}</Text>
              <Text style={styles.body}>
                {area
                  ? `New surplus deals pop up in ${area} throughout the day. Want a heads-up the moment they go live?`
                  : 'New surplus deals pop up throughout the day. Want a heads-up the moment they go live?'}
              </Text>
              {optedIn ? (
                <View style={[styles.notifyBtn, styles.notifyDone]} testID="onboarding-notify-done">
                  <Check size={18} color={COLORS.primary} />
                  <Text style={styles.notifyDoneText}>You’re on the list! We’ll email you.</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.notifyBtn} testID="onboarding-notify-me" onPress={notifyMe} activeOpacity={0.85}>
                  <Bell size={18} color="#fff" />
                  <Text style={styles.notifyText}>Notify me when deals go live</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dots}>
        {Array.from({ length: TOTAL }).map((_, i) => (
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
            <Text style={styles.stepText}>{index + 1} of {TOTAL}</Text>
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
  artWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  title: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.primaryDark, textAlign: 'center', marginBottom: SPACING.md },
  tagline: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: COLORS.primary, textAlign: 'center', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: SPACING.xs },
  body: { fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.xl,
    backgroundColor: COLORS.primary + '15', paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.full,
  },
  hintText: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: SPACING.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { width: 22, backgroundColor: COLORS.primary },
  footer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  nextBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  getStartedBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center' },
  getStartedText: { color: '#fff', fontSize: 17, fontFamily: 'Outfit_600SemiBold' },
  // Deal preview card
  dealCard: { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden', ...SHADOWS.medium },
  dealImageWrap: { position: 'relative' },
  dealImage: { width: '100%', height: 150, backgroundColor: COLORS.borderLight },
  dealImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  dealBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: COLORS.accentUrgent, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  dealBadgeText: { color: '#fff', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  dealTimer: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  dealTimerText: { color: '#fff', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  dealInfo: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  dealName: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  dealVendor: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  dealPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  dealPrice: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  dealStrike: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  dealCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, marginTop: SPACING.md, paddingVertical: 14 },
  dealCtaText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  dealDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACING.md },
  dealDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.border },
  dealDotActive: { width: 18, backgroundColor: COLORS.primary },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: SPACING.md, paddingVertical: 6 },
  seeAllText: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  notifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: SPACING.lg, marginTop: SPACING.lg },
  notifyText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  notifyDone: { backgroundColor: COLORS.primary + '15' },
  notifyDoneText: { color: COLORS.primaryDark, fontSize: 14, fontFamily: 'DMSans_700Bold' },
});
