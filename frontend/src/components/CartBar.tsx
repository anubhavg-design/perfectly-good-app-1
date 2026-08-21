import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ShoppingBag, ChevronRight } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useCart } from '../context/CartContext';

/**
 * Floating "View Cart" bar. Renders only when the cart has items.
 * Optionally scoped to a vendor (only show while browsing that restaurant).
 */
export default function CartBar({ vendorId, bottomOffset = 0 }: { vendorId?: string; bottomOffset?: number }) {
  const router = useRouter();
  const { cart, itemCount, subtotal } = useCart();
  if (!cart || itemCount === 0) return null;
  if (vendorId && cart.vendorId !== vendorId) return null;

  return (
    <TouchableOpacity
      testID="view-cart-bar"
      style={[styles.bar, { bottom: SPACING.md + bottomOffset }]}
      onPress={() => router.push('/cart')}
      activeOpacity={0.9}
    >
      <View style={styles.left}>
        <View style={styles.badge}>
          <ShoppingBag size={18} color="#fff" />
          <View style={styles.countPill}><Text style={styles.countText}>{itemCount}</Text></View>
        </View>
        <View>
          <Text style={styles.title}>{itemCount} item{itemCount > 1 ? 's' : ''} · ₹{subtotal}</Text>
          <Text style={styles.sub} numberOfLines={1}>{cart.vendorName}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.viewText}>View Cart</Text>
        <ChevronRight size={18} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: SPACING.md, right: SPACING.md, bottom: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: SPACING.md,
    ...SHADOWS.medium,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  badge: { position: 'relative', width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  countPill: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.accentUrgent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countText: { color: '#fff', fontSize: 10.5, fontFamily: 'DMSans_700Bold' },
  title: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_700Bold' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'DMSans_400Regular' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewText: { color: '#fff', fontSize: 15, fontFamily: 'DMSans_700Bold' },
});
