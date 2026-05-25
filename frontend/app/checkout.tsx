import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ArrowLeft, Minus, Plus, ShieldCheck } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { ordersApi } from '../src/api/client';

const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY || 'rzp_test_SSfFeyx6ytVg0B';

export default function CheckoutScreen() {
  const params = useLocalSearchParams<{
    itemId: string;
    name: string;
    price: string;
    originalPrice: string;
    vendorName: string;
    maxQty: string;
    imageUrl: string;
  }>();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showRazorpay, setShowRazorpay] = useState(false);
  const [razorpayData, setRazorpayData] = useState<any>(null);

  const price = Number(params.price);
  const originalPrice = Number(params.originalPrice);
  const maxQty = Number(params.maxQty);
  const subtotal = price * quantity;
  const gst = Math.round(subtotal * 0.05);
  const convenienceFee = Math.round(subtotal * 0.03);
  const total = subtotal + gst + convenienceFee;
  const totalSavings = (originalPrice - price) * quantity;

  const handleReserve = async () => {
    setLoading(true);
    try {
      const orderData = await ordersApi.create({
        food_item_id: params.itemId!,
        quantity,
      });
      setRazorpayData(orderData);
      setShowRazorpay(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const getRazorpayHTML = () => {
    if (!razorpayData) return '';
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
          key: '${RAZORPAY_KEY}',
          amount: ${razorpayData.amount},
          currency: 'INR',
          order_id: '${razorpayData.razorpay_order_id}',
          name: 'Perfectly Good',
          description: '${params.name?.replace(/'/g, "\\'")}',
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
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: response.error.description
          }));
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
          await ordersApi.verify({
            razorpay_order_id: data.razorpay_order_id,
            razorpay_payment_id: data.razorpay_payment_id,
            razorpay_signature: data.razorpay_signature,
            food_item_id: params.itemId!,
            quantity,
          });
          Alert.alert('Reserved!', 'Your food has been reserved. Check My Orders for details.', [
            { text: 'View Orders', onPress: () => router.replace('/(tabs)/orders') },
          ]);
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
          <TouchableOpacity
            testID="close-razorpay"
            onPress={() => setShowRazorpay(false)}
            style={styles.webviewClose}
          >
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
            <View style={styles.webviewLoader}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          )}
          style={styles.webview}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="checkout-back-btn" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Item Summary */}
        <View style={styles.itemCard}>
          <Text style={styles.itemName}>{params.name}</Text>
          <Text style={styles.itemVendor}>{params.vendorName}</Text>
        </View>

        {/* Quantity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantityCard}>
            <TouchableOpacity
              testID="qty-decrease"
              style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              <Minus size={20} color={quantity <= 1 ? COLORS.textMuted : COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              testID="qty-increase"
              style={[styles.qtyBtn, quantity >= maxQty && styles.qtyBtnDisabled]}
              onPress={() => setQuantity(Math.min(maxQty, quantity + 1))}
              disabled={quantity >= maxQty}
            >
              <Plus size={20} color={quantity >= maxQty ? COLORS.textMuted : COLORS.primary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.maxQtyHint}>Max available: {maxQty}</Text>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Breakdown</Text>
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal ({quantity} × ₹{price})</Text>
              <Text style={styles.priceValue}>₹{subtotal}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>GST (5%)</Text>
              <Text style={styles.priceValue}>₹{gst}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Convenience Fee</Text>
              <Text style={styles.priceValue}>₹{convenienceFee}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total}</Text>
            </View>
            <View style={[styles.savingsRow]}>
              <Text style={styles.savingsText}>You save ₹{totalSavings} on this order!</Text>
            </View>
          </View>
        </View>

        {/* Security Note */}
        <View style={styles.securityNote}>
          <ShieldCheck size={16} color={COLORS.primary} />
          <Text style={styles.securityText}>Payments secured by Razorpay. 100% safe.</Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          testID="pay-now-btn"
          style={[styles.payBtn, loading && styles.payBtnDisabled]}
          onPress={handleReserve}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText}>Pay ₹{total}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  scrollContent: { padding: SPACING.md, paddingBottom: 100 },
  itemCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  itemName: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  itemVendor: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 4 },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  quantityCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.lg,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small,
  },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' },
  qtyBtnDisabled: { backgroundColor: COLORS.borderLight },
  qtyValue: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, minWidth: 40, textAlign: 'center' },
  maxQtyHint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xs },
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
