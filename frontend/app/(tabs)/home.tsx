import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Image, ActivityIndicator, RefreshControl, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, MapPin, Clock, X, Tag } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { dropsApi } from '../../src/api/client';
import * as Location from 'expo-location';

// Default: Bangalore
const DEFAULT_LAT = 12.9716;
const DEFAULT_LON = 77.5946;

function getTimeRemaining(endTime: string) {
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
  return Math.round(((original - discounted) / original) * 100);
}

interface Drop {
  item_id: string;
  name: string;
  description: string;
  original_price: number;
  discounted_price: number;
  quantity_available: number;
  pickup_start_time: string;
  pickup_end_time: string;
  image_url: string;
  vendor_name: string;
  vendor_location: { lat: number; lon: number; address: string };
  vendor_category: string;
  is_active: boolean;
  expiry?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lon, setLon] = useState(DEFAULT_LON);

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
    loadDrops();
  }, [search, selectedCategory, sortBy, lat, lon]);

  const loadCategories = async () => {
    try {
      const data = await dropsApi.categories();
      setCategories(data || []);
    } catch {}
  };

  const loadDrops = async () => {
    try {
      setLoading(true);
      const data = await dropsApi.list({
        lat, lon,
        search: search || undefined,
        category: selectedCategory || undefined,
        sort_by: sortBy || undefined,
      });
      setDrops(data || []);
    } catch (err) {
      console.log('Failed to load drops', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDrops();
    setRefreshing(false);
  }, [search, selectedCategory, sortBy, lat, lon]);

  const renderDrop = ({ item }: { item: Drop }) => {
    const discount = getDiscount(item.original_price, item.discounted_price);
    const timeLeft = getTimeRemaining(item.pickup_end_time);

    return (
      <TouchableOpacity
        testID={`drop-card-${item.item_id}`}
        style={styles.card}
        onPress={() => router.push(`/drop/${item.item_id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.imageContainer}>
          <Image source={{ uri: item.image_url }} style={styles.cardImage} />
          {/* Discount badge */}
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{discount}% OFF</Text>
          </View>
          {/* Quantity badge */}
          {item.quantity_available <= 5 && (
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityBadgeText}>{item.quantity_available} left!</Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.vendorCategory}>{item.vendor_category}</Text>
            <View style={styles.timerRow}>
              <Clock size={12} color={COLORS.accentUrgent} />
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.vendorName} numberOfLines={1}>{item.vendor_name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.discountedPrice}>₹{item.discounted_price}</Text>
            <Text style={styles.originalPrice}>₹{item.original_price}</Text>
          </View>

          <View style={styles.locationRow}>
            <MapPin size={12} color={COLORS.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.vendor_location?.address || 'Nearby'}
            </Text>
          </View>

          {item.expiry ? (
            <View style={styles.expiryRow}>
              <Tag size={12} color={COLORS.accentUrgent} />
              <Text style={styles.expiryText}>Best before {item.expiry}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.headerSection}>
        <View>
          <Text style={styles.greeting}>Perfectly Good</Text>
          <Text style={styles.subGreeting}>Rescue delicious surplus food nearby</Text>
        </View>
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

          <Text style={[styles.filterLabel, { marginTop: SPACING.sm }]}>Sort By</Text>
          <View style={styles.chipRow}>
            {[{ label: 'Price', value: 'price' }, { label: 'Discount', value: 'discount' }].map((s) => (
              <TouchableOpacity
                key={s.value}
                testID={`sort-${s.value}`}
                style={[styles.chip, sortBy === s.value && styles.chipActive]}
                onPress={() => setSortBy(sortBy === s.value ? '' : s.value)}
              >
                <Text style={[styles.chipText, sortBy === s.value && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Drop List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          testID="drops-list"
          data={drops}
          renderItem={renderDrop}
          keyExtractor={(item) => item.item_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No drops available</Text>
              <Text style={styles.emptySubtitle}>Check back soon for fresh surplus deals!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    marginBottom: SPACING.md, overflow: 'hidden', ...SHADOWS.medium,
  },
  imageContainer: { position: 'relative' },
  cardImage: { width: '100%', height: 180, backgroundColor: COLORS.skeleton },
  discountBadge: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs,
  },
  discountBadgeText: { color: '#fff', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  quantityBadge: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    backgroundColor: COLORS.accentUrgent, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs,
  },
  quantityBadgeText: { color: '#fff', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  cardContent: { padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  vendorCategory: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },
  cardTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: 2 },
  vendorName: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  discountedPrice: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  originalPrice: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, flex: 1 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.xs },
  expiryText: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: COLORS.accentUrgent },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
});
