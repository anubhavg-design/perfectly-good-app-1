import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, Clock, Tag, Leaf, ExternalLink, Sparkles, BadgeCheck } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { restaurantsApi } from '../../src/api/client';
import CachedImage from '../../src/components/CachedImage';
import AddToCartSheet from '../../src/components/AddToCartSheet';
import CartBar from '../../src/components/CartBar';
import { AddMeta } from '../../src/context/CartContext';

type Tab = 'surplus' | 'takeaway' | 'dine_in';

function fmt12(t: string): string {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return t || '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'surplus', label: 'Surplus' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'dine_in', label: 'Dine-in' },
];

const MENU_SORT = [
  { key: '', label: 'Recommended' },
  { key: 'price', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'discount', label: 'Discount %' },
];

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('surplus');
  const [sortBy, setSortBy] = useState('');
  const [sheet, setSheet] = useState<{ meta: AddMeta; foodType: string } | null>(null);
  // Sub-type used when surplus is empty and we fall back to the regular menu
  const [fallbackType, setFallbackType] = useState<Exclude<Tab, 'surplus'>>('takeaway');

  const load = useCallback(async () => {
    try {
      const res = await restaurantsApi.get(id!);
      setData(res);
    } catch (err) {
      console.log('Failed to load restaurant', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.loader}><Text style={styles.errorText}>Restaurant not found</Text></View>
      </SafeAreaView>
    );
  }

  const vendor = data.vendor || {};
  const surplus = data.surplus_items || [];
  const menu = data.menu_items || [];
  const loc = vendor.location || {};

  const priceOf = (it: any) => it.price ?? it.discounted_price ?? it.original_price ?? 0;
  const discountOf = (it: any) => it.discount ?? it.discount_percentage ?? 0;
  const sortItems = (items: any[]) => {
    if (!sortBy) return items;
    const arr = [...items];
    if (sortBy === 'price') arr.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sortBy === 'price_desc') arr.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sortBy === 'discount') arr.sort((a, b) => discountOf(b) - discountOf(a));
    return arr;
  };
  const sortedSurplus = sortItems(surplus);
  const sortedMenu = sortItems(menu);

  const goToCheckout = (item: any, orderType: Tab) => {
    const isSurplus = orderType === 'surplus';
    const payPrice = item.price != null ? item.price : (isSurplus ? item.discounted_price : item.original_price);
    setSheet({
      meta: {
        vendorId: vendor.vendor_id,
        vendorName: vendor.name,
        orderType,
        isOpen: !!vendor.is_open,
        openStatusText: vendor.open_status_text || '',
        todayShifts: vendor.today_shifts || [],
        item: {
          itemId: item.menu_item_id || item.item_id,
          name: item.name,
          price: Number(payPrice) || 0,
          originalPrice: Number(item.original_price) || 0,
          imageUrl: item.image_url || '',
          maxQty: isSurplus ? (item.quantity_available ?? 0) : 0,
        },
      },
      foodType: item.food_type || 'veg',
    });
  };

  const openMaps = () => {
    const mapsUrl = loc?.maps_url || (loc?.lat && loc?.lon ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}` : null);
    if (mapsUrl) Linking.openURL(mapsUrl);
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
        {/* Hero / header */}
        <View style={styles.hero}>
          {vendor.storefront_image || vendor.logo_url ? (
            <CachedImage uri={vendor.storefront_image || vendor.logo_url} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Text style={styles.heroInitial}>{(vendor.name || '?').charAt(0).toUpperCase()}</Text>
              <Text style={styles.heroCategory}>{vendor.category}</Text>
            </View>
          )}
          <SafeAreaView style={styles.heroOverlay} edges={['top']}>
            <TouchableOpacity testID="restaurant-back-btn" style={styles.backBtnFloat} onPress={() => router.back()}>
              <ArrowLeft size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </SafeAreaView>
          {surplus.length > 0 && (
            <View style={styles.surplusFlag}>
              <Sparkles size={13} color="#fff" />
              <Text style={styles.surplusFlagText}>{surplus.length} surplus deal{surplus.length > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{vendor.name}</Text>
            {vendor.verified ? (
              <View style={styles.verifiedBadge}>
                <BadgeCheck size={14} color={COLORS.primary} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Tag size={12} color={COLORS.primary} />
              <Text style={styles.metaChipText}>{vendor.category}</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: (vendor.is_open ? COLORS.success : COLORS.accentUrgent) + '18' }]}>
              <Clock size={12} color={vendor.is_open ? COLORS.success : COLORS.accentUrgent} />
              <Text style={[styles.metaChipText, { color: vendor.is_open ? COLORS.success : COLORS.accentUrgent, fontFamily: 'DMSans_700Bold' }]}>
                {vendor.is_open ? 'Open now' : (vendor.open_status_text || 'Closed')}
              </Text>
            </View>
          </View>
          {vendor.today_shifts && vendor.today_shifts.length > 0 ? (
            <Text style={styles.hoursLine}>Today: {vendor.today_shifts.map((s: any) => `${fmt12(s.start)}–${fmt12(s.end)}`).join(', ')}</Text>
          ) : (
            <Text style={styles.hoursLine}>Closed today</Text>
          )}
          <TouchableOpacity style={styles.addressRow} onPress={openMaps} activeOpacity={0.7}>
            <MapPin size={14} color={COLORS.primary} />
            <Text style={styles.addressText} numberOfLines={2}>{loc.address || 'Nearby'}</Text>
            <ExternalLink size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const isSurplusTab = t.key === 'surplus';
            return (
              <TouchableOpacity
                key={t.key}
                testID={`tab-${t.key}`}
                style={[styles.tab, active && (isSurplusTab ? styles.tabActiveSurplus : styles.tabActive)]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.8}
              >
                {isSurplusTab && <Sparkles size={14} color={active ? '#fff' : COLORS.primary} />}
                <Text style={[styles.tabText, active && styles.tabTextActive, isSurplusTab && !active && { color: COLORS.primary }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sort bar */}
        <View style={styles.sortBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortBarContent}>
            {MENU_SORT.map((opt) => {
              const active = sortBy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key || 'default'}
                  testID={`menu-sort-${opt.key || 'default'}`}
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setSortBy(opt.key)}
                >
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {tab === 'surplus' ? (
            surplus.length > 0 ? (
              sortedSurplus.map((item: any) => (
                <MenuRow key={item.menu_item_id} item={item} surplus onPress={() => goToCheckout(item, 'surplus')} />
              ))
            ) : (
              <View>
                <View style={styles.emptySurplus}>
                  <Leaf size={22} color={COLORS.primary} />
                  <Text style={styles.emptySurplusTitle}>No surplus deals available right now</Text>
                  <Text style={styles.emptySurplusSub}>Browse the regular menu below — you can still order Takeaway or Dine-in.</Text>
                </View>
                {/* Sub-switch for the fallback regular menu */}
                <View style={styles.subSwitch}>
                  {(['takeaway', 'dine_in'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      testID={`fallback-${s}`}
                      style={[styles.subSwitchBtn, fallbackType === s && styles.subSwitchBtnActive]}
                      onPress={() => setFallbackType(s)}
                    >
                      <Text style={[styles.subSwitchText, fallbackType === s && styles.subSwitchTextActive]}>
                        {s === 'takeaway' ? 'Takeaway' : 'Dine-in'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {menu.length === 0 ? (
                  <Text style={styles.emptyMenuText}>This restaurant hasn't added a menu yet.</Text>
                ) : (
                  <GroupedMenu items={sortedMenu} flat={!!sortBy} onPressItem={(item: any) => goToCheckout(item, fallbackType)} />
                )}
              </View>
            )
          ) : (
            menu.length === 0 ? (
              <Text style={styles.emptyMenuText}>This restaurant hasn't added a menu yet.</Text>
            ) : (
              <GroupedMenu items={sortedMenu} flat={!!sortBy} onPressItem={(item: any) => goToCheckout(item, tab)} />
            )
          )}
        </View>
      </ScrollView>
      <CartBar vendorId={vendor.vendor_id} />
      <AddToCartSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        meta={sheet?.meta || null}
        foodType={sheet?.foodType}
      />
    </View>
  );
}

function GroupedMenu({ items, onPressItem, flat }: { items: any[]; onPressItem: (item: any) => void; flat?: boolean }) {
  // Group items by their free-form menu_category, preserving first-seen order.
  // Items without a category fall into "More" shown last.
  const order: string[] = [];
  const groups: Record<string, any[]> = {};
  items.forEach((it) => {
    const key = (it.menu_category || '').trim() || '__uncategorized__';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(it);
  });
  // If nothing is categorized, or a sort is active, render a flat list (no headers).
  const hasCategories = order.some((k) => k !== '__uncategorized__');
  if (flat || !hasCategories) {
    return (
      <>
        {items.map((item) => (
          <MenuRow key={item.menu_item_id} item={item} onPress={() => onPressItem(item)} />
        ))}
      </>
    );
  }
  // Show uncategorized group last, labelled "More".
  const sorted = [...order.filter((k) => k !== '__uncategorized__'), ...order.filter((k) => k === '__uncategorized__')];
  return (
    <>
      {sorted.map((key) => (
        <View key={key} style={styles.catGroup}>
          <Text style={styles.catHeader}>{key === '__uncategorized__' ? 'More' : key}</Text>
          {groups[key].map((item) => (
            <MenuRow key={item.menu_item_id} item={item} onPress={() => onPressItem(item)} />
          ))}
        </View>
      ))}
    </>
  );
}

function MenuRow({ item, surplus, onPress }: { item: any; surplus?: boolean; onPress: () => void }) {
  const isVeg = item.food_type !== 'non_veg';
  return (
    <TouchableOpacity
      testID={`menu-item-${item.menu_item_id}`}
      style={[styles.row, surplus && styles.rowSurplus]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <CachedImage uri={item.image_url} style={styles.rowImg} />
      <View style={{ flex: 1 }}>
        <View style={styles.rowTitleLine}>
          <View style={[styles.vegDot, { borderColor: isVeg ? COLORS.success : COLORS.error }]}>
            <View style={[styles.vegDotInner, { backgroundColor: isVeg ? COLORS.success : COLORS.error }]} />
          </View>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        </View>
        {item.description ? <Text style={styles.rowDesc} numberOfLines={2}>{item.description}</Text> : null}
        {(item.kcal || item.protein) ? (
          <Text style={styles.rowMacro}>
            {item.kcal ? `${item.kcal} kcal` : ''}{item.kcal && item.protein ? ' · ' : ''}{item.protein ? `${item.protein}g protein` : ''}
          </Text>
        ) : null}
        <View style={styles.rowPriceLine}>
          {surplus ? (
            <>
              <Text style={styles.rowPriceSurplus}>₹{item.price ?? item.discounted_price ?? item.original_price}</Text>
              {item.original_price > (item.price ?? item.discounted_price ?? item.original_price) ? (
                <Text style={styles.rowPriceStrike}>₹{item.original_price}</Text>
              ) : null}
              {item.discount > 0 ? <Text style={styles.rowDiscount}>{item.discount}% OFF</Text> : null}
            </>
          ) : (item.price != null && item.price < item.original_price) ? (
            <>
              <Text style={styles.rowPrice}>₹{item.price}</Text>
              <Text style={styles.rowPriceStrike}>₹{item.original_price}</Text>
              {item.discount_percentage > 0 ? <Text style={styles.rowDiscount}>{item.discount_percentage}% OFF</Text> : null}
            </>
          ) : (
            <Text style={styles.rowPrice}>₹{item.original_price}</Text>
          )}
        </View>
        {surplus && item.quantity_available != null ? (
          <Text style={styles.rowQty}>{item.quantity_available} left</Text>
        ) : null}
      </View>
      <View style={[styles.addBtn, surplus && styles.addBtnSurplus]}>
        <Text style={[styles.addBtnText, surplus && { color: '#fff' }]}>ADD</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  backBtn: { position: 'absolute', top: 48, left: 16, zIndex: 10 },
  hero: { position: 'relative' },
  heroImage: { width: '100%', height: 200, backgroundColor: COLORS.skeleton },
  heroPlaceholder: { backgroundColor: COLORS.primaryDark, justifyContent: 'center', alignItems: 'center' },
  heroInitial: { fontSize: 56, fontFamily: 'Outfit_700Bold', color: '#fff' },
  heroCategory: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: 'rgba(255,255,255,0.85)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtnFloat: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center', alignItems: 'center', margin: SPACING.md, ...SHADOWS.small,
  },
  surplusFlag: {
    position: 'absolute', bottom: SPACING.md, left: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 4, paddingVertical: SPACING.xs + 1,
  },
  surplusFlagText: { color: '#fff', fontSize: 12, fontFamily: 'DMSans_700Bold' },
  infoBlock: { padding: SPACING.md, backgroundColor: COLORS.surface },
  name: { fontSize: 24, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  verifiedText: { fontSize: 12, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  metaRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.borderLight, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm + 2, paddingVertical: 4 },
  metaChipText: { fontSize: 12, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  addressText: { flex: 1, fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary },
  hoursLine: { fontSize: 12.5, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, marginTop: SPACING.sm },
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface, marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.borderLight,
  },
  tabActive: { backgroundColor: COLORS.textPrimary },
  tabActiveSurplus: { backgroundColor: COLORS.primary },
  tabText: { fontSize: 14, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: SPACING.md, gap: SPACING.sm },
  sortBar: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  sortBarContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm },
  sortChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.borderLight, marginRight: SPACING.sm,
  },
  sortChipActive: { backgroundColor: COLORS.primary },
  sortChipText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary },
  sortChipTextActive: { color: '#fff' },
  emptySurplus: {
    alignItems: 'center', backgroundColor: COLORS.primary + '0D', borderRadius: RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md, gap: 6,
  },
  emptySurplusTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary, textAlign: 'center' },
  emptySurplusSub: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textSecondary, textAlign: 'center' },
  subSwitch: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  subSwitchBtn: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.md, backgroundColor: COLORS.borderLight, alignItems: 'center' },
  subSwitchBtnActive: { backgroundColor: COLORS.textPrimary },
  subSwitchText: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.textSecondary },
  subSwitchTextActive: { color: '#fff' },
  emptyMenuText: { fontSize: 14, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textAlign: 'center', paddingVertical: SPACING.xl },
  catGroup: { gap: SPACING.sm, marginBottom: SPACING.sm },
  catHeader: {
    fontSize: 17, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary,
    marginTop: SPACING.sm, marginBottom: 2,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: SPACING.sm + 2, ...SHADOWS.small,
  },
  rowSurplus: { borderWidth: 1, borderColor: COLORS.primary + '33' },
  rowImg: { width: 64, height: 64, borderRadius: RADIUS.md, backgroundColor: COLORS.skeleton },
  rowImgEmpty: { backgroundColor: COLORS.borderLight },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegDot: { width: 14, height: 14, borderRadius: 3, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  vegDotInner: { width: 6, height: 6, borderRadius: 3 },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: COLORS.textPrimary },
  rowDesc: { fontSize: 12.5, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, marginTop: 2 },
  rowMacro: { fontSize: 11.5, fontFamily: 'DMSans_500Medium', color: COLORS.textSecondary, marginTop: 2 },
  rowPriceLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  rowPrice: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.textPrimary },
  rowPriceSurplus: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: COLORS.primary },
  rowPriceStrike: { fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.textMuted, textDecorationLine: 'line-through' },
  rowDiscount: { fontSize: 11, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
  rowQty: { fontSize: 11.5, fontFamily: 'DMSans_500Medium', color: COLORS.accentUrgent, marginTop: 2 },
  addBtn: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  addBtnSurplus: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  addBtnText: { fontSize: 13, fontFamily: 'DMSans_700Bold', color: COLORS.primary },
});
