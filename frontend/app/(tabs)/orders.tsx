import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ShoppingBag, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { ordersApi } from '../../src/api/client';

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  reserved: { color: COLORS.primary, icon: Clock, label: 'Reserved' },
  picked_up: { color: COLORS.info, icon: CheckCircle, label: 'Picked Up' },
  cancelled: { color: COLORS.error, icon: XCircle, label: 'Cancelled' },
  expired: { color: COLORS.textMuted, icon: AlertCircle, label: 'Expired' },
};

interface Order {
  order_id: string;
  food_item_name: string;
  vendor_name: string;
  quantity: number;
  total_amount: number;
  status: string;
  pickup_start_time: string;
  pickup_end_time: string;
  created_at: string;
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const renderOrder = ({ item }: { item: Order }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.reserved;
    const Icon = config.icon;
    const date = new Date(item.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

    return (
      <View testID={`order-card-${item.order_id}`} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderName} numberOfLines={1}>{item.food_item_name}</Text>
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
  orderName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
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
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 20, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.md },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: SPACING.xs },
});
