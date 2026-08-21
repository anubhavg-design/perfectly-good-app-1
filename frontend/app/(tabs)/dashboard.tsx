import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl, Switch, Alert, ScrollView, TextInput, Modal, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Plus, Package, ShoppingBag, Clock, CheckCircle, XCircle, Wallet, IndianRupee, Settings, MapPin, Phone, List, Pencil, Camera, X, KeyRound, ShieldCheck, ChevronRight, Users, Trash2 } from 'lucide-react-native';
import HoursEditor, { HoursMap, emptyHours, hoursFromProfile, validateHours } from '../../src/components/HoursEditor';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/context/AuthContext';
import { vendorApi, resolveMediaUrl } from '../../src/api/client';

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
  items?: { food_item_name: string; quantity: number; note?: string }[];
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
  const [vendorStatus, setVendorStatus] = useState<string>('active');
  const [hours, setHours] = useState<HoursMap>(emptyHours());
  const [savingHours, setSavingHours] = useState(false);
  const [closures, setClosures] = useState<string[]>([]);
  // Change password state
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // Staff management (vendor owner only)
  const isOwner = user?.role === 'vendor';
  const STAFF_PERMS: { key: string; label: string }[] = [
    { key: 'add_drops', label: 'Add surplus drops' },
    { key: 'complete_orders', label: 'Mark orders as completed' },
    { key: 'edit_menu', label: 'Edit menu images/descriptions' },
  ];
  const [staff, setStaff] = useState<any[]>([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPwd, setSPwd] = useState('');
  const [sPerms, setSPerms] = useState<string[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);

  const loadStaff = async () => {
    try { const r = await vendorApi.listStaff(); setStaff(r.items || []); } catch {}
  };
  useEffect(() => { if (activeTab === 'settings' && isOwner) loadStaff(); }, [activeTab, isOwner]);

  const toggleSPerm = (k: string) => setSPerms((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);
  const addStaff = async () => {
    if (!sName.trim() || !sEmail.trim() || sPwd.length < 6) { Alert.alert('Missing info', 'Enter name, email and a password (min 6 chars).'); return; }
    setSavingStaff(true);
    try {
      await vendorApi.createStaff({ name: sName.trim(), email: sEmail.trim(), password: sPwd, permissions: sPerms });
      setSName(''); setSEmail(''); setSPwd(''); setSPerms([]); setShowAddStaff(false);
      await loadStaff();
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSavingStaff(false); }
  };
  const toggleStaffPerm = async (st: any, k: string) => {
    const next = (st.permissions || []).includes(k) ? st.permissions.filter((x: string) => x !== k) : [...(st.permissions || []), k];
    setStaff((list) => list.map((x) => x.user_id === st.user_id ? { ...x, permissions: next } : x));
    try { await vendorApi.updateStaff(st.user_id, { permissions: next }); } catch (e: any) { Alert.alert('Error', e.message); loadStaff(); }
  };
  const removeStaff = (st: any) => {
    Alert.alert('Remove staff', `Remove ${st.name}? They will lose access.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { try { await vendorApi.deleteStaff(st.user_id); await loadStaff(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6) { Alert.alert('Weak password', 'New password must be at least 6 characters.'); return; }
    if (newPwd !== confirmPwd) { Alert.alert('Mismatch', 'New password and confirmation do not match.'); return; }
    setChangingPwd(true);
    try {
      await vendorApi.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      Alert.alert('Done', 'Your password has been changed.');
    } catch (err: any) { Alert.alert('Error', err.message); } finally { setChangingPwd(false); }
  };

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
        setHours(hoursFromProfile(profile));
        setClosures(profile?.special_closures || []);
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
      vendorApi.getVerification().then((r: any) => setVendorStatus(r?.status || 'active')).catch(() => {});
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

  const toggleStock = async (id: string, newInStock: boolean) => {
    try {
      await vendorApi.toggleMenuItem(id, newInStock);
      setMenu(prev => prev.map(m => m.menu_item_id === id ? { ...m, in_stock: newInStock } : m));
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
    const soldOut = item.in_stock === false;
    const isVeg = item.food_type !== 'non_veg';
    return (
      <View testID={`vendor-menu-${item.menu_item_id}`} style={[styles.card, soldOut && styles.cardSoldOut]}>
        <View style={styles.cardRow}>
          {item.image_url ? (
            <Image source={{ uri: resolveMediaUrl(item.image_url) }} style={[styles.menuThumb, soldOut && styles.dimmed]} />
          ) : (
            <View style={[styles.menuThumb, styles.menuThumbEmpty, soldOut && styles.dimmed]}>
              <Camera size={18} color={COLORS.textMuted} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: isVeg ? COLORS.success : COLORS.error, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isVeg ? COLORS.success : COLORS.error }} />
              </View>
              <Text style={[styles.cardTitle, soldOut && styles.dimmedText]} numberOfLines={1}>{item.name}</Text>
              {soldOut ? (
                <View style={styles.soldOutBadge}><Text style={styles.soldOutBadgeText}>SOLD OUT</Text></View>
              ) : null}
            </View>
            <Text style={styles.cardSub}>₹{item.original_price}{item.available_today ? '  ·  Surplus live' : ''}</Text>
            {(item.kcal != null || item.protein != null) ? (
              <Text style={styles.cardSub}>{item.kcal != null ? `${item.kcal} kcal` : ''}{item.kcal != null && item.protein != null ? ' · ' : ''}{item.protein != null ? `${item.protein}g protein` : ''}</Text>
            ) : null}
            <Text style={[styles.cardSub, { color: soldOut ? COLORS.accentUrgent : COLORS.success }]}>
              {soldOut ? 'Sold out — hidden from customers (auto-resets at midnight)' : 'Available to customers'}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={styles.toggleLabel}>Sold Out</Text>
            <Switch
              testID={`toggle-soldout-${item.menu_item_id}`}
              value={soldOut}
              onValueChange={() => toggleStock(item.menu_item_id, soldOut)}
              trackColor={{ false: COLORS.border, true: COLORS.accentUrgent + '70' }}
              thumbColor={soldOut ? COLORS.accentUrgent : COLORS.textMuted}
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
            {item.items && item.items.length > 0 ? (
              item.items.map((li, i) => (
                <View key={i}>
                  <Text style={styles.cardSub} numberOfLines={1}>· {li.quantity} × {li.food_item_name}</Text>
                  {li.note ? <Text style={styles.cardNote} numberOfLines={2}>   ↳ {li.note}</Text> : null}
                </View>
              ))
            ) : null}
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

      {!['active', 'approved'].includes(vendorStatus) && (
        <TouchableOpacity
          testID="verification-banner"
          style={[styles.verifBanner, vendorStatus === 'suspended' && { backgroundColor: '#FEF2F2', borderColor: COLORS.error + '44' }]}
          onPress={() => router.push('/vendor-verification')}
          activeOpacity={0.85}
        >
          <ShieldCheck size={20} color={vendorStatus === 'suspended' ? COLORS.error : COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.verifTitle}>
              {vendorStatus === 'pending_verification' ? 'Verification under review'
                : vendorStatus === 'rejected' ? 'Verification needs changes'
                : vendorStatus === 'suspended' ? 'Account suspended'
                : 'Complete your business verification'}
            </Text>
            <Text style={styles.verifSub}>
              {vendorStatus === 'pending_verification' ? 'Awaiting admin approval. You cannot go live yet.'
                : vendorStatus === 'rejected' ? 'Tap to review the reason and resubmit.'
                : vendorStatus === 'suspended' ? 'Contact the Perfectly Good team for help.'
                : 'You must be approved before you can go live and receive orders.'}
            </Text>
          </View>
          <ChevronRight size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}

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

          <View style={styles.settingsCard}>
            <View style={styles.settingsLabelRow}>
              <Clock size={16} color={COLORS.textSecondary} />
              <Text style={styles.settingsTitle}>Operating Hours</Text>
            </View>
            <Text style={styles.settingsHint}>Set up to two shifts per day (e.g. lunch and dinner). Customers can only order and pick up during these hours.</Text>
            <View style={{ marginTop: SPACING.sm }}>
              <HoursEditor value={hours} onChange={setHours} />
            </View>
            <TouchableOpacity
              testID="save-hours-btn"
              style={[styles.saveBtn, savingHours && { opacity: 0.7 }]}
              onPress={async () => {
                const err = validateHours(hours);
                if (err) { Alert.alert('Check hours', err); return; }
                setSavingHours(true);
                try {
                  await vendorApi.updateHours(hours);
                  Alert.alert('Saved', 'Your operating hours have been updated');
                } catch (e: any) {
                  Alert.alert('Error', e.message);
                } finally {
                  setSavingHours(false);
                }
              }}
              disabled={savingHours}
            >
              {savingHours ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Hours</Text>}
            </TouchableOpacity>

            <View style={styles.closureDivider} />
            <View style={styles.settingsLabelRow}>
              <Clock size={16} color={COLORS.textSecondary} />
              <Text style={styles.settingsTitle}>Holidays & Closures</Text>
            </View>
            <Text style={styles.settingsHint}>Mark a one-off holiday without changing your weekly hours. On these dates you&apos;ll show as closed and won&apos;t take orders.</Text>
            <View style={styles.closureQuickRow}>
              {[0, 1].map((offset) => {
                const d = new Date(); d.setDate(d.getDate() + offset);
                const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const on = closures.includes(ds);
                const label = offset === 0 ? 'Closed today' : 'Closed tomorrow';
                return (
                  <TouchableOpacity
                    key={offset}
                    testID={`closure-toggle-${offset}`}
                    style={[styles.closureQuickBtn, on && styles.closureQuickBtnActive]}
                    onPress={async () => {
                      const next = on ? closures.filter((x) => x !== ds) : [...closures, ds];
                      try {
                        const res = await vendorApi.updateClosures(next);
                        setClosures(res.special_closures || []);
                      } catch (e: any) { Alert.alert('Error', e.message); }
                    }}
                  >
                    <Text style={[styles.closureQuickText, on && styles.closureQuickTextActive]}>
                      {on ? `✓ ${label}` : label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {closures.length > 0 ? (
              <View style={styles.closureList}>
                {closures.map((ds) => (
                  <View key={ds} style={styles.closureChip}>
                    <Text style={styles.closureChipText}>{ds}</Text>
                    <TouchableOpacity
                      testID={`closure-remove-${ds}`}
                      hitSlop={8}
                      onPress={async () => {
                        const next = closures.filter((x) => x !== ds);
                        try {
                          const res = await vendorApi.updateClosures(next);
                          setClosures(res.special_closures || []);
                        } catch (e: any) { Alert.alert('Error', e.message); }
                      }}
                    >
                      <X size={14} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.closureEmpty}>No upcoming closures.</Text>
            )}
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Change Password</Text>
            <View style={styles.settingsField}>
              <View style={styles.settingsLabelRow}>
                <KeyRound size={16} color={COLORS.textSecondary} />
                <Text style={styles.settingsLabel}>Current Password</Text>
              </View>
              <TextInput testID="cur-pwd" style={styles.settingsInput} value={curPwd} onChangeText={setCurPwd} placeholder="Current password" placeholderTextColor={COLORS.textMuted} secureTextEntry autoCapitalize="none" />
            </View>
            <View style={styles.settingsField}>
              <View style={styles.settingsLabelRow}>
                <KeyRound size={16} color={COLORS.textSecondary} />
                <Text style={styles.settingsLabel}>New Password</Text>
              </View>
              <TextInput testID="new-pwd" style={styles.settingsInput} value={newPwd} onChangeText={setNewPwd} placeholder="Min 6 characters" placeholderTextColor={COLORS.textMuted} secureTextEntry autoCapitalize="none" />
            </View>
            <View style={styles.settingsField}>
              <View style={styles.settingsLabelRow}>
                <KeyRound size={16} color={COLORS.textSecondary} />
                <Text style={styles.settingsLabel}>Confirm New Password</Text>
              </View>
              <TextInput testID="confirm-pwd" style={styles.settingsInput} value={confirmPwd} onChangeText={setConfirmPwd} placeholder="Re-enter new password" placeholderTextColor={COLORS.textMuted} secureTextEntry autoCapitalize="none" />
            </View>
            <TouchableOpacity testID="change-pwd-btn" style={[styles.saveBtn, changingPwd && { opacity: 0.7 }]} onPress={handleChangePassword} disabled={changingPwd}>
              {changingPwd ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Change Password</Text>}
            </TouchableOpacity>
          </View>

          {isOwner && (
            <View style={styles.settingsCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Users size={18} color={COLORS.textPrimary} />
                  <Text style={styles.settingsTitle}>Staff Management</Text>
                </View>
                <TouchableOpacity testID="add-staff-btn" onPress={() => setShowAddStaff((v) => !v)} style={styles.staffAddBtn}>
                  <Plus size={16} color="#fff" />
                  <Text style={styles.staffAddText}>{showAddStaff ? 'Close' : 'Add Staff'}</Text>
                </TouchableOpacity>
              </View>

              {showAddStaff && (
                <View style={styles.staffForm}>
                  <TextInput style={styles.settingsInput} value={sName} onChangeText={setSName} placeholder="Staff name" placeholderTextColor={COLORS.textMuted} />
                  <TextInput style={styles.settingsInput} value={sEmail} onChangeText={setSEmail} placeholder="Email" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" keyboardType="email-address" />
                  <TextInput style={styles.settingsInput} value={sPwd} onChangeText={setSPwd} placeholder="Password (min 6)" placeholderTextColor={COLORS.textMuted} secureTextEntry autoCapitalize="none" />
                  <Text style={styles.staffPermHead}>Permissions</Text>
                  {STAFF_PERMS.map((p) => (
                    <TouchableOpacity key={p.key} style={styles.permRow} onPress={() => toggleSPerm(p.key)}>
                      <View style={[styles.permBox, sPerms.includes(p.key) && styles.permBoxOn]}>{sPerms.includes(p.key) ? <CheckCircle size={15} color="#fff" /> : null}</View>
                      <Text style={styles.permLabel}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity testID="save-staff-btn" style={[styles.saveBtn, savingStaff && { opacity: 0.7 }]} onPress={addStaff} disabled={savingStaff}>
                    {savingStaff ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Create Staff Account</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {staff.length === 0 ? (
                <Text style={styles.staffEmpty}>No staff added yet.</Text>
              ) : staff.map((st) => (
                <View key={st.user_id} style={styles.staffCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName}>{st.name}</Text>
                      <Text style={styles.staffEmail}>{st.email}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeStaff(st)} style={styles.staffDel}><Trash2 size={16} color={COLORS.error} /></TouchableOpacity>
                  </View>
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {STAFF_PERMS.map((p) => (
                      <TouchableOpacity key={p.key} style={styles.permRow} onPress={() => toggleStaffPerm(st, p.key)}>
                        <View style={[styles.permBox, (st.permissions || []).includes(p.key) && styles.permBoxOn]}>{(st.permissions || []).includes(p.key) ? <CheckCircle size={14} color="#fff" /> : null}</View>
                        <Text style={styles.permLabelSm}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
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
      {/* Bulk image upload summary */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  verifBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.md, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary + '10', borderWidth: 1, borderColor: COLORS.primary + '33' },
  verifTitle: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textPrimary },
  verifSub: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
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
  cardSoldOut: { backgroundColor: COLORS.borderLight, borderWidth: 1, borderColor: COLORS.accentUrgent + '40' },
  dimmed: { opacity: 0.4 },
  dimmedText: { color: COLORS.textMuted },
  soldOutBadge: { backgroundColor: COLORS.accentUrgent + '1A', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
  soldOutBadgeText: { fontSize: 10, fontFamily: 'DMSans_700Bold', color: COLORS.accentUrgent, letterSpacing: 0.5 },
  toggleLabel: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  cardSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  cardNote: { fontSize: 12.5, fontFamily: 'DMSans_500Medium', color: COLORS.primary, marginTop: 1 },
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
  closureDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SPACING.lg },
  closureQuickRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  closureQuickBtn: { flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center' },
  closureQuickBtnActive: { backgroundColor: COLORS.accentUrgent + '15', borderColor: COLORS.accentUrgent },
  closureQuickText: { fontSize: 13.5, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  closureQuickTextActive: { color: COLORS.accentUrgent },
  closureList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  closureChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.borderLight, borderRadius: RADIUS.full, paddingLeft: SPACING.md, paddingRight: SPACING.sm, paddingVertical: 6 },
  closureChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  closureEmpty: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: SPACING.sm },
  currentLocation: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
  currentLocationText: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, flex: 1 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.sm },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  staffAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
  staffAddText: { color: '#fff', fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  staffForm: { gap: SPACING.sm, marginBottom: SPACING.md, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  staffPermHead: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginTop: 4 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  permBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  permBoxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  permLabel: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary },
  permLabelSm: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  staffEmpty: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, paddingVertical: SPACING.sm },
  staffCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight },
  staffName: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  staffEmail: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  staffDel: { padding: 8 },
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
