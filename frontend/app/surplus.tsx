import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { dropsApi } from '../src/api/client';
import * as adapter from '../src/api/adapter';
import CachedImage from '../src/components/CachedImage';
import VegDot from '../src/components/VegDot';
import { ListSkeleton } from '../src/components/Skeleton';

const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;
const PAGE_SIZE = 10;

const PRICE_FILTERS = [
  { key: 0, label: 'All' },
  { key: 100, label: 'Under ₹100' },
  { key: 200, label: 'Under ₹200' },
  { key: 300, label: 'Under ₹300' },
];

const SORT_OPTIONS = [
  { key: 'price', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'discount', label: 'Discount: High to Low' },
  { key: 'distance', label: 'Nearest to Me' },
];

const activePrice = (d: any) => (d.price ?? d.discounted_price ?? d.original_price ?? 0);

export default function SurplusScreen() {
  const router = useRouter();
  const [drops, setDrops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [priceMax, setPriceMax] = useState(0);
  const [sortBy, setSortBy] = useState('price');
  const [vegOnly, setVegOnly] = useState(false);
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);

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
      const res = await adapter.drops.list({
        limit: PAGE_SIZE, cursor: null,
        params: { lat, lon, sort_by: sortBy },
      });
      const items = res.items || [];
      setDrops(items);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      console.log('Failed to load surplus deals', err);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, sortBy]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const res = await adapter.drops.list({
        limit: PAGE_SIZE, cursor,
        params: { lat, lon, sort_by: sortBy },
      });
      const items = res.items || [];
      setDrops((prev) => [...prev, ...items]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      console.log('Failed to load more surplus deals', err);
    } finally {
      setLoadingMore(false);
    }
  }, [lat, lon, sortBy, cursor, hasMore, loadingMore, loading]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const getDiscount = (op: number, p: number) => (op && p < op ? Math.round(((op - p) / op) * 100) : 0);

  const renderCard = useCallback(({ item }: { item: any }) => {
    const price = activePrice(item);
    const discount = getDiscount(item.original_price, price);
    return (
      <TouchableOpacity
        testID={`surplus-item-${item.item_id}`}
        style={styles.card}
        onPress={() => router.push(`/drop/${item.item_id}`)}
        activeOpacity={0.85}
      >
        <CachedImage uri={item.thumbnail_url || item.image_url} style={styles.cardImage} />
        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.vendor} numberOfLines={1}>{item.vendor_name}</Text>
          <View style={styles.metaRow}>
            {item.vendor_category ? <Text style={styles.metaText}>{item.vendor_category}</Text> : null}
            {item.vendor_category && item.distance != null ? <Text style={styles.metaText}>·</Text> : null}
            {item.distance != null ? (
              <View style={styles.metaDist}>
                <MapPin size={10} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{item.distance} km</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{price}</Text>
            {item.original_price > price ? <Text style={styles.strike}>₹{item.original_price}</Text> : null}
            {item.quantity_available != null ? <Text style={styles.qty}>{item.quantity_available} left</Text> : null}
          </View>
        </View>
        {discount > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{discount}% OFF</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }, [router]);

  // Client-side veg/price filters apply on the accumulated list (post-pagination).
  const data = useMemo(() => drops.filter((d) => {
    if (vegOnly && d.food_type === 'non_veg') return false;
    if (priceMax && !(activePrice(d) < priceMax)) return false;
    return true;
  }), [drops, vegOnly, priceMax]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="surplus-back" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Surplus Deals</Text>
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

      <View style={styles.priceBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priceBar}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortBy === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                testID={`sort-${opt.key}`}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortBy(opt.key)}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.priceBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priceBar}>
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
        <View style={{ paddingTop: SPACING.md }}><ListSkeleton count={6} variant="restaurant" /></View>
      ) : (
        <FlatList
          testID="surplus-screen-list"
          data={data}
          renderItem={renderCard}
          keyExtractor={(item) => item.item_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'ios'}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.listFooter}><ActivityIndicator size="small" color={COLORS.primary} /></View>
            ) : (!hasMore && data.length > 0 ? (
              <View style={styles.listFooter}><Text style={styles.footerText}>You've seen all deals</Text></View>
            ) : null)
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No surplus deals</Text>
              <Text style={styles.emptySubtitle}>Check back soon — new deals drop through the day.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listFooter: { paddingVertical: SPACING.lg, alignItems: 'center' },
  footerText: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: COLORS.textMuted },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  vegToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.success, backgroundColor: COLORS.surface },
  vegToggleActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  vegToggleText: { fontSize: 12.5, fontFamily: 'DMSans_700Bold', color: COLORS.success },
  vegToggleTextActive: { color: '#fff' },
  priceBarWrap: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  priceBar: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  priceChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.sm },
  priceChipActive: { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary },
  priceChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  priceChipTextActive: { color: COLORS.primary, fontFamily: 'DMSans_700Bold' },
  sortChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: RADIUS.full, backgroundColor: COLORS.borderLight, marginRight: SPACING.sm },
  sortChipActive: { backgroundColor: COLORS.primary },
  sortChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  sortChipTextActive: { color: '#fff' },
  centerLoader: { paddingVertical: 60, alignItems: 'center' },
  listContent: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xxl },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.sm, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary + '22', ...SHADOWS.small },
  cardImage: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  vendor: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaDist: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  metaText: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  price: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  strike: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  qty: { fontSize: 11.5, fontFamily: 'DMSans_500Medium', color: COLORS.accentUrgent, marginLeft: 'auto' },
  discountBadge: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  discountBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'DMSans_700Bold' },
  emptyState: { paddingVertical: 60, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 4 },
});
