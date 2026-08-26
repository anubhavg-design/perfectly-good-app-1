import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin, BadgeCheck } from 'lucide-react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { restaurantsApi } from '../src/api/client';
import * as adapter from '../src/api/adapter';
import CachedImage from '../src/components/CachedImage';
import VegDot from '../src/components/VegDot';
import { ListSkeleton } from '../src/components/Skeleton';

const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;
const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { key: 'price', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'discount', label: 'Discount: High to Low' },
  { key: 'distance', label: 'Nearest to Me' },
];

const PRICE_FILTERS = [
  { key: 0, label: 'All' },
  { key: 100, label: 'Under ₹100' },
  { key: 200, label: 'Under ₹200' },
  { key: 300, label: 'Under ₹300' },
];

const DealCard = React.memo(function DealCard({ item, onPress }: { item: any; onPress: (id: string) => void }) {
  return (
    <TouchableOpacity
      testID={`browse-deal-${item.item_id}`}
      style={styles.card}
      onPress={() => onPress(item.vendor_id)}
      activeOpacity={0.85}
    >
      <CachedImage uri={item.item_thumbnail || item.item_image} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{item.item_name}</Text>
        <View style={styles.vendorRow}>
          <Text style={styles.cardVendor} numberOfLines={1}>{item.vendor_name}</Text>
          {item.verified ? <BadgeCheck size={12} color={COLORS.primary} /> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{item.price}</Text>
          <Text style={styles.strike}>₹{item.original_price}</Text>
          {item.distance != null ? (
            <View style={styles.distMeta}>
              <MapPin size={11} color={COLORS.textMuted} />
              <Text style={styles.distText}>{item.distance} km</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.discountBadge}>
        <Text style={styles.discountBadgeText}>{item.discount}% OFF</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function BrowseDealsScreen() {
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('price');
  const [priceMax, setPriceMax] = useState(0);
  const [vegOnly, setVegOnly] = useState(false);
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);
  const [offset, setOffset] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLat(loc.coords.latitude);
          setLon(loc.coords.longitude);
        }
      } catch {}
    })();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adapter.browseDeals.list({
        limit: PAGE_SIZE, cursor: null,
        params: { lat, lon, sort_by: sortBy },
      });
      const list = res.items || [];
      setDeals(list);
      setOffset(list.length);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      console.log('Failed to load browse deals', err);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, sortBy]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const res = await adapter.browseDeals.list({
        limit: PAGE_SIZE, cursor,
        params: { lat, lon, sort_by: sortBy },
      });
      const list = res.items || [];
      setDeals((prev) => [...prev, ...list]);
      setOffset((prev) => prev + list.length);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      console.log('Failed to load more deals', err);
    } finally {
      setLoadingMore(false);
    }
  }, [lat, lon, sortBy, cursor, hasMore, loadingMore, loading]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const openRestaurant = useCallback((vendorId: string) => router.push(`/restaurant/${vendorId}`), [router]);
  const renderDeal = useCallback(({ item }: { item: any }) => (
    <DealCard item={item} onPress={openRestaurant} />
  ), [openRestaurant]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="browse-back"
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse Deals</Text>
        <TouchableOpacity
          testID="veg-only-toggle"
          style={[styles.vegToggle, vegOnly && styles.vegToggleActive]}
          onPress={() => setVegOnly((v) => !v)}
          activeOpacity={0.8}
        >
          <VegDot size={14} color={vegOnly ? '#fff' : COLORS.success} />
          <Text style={[styles.vegToggleText, vegOnly && styles.vegToggleTextActive]}>Veg</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sortBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortBar}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                testID={`sort-${opt.key}`}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortBy(opt.key)}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.priceBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortBar}>
          {PRICE_FILTERS.map((pf) => {
            const active = priceMax === pf.key;
            return (
              <TouchableOpacity
                key={pf.key}
                testID={`price-${pf.key}`}
                style={[styles.priceChip, active && styles.priceChipActive]}
                onPress={() => setPriceMax(pf.key)}
              >
                <Text style={[styles.priceChipText, active && styles.priceChipTextActive]}>{pf.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.skeletonWrap}>
          <ListSkeleton count={6} variant="restaurant" />
        </View>
      ) : (
        <FlatList
          testID="browse-deals-list"
          data={(() => {
            let list = deals;
            if (vegOnly) list = list.filter((d) => d.food_type !== 'non_veg');
            if (priceMax) list = list.filter((d) => (d.price ?? d.original_price) < priceMax);
            return list;
          })()}
          renderItem={renderDeal}
          keyExtractor={(item) => item.item_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No deals right now</Text>
              <Text style={styles.emptySubtitle}>Check back soon for discounted menu items.</Text>
            </View>
          }
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          ListFooterComponent={loadingMore ? (
            <View style={styles.listFooter}><ActivityIndicator size="small" color={COLORS.primary} /></View>
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  vegToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.success, backgroundColor: COLORS.surface },
  vegToggleActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  vegToggleText: { fontSize: 12.5, fontFamily: 'DMSans_700Bold', color: COLORS.success },
  vegToggleTextActive: { color: '#fff' },

  sortBarWrap: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  sortBar: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  sortChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.borderLight, marginRight: SPACING.sm,
  },
  sortChipActive: { backgroundColor: COLORS.primary },
  sortChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  sortChipTextActive: { color: '#fff' },
  priceBarWrap: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  priceChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.sm },
  priceChipActive: { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary },
  priceChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  priceChipTextActive: { color: COLORS.primary, fontFamily: 'DMSans_700Bold' },

  centerLoader: { paddingVertical: 60, alignItems: 'center' },
  skeletonWrap: { paddingTop: SPACING.md },
  listFooter: { paddingVertical: SPACING.lg, alignItems: 'center' },
  listContent: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },

  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: SPACING.sm, gap: SPACING.sm, ...SHADOWS.small,
  },
  cardImage: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  cardVendor: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 6 },
  price: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  strike: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  distMeta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  distText: { fontSize: 11.5, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },

  discountBadge: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3, alignSelf: 'flex-start',
  },
  discountBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'DMSans_700Bold' },

  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 4 },
});
