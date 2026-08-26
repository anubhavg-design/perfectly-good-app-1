import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Image, ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Search, SlidersHorizontal, MapPin, Clock, X, Sparkles, Store, ChevronRight, Heart, BadgeCheck, Tag } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { dropsApi, restaurantsApi } from '../../src/api/client';
import * as adapter from '../../src/api/adapter';
import { SurplusRail } from '../../src/components/SurplusRail';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import CachedImage from '../../src/components/CachedImage';
import VegDot from '../../src/components/VegDot';
import CartBar from '../../src/components/CartBar';
import { ListSkeleton } from '../../src/components/Skeleton';
import * as Location from 'expo-location';

// Default: Bangalore
const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;
const PAGE_SIZE = 10;
const HOME_CACHE_KEY = 'pg_home_restaurants_v1';

function getTimeRemaining(endTime: string) {
  if (!endTime) return '';
  const now = new Date();
  const [h, m] = endTime.split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  const diff = end.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function getDiscount(original: number, discounted: number) {
  if (!original) return 0;
  return Math.round(((original - discounted) / original) * 100);
}

const RestaurantCard = React.memo(function RestaurantCard({ item, onPress }: { item: any; onPress: (id: string) => void }) {
  return (
    <TouchableOpacity
      testID={`restaurant-card-${item.vendor_id}`}
      style={styles.restCard}
      onPress={() => onPress(item.vendor_id)}
      activeOpacity={0.85}
    >
      {item.storefront_thumbnail || item.storefront_image || item.logo_url ? (
        <CachedImage uri={item.storefront_thumbnail || item.storefront_image || item.logo_url} style={styles.restLogo} />
      ) : (
        <View style={[styles.restLogo, styles.restLogoPlaceholder]}>
          <Text style={styles.restLogoInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.restNameRow}>
          <Text style={styles.restName} numberOfLines={1}>{item.name}</Text>
          {item.verified ? (
            <View style={styles.verifiedBadge}>
              <BadgeCheck size={12} color={COLORS.primary} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.restCategory} numberOfLines={1}>{item.category}</Text>
        <View style={styles.restMetaRow}>
          <View style={[styles.statusPill, { backgroundColor: (item.is_open ? COLORS.success : COLORS.accentUrgent) + '18' }]}>
            <Text style={[styles.statusPillText, { color: item.is_open ? COLORS.success : COLORS.accentUrgent }]}>
              {item.is_open ? 'Open' : 'Closed'}
            </Text>
          </View>
          {item.distance != null ? (
            <View style={styles.restMeta}>
              <MapPin size={12} color={COLORS.textMuted} />
              <Text style={styles.restMetaText}>{item.distance} km</Text>
            </View>
          ) : null}
          {item.discount_percentage > 0 ? (
            <View style={styles.discountPill}>
              <Text style={styles.discountPillText}>{item.discount_percentage}% OFF</Text>
            </View>
          ) : null}
          {item.surplus_count > 0 ? (
            <View style={styles.surplusPill}>
              <Sparkles size={11} color={COLORS.primary} />
              <Text style={styles.surplusPillText}>{item.surplus_count} surplus</Text>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronRight size={20} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const surplusOnly = params?.focus === 'surplus';
  const { user } = useAuth();
  const [drops, setDrops] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [rOffset, setROffset] = useState(0);
  const [rCursor, setRCursor] = useState<string | null>(null);
  const [rHasMore, setRHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dropsLoading, setDropsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);
  const [showSignInHint, setShowSignInHint] = useState(true);
  const hasDataRef = useRef(false);

  // Instant load: show the last cached restaurant list immediately on open,
  // then loadData() fetches fresh in the background.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOME_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached) && cached.length && restaurants.length === 0) {
            setRestaurants(cached);
            setROffset(cached.length);
            hasDataRef.current = true;
            setLoading(false);
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live countdown moved into <SurplusRail /> (Phase 4) so the 60s tick no
  // longer forces the whole HomeScreen to re-render.

  useEffect(() => {
    if (user?.role === 'vendor') router.replace('/(tabs)/dashboard');
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLat(loc.coords.latitude);
          setLon(loc.coords.longitude);
        }
      } catch {}
    })();
    loadCategories();
  }, []);

  useEffect(() => {
    loadData();
  }, [search, selectedCategory, lat, lon]);

  // Cache freshness: silently re-fetch when returning to Home so new deals show up.
  const refreshSilently = useCallback(async () => {
    try {
      const restRes = await adapter.restaurants.list({
        limit: PAGE_SIZE, cursor: null,
        params: { lat, lon, search: search || undefined, category: selectedCategory || undefined },
      });
      const list = restRes.items || [];
      setRestaurants(list);
      setROffset(list.length);
      setRCursor(restRes.nextCursor);
      setRHasMore(restRes.hasMore);
      if (!search && !selectedCategory) {
        AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }
      adapter.drops.list({
        limit: 20, cursor: null,
        params: { lat, lon, search: search || undefined, category: selectedCategory || undefined },
      }).then((d) => setDrops(d.items || [])).catch(() => {});
      adapter.featuredDeals.list({
        limit: 10, cursor: null, params: { lat, lon },
      }).then((f) => setFeatured(f.items || [])).catch(() => {});
    } catch (err) {
      console.log('Silent refresh failed', err);
    }
  }, [lat, lon, search, selectedCategory]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      refreshSilently();
    }, [refreshSilently]),
  );

  const loadCategories = async () => {
    try {
      const data = await dropsApi.categories();
      setCategories(data || []);
    } catch {}
  };

  const loadData = async () => {
    const isDefaultView = !search && !selectedCategory;
    if (!hasDataRef.current) setLoading(true);
    // Restaurants — first page only (blocks the initial gate)
    try {
      const restRes = await adapter.restaurants.list({
        limit: PAGE_SIZE, cursor: null,
        params: { lat, lon, search: search || undefined, category: selectedCategory || undefined },
      });
      const list = restRes.items || [];
      setRestaurants(list);
      setROffset(list.length);
      setRCursor(restRes.nextCursor);
      setRHasMore(restRes.hasMore);
      hasDataRef.current = true;
      if (isDefaultView) {
        AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }
    } catch (err) {
      console.log('Failed to load restaurants', err);
    } finally {
      setLoading(false);
    }
    // Surplus + featured load in the background so a slow call never blocks the page
    setDropsLoading(true);
    adapter.drops.list({
      limit: 20, cursor: null,
      params: { lat, lon, search: search || undefined, category: selectedCategory || undefined },
    }).then((d) => setDrops(d.items || [])).catch(() => {}).finally(() => setDropsLoading(false));
    adapter.featuredDeals.list({
      limit: 10, cursor: null, params: { lat, lon },
    }).then((f) => setFeatured(f.items || [])).catch(() => {});
  };

  const loadMoreRestaurants = async () => {
    if (loadingMore || !rHasMore || loading) return;
    setLoadingMore(true);
    try {
      const more = await adapter.restaurants.list({
        limit: PAGE_SIZE, cursor: rCursor,
        params: { lat, lon, search: search || undefined, category: selectedCategory || undefined },
      });
      const list = more.items || [];
      setRestaurants((prev) => [...prev, ...list]);
      setROffset((prev) => prev + list.length);
      setRCursor(more.nextCursor);
      setRHasMore(more.hasMore);
    } catch (err) {
      console.log('Failed to load more restaurants', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [search, selectedCategory, lat, lon]);

  const openRestaurant = useCallback((vendorId: string) => router.push(`/restaurant/${vendorId}`), [router]);

  const renderFeaturedCard = useCallback(({ item }: { item: any }) => (
    <TouchableOpacity
      testID={`featured-card-${item.vendor_id}`}
      style={styles.featuredCard}
      onPress={() => router.push(`/restaurant/${item.vendor_id}`)}
      activeOpacity={0.85}
    >
      <View>
        <CachedImage uri={item.item_thumbnail || item.item_image} style={styles.featuredImage} showLabel />
        <View style={styles.featuredReasonPill}>
          <Sparkles size={11} color="#fff" />
          <Text style={styles.featuredReasonText}>{item.reason}</Text>
        </View>
        {item.discount > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{item.discount}% OFF</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.surplusBody}>
        <Text style={styles.surplusName} numberOfLines={1}>{item.item_name}</Text>
        <View style={styles.featuredVendorRow}>
          <Text style={styles.surplusVendor} numberOfLines={1}>{item.vendor_name}</Text>
          {item.verified ? <BadgeCheck size={12} color={COLORS.primary} /> : null}
        </View>
        <View style={styles.cardMetaRow}>
          {item.vendor_category ? <Text style={styles.cardMetaText}>{item.vendor_category}</Text> : null}
          {item.vendor_category && item.distance != null ? <Text style={styles.cardMetaDot}>·</Text> : null}
          {item.distance != null ? (
            <View style={styles.cardMetaDist}>
              <MapPin size={10} color={COLORS.textMuted} />
              <Text style={styles.cardMetaText}>{item.distance} km</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.surplusPriceRow}>
          <Text style={styles.surplusPrice}>₹{item.price}</Text>
          {item.discount > 0 ? (
            <Text style={styles.surplusStrike}>₹{item.original_price}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderRestaurant = useCallback(({ item }: { item: any }) => (
    <RestaurantCard item={item} onPress={openRestaurant} />
  ), [openRestaurant]);

  const isVeg = (ft: string) => ft !== 'non_veg';
  const vegDrops = useMemo(
    () => (vegOnly ? drops.filter((d: any) => isVeg(d.food_type)) : drops),
    [vegOnly, drops],
  );
  const vegFeatured = useMemo(
    () => (vegOnly ? featured.filter((f: any) => isVeg(f.food_type)) : featured),
    [vegOnly, featured],
  );
  const vegRestaurants = useMemo(
    () => (vegOnly ? restaurants.filter((r: any) => r.has_veg) : restaurants),
    [vegOnly, restaurants],
  );
  const restaurantsData = useMemo(
    () => (surplusOnly ? vegRestaurants.filter((r) => (r.surplus_count || 0) > 0) : vegRestaurants),
    [surplusOnly, vegRestaurants],
  );

  const ListHeader = (
    <View>
      {!user && showSignInHint ? (
        <View style={styles.signInHint} testID="guest-signin-hint">
          <Heart size={18} color={COLORS.primary} />
          <View style={styles.signInHintTextWrap}>
            <Text style={styles.signInHintText}>Sign in to save favourites & reorder faster</Text>
          </View>
          <TouchableOpacity testID="guest-signin-hint-cta" onPress={() => router.push('/login')}>
            <Text style={styles.signInHintCta}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="guest-signin-hint-dismiss" onPress={() => setShowSignInHint(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
      {surplusOnly ? (
        <View style={styles.surplusBanner} testID="surplus-only-banner">
          <View style={styles.surplusBannerLeft}>
            <Sparkles size={16} color={COLORS.primary} />
            <Text style={styles.surplusBannerText}>Showing surplus deals only</Text>
          </View>
          <TouchableOpacity testID="clear-surplus-filter" onPress={() => router.replace('/(tabs)/home')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      ) : null}
      {/* Header */}
      <View style={styles.headerSection}>
        <View style={{ width: 40 }} />
        <Image
          source={require('../../assets/images/splash-icon.png')}
          style={styles.headerLogo}
          resizeMode="contain"
          accessibilityLabel="Perfectly Good"
        />
        <TouchableOpacity
          testID="veg-only-toggle"
          style={[styles.vegToggle, vegOnly && styles.vegToggleActive]}
          onPress={() => setVegOnly((v) => !v)}
          activeOpacity={0.8}
          accessibilityLabel="Veg only filter"
        >
          <VegDot size={14} color={vegOnly ? '#fff' : COLORS.success} />
          <Text style={[styles.vegToggleText, vegOnly && styles.vegToggleTextActive]}>Veg</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Search size={18} color={COLORS.textMuted} />
          <TextInput
            testID="search-input"
            style={styles.searchInput}
            placeholder="Search food, restaurants..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity testID="clear-search" onPress={() => setSearch('')}>
              <X size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          testID="filter-btn"
          style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={20} color={showFilters ? '#fff' : COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <TouchableOpacity
              testID="filter-all"
              style={[styles.chip, !selectedCategory && styles.chipActive]}
              onPress={() => setSelectedCategory('')}
            >
              <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                testID={`filter-${cat}`}
                style={[styles.chip, selectedCategory === cat && styles.chipActive]}
                onPress={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Browse All Deals entry */}
      <TouchableOpacity
        testID="browse-all-deals"
        style={styles.browseCard}
        onPress={() => router.push('/browse-deals')}
        activeOpacity={0.9}
      >
        <View style={styles.browseIcon}>
          <Tag size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.browseTitle}>Browse All Deals</Text>
          <Text style={styles.browseSub}>Discounted menu items from every restaurant near you</Text>
          <View style={styles.browseCta}>
            <Text style={styles.browseCtaText}>Explore deals</Text>
            <ChevronRight size={16} color="#fff" />
          </View>
        </View>
      </TouchableOpacity>

      {/* Surplus Deals */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadRow}>
          <View style={styles.sectionTitleRow}>
            <Sparkles size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Surplus Deals</Text>
          </View>
          <TouchableOpacity testID="see-all-surplus" onPress={() => router.push('/surplus')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionSub}>Upto 70% off. Grab it before it&apos;s gone</Text>
      </View>
      <SurplusRail items={vegDrops} loading={dropsLoading} />

      {/* Featured Deals */}
      {!surplusOnly && vegFeatured.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Sparkles size={18} color={COLORS.accentUrgent} />
              <Text style={styles.sectionTitle}>Featured Deals</Text>
            </View>
            <Text style={styles.sectionSub}>One standout pick from each restaurant</Text>
          </View>
          <FlatList
            testID="featured-list"
            data={vegFeatured}
            renderItem={renderFeaturedCard}
            keyExtractor={(item) => `feat-${item.vendor_id}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.surplusListContent}
          />
        </>
      ) : null}

      {/* Nearby Restaurants heading */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Store size={18} color={COLORS.textPrimary} />
          <Text style={styles.sectionTitle}>Nearby Restaurants</Text>
        </View>
        <Text style={styles.sectionSub}>Order Surplus, Takeaway or Dine-in</Text>
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {ListHeader}
        <ListSkeleton count={5} variant="restaurant" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        testID="restaurants-list"
        data={restaurantsData}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.vendor_id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          loading ? (
            <ListSkeleton count={5} variant="restaurant" />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No restaurants found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search or filters.</Text>
            </View>
          )
        }
        onEndReached={loadMoreRestaurants}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooter}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null
        }
      />
      <CartBar bottomOffset={64} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listFooter: { paddingVertical: SPACING.lg, alignItems: 'center' },
  surplusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary + '12', marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  surplusBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  surplusBannerText: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.primaryDark },
  signInHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary + '10', marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  signInHintTextWrap: { flex: 1 },
  signInHintText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  signInHintCta: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.primary, marginRight: 4 },
  headerSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  headerLogo: { width: 180, height: 56 },
  vegToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.success, backgroundColor: COLORS.surface,
  },
  vegToggleActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  vegToggleText: { fontSize: 12.5, fontFamily: 'DMSans_700Bold', color: COLORS.success },
  vegToggleTextActive: { color: '#fff' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMetaDist: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardMetaText: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  cardMetaDot: { fontSize: 11, color: COLORS.textMuted },
  greeting: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  subGreeting: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  searchRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.sm },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, height: 48,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, marginLeft: SPACING.sm, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  filterBtn: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.primary,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterPanel: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  filterLabel: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.xs },
  chipRow: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.borderLight,
    marginRight: SPACING.sm,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  chipTextActive: { color: '#fff' },
  centerLoader: { paddingVertical: 60, alignItems: 'center' },
  listContent: { paddingBottom: SPACING.xxl },

  sectionHead: { paddingHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAllText: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  browseCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.lg, ...SHADOWS.medium,
  },
  browseIcon: {
    width: 56, height: 56, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accentUrgent,
    alignItems: 'center', justifyContent: 'center',
  },
  browseTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: '#fff' },
  browseSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  browseCta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  browseCtaText: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: '#fff' },
  sectionTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  sectionSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },

  surplusListContent: { paddingHorizontal: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xs },
  surplusEmpty: { marginHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOWS.small },
  surplusEmptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center' },
  surplusCard: {
    width: 190, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.primary + '22', ...SHADOWS.small,
  },
  surplusImage: { width: '100%', height: 110, backgroundColor: COLORS.skeleton },
  discountBadge: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  discountBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'DMSans_700Bold' },
  surplusBody: { padding: SPACING.sm + 2 },
  surplusName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  surplusVendor: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
  surplusPriceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 6 },
  surplusPrice: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  surplusStrike: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  surplusTimer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  surplusTimerText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },

  featuredCard: {
    width: 190, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.accentUrgent + '30', ...SHADOWS.small,
  },
  featuredImage: { width: '100%', height: 110, backgroundColor: COLORS.skeleton },
  featuredImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  featuredReasonPill: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.accentUrgent, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  featuredReasonText: { color: '#fff', fontSize: 10.5, fontFamily: 'DMSans_700Bold' },
  featuredVendorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },

  restCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small,
  },
  restLogo: { width: 60, height: 60, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  restLogoPlaceholder: { backgroundColor: COLORS.primaryDark, justifyContent: 'center', alignItems: 'center' },
  restLogoInitial: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: '#fff' },
  restName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, flexShrink: 1 },
  restNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
  verifiedText: { fontSize: 10.5, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  restCategory: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
  restMetaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 6, flexWrap: 'wrap' },
  restMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  restMetaText: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  surplusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  surplusPillText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  discountPill: { backgroundColor: COLORS.accentUrgent + '18', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  discountPillText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },
  statusPill: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  statusPillText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold' },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
});
