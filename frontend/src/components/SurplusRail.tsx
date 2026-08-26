import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, MapPin, Sparkles } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import CachedImage from './CachedImage';
import { ListSkeleton } from './Skeleton';

// Phase 4: SurplusRail owns its own 60s tick so the countdown update never
// bubbles up to the parent HomeScreen and re-renders the vertical restaurants
// list. Wrapped in React.memo so unrelated parent re-renders don't touch it either.

type Props = { items: any[]; loading?: boolean };

function getTimeRemaining(pickupEnd: string | undefined): string {
  if (!pickupEnd) return '';
  const [hh, mm] = String(pickupEnd).split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(hh)) return '';
  const now = new Date();
  const end = new Date();
  end.setHours(hh, mm || 0, 0, 0);
  let diff = Math.floor((end.getTime() - now.getTime()) / 60000);
  if (diff <= 0) return '';
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getDiscount(op: number, p: number) {
  return op && p < op ? Math.round(((op - p) / op) * 100) : 0;
}

function SurplusRailInner({ items, loading }: Props) {
  const router = useRouter();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const renderCard = useCallback(({ item }: { item: any }) => {
    const activePrice = item.price ?? item.discounted_price ?? item.original_price;
    const discount = getDiscount(item.original_price, activePrice);
    const timeLeft = getTimeRemaining(item.pickup_end_time);
    return (
      <TouchableOpacity
        testID={`surplus-card-${item.item_id}`}
        style={styles.surplusCard}
        onPress={() => router.push(`/drop/${item.item_id}`)}
        activeOpacity={0.85}
      >
        <View>
          <CachedImage uri={item.thumbnail_url || item.image_url} style={styles.surplusImage} />
          {discount > 0 ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{discount}% OFF</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.surplusBody}>
          <Text style={styles.surplusName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.surplusVendor} numberOfLines={1}>{item.vendor_name}</Text>
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
            <Text style={styles.surplusPrice}>₹{activePrice}</Text>
            {item.original_price > activePrice ? (
              <Text style={styles.surplusStrike}>₹{item.original_price}</Text>
            ) : null}
          </View>
          {timeLeft ? (
            <View style={styles.surplusTimer}>
              <Clock size={11} color={COLORS.accentUrgent} />
              <Text style={styles.surplusTimerText}>Ends in {timeLeft}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, router]);

  if (loading) return <ListSkeleton count={3} variant="deal" />;
  if (!items || items.length === 0) {
    return (
      <View style={styles.surplusEmpty}>
        <Text style={styles.surplusEmptyText}>No surplus deals right now. Check back soon!</Text>
      </View>
    );
  }
  return (
    <FlatList
      testID="surplus-list"
      data={items}
      extraData={tick}
      renderItem={renderCard}
      keyExtractor={(item) => item.item_id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.surplusListContent}
    />
  );
}

// Shallow prop comparison — re-render only if `items` array reference or
// `loading` flag actually changed. Everything internal (tick) is state, not props.
export const SurplusRail = React.memo(SurplusRailInner, (prev, next) => (
  prev.items === next.items && prev.loading === next.loading
));

export default SurplusRail;

const styles = StyleSheet.create({
  surplusListContent: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  surplusCard: {
    width: 200, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    marginRight: SPACING.sm, overflow: 'hidden', ...SHADOWS.card,
  },
  surplusImage: { width: '100%', height: 120, backgroundColor: COLORS.surfaceMuted },
  discountBadge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: COLORS.accentUrgent,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm,
  },
  discountBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Outfit_700Bold' },
  surplusBody: { padding: SPACING.sm, gap: 4 },
  surplusName: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
  surplusVendor: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: COLORS.textSecondary },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMetaText: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: COLORS.textMuted },
  cardMetaDot: { fontSize: 11, color: COLORS.textMuted },
  cardMetaDist: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  surplusPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  surplusPrice: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: COLORS.textPrimary },
  surplusStrike: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: COLORS.textMuted, textDecorationLine: 'line-through' },
  surplusTimer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  surplusTimerText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: COLORS.accentUrgent },
  surplusEmpty: {
    marginHorizontal: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
  },
  surplusEmptyText: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
});
