import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { ordersApi } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { useCart, orderTypeLabel } from '../src/context/CartContext';
import CachedImage from '../src/components/CachedImage';

const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY || 'rzp_test_SSfFeyx6ytVg0B';

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{ resume: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { cart, subtotal, itemCount, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [showRazorpay, setShowRazorpay] = useState(false);
  const [razorpayData, setRazorpayData] = useState<any>(null);

  const fmt12 = (t: string) => {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return t || '';
    const [h, m] = t.split(':').map(Number);
    const ap = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const allShifts = cart?.todayShifts || [];
  const nowMin = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const selectableShifts = allShifts.filter((s) => t2m(s.end) > nowMin);
  const isClosed = !cart?.isOpen || selectableShifts.length === 0;
  const [shiftIdx, setShiftIdx] = useState(0);
  const chosenShift = selectableShifts[shiftIdx] || selectableShifts[0] || null;

  // Reserving requires an account. Guests go to login and return here (cart persists).
  React.useEffect(() => {
    if (authLoading || user) return;
    router.replace(`/login?next=${encodeURIComponent('/checkout?resume=1')}`);
  }, [user, authLoading]);

  const orderType = cart?.orderType || 'surplus';
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const gst = round2(subtotal * 0.05);
  const convenienceFee = round2(subtotal * 0.05);
  const total = round2(subtotal + gst + convenienceFee);
  const totalSavings = cart ? cart.items.reduce((s, i) => s + Math.max(0, (i.originalPrice - i.price)) * i.quantity, 0) : 0;

  const handleReserve = async () => {
    if (!cart || cart.items.length === 0) return;
    if (isClosed) {
      Alert.alert('Restaurant closed', cart.openStatusText || 'This restaurant is closed right now.');
      return;
    }
    setLoading(true);
    try {
      const orderData = await ordersApi.create({
        items: cart.items.map((i) => ({ food_item_id: i.itemId, quantity: i.quantity })),
        order_type: orderType,
        shift_start: chosenShift?.start,
        shift_end: chosenShift?.end,
      });
      setRazorpayData(orderData);
      setShowRazorpay(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  // Guest resume: after login, jump straight to payment.
  const resumedRef = React.useRef(false);
  React.useEffect(() => {
    if (user && params.resume === '1' && cart && cart.items.length > 0 && !resumedRef.current) {
      resumedRef.current = true;
      handleReserve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.resume, cart]);

  const getRazorpayHTML = () => {
    if (!razorpayData) return '';
    const desc = `${itemCount} item(s) from ${cart?.vendorName || 'restaurant'}`.replace(/'/g, "\\'");
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        body { display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:#FDFBF7; font-family:sans-serif; }
        .loading { text-align:center; color:#4B5563; }
      </style>
    </head>
    <body>
      <div class="loading"><p>Opening payment...</p></div>
      <script>
        var options = {
          key: '${razorpayData.key_id || RAZORPAY_KEY}',
          amount: ${razorpayData.amount},
          currency: 'INR',
          order_id: '${razorpayData.razorpay_order_id}',
          name: 'Perfectly Good',
          description: '${desc}',
          handler: function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'success',
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }));
          },
          modal: {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dismissed' }));
            }
          },
          theme: { color: '#2E7D32' }
        };
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: response.error.description }));
        });
        setTimeout(function() { rzp.open(); }, 500);
      </script>
    </body>
    </html>`;
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'success') {
        setShowRazorpay(false);
        setLoading(true);
        try {
          const res = await ordersApi.verify({
            razorpay_order_id: data.razorpay_order_id,
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_signature: data.razorpay_signature,
            order_type: orderType,
          });
          const o = res?.order || {};
          const items = (o.items || cart?.items || []).map((i: any) => ({
            name: i.food_item_name || i.name,
            quantity: i.quantity,
          }));
          clearCart();
          router.replace({
            pathname: '/order-confirmation',
            params: {
              orderId: o.order_id || res?.order_id || '',
              code: o.pickup_code || '',
              vendorName: o.vendor_name || cart?.vendorName || '',
              itemName: o.food_item_name || '',
              items: JSON.stringify(items),
              pickupStart: o.pickup_start_time || '',
              pickupEnd: o.pickup_end_time || '',
              orderType: o.order_type || orderType,
            },
          });
        } catch (err: any) {
          Alert.alert('Verification Failed', err.message);
        } finally {
          setLoading(false);
        }
      } else if (data.type === 'error') {
        setShowRazorpay(false);
        Alert.alert('Payment Failed', data.message);
      } else if (data.type === 'dismissed') {
        setShowRazorpay(false);
      }
    } catch {}
  };

  if (showRazorpay) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.webviewHeader}>
          <TouchableOpacity testID="close-razorpay" onPress={() => setShowRazorpay(false)} style={styles.webviewClose}>
            <ArrowLeft size={22} color={COLORS.textPrimary} />
            <Text style={styles.webviewCloseText}>Cancel Payment</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ html: getRazorpayHTML() }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webviewLoader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          )}
          style={styles.webview}
        />
      </SafeAreaView>
    );
  }

  if (!user || !cart || cart.items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity testID="checkout-back-btn" onPress={() => router.back()} style={styles.headerBack}>
            <ArrowLeft size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>
        {!user ? (
          <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : (
          <View style={styles.loader}>
            <Text style={styles.emptyText}>Your cart is empty.</Text>
            <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace('/(tabs)/home')}>
              <Text style={styles.browseBtnText}>Browse restaurants</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="checkout-back-btn" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Vendor + order type */}
        <View style={styles.itemCard}>
          <View style={styles.orderTypeBadge}>
            <Text style={styles.orderTypeBadgeText}>{orderTypeLabel(orderType)}</Text>
          </View>
          <Text style={styles.itemVendor}>{cart.vendorName}</Text>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Items ({itemCount})</Text>
          <View style={styles.priceCard}>
            {cart.items.map((it, idx) => (
              <View key={it.itemId} style={[styles.lineRow, idx > 0 && styles.lineRowBorder]}>
                <CachedImage uri={it.imageUrl} style={styles.lineImg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.lineMeta}>{it.quantity} × ₹{it.price}</Text>
                </View>
                <Text style={styles.lineTotal}>₹{money(round2(it.price * it.quantity))}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Closed banner */}
        {isClosed ? (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerTitle}>Restaurant is closed</Text>
            <Text style={styles.closedBannerText}>{cart.openStatusText || 'Ordering is unavailable right now.'}</Text>
          </View>
        ) : null}

        {/* Pickup Slot */}
        {!isClosed && selectableShifts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pickup Slot</Text>
            <View style={styles.slotRow}>
              {selectableShifts.map((s, i) => {
                const active = i === shiftIdx;
                return (
                  <TouchableOpacity key={`${s.start}-${s.end}`} testID={`shift-${i}`} style={[styles.slotChip, active && styles.slotChipActive]} onPress={() => setShiftIdx(i)}>
                    <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>{fmt12(s.start)} – {fmt12(s.end)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.maxQtyHint}>Collect your order during this window.</Text>
          </View>
        ) : null}

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Breakdown</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceValue}>₹{money(subtotal)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>GST</Text>
              <Text style={styles.priceValue}>₹{money(gst)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Payment gateway fees</Text>
              <Text style={styles.priceValue}>₹{money(convenienceFee)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{money(total)}</Text>
            </View>
            {totalSavings > 0 ? (
              <View style={styles.savingsRow}>
                <Text style={styles.savingsText}>You save ₹{money(round2(totalSavings))} on this order!</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={16} color={COLORS.primary} />
          <Text style={styles.securityText}>Payments secured by Razorpay. 100% safe.</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity testID="pay-now-btn" style={[styles.payBtn, (loading || isClosed) && styles.payBtnDisabled]} onPress={handleReserve} disabled={loading || isClosed} activeOpacity={0.8}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>{isClosed ? 'Closed' : `Pay ₹${money(total)}`}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  emptyText: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  browseBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: 12 },
  browseBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  scrollContent: { padding: SPACING.md, paddingBottom: 100 },
  itemCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  orderTypeBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.primary + '18', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 3, marginBottom: SPACING.xs },
  orderTypeBadgeText: { fontSize: 11, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  itemVendor: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  lineRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  lineImg: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.skeleton },
  lineName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  lineMeta: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  lineTotal: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  maxQtyHint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: SPACING.xs },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  slotChip: { paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small },
  slotChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotChipText: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  slotChipTextActive: { color: '#fff' },
  closedBanner: { backgroundColor: COLORS.accentUrgent + '15', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.accentUrgent + '40' },
  closedBannerTitle: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: COLORS.accentUrgent },
  closedBannerText: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  priceCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.xs + 2 },
  priceLabel: { fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  priceValue: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.xs },
  totalLabel: { fontSize: 17, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  totalValue: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  savingsRow: { backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.sm, padding: SPACING.sm, marginTop: SPACING.sm },
  savingsText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.primary, textAlign: 'center' },
  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  securityText: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  bottomBar: { padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  payBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontSize: 18, fontFamily: 'Outfit_700Bold' },
  webviewHeader: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  webviewClose: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  webviewCloseText: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  webview: { flex: 1 },
  webviewLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
});
