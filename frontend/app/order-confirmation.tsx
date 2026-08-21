import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Clock, Store, Hash } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';

const ORDER_TYPE_LABELS: Record<string, string> = { surplus: 'Surplus', takeaway: 'Takeaway', dine_in: 'Dine-in' };

export default function OrderConfirmationScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    orderId: string; code: string; vendorName: string; itemName: string; items: string;
    pickupStart: string; pickupEnd: string; orderType: string;
  }>();

  const orderNumber = (p.orderId || '').replace(/^order_?/i, '').slice(0, 10).toUpperCase();
  const pickupWindow = p.pickupStart && p.pickupEnd ? `${p.pickupStart} – ${p.pickupEnd}` : 'As per restaurant';
  const items: { name: string; quantity: number }[] = (() => {
    try { return JSON.parse(p.items || '[]'); } catch { return []; }
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.successCircle}>
          <CheckCircle2 size={54} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Order Confirmed</Text>
        <Text style={styles.subtitle}>Your payment was successful and your order is reserved.</Text>

        {/* Pickup code card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Pickup Code</Text>
          <Text testID="pickup-code" style={styles.codeValue}>{p.code || '——————'}</Text>
          <Text style={styles.codeHint}>Show this code to the restaurant during pickup.</Text>
        </View>

        {/* Order summary */}
        <View style={styles.card}>
          {items.length > 0 ? (
            <View style={styles.itemsBlock}>
              {items.map((it, i) => (
                <View key={i} style={styles.itemLine}>
                  <Text style={styles.itemLineName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.itemLineQty}>× {it.quantity}</Text>
                </View>
              ))}
            </View>
          ) : p.itemName ? (
            <Text style={styles.itemName}>{p.itemName}</Text>
          ) : null}
          <View style={styles.row}>
            <Store size={16} color={COLORS.textSecondary} />
            <Text style={styles.rowLabel}>Restaurant</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{p.vendorName || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Clock size={16} color={COLORS.textSecondary} />
            <Text style={styles.rowLabel}>Pickup Window</Text>
            <Text style={styles.rowValue}>{pickupWindow}</Text>
          </View>
          <View style={styles.row}>
            <Hash size={16} color={COLORS.textSecondary} />
            <Text style={styles.rowLabel}>Order Number</Text>
            <Text style={styles.rowValue}>{orderNumber || '—'}</Text>
          </View>
          {p.orderType ? (
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{ORDER_TYPE_LABELS[p.orderType] || 'Surplus'}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.note}>Your pickup code stays available under My Orders until the order is completed.</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity testID="view-orders-btn" style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/orders')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>View My Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="back-home-btn" style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)/home')} activeOpacity={0.7}>
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, alignItems: 'center', paddingBottom: SPACING.xl },
  successCircle: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg, marginBottom: SPACING.md,
  },
  title: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md },
  codeCard: {
    width: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center', ...SHADOWS.small, marginBottom: SPACING.md,
  },
  codeLabel: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 46, fontFamily: 'Outfit_700Bold', color: '#fff', letterSpacing: 8, marginVertical: 6 },
  codeHint: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  card: { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  itemName: { fontSize: 17, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  itemsBlock: { marginBottom: SPACING.sm, gap: 4 },
  itemLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemLineName: { flex: 1, fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  itemLineQty: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginLeft: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs + 2 },
  rowLabel: { fontSize: 13.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textPrimary },
  typePill: { alignSelf: 'flex-start', backgroundColor: COLORS.primary + '18', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 3, marginTop: SPACING.sm },
  typePillText: { fontSize: 11, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  note: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.md, paddingHorizontal: SPACING.md },
  bottomBar: { padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight, gap: SPACING.sm },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 17, fontFamily: 'Outfit_700Bold' },
  secondaryBtn: { paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: COLORS.textSecondary, fontSize: 15, fontFamily: 'DMSans_500Medium' },
});
