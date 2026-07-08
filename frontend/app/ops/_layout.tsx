import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions, TextInput } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard, Store, ShoppingBag, Users, Wallet, Settings as SettingsIcon,
  Menu as MenuIcon, X, Search, LogOut, BarChart3,
} from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, titleCase, hasPerm } from '../../src/ops/theme';
import { Spinner } from '../../src/ops/ui';

const NAV = [
  { label: 'Dashboard', route: '/ops', icon: LayoutDashboard, perm: 'view_dashboard' },
  { label: 'Analytics', route: '/ops/analytics', icon: BarChart3, perm: 'view_dashboard' },
  { label: 'Vendors', route: '/ops/vendors', icon: Store, perm: 'view_vendors' },
  { label: 'Orders', route: '/ops/orders', icon: ShoppingBag, perm: 'view_orders' },
  { label: 'Users', route: '/ops/users', icon: Users, perm: 'view_users' },
  { label: 'Payouts', route: '/ops/payouts', icon: Wallet, perm: 'view_finance' },
  { label: 'Settings', route: '/ops/settings', icon: SettingsIcon, perm: 'view_dashboard' },
];

const STAFF = ['admin', 'operations', 'customer_success', 'finance'];

export default function OpsLayout() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && (!user || !STAFF.includes((user as any).role))) {
      router.replace('/');
    }
  }, [user, loading]);

  if (loading || !user) return <View style={{ flex: 1, backgroundColor: C.bg }}><Spinner label="Loading dashboard…" /></View>;
  if (!STAFF.includes((user as any).role)) return null;

  const isActive = (route: string) => {
    if (route === '/ops') return pathname === '/ops';
    if (route === '/ops/vendors') return pathname.startsWith('/ops/vendor');
    return pathname.startsWith(route);
  };

  const navItems = NAV.filter((n) => hasPerm(user, n.perm));

  const Sidebar = (
    <View style={[styles.sidebar, { paddingTop: SP.xl + (isNarrow ? insets.top : 0) }]}>
      <View style={styles.brand}>
        <Text style={styles.brandText}>Perfectly Good</Text>
        <Text style={styles.brandSub}>Operations</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: SP.md }}>
        {navItems.map((n) => {
          const active = isActive(n.route);
          const Icon = n.icon;
          return (
            <Pressable key={n.route} onPress={() => { router.push(n.route as any); setDrawerOpen(false); }}
              style={[styles.navItem, active && styles.navItemActive]}>
              <Icon size={19} color={active ? C.sidebarActiveText : C.sidebarItem} />
              <Text style={[styles.navLabel, active && { color: C.sidebarActiveText, fontWeight: '700' }]}>{n.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.userBox, { paddingBottom: SP.lg + insets.bottom }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>{(user as any).name || (user as any).email}</Text>
          <Text style={styles.userRole}>{titleCase((user as any).role)}</Text>
        </View>
        <Pressable onPress={async () => { await logout(); router.replace('/'); }} hitSlop={8}>
          <LogOut size={18} color={C.sidebarItem} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {!isNarrow && Sidebar}
      <View style={{ flex: 1 }}>
        <TopBar isNarrow={isNarrow} topInset={insets.top} onMenu={() => setDrawerOpen(true)} />
        <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[styles.content, { paddingBottom: SP.xl + insets.bottom }]}>
          <Slot />
        </ScrollView>
      </View>
      {isNarrow && drawerOpen && (
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <View style={{ width: 250, height: '100%' }}>{Sidebar}</View>
        </View>
      )}
    </View>
  );
}

function TopBar({ isNarrow, topInset, onMenu }: { isNarrow: boolean; topInset: number; onMenu: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const router = useRouter();

  const doSearch = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) { setResults(null); return; }
    try { setResults(await opsApi.search(text.trim())); } catch { setResults(null); }
  };

  const go = (path: string) => { setQ(''); setResults(null); router.push(path as any); };

  return (
    <View style={[styles.topbar, { paddingTop: topInset, height: 60 + topInset }]}>
      {isNarrow && (
        <Pressable onPress={onMenu} hitSlop={8} style={{ marginRight: SP.md }}>
          <MenuIcon size={22} color={C.text} />
        </Pressable>
      )}
      <View style={styles.searchWrap}>
        <Search size={16} color={C.textMute} />
        <TextInput
          value={q}
          onChangeText={doSearch}
          placeholder="Search vendors, customers, items, orders…"
          placeholderTextColor={C.textMute}
          style={styles.searchInput}
        />
        {q ? <Pressable onPress={() => { setQ(''); setResults(null); }}><X size={16} color={C.textMute} /></Pressable> : null}
        {results && (
          <View style={styles.searchResults}>
            <ScrollView style={{ maxHeight: 360 }}>
              <SearchGroup title="Vendors" items={(results.vendors || []).map((v: any) => ({ id: v.vendor_id, label: v.name, sub: v.category }))} onPick={(id: string) => go(`/ops/vendor/${id}`)} />
              <SearchGroup title="Customers" items={(results.customers || []).map((c: any) => ({ id: c.user_id, label: c.name, sub: c.email }))} onPick={() => go('/ops/users')} />
              <SearchGroup title="Menu Items" items={(results.menu_items || []).map((m: any) => ({ id: m.menu_item_id, label: m.name, sub: '' }))} onPick={(_: string, row: any) => go(`/ops/vendor/${(results.menu_items.find((x: any) => x.menu_item_id === row.id) || {}).vendor_id}`)} />
              <SearchGroup title="Orders" items={(results.orders || []).map((o: any) => ({ id: o.order_id, label: o.order_id, sub: `${o.user_name} · ${o.vendor_name}` }))} onPick={() => go('/ops/orders')} />
              {(!results.vendors?.length && !results.customers?.length && !results.menu_items?.length && !results.orders?.length) ? (
                <Text style={{ padding: SP.md, color: C.textMute }}>No results</Text>
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

function SearchGroup({ title, items, onPick }: any) {
  if (!items.length) return null;
  return (
    <View>
      <Text style={styles.searchGroupTitle}>{title}</Text>
      {items.map((it: any) => (
        <Pressable key={it.id} style={styles.searchItem} onPress={() => onPick(it.id, it)}>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{it.label}</Text>
          {it.sub ? <Text style={{ color: C.textMute, fontSize: 12 }} numberOfLines={1}>{it.sub}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  sidebar: { width: 244, backgroundColor: C.sidebar, paddingTop: SP.xl, flex: 1 },
  brand: { paddingHorizontal: SP.lg, paddingBottom: SP.lg, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  brandText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  brandSub: { color: C.primary, fontSize: 12, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingHorizontal: SP.lg, paddingVertical: 12, marginHorizontal: SP.sm, borderRadius: R.md },
  navItemActive: { backgroundColor: C.sidebarActiveBg },
  navLabel: { color: C.sidebarItem, fontSize: 14.5, fontWeight: '500' },
  userBox: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, padding: SP.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  userName: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  userRole: { color: C.sidebarItem, fontSize: 12 },
  topbar: { height: 60, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.lg, zIndex: 50 },
  searchWrap: { flex: 1, maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.bg, borderRadius: R.md, paddingHorizontal: 12, height: 38, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.text, outlineStyle: 'none' as any },
  searchResults: { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingVertical: SP.xs, zIndex: 100, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  searchGroupTitle: { fontSize: 11, fontWeight: '800', color: C.textMute, textTransform: 'uppercase', paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: 2 },
  searchItem: { paddingHorizontal: SP.md, paddingVertical: 8 },
  content: { padding: SP.xl, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  drawerOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', zIndex: 200 },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
});
