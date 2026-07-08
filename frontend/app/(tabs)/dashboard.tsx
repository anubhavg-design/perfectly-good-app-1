import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Switch, Alert, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Package, ShoppingBag, Clock, CheckCircle, XCircle, Wallet, IndianRupee, Settings, MapPin, Phone, List } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { vendorApi } from '../../src/api/client';

type TabType = 'menu' | 'drops' | 'orders' | 'earnings' | 'settings';

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

interface EarningsSummary {
  total_orders_completed: number;
  total_revenue: number;
  total_commission: number;
  net_earnings: number;
  total_paid: number;
  pending_payout: number;
}

interface EarningsOrder {
  order_id: string;
  food_item_name: string;
  quantity: number;
  discounted_price: number;
  vendor_earning: number;
  commission: number;
  created_at: string;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('menu');
  const [drops, setDrops] = useState<VendorDrop[]>([]);
  const [menu, setMenu] = useState<any[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary | null>(null);
  const [earningsOrders, setEarningsOrders] = useState<EarningsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Settings state
  const [vendorProfile, setVendorProfile] = useState<any>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      if (activeTab === 'menu') {
        const data = await vendorApi.menu();
        setMenu(data || []);
      } else if (activeTab === 'drops') {
        const data = await vendorApi.drops();
        setDrops(data || []);
      } else if (activeTab === 'orders') {
        const data = await vendorApi.orders();
        setOrders(data || []);
      } else if (activeTab === 'settings') {
        const profile = await vendorApi.profile();
        setVendorProfile(profile);
        setEditAddress(profile?.location?.address || '');
        setEditPhone(profile?.phone || '');
      } else {
        const [summary, ords] = await Promise.all([
          vendorApi.payoutsSummary(),
          vendorApi.payoutsOrders(),
        ]);
        setEarningsSummary(summary);
        setEarningsOrders(ords || []);
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

  const toggleStock = async (id: string, inStock: boolean) => {
    try {
      await vendorApi.toggleMenuItem(id, !inStock);
      setMenu(prev => prev.map(m => m.menu_item_id === id ? { ...m, in_stock: !inStock } : m));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const renderMenuItem = ({ item }: { item: any }) => {
    const inStock = item.in_stock !== false;
    const isVeg = item.food_type !== 'non_veg';
    return (
      <View testID={`vendor-menu-${item.menu_item_id}`} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: isVeg ? COLORS.success : COLORS.error, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isVeg ? COLORS.success : COLORS.error }} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={styles.cardSub}>₹{item.original_price}{item.available_today ? '  ·  Surplus live' : ''}</Text>
            <Text style={[styles.cardSub, { color: inStock ? COLORS.success : COLORS.textMuted }]}>{inStock ? 'In stock (visible to customers)' : 'Out of stock (hidden)'}</Text>
          </View>
          <Switch
            testID={`toggle-stock-${item.menu_item_id}`}
            value={inStock}
            onValueChange={() => toggleStock(item.menu_item_id, inStock)}
            trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
            thumbColor={inStock ? COLORS.primary : COLORS.textMuted}
          />
        </View>
      </View>
    );
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

  const renderEarningsOrder = ({ item }: { item: EarningsOrder }) => {
    const date = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return (
      <View testID={`earning-order-${item.order_id}`} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.food_item_name}</Text>
            <Text style={styles.cardSub}>{item.quantity} × ₹{item.discounted_price} · {date}</Text>
          </View>
          <View style={styles.earningRight}>
            <Text style={styles.earningAmount}>₹{item.vendor_earning}</Text>
            <Text style={styles.earningComm}>-₹{item.commission} comm · -₹{item.gst_on_commission || 0} GST</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEarningsHeader = () => {
    if (!earningsSummary) return null;
    const s = earningsSummary;
    return (
      <View style={styles.earningsHeader}>
        {/* Summary Cards */}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
            <Text style={styles.summaryLabel}>Net Earnings</Text>
            <Text style={styles.summaryValuePrimary}>₹{s.net_earnings.toLocaleString('en-IN')}</Text>
            <Text style={styles.summaryMeta}>{s.total_orders_completed} orders completed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Paid</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>₹{s.total_paid.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryValue, { color: COLORS.accentUrgent }]}>₹{s.pending_payout.toLocaleString('en-IN')}</Text>
          </View>
        </View>
        {/* Deductions bar */}
        <View style={styles.commissionBar}>
          <IndianRupee size={14} color={COLORS.textSecondary} />
          <Text style={styles.commissionText}>
            Revenue: ₹{s.total_revenue.toLocaleString('en-IN')}  ·  Commission (15%): ₹{s.total_commission.toLocaleString('en-IN')}  ·  GST on commission (18%): ₹{(s.gst_on_commission || 0).toLocaleString('en-IN')}
          </Text>
        </View>
        {earningsOrders.length > 0 && (
          <Text style={styles.earningsListTitle}>Completed Orders</Text>
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
            <Text style={styles.addBtnText}>Add Surplus</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          testID="tab-menu"
          style={[styles.tab, activeTab === 'menu' && styles.tabActive]}
          onPress={() => setActiveTab('menu')}
        >
          <List size={14} color={activeTab === 'menu' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'menu' && styles.tabTextActive]}>Menu</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-drops"
          style={[styles.tab, activeTab === 'drops' && styles.tabActive]}
          onPress={() => setActiveTab('drops')}
        >
          <Package size={14} color={activeTab === 'drops' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'drops' && styles.tabTextActive]}>Surplus</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-orders"
          style={[styles.tab, activeTab === 'orders' && styles.tabActive]}
          onPress={() => setActiveTab('orders')}
        >
          <ShoppingBag size={14} color={activeTab === 'orders' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-earnings"
          style={[styles.tab, activeTab === 'earnings' && styles.tabActive]}
          onPress={() => setActiveTab('earnings')}
        >
          <Wallet size={14} color={activeTab === 'earnings' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'earnings' && styles.tabTextActive]}>Earnings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-settings"
          style={[styles.tab, activeTab === 'settings' && styles.tabActive]}
          onPress={() => setActiveTab('settings')}
        >
          <Settings size={14} color={activeTab === 'settings' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === 'settings' && styles.tabTextActive]}>Settings</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : activeTab === 'settings' ? (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Restaurant Details</Text>

            <View style={styles.settingsField}>
              <View style={styles.settingsLabelRow}>
                <MapPin size={16} color={COLORS.textSecondary} />
                <Text style={styles.settingsLabel}>Address</Text>
              </View>
              <TextInput
                testID="settings-address"
                style={styles.settingsInput}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="Full restaurant address"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
              <Text style={styles.settingsHint}>Address will be auto-geocoded for Google Maps</Text>
            </View>

            <View style={styles.settingsField}>
              <View style={styles.settingsLabelRow}>
                <Phone size={16} color={COLORS.textSecondary} />
                <Text style={styles.settingsLabel}>Phone Number</Text>
              </View>
              <TextInput
                testID="settings-phone"
                style={styles.settingsInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            {vendorProfile?.location?.maps_url && (
              <View style={styles.currentLocation}>
                <MapPin size={14} color={COLORS.primary} />
                <Text style={styles.currentLocationText} numberOfLines={2}>
                  Current: {vendorProfile.location.address || 'Not set'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              testID="save-settings-btn"
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={async () => {
                setSaving(true);
                try {
                  const updated = await vendorApi.updateProfile({ address: editAddress || undefined, phone: editPhone || undefined });
                  setVendorProfile(updated);
                  Alert.alert('Saved', 'Your details have been updated');
                } catch (err: any) {
                  Alert.alert('Error', err.message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : activeTab === 'earnings' ? (
        <FlatList
          testID="earnings-list"
          data={earningsOrders}
          renderItem={renderEarningsOrder}
          keyExtractor={(item) => item.order_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderEarningsHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            earningsSummary ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No completed orders yet</Text>
                <Text style={styles.emptySubtitle}>Earnings appear when orders are marked as picked up.</Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList
          testID={`vendor-${activeTab}-list`}
          data={activeTab === 'menu' ? menu : activeTab === 'drops' ? drops.filter((d: any) => d.is_active) : orders}
          renderItem={activeTab === 'menu' ? renderMenuItem : activeTab === 'drops' ? renderDrop : renderOrder}
          keyExtractor={(item: any) => item.menu_item_id || item.item_id || item.order_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {activeTab === 'menu' ? 'No menu items yet' : activeTab === 'drops' ? 'No surplus drops' : 'No orders found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'menu' ? 'Your menu is added by the Perfectly Good team.' : activeTab === 'drops' ? 'Tap "Add Surplus" to list a surplus deal!' : 'Orders will appear here.'}
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
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.sm - 2 },
  tabActive: { backgroundColor: COLORS.surface, ...SHADOWS.small },
  tabText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
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
  // Earnings styles
  earningsHeader: { marginBottom: SPACING.sm },
  summaryGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  summaryCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small, alignItems: 'center' },
  summaryCardPrimary: { flex: 2, backgroundColor: COLORS.primary, alignItems: 'flex-start' },
  summaryLabel: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  summaryValuePrimary: { fontSize: 28, fontFamily: 'Outfit_700Bold', color: '#fff' },
  summaryMeta: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  commissionBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.md, ...SHADOWS.small },
  commissionText: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, flex: 1 },
  earningsListTitle: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm, marginTop: SPACING.xs },
  earningRight: { alignItems: 'flex-end' },
  earningAmount: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  earningComm: { fontSize: 11, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: SPACING.xs, textAlign: 'center' },
  // Settings styles
  settingsCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOWS.small },
  settingsTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.lg },
  settingsField: { marginBottom: SPACING.md },
  settingsLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.xs },
  settingsLabel: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  settingsInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  settingsHint: { fontSize: 11, fontFamily: 'DMSans_400Regular', color: COLORS.primary, marginTop: 4 },
  currentLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
  currentLocationText: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, flex: 1 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
});
