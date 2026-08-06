import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Image, ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Search, SlidersHorizontal, MapPin, Clock, X, Sparkles, Store, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { dropsApi, restaurantsApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import * as Location from 'expo-location';

// Default: Bangalore
const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;

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

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const surplusOnly = params?.focus === 'surplus';
  const { user } = useAuth();
  const [drops, setDrops] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);

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

  const loadCategories = async () => {
    try {
      const data = await dropsApi.categories();
      setCategories(data || []);
    } catch {}
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [dropsRes, restRes] = await Promise.all([
        dropsApi.list({ lat, lon, search: search || undefined, category: selectedCategory || undefined }),
        restaurantsApi.list({ lat, lon, search: search || undefined, category: selectedCategory || undefined }),
      ]);
      setDrops(dropsRes || []);
      setRestaurants(restRes || []);
    } catch (err) {
      console.log('Failed to load home', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [search, selectedCategory, lat, lon]);

  const renderSurplusCard = ({ item }: { item: any }) => {
    const discount = getDiscount(item.original_price, item.discounted_price);
    const timeLeft = getTimeRemaining(item.pickup_end_time);
    return (
      <TouchableOpacity
        testID={`surplus-card-${item.item_id}`}
        style={styles.surplusCard}
        onPress={() => router.push(`/drop/${item.item_id}`)}
        activeOpacity={0.85}
      >
        <View>
          <Image source={{ uri: item.image_url }} style={styles.surplusImage} />
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{discount}% OFF</Text>
          </View>
        </View>
        <View style={styles.surplusBody}>
          <Text style={styles.surplusName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.surplusVendor} numberOfLines={1}>{item.vendor_name}</Text>
          <View style={styles.surplusPriceRow}>
            <Text style={styles.surplusPrice}>₹{item.discounted_price}</Text>
            <Text style={styles.surplusStrike}>₹{item.original_price}</Text>
          </View>
          {timeLeft ? (
            <View style={styles.surplusTimer}>
              <Clock size={11} color={COLORS.accentUrgent} />
              <Text style={styles.surplusTimerText}>{timeLeft} left</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderRestaurant = ({ item }: { item: any }) => (
    <TouchableOpacity
      testID={`restaurant-card-${item.vendor_id}`}
      style={styles.restCard}
      onPress={() => router.push(`/restaurant/${item.vendor_id}`)}
      activeOpacity={0.85}
    >
      {item.storefront_image || item.logo_url ? (
        <Image source={{ uri: item.storefront_image || item.logo_url }} style={styles.restLogo} />
      ) : (
        <View style={[styles.restLogo, styles.restLogoPlaceholder]}>
          <Text style={styles.restLogoInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.restName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.restCategory} numberOfLines={1}>{item.category}</Text>
        <View style={styles.restMetaRow}>
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

  const ListHeader = (
    <View>
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
        <Text style={styles.greeting}>Perfectly Good</Text>
        <Text style={styles.subGreeting}>Rescue surplus food & order from restaurants nearby</Text>
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

      {/* Surplus Deals */}
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          <Sparkles size={18} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Surplus Deals</Text>
        </View>
        <Text style={styles.sectionSub}>Up to 70% off — rescue before it's gone</Text>
      </View>
      {drops.length === 0 ? (
        <View style={styles.surplusEmpty}>
          <Text style={styles.surplusEmptyText}>No surplus deals right now. Check back soon!</Text>
        </View>
      ) : (
        <FlatList
          testID="surplus-list"
          data={drops}
          renderItem={renderSurplusCard}
          keyExtractor={(item) => item.item_id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.surplusListContent}
        />
      )}

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
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        testID="restaurants-list"
        data={surplusOnly ? restaurants.filter((r) => (r.surplus_count || 0) > 0) : restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.vendor_id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No restaurants found</Text>
            <Text style={styles.emptySubtitle}>Try adjusting your search or filters.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  surplusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary + '12', marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  surplusBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  surplusBannerText: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.primaryDark },
  headerSection: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
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
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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

  restCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small,
  },
  restLogo: { width: 60, height: 60, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  restLogoPlaceholder: { backgroundColor: COLORS.primaryDark, justifyContent: 'center', alignItems: 'center' },
  restLogoInitial: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: '#fff' },
  restName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  restCategory: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
  restMetaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 6, flexWrap: 'wrap' },
  restMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  restMetaText: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  surplusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  surplusPillText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  discountPill: { backgroundColor: COLORS.accentUrgent + '18', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  discountPillText: { fontSize: 11.5, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
});
