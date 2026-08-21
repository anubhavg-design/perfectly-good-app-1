import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import CachedImage from '../src/components/CachedImage';
import { useCart, orderTypeLabel } from '../src/context/CartContext';

export default function CartScreen() {
  const router = useRouter();
  const { cart, itemCount, subtotal, updateQty, removeItem, clearCart } = useCart();

  if (!cart || itemCount === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity testID="cart-back" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Cart</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <ShoppingBag size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Add items from a restaurant to get started.</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.browseBtnText}>Browse restaurants</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const goCheckout = () => router.push('/checkout');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="cart-back" onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Cart</Text>
        <TouchableOpacity testID="cart-clear" onPress={clearCart} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.vendorCard}>
          <Text style={styles.vendorName}>{cart.vendorName}</Text>
          <View style={styles.typePill}><Text style={styles.typePillText}>{orderTypeLabel(cart.orderType)}</Text></View>
        </View>

        {cart.items.map((it) => (
          <View key={it.itemId} style={styles.itemCard} testID={`cart-item-${it.itemId}`}>
            <CachedImage uri={it.imageUrl} style={styles.itemImg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
              <View style={styles.itemPriceRow}>
                <Text style={styles.itemPrice}>₹{it.price}</Text>
                {it.originalPrice > it.price ? <Text style={styles.itemStrike}>₹{it.originalPrice}</Text> : null}
              </View>
              <View style={styles.itemBottom}>
                <View style={styles.stepper}>
                  <TouchableOpacity testID={`cart-minus-${it.itemId}`} style={styles.stepBtn} onPress={() => updateQty(it.itemId, it.quantity - 1)}>
                    <Minus size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyVal}>{it.quantity}</Text>
                  <TouchableOpacity
                    testID={`cart-plus-${it.itemId}`}
                    style={[styles.stepBtn, it.maxQty > 0 && it.quantity >= it.maxQty && styles.stepBtnDisabled]}
                    onPress={() => updateQty(it.itemId, it.quantity + 1)}
                    disabled={it.maxQty > 0 && it.quantity >= it.maxQty}
                  >
                    <Plus size={16} color={it.maxQty > 0 && it.quantity >= it.maxQty ? COLORS.textMuted : COLORS.primary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity testID={`cart-remove-${it.itemId}`} onPress={() => removeItem(it.itemId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Trash2 size={18} color={COLORS.accentUrgent} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.lineTotal}>₹{Math.round(it.price * it.quantity * 100) / 100}</Text>
          </View>
        ))}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({itemCount} item{itemCount > 1 ? 's' : ''})</Text>
            <Text style={styles.summaryValue}>₹{subtotal}</Text>
          </View>
          <Text style={styles.summaryNote}>GST &amp; gateway fees calculated at checkout.</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity testID="cart-checkout-btn" style={styles.checkoutBtn} onPress={goCheckout} activeOpacity={0.85}>
          <Text style={styles.checkoutText}>Proceed to Checkout · ₹{subtotal}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  clearText: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent },
  scroll: { padding: SPACING.md, paddingBottom: 120 },
  vendorCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  vendorName: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, flex: 1 },
  typePill: { backgroundColor: COLORS.primary + '18', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 3 },
  typePillText: { fontSize: 11, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  itemCard: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.sm, marginBottom: SPACING.sm, ...SHADOWS.small },
  itemImg: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  itemName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  itemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  itemPrice: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  itemStrike: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  stepBtnDisabled: { backgroundColor: COLORS.borderLight },
  qtyVal: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, minWidth: 24, textAlign: 'center' },
  lineTotal: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, alignSelf: 'center' },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.sm, ...SHADOWS.small },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  summaryValue: { fontSize: 17, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  summaryNote: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 4 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  checkoutBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center' },
  checkoutText: { color: '#fff', fontSize: 17, fontFamily: 'Outfit_700Bold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, padding: SPACING.xl },
  emptyTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.sm },
  emptySub: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center' },
  browseBtn: { marginTop: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
});
