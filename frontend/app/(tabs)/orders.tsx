import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ShoppingBag, Clock, CheckCircle, XCircle, AlertCircle, RotateCcw, KeyRound, LifeBuoy } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ordersApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  reserved: { color: COLORS.primary, icon: Clock, label: 'Ready for Pickup' },
  picked_up: { color: COLORS.info, icon: CheckCircle, label: 'Completed' },
  cancelled: { color: COLORS.error, icon: XCircle, label: 'Cancelled' },
  refunded: { color: COLORS.accentUrgent, icon: RotateCcw, label: 'Refunded' },
  expired: { color: COLORS.textMuted, icon: AlertCircle, label: 'Expired' },
};

interface Order {
  order_id: string;
  food_item_name: string;
  vendor_name: string;
  quantity: number;
  total_amount: number;
  status: string;
  order_type?: string;
  pickup_code?: string;
  pickup_start_time: string;
  pickup_end_time: string;
  created_at: string;
}

const ORDER_TYPE_LABELS: Record<string, string> = { surplus: 'Surplus', takeaway: 'Takeaway', dine_in: 'Dine-in' };

export default function OrdersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  React.useEffect(() => {
    if (user?.role === 'vendor') router.replace('/(tabs)/dashboard');
  }, [user]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await ordersApi.userOrders();
      setOrders(data || []);
    } catch (err) {
      console.log('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleCancel = (orderId: string, itemName: string) => {
    Alert.alert(
      'Cancel Order',
      `Cancel your reservation for "${itemName}"? The quantity will be restored for others.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await ordersApi.cancelOrder(orderId);
              setOrders(prev =>
                prev.map(o => o.order_id === orderId ? { ...o, status: 'cancelled' } : o)
              );
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel order');
            }
          },
        },
      ]
    );
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.reserved;
    const Icon = config.icon;
    const date = new Date(item.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const isReserved = item.status === 'reserved';

    return (
      <View testID={`order-card-${item.order_id}`} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.orderInfo}>
            <View style={styles.orderTitleRow}>
              <Text style={styles.orderName} numberOfLines={1}>{item.food_item_name}</Text>
              <View style={[styles.typePill, item.order_type === 'surplus' ? styles.typePillSurplus : styles.typePillNeutral]}>
                <Text style={[styles.typePillText, item.order_type === 'surplus' ? { color: COLORS.primary } : { color: COLORS.textSecondary }]}>
                  {ORDER_TYPE_LABELS[item.order_type || 'surplus'] || 'Surplus'}
                </Text>
              </View>
            </View>
            <Text style={styles.orderVendor}>{item.vendor_name}</Text>
            <Text style={styles.orderDate}>{date}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.color + '18' }]}>
            <Icon size={14} color={config.color} />
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Qty:</Text>
            <Text style={styles.detailValue}>{item.quantity}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Pickup:</Text>
            <Text style={styles.detailValue}>{item.pickup_start_time} - {item.pickup_end_time}</Text>
          </View>
          <Text style={styles.totalAmount}>₹{item.total_amount}</Text>
        </View>

        {isReserved && item.pickup_code ? (
          <View style={styles.codeBox}>
            <View style={styles.codeBoxHeader}>
              <KeyRound size={14} color={COLORS.primary} />
              <Text style={styles.codeBoxLabel}>Your Pickup Code</Text>
            </View>
            <Text testID={`pickup-code-${item.order_id}`} style={styles.codeBoxValue}>{item.pickup_code}</Text>
            <Text style={styles.codeBoxHint}>Show this code to the restaurant during pickup.</Text>
          </View>
        ) : null}

        {isReserved && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              testID={`support-order-${item.order_id}`}
              style={styles.supportBtn}
              onPress={() => Linking.openURL(`mailto:support@perfectlygood.in?subject=Order%20${item.order_id}`)}
              activeOpacity={0.7}
            >
              <LifeBuoy size={15} color={COLORS.textSecondary} />
              <Text style={styles.supportBtnText}>Support</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`cancel-order-${item.order_id}`}
              style={styles.cancelBtn}
              onPress={() => handleCancel(item.order_id, item.food_item_name)}
              activeOpacity={0.7}
            >
              <XCircle size={15} color={COLORS.error} />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          testID="orders-list"
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ShoppingBag size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>Browse the home feed to find surplus deals!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  title: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  orderInfo: { flex: 1, marginRight: SPACING.sm },
  orderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  orderName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, flexShrink: 1 },
  typePill: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  typePillSurplus: { backgroundColor: COLORS.primary + '18' },
  typePillNeutral: { backgroundColor: COLORS.borderLight },
  typePillText: { fontSize: 10.5, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  orderVendor: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  orderDate: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full, alignSelf: 'flex-start',
  },
  statusText: { fontSize: 12, fontFamily: 'DMSans_700Bold' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: SPACING.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  detailValue: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  totalAmount: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: COLORS.primary, marginLeft: 'auto' },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    flex: 1, paddingVertical: SPACING.sm,
  },
  cancelBtnText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.error },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: SPACING.xs },
  supportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, paddingVertical: SPACING.sm },
  supportBtnText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  codeBox: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primary + '0D', borderWidth: 1, borderColor: COLORS.primary + '33',
    borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center',
  },
  codeBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeBoxLabel: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  codeBoxValue: { fontSize: 34, fontFamily: 'Outfit_700Bold', color: COLORS.primary, letterSpacing: 6, marginVertical: 2 },
  codeBoxHint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.md },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: SPACING.xs },
});
