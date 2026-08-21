import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { X, Minus, Plus } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import CachedImage from './CachedImage';
import VegDot from './VegDot';
import { useCart, AddMeta, orderTypeLabel } from '../context/CartContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  meta: AddMeta | null;
  foodType?: string;
};

/**
 * Bottom-sheet preview shown when adding a menu item to the cart.
 * Shows the item image, name, and price with a quantity stepper.
 * Handles the cross-restaurant / cross-mode "clear cart?" warning.
 */
export default function AddToCartSheet({ visible, onClose, meta, foodType }: Props) {
  const { addItem, replaceWithItem } = useCart();
  const [qty, setQty] = useState(1);
  const [conflict, setConflict] = useState<{ vendorName: string; sameVendor: boolean } | null>(null);

  React.useEffect(() => { if (visible) { setQty(1); setConflict(null); } }, [visible, meta?.item?.itemId]);

  if (!meta) return null;
  const item = meta.item;
  const maxQty = item.maxQty && item.maxQty > 0 ? item.maxQty : 99;
  const isVeg = (foodType || 'veg') !== 'non_veg';

  const doAdd = () => {
    const res = addItem({ ...meta, quantity: qty });
    if (res.ok) {
      onClose();
      return;
    }
    // Conflict — show an in-sheet confirmation (works on web + native)
    setConflict({ vendorName: res.vendorName, sameVendor: res.sameVendor });
  };

  const confirmReplace = () => { replaceWithItem({ ...meta, quantity: qty }); setConflict(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <TouchableOpacity testID="add-cart-close" style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={22} color={COLORS.textMuted} />
          </TouchableOpacity>

          {conflict ? (
            <View style={styles.confirmWrap}>
              <Text style={styles.confirmTitle}>Start a new cart?</Text>
              <Text style={styles.confirmMsg}>
                {conflict.sameVendor
                  ? `Your cart has items from ${conflict.vendorName} in a different order mode. Clear cart to switch?`
                  : `You already have items from ${conflict.vendorName} in your cart. Clear cart to add this?`}
              </Text>
              <TouchableOpacity testID="cart-conflict-replace" style={styles.addBtn} onPress={confirmReplace} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>Clear cart &amp; Add</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="cart-conflict-cancel" style={styles.cancelBtn} onPress={() => setConflict(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>
          <View style={styles.previewRow}>
            <CachedImage uri={item.imageUrl} style={styles.image} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <VegDot size={14} color={isVeg ? COLORS.success : COLORS.error} />
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.price}>₹{item.price}</Text>
                {item.originalPrice > item.price ? (
                  <Text style={styles.strike}>₹{item.originalPrice}</Text>
                ) : null}
              </View>
              <Text style={styles.typeText}>{orderTypeLabel(meta.orderType)} · {meta.vendorName}</Text>
            </View>
          </View>

          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                testID="add-cart-minus"
                style={[styles.stepBtn, qty <= 1 && styles.stepBtnDisabled]}
                onPress={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
              >
                <Minus size={18} color={qty <= 1 ? COLORS.textMuted : COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.qtyVal}>{qty}</Text>
              <TouchableOpacity
                testID="add-cart-plus"
                style={[styles.stepBtn, qty >= maxQty && styles.stepBtnDisabled]}
                onPress={() => setQty(Math.min(maxQty, qty + 1))}
                disabled={qty >= maxQty}
              >
                <Plus size={18} color={qty >= maxQty ? COLORS.textMuted : COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
          {meta.orderType === 'surplus' && item.maxQty > 0 ? (
            <Text style={styles.maxHint}>Max available: {item.maxQty}</Text>
          ) : null}

          <TouchableOpacity testID="add-cart-confirm" style={styles.addBtn} onPress={doAdd} activeOpacity={0.85}>
            <Text style={styles.addBtnText}>Add to Cart · ₹{Math.round(item.price * qty * 100) / 100}</Text>
          </TouchableOpacity>
          </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropTouch: { flex: 1 },
  sheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.md, paddingBottom: SPACING.xl },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderLight, alignSelf: 'center', marginBottom: SPACING.md },
  closeBtn: { position: 'absolute', top: SPACING.md, right: SPACING.md, zIndex: 2 },
  previewRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  image: { width: 84, height: 84, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 17, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 6 },
  price: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  strike: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  typeText: { fontSize: 12.5, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  qtyLabel: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textPrimary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  stepBtnDisabled: { backgroundColor: COLORS.borderLight },
  qtyVal: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, minWidth: 32, textAlign: 'center' },
  maxHint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginBottom: SPACING.sm },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', marginTop: SPACING.md },
  addBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_700Bold' },
  confirmWrap: { paddingTop: SPACING.sm },
  confirmTitle: { fontSize: 19, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  confirmMsg: { fontSize: 14.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, lineHeight: 21, marginBottom: SPACING.lg },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: SPACING.xs },
  cancelText: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
});
