import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp, Package } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { adminApi } from '../src/api/client';

interface Vendor {
  vendor_id: string;
  name: string;
  category: string;
  email: string;
  location: any;
}

interface MenuItem {
  menu_item_id: string;
  name: string;
  description: string;
  original_price: number;
  image_url: string;
}

export default function AdminScreen() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [vendorMenus, setVendorMenus] = useState<Record<string, MenuItem[]>>({});
  const [menuLoading, setMenuLoading] = useState<string | null>(null);

  // Create vendor form
  const [vName, setVName] = useState('');
  const [vCategory, setVCategory] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPassword, setVPassword] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [creating, setCreating] = useState(false);

  // Add menu item form
  const [addMenuVendorId, setAddMenuVendorId] = useState<string | null>(null);
  const [mName, setMName] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [mImage, setMImage] = useState('');
  const [addingMenu, setAddingMenu] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const data = await adminApi.vendors();
      setVendors(data || []);
    } catch (err: any) {
      console.log('Failed to load vendors', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMenu = async (vendorId: string) => {
    setMenuLoading(vendorId);
    try {
      const data = await adminApi.vendorMenu(vendorId);
      setVendorMenus(prev => ({ ...prev, [vendorId]: data || [] }));
    } catch (err: any) {
      console.log('Failed to load menu', err);
    } finally {
      setMenuLoading(null);
    }
  };

  const toggleVendor = async (vendorId: string) => {
    if (expandedVendor === vendorId) {
      setExpandedVendor(null);
    } else {
      setExpandedVendor(vendorId);
      if (!vendorMenus[vendorId]) {
        await loadMenu(vendorId);
      }
    }
  };

  const handleCreateVendor = async () => {
    if (!vName || !vCategory || !vEmail || !vPassword) {
      Alert.alert('Error', 'Fill in all required fields');
      return;
    }
    setCreating(true);
    try {
      await adminApi.createVendor({
        name: vName,
        category: vCategory,
        email: vEmail,
        password: vPassword,
        location: { lat: 12.9716, lon: 77.5946, address: vAddress || 'Bangalore' },
      });
      Alert.alert('Success', 'Vendor created successfully');
      setShowCreateVendor(false);
      setVName(''); setVCategory(''); setVEmail(''); setVPassword(''); setVAddress('');
      loadVendors();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteVendor = (id: string, name: string) => {
    Alert.alert('Delete Vendor', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.deleteVendor(id);
            setVendors(prev => prev.filter(v => v.vendor_id !== id));
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleAddMenuItem = async () => {
    if (!mName || !mPrice || !addMenuVendorId) {
      Alert.alert('Error', 'Fill in name and price');
      return;
    }
    setAddingMenu(true);
    try {
      await adminApi.addMenuItem(addMenuVendorId, {
        name: mName,
        description: mDesc,
        original_price: Number(mPrice),
        image_url: mImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
      });
      Alert.alert('Success', 'Menu item added');
      setAddMenuVendorId(null);
      setMName(''); setMDesc(''); setMPrice(''); setMImage('');
      loadMenu(addMenuVendorId);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setAddingMenu(false);
    }
  };

  const handleDeleteMenuItem = (menuId: string) => {
    Alert.alert('Delete Menu Item', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.deleteMenuItem(menuId);
            // Refresh menus
            if (expandedVendor) loadMenu(expandedVendor);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="admin-back-btn" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <TouchableOpacity testID="add-vendor-btn" onPress={() => setShowCreateVendor(!showCreateVendor)} style={styles.headerAdd}>
          <Plus size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Create Vendor Form */}
        {showCreateVendor && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Onboard New Vendor</Text>
            <TextInput testID="vendor-name-input" style={styles.input} placeholder="Vendor Name" placeholderTextColor={COLORS.textMuted} value={vName} onChangeText={setVName} />
            <TextInput testID="vendor-category-input" style={styles.input} placeholder="Category (e.g., Bakery, Restaurant)" placeholderTextColor={COLORS.textMuted} value={vCategory} onChangeText={setVCategory} />
            <TextInput testID="vendor-email-input" style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textMuted} value={vEmail} onChangeText={setVEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput testID="vendor-password-input" style={styles.input} placeholder="Password" placeholderTextColor={COLORS.textMuted} value={vPassword} onChangeText={setVPassword} secureTextEntry />
            <TextInput testID="vendor-address-input" style={styles.input} placeholder="Address" placeholderTextColor={COLORS.textMuted} value={vAddress} onChangeText={setVAddress} />
            <TouchableOpacity testID="create-vendor-submit" style={styles.primaryBtn} onPress={handleCreateVendor} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Vendor</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Vendors List */}
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          vendors.map((vendor) => (
            <View key={vendor.vendor_id} style={styles.vendorCard}>
              <TouchableOpacity
                testID={`vendor-row-${vendor.vendor_id}`}
                style={styles.vendorRow}
                onPress={() => toggleVendor(vendor.vendor_id)}
              >
                <View style={styles.vendorInfo}>
                  <Text style={styles.vendorName}>{vendor.name}</Text>
                  <Text style={styles.vendorSub}>{vendor.category} · {vendor.email}</Text>
                </View>
                <View style={styles.vendorActions}>
                  <TouchableOpacity testID={`delete-vendor-${vendor.vendor_id}`} onPress={() => handleDeleteVendor(vendor.vendor_id, vendor.name)}>
                    <Trash2 size={18} color={COLORS.error} />
                  </TouchableOpacity>
                  {expandedVendor === vendor.vendor_id ?
                    <ChevronUp size={20} color={COLORS.textMuted} /> :
                    <ChevronDown size={20} color={COLORS.textMuted} />
                  }
                </View>
              </TouchableOpacity>

              {/* Expanded Menu */}
              {expandedVendor === vendor.vendor_id && (
                <View style={styles.menuSection}>
                  {menuLoading === vendor.vendor_id ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <View style={styles.menuHeader}>
                        <Text style={styles.menuTitle}>Menu Items</Text>
                        <TouchableOpacity
                          testID={`add-menu-btn-${vendor.vendor_id}`}
                          onPress={() => setAddMenuVendorId(addMenuVendorId === vendor.vendor_id ? null : vendor.vendor_id)}
                        >
                          <Plus size={18} color={COLORS.primary} />
                        </TouchableOpacity>
                      </View>

                      {/* Add Menu Item Form */}
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

                      {(vendorMenus[vendor.vendor_id] || []).map((menuItem) => (
                        <View key={menuItem.menu_item_id} style={styles.menuItem}>
                          <View style={styles.menuItemInfo}>
                            <Text style={styles.menuItemName}>{menuItem.name}</Text>
                            <Text style={styles.menuItemPrice}>₹{menuItem.original_price}</Text>
                          </View>
                          <TouchableOpacity
                            testID={`delete-menu-${menuItem.menu_item_id}`}
                            onPress={() => handleDeleteMenuItem(menuItem.menu_item_id)}
                          >
                            <Trash2 size={16} color={COLORS.error} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {(vendorMenus[vendor.vendor_id] || []).length === 0 && (
                        <Text style={styles.emptyMenu}>No menu items yet</Text>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          ))
        )}

        {!loading && vendors.length === 0 && (
          <View style={styles.emptyState}>
            <Package size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>No vendors yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to onboard your first vendor</Text>
          </View>
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
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  formCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, ...SHADOWS.medium },
  formTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginBottom: SPACING.md },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: 15, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, marginBottom: SPACING.sm,
  },
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
  miniInput: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 10,
    fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary, marginBottom: SPACING.xs,
  },
  smallBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 10, alignItems: 'center' },
  smallBtnText: { color: '#fff', fontSize: 14, fontFamily: 'DMSans_700Bold' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  menuItemInfo: { flex: 1 },
  menuItemName: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary },
  menuItemPrice: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  emptyMenu: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.md },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, marginTop: SPACING.md },
  emptySubtitle: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
});
