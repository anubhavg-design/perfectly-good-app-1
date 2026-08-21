import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, MapPin, Users, Tag, ExternalLink } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { dropsApi } from '../../src/api/client';
import AddToCartSheet from '../../src/components/AddToCartSheet';
import CartBar from '../../src/components/CartBar';
import { AddMeta } from '../../src/context/CartContext';

function getDiscount(original: number, discounted: number) {
  return Math.round(((original - discounted) / original) * 100);
}

function getTimeRemaining(endTime: string) {
  const now = new Date();
  const [h, m] = endTime.split(':').map(Number);
  const end = new Date(now);
  end.setHours(h, m, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  const diff = end.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function DropDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [drop, setDrop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<AddMeta | null>(null);

  useEffect(() => {
    loadDrop();
  }, [id]);

  const loadDrop = async () => {
    try {
      const data = await dropsApi.get(id!, 12.9716, 77.5946);
      setDrop(data);
    } catch (err) {
      console.log('Failed to load drop', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!drop) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity testID="back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.loader}>
          <Text style={styles.errorText}>Drop not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activePrice = drop.price ?? drop.discounted_price ?? drop.original_price;
  const discount = getDiscount(drop.original_price, activePrice);
  const timeLeft = getTimeRemaining(drop.pickup_end_time);
  const savings = drop.original_price - activePrice;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image */}
        <View style={styles.imageWrap}>
          <Image source={{ uri: drop.image_url }} style={styles.heroImage} />
          <SafeAreaView style={styles.imageOverlay} edges={['top']}>
            <TouchableOpacity testID="back-btn" style={styles.backBtnFloat} onPress={() => router.back()}>
              <ArrowLeft size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </SafeAreaView>
          {/* Badges */}
          <View style={styles.badgeRow}>
            {discount > 0 ? (
              <View style={styles.discountBadge}>
                <Text style={styles.badgeText}>{discount}% OFF</Text>
              </View>
            ) : null}
            {drop.quantity_available <= 5 && (
              <View style={styles.urgentBadge}>
                <Text style={styles.badgeText}>{drop.quantity_available} left!</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Category & Timer */}
          <View style={styles.metaRow}>
            <View style={styles.categoryChip}>
              <Tag size={12} color={COLORS.primary} />
              <Text style={styles.categoryText}>{drop.vendor_category}</Text>
            </View>
            <View style={styles.timerChip}>
              <Clock size={12} color={COLORS.accentUrgent} />
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{drop.name}</Text>
          <Text style={styles.vendorName}>{drop.vendor_name}</Text>

          {/* Description */}
          <Text style={styles.description}>{drop.description}</Text>

          {/* Pricing */}
          <View style={styles.priceCard}>
            <View style={styles.priceLeft}>
              <Text style={styles.discountedPrice}>₹{activePrice}</Text>
              {drop.original_price > activePrice ? (
                <Text style={styles.originalPrice}>₹{drop.original_price}</Text>
              ) : null}
            </View>
            {savings > 0 ? (
              <View style={styles.savingsChip}>
                <Text style={styles.savingsText}>You save ₹{savings}</Text>
              </View>
            ) : null}
          </View>

          {/* Info rows */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Clock size={18} color={COLORS.textSecondary} />
              <View>
                <Text style={styles.infoLabel}>Pickup Window</Text>
                <Text style={styles.infoValue}>{drop.pickup_start_time} — {drop.pickup_end_time}</Text>
              </View>
            </View>
            {drop.expiry ? (
              <View style={styles.infoRow}>
                <Tag size={18} color={COLORS.accentUrgent} />
                <View>
                  <Text style={styles.infoLabel}>Best Before</Text>
                  <Text style={styles.infoValue}>{drop.expiry}</Text>
                </View>
              </View>
            ) : null}
            <TouchableOpacity
              testID="open-maps-btn"
              style={styles.infoRow}
              onPress={() => {
                const loc = drop.vendor_location;
                const mapsUrl = loc?.maps_url || (loc?.lat && loc?.lon ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}` : null);
                if (mapsUrl) Linking.openURL(mapsUrl);
              }}
              activeOpacity={0.7}
            >
              <MapPin size={18} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{drop.vendor_location?.address || 'Nearby'}</Text>
              </View>
              <ExternalLink size={16} color={COLORS.primary} />
            </TouchableOpacity>
            <View style={styles.infoRow}>
              <Users size={18} color={COLORS.textSecondary} />
              <View>
                <Text style={styles.infoLabel}>Available</Text>
                <Text style={styles.infoValue}>{drop.quantity_available} portions left</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <View style={styles.bottomContent}>
          <View>
            <Text style={styles.bottomPrice}>₹{activePrice}</Text>
            <Text style={styles.bottomSub}>per item</Text>
          </View>
          <TouchableOpacity
            testID="reserve-btn"
            style={styles.reserveBtn}
            onPress={() => setSheet({
              vendorId: drop.vendor_id,
              vendorName: drop.vendor_name,
              orderType: 'surplus',
              isOpen: !!drop.is_open,
              openStatusText: drop.open_status_text || '',
              todayShifts: drop.today_shifts || [],
              item: {
                itemId: drop.item_id,
                name: drop.name,
                price: Number(drop.price ?? drop.discounted_price ?? drop.original_price) || 0,
                originalPrice: Number(drop.original_price) || 0,
                imageUrl: drop.image_url || '',
                maxQty: drop.quantity_available ?? 0,
              },
            })}
            activeOpacity={0.8}
          >
            <Text style={styles.reserveBtnText}>Add to Cart</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <CartBar vendorId={drop.vendor_id} />
      <AddToCartSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        meta={sheet}
        foodType={drop.food_type}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  backBtn: { position: 'absolute', top: 16, left: 16, zIndex: 10 },
  imageWrap: { position: 'relative' },
  heroImage: { width: '100%', height: 300, backgroundColor: COLORS.skeleton },
  imageOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtnFloat: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center', alignItems: 'center', margin: SPACING.md, ...SHADOWS.small,
  },
  badgeRow: { position: 'absolute', bottom: SPACING.md, left: SPACING.md, flexDirection: 'row', gap: SPACING.sm },
  discountBadge: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 2 },
  urgentBadge: { backgroundColor: COLORS.accentUrgent, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 2 },
  badgeText: { color: '#fff', fontSize: 13, fontFamily: 'DMSans_700Bold' },
  content: { padding: SPACING.md },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 2 },
  categoryText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase' },
  timerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accentUrgent + '15', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 2 },
  timerText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },
  title: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, marginBottom: 4 },
  vendorName: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, marginBottom: SPACING.md },
  description: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.lg },
  priceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  priceLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  discountedPrice: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  originalPrice: { fontSize: 18, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  savingsChip: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2 },
  savingsText: { color: '#fff', fontSize: 13, fontFamily: 'DMSans_700Bold' },
  infoSection: { gap: SPACING.md, marginBottom: SPACING.lg },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  infoLabel: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  infoValue: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  bottomBar: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  bottomContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  bottomPrice: { fontSize: 22, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  bottomSub: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  reserveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl, paddingVertical: 14 },
  reserveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
});
