import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { vendorApi } from '../src/api/client';

interface MenuItem {
  menu_item_id: string;
  name: string;
  description: string;
  original_price: number;
  image_url: string;
}

const EXPIRY_OPTIONS = ['Today', 'Tomorrow', 'In 2 days', 'In 3 days'];

export default function VendorCreateDropScreen() {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiry, setExpiry] = useState('');
  const [pickupStart, setPickupStart] = useState('');
  const [pickupEnd, setPickupEnd] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {
    try {
      const data = await vendorApi.menu();
      setMenuItems(data || []);
    } catch (err) {
      console.log('Failed to load menu', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedItem || !discountedPrice || !quantity || !expiry || !pickupStart || !pickupEnd) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    const dp = Number(discountedPrice);
    if (dp >= selectedItem.original_price) {
      Alert.alert('Error', 'Discounted price must be less than original price');
      return;
    }
    setCreating(true);
    try {
      await vendorApi.createDrop({
        menu_item_id: selectedItem.menu_item_id,
        discounted_price: dp,
        quantity_available: Number(quantity),
        pickup_start_time: pickupStart,
        pickup_end_time: pickupEnd,
        expiry,
      });
      Alert.alert('Success', 'Drop created successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity testID="create-drop-back" onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Drop</Text>
        <TouchableOpacity
          testID="submit-drop-btn"
          onPress={handleCreate}
          disabled={!selectedItem || creating}
          style={[styles.headerAddBtn, (!selectedItem || creating) && { opacity: 0.4 }]}
        >
          {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.headerAddText}>Add Drop</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Select Menu Item */}
        <Text style={styles.sectionTitle}>Select Menu Item</Text>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.menu_item_id}
            testID={`menu-select-${item.menu_item_id}`}
            style={[styles.menuCard, selectedItem?.menu_item_id === item.menu_item_id && styles.menuCardSelected]}
            onPress={() => {
              setSelectedItem(item);
              // Default the discounted price to 80% of original (20% off)
              setDiscountedPrice(String(Math.round(item.original_price * 0.8)));
            }}
          >
            <View style={styles.menuInfo}>
              <Text style={styles.menuName}>{item.name}</Text>
              <Text style={styles.menuDesc} numberOfLines={1}>{item.description}</Text>
              <Text style={styles.menuPrice}>₹{item.original_price}</Text>
            </View>
            {selectedItem?.menu_item_id === item.menu_item_id && (
              <View style={styles.checkCircle}>
                <Check size={16} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        ))}

        {menuItems.length === 0 && (
          <Text style={styles.emptyText}>No menu items available. Ask admin to add items first.</Text>
        )}

        {/* Drop Details */}
        {selectedItem && (
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Drop Details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Discounted Price (₹)</Text>
              <TextInput
                testID="discounted-price-input"
                style={styles.input}
                value={discountedPrice}
                onChangeText={setDiscountedPrice}
                keyboardType="numeric"
                placeholder="e.g., 120"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={styles.hint}>Original: ₹{selectedItem.original_price}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Quantity Available</Text>
              <TextInput
                testID="quantity-input"
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="e.g., 10"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Best Before / Expiry</Text>
              <View style={styles.expiryRow}>
                {EXPIRY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    testID={`expiry-${opt}`}
                    style={[styles.expiryChip, expiry === opt && styles.expiryChipSelected]}
                    onPress={() => setExpiry(opt)}
                  >
                    <Text style={[styles.expiryChipText, expiry === opt && styles.expiryChipTextSelected]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.timeRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Pickup Start (HH:MM)</Text>
                <TextInput
                  testID="pickup-start-input"
                  style={styles.input}
                  value={pickupStart}
                  onChangeText={setPickupStart}
                  placeholder="18:00"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Pickup End (HH:MM)</Text>
                <TextInput
                  testID="pickup-end-input"
                  style={styles.input}
                  value={pickupEnd}
                  onChangeText={setPickupEnd}
                  placeholder="20:00"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerAddBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 8, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
  headerAddText: { color: '#fff', fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  headerTitle: { fontSize: 20, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  sectionTitle: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  menuCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 2, borderColor: 'transparent', ...SHADOWS.small,
  },
  menuCardSelected: { borderColor: COLORS.primary },
  menuInfo: { flex: 1 },
  menuName: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  menuDesc: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, marginTop: 2 },
  menuPrice: { fontSize: 15, fontFamily: 'DMSans_700Bold', color: COLORS.primary, marginTop: 4 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.lg },
  detailsSection: { marginTop: SPACING.md },
  inputGroup: { marginBottom: SPACING.md },
  label: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textPrimary, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16, fontFamily: 'DMSans_400Regular', color: COLORS.textPrimary,
  },
  hint: { fontSize: 12, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 4 },
  timeRow: { flexDirection: 'row', gap: SPACING.md },
  expiryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  expiryChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  expiryChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  expiryChipText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  expiryChipTextSelected: { color: '#fff' },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center', marginTop: SPACING.md },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
});
