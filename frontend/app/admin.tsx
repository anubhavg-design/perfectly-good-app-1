import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Package, Wallet, CreditCard, Clock } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { adminApi } from '../src/api/client';

interface Vendor { vendor_id: string; name: string; category: string; email: string; location: any; }
interface MenuItem { menu_item_id: string; name: string; description: string; original_price: number; image_url: string; }
interface PayoutVendor { vendor_id: string; vendor_name: string; total_orders_completed: number; net_earnings: number; total_paid: number; pending_payout: number; }
interface PayoutRecord { payout_id?: string; amount: number; note: string; created_at: string; }

type AdminTab = 'vendors' | 'payments';

export default function AdminScreen() {
  const router = useRouter();
  const [adminTab, setAdminTab] = useState<AdminTab>('vendors');

  // Vendors state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [vendorMenus, setVendorMenus] = useState<Record<string, MenuItem[]>>({});
  const [menuLoading, setMenuLoading] = useState<string | null>(null);

  // Vendor form
  const [vName, setVName] = useState('');
  const [vCategory, setVCategory] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPassword, setVPassword] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vServiceType, setVServiceType] = useState<'dine_in' | 'takeaway' | 'both'>('both');
  const [creating, setCreating] = useState(false);

  // Menu item form
  const [addMenuVendorId, setAddMenuVendorId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [mImage, setMImage] = useState('');
  const [addingMenu, setAddingMenu] = useState(false);

  // Payments state
  const [payoutVendors, setPayoutVendors] = useState<PayoutVendor[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [payVendorId, setPayVendorId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [historyVendorId, setHistoryVendorId] = useState<string | null>(null);
  const [payoutHistory, setPayoutHistory] = useState<PayoutRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (adminTab === 'vendors') loadVendors();
    else loadPayoutVendors();
  }, [adminTab]);

  // ─── Vendors ───
  const loadVendors = async () => {
    try { setLoading(true); const data = await adminApi.vendors(); setVendors(data || []); }
    catch {} finally { setLoading(false); }
  };
  const loadMenu = async (vendorId: string) => {
    setMenuLoading(vendorId);
    try { const data = await adminApi.vendorMenu(vendorId); setVendorMenus(prev => ({ ...prev, [vendorId]: data || [] })); }
    catch {} finally { setMenuLoading(null); }
  };
  const toggleVendor = async (vendorId: string) => {
    if (expandedVendor === vendorId) { setExpandedVendor(null); return; }
    setExpandedVendor(vendorId);
    if (!vendorMenus[vendorId]) await loadMenu(vendorId);
  };
  const handleCreateVendor = async () => {
    if (!vName || !vCategory || !vEmail || !vPassword) { Alert.alert('Error', 'Fill in all required fields'); return; }
    setCreating(true);
    try {
      await adminApi.createVendor({ name: vName, category: vCategory, email: vEmail, password: vPassword, phone: vPhone || undefined, place_id: vAddress || undefined, service_type: vServiceType });
      Alert.alert('Success', 'Vendor created'); setShowCreateVendor(false);
      setVName(''); setVCategory(''); setVEmail(''); setVPassword(''); setVAddress(''); setVPhone(''); setVServiceType('both');
      loadVendors();
    } catch (err: any) { Alert.alert('Error', err.message); } finally { setCreating(false); }
  };
  const handleDeleteVendor = (id: string, name: string) => {
    Alert.alert('Delete Vendor', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await adminApi.deleteVendor(id); setVendors(prev => prev.filter(v => v.vendor_id !== id)); } catch (err: any) { Alert.alert('Error', err.message); } } },
    ]);
  };
  const handleAddMenuItem = async () => {
    if (!mName || !mPrice || !addMenuVendorId) { Alert.alert('Error', 'Fill in name and price'); return; }
    setAddingMenu(true);
    try {
      await adminApi.addMenuItem(addMenuVendorId, { name: mName, description: mDesc, original_price: Number(mPrice), image_url: mImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600' });
      Alert.alert('Success', 'Menu item added'); setAddMenuVendorId(null); setMName(''); setMDesc(''); setMPrice(''); setMImage('');
      loadMenu(addMenuVendorId);
    } catch (err: any) { Alert.alert('Error', err.message); } finally { setAddingMenu(false); }
  };
  const handleDeleteMenuItem = (menuId: string) => {
    Alert.alert('Delete', 'Delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await adminApi.deleteMenuItem(menuId); if (expandedVendor) loadMenu(expandedVendor); } catch (err: any) { Alert.alert('Error', err.message); } } },
    ]);
  };

  // ─── Payments ───
  const loadPayoutVendors = async () => {
    try { setPayoutsLoading(true); const data = await adminApi.payoutsVendors(); setPayoutVendors(data || []); }
    catch (err) { console.log('Failed to load payouts', err); } finally { setPayoutsLoading(false); }
  };
  const loadHistory = async (vendorId: string) => {
    if (historyVendorId === vendorId) { setHistoryVendorId(null); return; }
    setHistoryVendorId(vendorId); setHistoryLoading(true);
    try { const data = await adminApi.payoutHistory(vendorId); setPayoutHistory(data || []); }
    catch {} finally { setHistoryLoading(false); }
  };
  const handlePay = async () => {
    if (!payVendorId || !payAmount || Number(payAmount) <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
    setPaying(true);
    try {
      await adminApi.addPayout({ vendor_id: payVendorId, amount: Number(payAmount), note: payNote });
      Alert.alert('Success', 'Payout recorded'); setPayVendorId(null); setPayAmount(''); setPayNote('');
      loadPayoutVendors();
      if (historyVendorId === payVendorId) loadHistory(payVendorId);
    } catch (err: any) { Alert.alert('Error', err.message); } finally { setPaying(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="admin-back-btn" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        {adminTab === 'vendors' ? (
          <TouchableOpacity testID="add-vendor-btn" onPress={() => setShowCreateVendor(!showCreateVendor)} style={styles.headerAdd}>
            <Plus size={22} color={COLORS.primary} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity testID="admin-tab-vendors" style={[styles.tab, adminTab === 'vendors' && styles.tabActive]} onPress={() => setAdminTab('vendors')}>
          <Package size={14} color={adminTab === 'vendors' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, adminTab === 'vendors' && styles.tabTextActive]}>Vendors</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="admin-tab-payments" style={[styles.tab, adminTab === 'payments' && styles.tabActive]} onPress={() => setAdminTab('payments')}>
          <Wallet size={14} color={adminTab === 'payments' ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, adminTab === 'payments' && styles.tabTextActive]}>Payments</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {adminTab === 'vendors' ? (
          <>
            {/* Create Vendor Form */}
            {showCreateVendor && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Onboard New Vendor</Text>
                <TextInput testID="vendor-name-input" style={styles.input} placeholder="Vendor Name" placeholderTextColor={COLORS.textMuted} value={vName} onChangeText={setVName} />
                <TextInput testID="vendor-category-input" style={styles.input} placeholder="Category" placeholderTextColor={COLORS.textMuted} value={vCategory} onChangeText={setVCategory} />
                <TextInput testID="vendor-email-input" style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textMuted} value={vEmail} onChangeText={setVEmail} keyboardType="email-address" autoCapitalize="none" />
                <TextInput testID="vendor-password-input" style={styles.input} placeholder="Password" placeholderTextColor={COLORS.textMuted} value={vPassword} onChangeText={setVPassword} secureTextEntry />
                <TextInput testID="vendor-phone-input" style={styles.input} placeholder="Phone Number (e.g. +91 98765 43210)" placeholderTextColor={COLORS.textMuted} value={vPhone} onChangeText={setVPhone} keyboardType="phone-pad" />
                <TextInput testID="vendor-address-input" style={styles.input} placeholder="Full restaurant address (e.g. 100 Feet Road, Koramangala, Bangalore)" placeholderTextColor={COLORS.textMuted} value={vAddress} onChangeText={setVAddress} />
                <Text style={styles.addressHint}>Address will be auto-geocoded to show on Google Maps</Text>
                <Text style={styles.serviceLabel}>Service Type</Text>
                <View style={styles.serviceRow}>
                  {(['dine_in', 'takeaway', 'both'] as const).map((st) => (
                    <TouchableOpacity
                      key={st}
                      testID={`service-type-${st}`}
                      style={[styles.serviceChip, vServiceType === st && styles.serviceChipActive]}
                      onPress={() => setVServiceType(st)}
                    >
                      <Text style={[styles.serviceChipText, vServiceType === st && styles.serviceChipTextActive]}>
                        {st === 'dine_in' ? 'Dine In' : st === 'takeaway' ? 'Takeaway' : 'Both'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity testID="create-vendor-submit" style={styles.primaryBtn} onPress={handleCreateVendor} disabled={creating}>
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Vendor</Text>}
                </TouchableOpacity>
              </View>
            )}
            {/* Vendors List */}
            {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /> : vendors.map((vendor) => (
              <View key={vendor.vendor_id} style={styles.vendorCard}>
                <TouchableOpacity testID={`vendor-row-${vendor.vendor_id}`} style={styles.vendorRow} onPress={() => toggleVendor(vendor.vendor_id)}>
                  <View style={styles.vendorInfo}>
                    <Text style={styles.vendorName}>{vendor.name}</Text>
                    <Text style={styles.vendorSub}>{vendor.category} · {vendor.email}</Text>
                  </View>
                  <View style={styles.vendorActions}>
                    <TouchableOpacity testID={`delete-vendor-${vendor.vendor_id}`} onPress={() => handleDeleteVendor(vendor.vendor_id, vendor.name)}>
                      <Trash2 size={18} color={COLORS.error} />
                    </TouchableOpacity>
                    {expandedVendor === vendor.vendor_id ? <ChevronUp size={20} color={COLORS.textMuted} /> : <ChevronDown size={20} color={COLORS.textMuted} />}
                  </View>
                </TouchableOpacity>
                {expandedVendor === vendor.vendor_id && (
                  <View style={styles.menuSection}>
                    {menuLoading === vendor.vendor_id ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                      <>
                        <View style={styles.menuHeader}>
                          <Text style={styles.menuTitle}>Menu Items</Text>
                          <TouchableOpacity testID={`add-menu-btn-${vendor.vendor_id}`} onPress={() => setAddMenuVendorId(addMenuVendorId === vendor.vendor_id ? null : vendor.vendor_id)}>
                            <Plus size={18} color={COLORS.primary} />
                          </TouchableOpacity>
                        </View>
                        {addMenuVendorId === vendor.vendor_id && (
                          <View style={styles.miniForm}>
                            <TextInput testID="menu-name-input" style={styles.miniInput} placeholder="Item Name" placeholderTextColor={COLORS.textMuted} value={mName} onChangeText={setMName} />
                            <TextInput testID="menu-desc-input" style={styles.miniInput} placeholder="Description" placeholderTextColor={COLORS.textMuted} value={mDesc} onChangeText={setMDesc} />
                            <TextInput testID="menu-price-input" style={styles.miniInput} placeholder="Price" placeholderTextColor={COLORS.textMuted} value={mPrice} onChangeText={setMPrice} keyboardType="numeric" />
                            <TextInput testID="menu-image-input" style={styles.miniInput} placeholder="Image URL" placeholderTextColor={COLORS.textMuted} value={mImage} onChangeText={setMImage} />
                            <TouchableOpacity testID="add-menu-submit" style={styles.smallBtn} onPress={handleAddMenuItem} disabled={addingMenu}>
                              {addingMenu ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.smallBtnText}>Add Item</Text>}
                            </TouchableOpacity>
                          </View>
                        )}
                        {(vendorMenus[vendor.vendor_id] || []).map((mi) => (
                          <View key={mi.menu_item_id} style={styles.menuItem}>
                            <View style={styles.menuItemInfo}><Text style={styles.menuItemName}>{mi.name}</Text><Text style={styles.menuItemPrice}>₹{mi.original_price}</Text></View>
                            <TouchableOpacity testID={`delete-menu-${mi.menu_item_id}`} onPress={() => handleDeleteMenuItem(mi.menu_item_id)}><Trash2 size={16} color={COLORS.error} /></TouchableOpacity>
                          </View>
                        ))}
                        {(vendorMenus[vendor.vendor_id] || []).length === 0 && <Text style={styles.emptyMenu}>No menu items yet</Text>}
                      </>
                    )}
                  </View>
                )}
              </View>
            ))}
            {!loading && vendors.length === 0 && (
              <View style={styles.emptyState}><Package size={40} color={COLORS.textMuted} /><Text style={styles.emptyTitle}>No vendors yet</Text></View>
            )}
          </>
        ) : (
          /* ─── Payments Tab ─── */
          <>
            {payoutsLoading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /> : (
              payoutVendors.map((pv) => (
                <View key={pv.vendor_id} style={styles.payoutCard}>
                  <View style={styles.payoutHeader}>
                    <View style={styles.payoutVendorInfo}>
                      <Text style={styles.payoutVendorName}>{pv.vendor_name}</Text>
                      <Text style={styles.payoutMeta}>{pv.total_orders_completed} completed orders</Text>
                    </View>
                    <View style={styles.payoutAmounts}>
                      <Text style={styles.payoutPending}>₹{pv.pending_payout.toLocaleString('en-IN')}</Text>
                      <Text style={styles.payoutPendingLabel}>pending</Text>
                    </View>
                  </View>

                  {/* Earnings bar */}
                  <View style={styles.payoutStats}>
                    <View style={styles.payoutStatItem}>
                      <Text style={styles.payoutStatLabel}>Earned</Text>
                      <Text style={styles.payoutStatValue}>₹{pv.net_earnings.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.payoutStatItem}>
                      <Text style={styles.payoutStatLabel}>Paid</Text>
                      <Text style={[styles.payoutStatValue, { color: COLORS.primary }]}>₹{pv.total_paid.toLocaleString('en-IN')}</Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.payoutActions}>
                    <TouchableOpacity
                      testID={`mark-paid-${pv.vendor_id}`}
                      style={styles.markPaidBtn}
                      onPress={() => { setPayVendorId(payVendorId === pv.vendor_id ? null : pv.vendor_id); setPayAmount(''); setPayNote(''); }}
                    >
                      <CreditCard size={14} color="#fff" />
                      <Text style={styles.markPaidText}>Mark as Paid</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`view-history-${pv.vendor_id}`}
                      style={styles.historyBtn}
                      onPress={() => loadHistory(pv.vendor_id)}
                    >
                      <Clock size={14} color={COLORS.primary} />
                      <Text style={styles.historyBtnText}>History</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Pay Form */}
                  {payVendorId === pv.vendor_id && (
                    <View style={styles.payForm}>
                      <TextInput testID={`pay-amount-${pv.vendor_id}`} style={styles.miniInput} placeholder="Amount (₹)" placeholderTextColor={COLORS.textMuted} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" />
                      <TextInput testID={`pay-note-${pv.vendor_id}`} style={styles.miniInput} placeholder="Note (e.g. Bank transfer #123)" placeholderTextColor={COLORS.textMuted} value={payNote} onChangeText={setPayNote} />
                      <TouchableOpacity testID={`pay-submit-${pv.vendor_id}`} style={styles.smallBtn} onPress={handlePay} disabled={paying}>
                        {paying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.smallBtnText}>Record Payout</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* History */}
                  {historyVendorId === pv.vendor_id && (
                    <View style={styles.historySection}>
                      {historyLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                        payoutHistory.length === 0 ? <Text style={styles.emptyMenu}>No payouts recorded yet</Text> : (
                          payoutHistory.map((ph, idx) => (
                            <View key={idx} style={styles.historyItem}>
                              <View>
                                <Text style={styles.historyAmount}>₹{ph.amount.toLocaleString('en-IN')}</Text>
                                <Text style={styles.historyNote}>{ph.note || 'No note'}</Text>
                              </View>
                              <Text style={styles.historyDate}>{new Date(ph.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                            </View>
                          ))
                        )
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
            {!payoutsLoading && payoutVendors.length === 0 && (
              <View style={styles.emptyState}><Wallet size={40} color={COLORS.textMuted} /><Text style={styles.emptyTitle}>No vendor data</Text></View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  headerAdd: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  tabRow: { flexDirection: 'row', marginHorizontal: SPACING.md, backgroundColor: COLORS.borderLight, borderRadius: RADIUS.sm, padding: 2, marginBottom: SPACING.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.sm - 2 },
  tabActive: { backgroundColor: COLORS.surface, ...SHADOWS.small },
  tabText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontFamily: 'DMSans_700Bold' },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, ...SHADOWS.medium },
  formTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.md },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: SPACING.xs },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  vendorCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, ...SHADOWS.small, overflow: 'hidden' },
  vendorRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  vendorInfo: { flex: 1 },
  vendorName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  vendorSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  vendorActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  menuSection: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, padding: SPACING.md },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  menuTitle: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  miniForm: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
  miniInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 10, fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 10, alignItems: 'center' },
  smallBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans_700Bold' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  menuItemInfo: { flex: 1 },
  menuItemName: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  menuItemPrice: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  emptyMenu: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.md },
  addressHint: { fontSize: 11, fontFamily: 'DMSans_400Regular', color: COLORS.primary, marginTop: -4, marginBottom: SPACING.sm },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.md },
  // Service type selector
  serviceLabel: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  serviceRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  serviceChip: { flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md, backgroundColor: COLORS.borderLight, alignItems: 'center' },
  serviceChipActive: { backgroundColor: COLORS.primary },
  serviceChipText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  serviceChipTextActive: { color: '#fff', fontFamily: 'DMSans_700Bold' },
  // Payments styles
  payoutCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  payoutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  payoutVendorInfo: { flex: 1 },
  payoutVendorName: { fontSize: 17, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  payoutMeta: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  payoutAmounts: { alignItems: 'flex-end' },
  payoutPending: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.accentUrgent },
  payoutPendingLabel: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.textMuted },
  payoutStats: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  payoutStatItem: { flex: 1 },
  payoutStatLabel: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
  payoutStatValue: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: 2 },
  payoutActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  markPaidBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.sm + 2 },
  markPaidText: { color: '#fff', fontSize: 13, fontFamily: 'DMSans_700Bold' },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary + '15', borderRadius: RADIUS.md, paddingVertical: SPACING.sm + 2 },
  historyBtnText: { color: COLORS.primary, fontSize: 13, fontFamily: 'DMSans_700Bold' },
  payForm: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.sm, marginTop: SPACING.sm },
  historySection: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: SPACING.sm, paddingTop: SPACING.sm },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  historyAmount: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.primary },
  historyNote: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  historyDate: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted },
});
