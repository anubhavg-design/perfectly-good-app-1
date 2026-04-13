import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Switch, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Package, ShoppingBag, Clock, CheckCircle, XCircle } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { vendorApi } from '../../src/api/client';

type TabType = 'drops' | 'orders';

interface VendorDrop {
  item_id: string;
  name: string;
  discounted_price: number;
  original_price: number;
  quantity_available: number;
  pickup_start_time: string;
  pickup_end_time: string;
  is_active: boolean;
}

interface VendorOrder {
  order_id: string;
  food_item_name: string;
  customer_name: string;
  quantity: number;
  total_amount: number;
  status: string;
  created_at: string;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('drops');
  const [drops, setDrops] = useState<VendorDrop[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      if (activeTab === 'drops') {
        const data = await vendorApi.drops();
        setDrops(data || []);
      } else {
        const data = await vendorApi.orders();
        setOrders(data || []);
      }
    } catch (err) {
      console.log('Failed to load vendor data', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [activeTab])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleDrop = async (id: string, isActive: boolean) => {
    try {
      await vendorApi.toggleDrop(id, { is_active: !isActive });
      setDrops(prev => prev.map(d => d.item_id === id ? { ...d, is_active: !isActive } : d));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      await vendorApi.updateOrderStatus(orderId, status);
      setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status } : o));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const renderDrop = ({ item }: { item: VendorDrop }) => (
    <View testID={`vendor-drop-${item.item_id}`} style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardSub}>₹{item.discounted_price} · {item.quantity_available} available</Text>
          <Text style={styles.cardSub}>Pickup: {item.pickup_start_time} - {item.pickup_end_time}</Text>
        </View>
        <Switch
          testID={`toggle-drop-${item.item_id}`}
          value={item.is_active}
          onValueChange={() => toggleDrop(item.item_id, item.is_active)}
          trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
          thumbColor={item.is_active ? COLORS.primary : COLORS.textMuted}
        />
      </View>
    </View>
  );

  const renderOrder = ({ item }: { item: VendorOrder }) => {
    const isReserved = item.status === 'reserved';
    return (
      <View testID={`vendor-order-${item.order_id}`} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.food_item_name}</Text>
            <Text style={styles.cardSub}>{item.customer_name} · Qty: {item.quantity}</Text>
            <Text style={styles.cardSub}>₹{item.total_amount} · {item.status.replace('_', ' ')}</Text>
          </View>
        </View>
        {isReserved && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              testID={`pickup-btn-${item.order_id}`}
              style={[styles.actionBtn, { backgroundColor: COLORS.info }]}
              onPress={() => updateOrderStatus(item.order_id, 'picked_up')}
            >
              <CheckCircle size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Mark Picked Up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`cancel-btn-${item.order_id}`}
              style={[styles.actionBtn, { backgroundColor: COLORS.error }]}
              onPress={() => {
                Alert.alert('Cancel Order', 'Are you sure?', [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes', onPress: () => updateOrderStatus(item.order_id, 'cancelled') },
                ]);
              }}
            >
              <XCircle size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Dashboard</Text>
        {activeTab === 'drops' && (
          <TouchableOpacity
            testID="create-drop-btn"
            style={styles.addBtn}
            onPress={() => router.push('/vendor-create-drop')}
          >
            <Plus size={20} color="#fff" />
            <Text style={styles.addBtnText}>New Drop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="tab-drops"
          style={[styles.tab, activeTab === 'drops' && styles.tabActive]}
          onPress={() => setActiveTab('drops')}
        >
          <Package size={16} color={activeTab === 'drops' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'drops' && styles.tabTextActive]}>My Drops</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-orders"
          style={[styles.tab, activeTab === 'orders' && styles.tabActive]}
          onPress={() => setActiveTab('orders')}
        >
          <ShoppingBag size={16} color={activeTab === 'orders' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Orders</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          testID={`vendor-${activeTab}-list`}
          data={activeTab === 'drops' ? drops : orders}
          renderItem={activeTab === 'drops' ? renderDrop : renderOrder}
          keyExtractor={(item: any) => item.item_id || item.order_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No {activeTab} found</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'drops' ? 'Create a new drop to get started!' : 'Orders will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  screenTitle: { fontSize: 26, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans_700Bold' },
  tabRow: { flexDirection: 'row', marginHorizontal: SPACING.md, backgroundColor: COLORS.borderLight, borderRadius: RADIUS.sm, padding: 2, marginBottom: SPACING.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.sm - 2 },
  tabActive: { backgroundColor: COLORS.surface, ...SHADOWS.small },
  tabText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontFamily: 'DMSans_700Bold' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  cardSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: SPACING.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  actionBtnText: { color: '#fff', fontSize: 13, fontFamily: 'DMSans_700Bold' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: SPACING.xs },
});
