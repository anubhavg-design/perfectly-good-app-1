import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Switch, Alert, ScrollView, TextInput, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Package, ShoppingBag, Clock, CheckCircle, XCircle, Wallet, IndianRupee, Settings, MapPin, Phone, List, Pencil, Camera, X, KeyRound } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { vendorApi } from '../../src/api/client';

type TabType = 'menu' | 'drops' | 'orders' | 'earnings' | 'settings';
type OrderFilter = 'reserved' | 'picked_up' | 'cancelled' | 'refunded';

const V_ORDER_STATUS: Record<string, { label: string; color: string }> = {
  reserved: { label: 'Ready for Pickup', color: COLORS.primary },
  picked_up: { label: 'Completed', color: COLORS.info },
  cancelled: { label: 'Cancelled', color: COLORS.error },
  refunded: { label: 'Refunded', color: COLORS.accentUrgent },
  expired: { label: 'Expired', color: COLORS.textMuted },
};
const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'reserved', label: 'Ready for Pickup' },
  { key: 'picked_up', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

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
  pickup_start_time?: string;
  pickup_end_time?: string;
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

  // Menu item detail editing (image / kcal / protein) — vendor-controlled fields
  const [editItem, setEditItem] = useState<any>(null);
  const [editImage, setEditImage] = useState('');
  const [editKcal, setEditKcal] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  // Pickup verification (vendor)
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('reserved');
  const [verifyOrder, setVerifyOrder] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const submitVerify = async () => {
    if (!verifyOrder) return;
    if (verifyCode.trim().length !== 6) {
      Alert.alert('Enter code', 'Please enter the customer\u2019s 6-digit pickup code.');
      return;
    }
    setVerifying(true);
    try {
      await vendorApi.verifyPickup(verifyOrder.order_id, verifyCode.trim());
      setOrders(prev => prev.map(o => o.order_id === verifyOrder.order_id ? { ...o, status: 'picked_up' } : o));
      setVerifyOrder(null); setVerifyCode('');
      Alert.alert('\u2705 Pickup Verified', 'Pickup verified successfully. The order is now completed.');
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Incorrect pickup code.');
    } finally {
      setVerifying(false);
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditImage(item.image_url || '');
    setEditKcal(item.kcal != null ? String(item.kcal) : '');
    setEditProtein(item.protein != null ? String(item.protein) : '');
  };

  const pickItemImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to upload a food image.');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
      if (!r.canceled && r.assets?.[0]?.base64) {
        setEditImage(`data:${r.assets[0].mimeType || 'image/jpeg'};base64,${r.assets[0].base64}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not pick image');
    }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setSavingItem(true);
    try {
      const payload: any = {};
      if (editImage) payload.image_url = editImage;
      payload.kcal = editKcal.trim() === '' ? null : Math.round(Number(editKcal));
      payload.protein = editProtein.trim() === '' ? null : Number(editProtein);
      const updated = await vendorApi.editMenuItem(editItem.menu_item_id, payload);
      setMenu(prev => prev.map(m => m.menu_item_id === editItem.menu_item_id ? { ...m, ...updated } : m));
      setEditItem(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSavingItem(false);
    }
  };

  const renderMenuItem = ({ item }: { item: any }) => {
    const inStock = item.in_stock !== false;
    const isVeg = item.food_type !== 'non_veg';
    return (
      <View testID={`vendor-menu-${item.menu_item_id}`} style={styles.card}>
        <View style={styles.cardRow}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.menuThumb} />
          ) : (
            <View style={[styles.menuThumb, styles.menuThumbEmpty]}>
              <Camera size={18} color={COLORS.textMuted} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: isVeg ? COLORS.success : COLORS.error, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isVeg ? COLORS.success : COLORS.error }} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            </View>
            <Text style={styles.cardSub}>₹{item.original_price}{item.available_today ? '  ·  Surplus live' : ''}</Text>
            {(item.kcal != null || item.protein != null) ? (
              <Text style={styles.cardSub}>{item.kcal != null ? `${item.kcal} kcal` : ''}{item.kcal != null && item.protein != null ? ' · ' : ''}{item.protein != null ? `${item.protein}g protein` : ''}</Text>
            ) : null}
            <Text style={[styles.cardSub, { color: inStock ? COLORS.success : COLORS.textMuted }]}>{inStock ? 'In stock (visible to customers)' : 'Out of stock (hidden)'}</Text>
          </View>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Switch
              testID={`toggle-stock-${item.menu_item_id}`}
              value={inStock}
              onValueChange={() => toggleStock(item.menu_item_id, inStock)}
              trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
              thumbColor={inStock ? COLORS.primary : COLORS.textMuted}
            />
            <TouchableOpacity testID={`edit-item-${item.menu_item_id}`} style={styles.editBtn} onPress={() => openEdit(item)}>
              <Pencil size={14} color={COLORS.primary} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
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
    const cfg = V_ORDER_STATUS[item.status] || V_ORDER_STATUS.reserved;
    return (
      <View testID={`vendor-order-${item.order_id}`} style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.food_item_name}</Text>
            <Text style={styles.cardSub}>{item.customer_name} · Qty: {item.quantity}</Text>
            <Text style={styles.cardSub}>Order #{(item.order_id || '').replace(/^order_?/i, '').slice(0, 8).toUpperCase()} · ₹{item.total_amount}</Text>
            {item.pickup_start_time ? <Text style={styles.cardSub}>Pickup: {item.pickup_start_time} - {item.pickup_end_time}</Text> : null}
          </View>
          <View style={[styles.statusPill, { backgroundColor: cfg.color + '18' }]}>
            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        {isReserved && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              testID={`verify-pickup-btn-${item.order_id}`}
              style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
              onPress={() => { setVerifyOrder(item); setVerifyCode(''); }}
            >
              <KeyRound size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Verify Pickup</Text>
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

  const renderOrderFilters = () => (
    <View style={styles.orderFilterRow}>
      {ORDER_FILTERS.map((f) => {
        const active = orderFilter === f.key;
        const count = orders.filter((o: any) => o.status === f.key).length;
        return (
          <TouchableOpacity
            key={f.key}
            testID={`order-filter-${f.key}`}
            style={[styles.orderFilterChip, active && styles.orderFilterChipActive]}
            onPress={() => setOrderFilter(f.key)}
          >
            <Text style={[styles.orderFilterText, active && styles.orderFilterTextActive]} numberOfLines={1}>{f.label} ({count})</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

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
          data={activeTab === 'menu' ? menu : activeTab === 'drops' ? drops.filter((d: any) => d.is_active) : orders.filter((o: any) => o.status === orderFilter)}
          renderItem={activeTab === 'menu' ? renderMenuItem : activeTab === 'drops' ? renderDrop : renderOrder}
          keyExtractor={(item: any) => item.menu_item_id || item.item_id || item.order_id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={activeTab === 'orders' ? renderOrderFilters : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {activeTab === 'menu' ? 'No menu items yet' : activeTab === 'drops' ? 'No surplus drops' : `No ${(V_ORDER_STATUS[orderFilter]?.label || '').toLowerCase()} orders`}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'menu' ? 'Your menu is added by the Perfectly Good team.' : activeTab === 'drops' ? 'Tap "Add Surplus" to list a surplus deal!' : 'Orders will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Verify pickup modal */}
      <Modal visible={!!verifyOrder} transparent animationType="slide" onRequestClose={() => setVerifyOrder(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Pickup</Text>
              <TouchableOpacity testID="close-verify" onPress={() => setVerifyOrder(null)} style={styles.modalClose}>
                <X size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Ask the customer for their 6-digit pickup code and enter it below to complete the order.</Text>
            <TextInput
              testID="verify-code-input"
              style={styles.codeInput}
              value={verifyCode}
              onChangeText={(t) => setVerifyCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity testID="confirm-pickup-btn" style={[styles.saveBtn, verifying && { opacity: 0.7 }]} onPress={submitVerify} disabled={verifying}>
              {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Confirm Pickup</Text>}
            </TouchableOpacity>
            <TouchableOpacity testID="cancel-verify-btn" style={styles.modalCancelBtn} onPress={() => setVerifyOrder(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit menu item (image / kcal / protein) */}
      <Modal visible={!!editItem} transparent animationType="slide" onRequestClose={() => setEditItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{editItem?.name}</Text>
              <TouchableOpacity testID="close-edit-item" onPress={() => setEditItem(null)} style={styles.modalClose}>
                <X size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Name, price & description are managed by the Perfectly Good team. You can update the photo and nutrition.</Text>

            <TouchableOpacity testID="edit-item-image" onPress={pickItemImage} activeOpacity={0.85} style={{ marginBottom: SPACING.md }}>
              {editImage ? (
                <Image source={{ uri: editImage }} style={styles.editImagePreview} />
              ) : (
                <View style={styles.editImageEmpty}>
                  <Camera size={26} color={COLORS.textMuted} />
                  <Text style={styles.editImageEmptyText}>Tap to upload food photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: SPACING.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.editLabel}>Calories (kcal)</Text>
                <TextInput testID="edit-item-kcal" style={styles.editInput} value={editKcal} onChangeText={setEditKcal} placeholder="e.g. 450" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editLabel}>Protein (g)</Text>
                <TextInput testID="edit-item-protein" style={styles.editInput} value={editProtein} onChangeText={setEditProtein} placeholder="e.g. 22" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" />
              </View>
            </View>

            <TouchableOpacity testID="save-item-btn" style={[styles.saveBtn, savingItem && { opacity: 0.7 }]} onPress={saveEdit} disabled={savingItem}>
              {savingItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Menu item edit
  menuThumb: { width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton, marginRight: SPACING.sm },
  menuThumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.borderLight },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary },
  editBtnText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, paddingBottom: SPACING.xxl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  modalTitle: { flex: 1, fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalHint: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginBottom: SPACING.md },
  editImagePreview: { width: '100%', height: 160, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  editImageEmpty: { height: 130, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', gap: 6 },
  editImageEmptyText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  editLabel: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.xs },
  editInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  // Order status + verify
  statusPill: { alignSelf: 'flex-start', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontFamily: 'DMSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  orderFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.sm },
  orderFilterChip: { paddingHorizontal: SPACING.sm + 2, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.borderLight },
  orderFilterChipActive: { backgroundColor: COLORS.primary },
  orderFilterText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  orderFilterTextActive: { color: '#fff' },
  codeInput: { backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, fontSize: 32, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary, textAlign: 'center', letterSpacing: 8, marginBottom: SPACING.md },
  modalCancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  modalCancelText: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
});
