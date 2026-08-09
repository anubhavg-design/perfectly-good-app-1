import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Store, CheckCircle2, Clock, UtensilsCrossed, ShoppingBag, IndianRupee, TrendingUp, Wallet, Plus, Upload, Eye } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money, hasPerm } from '../../src/ops/theme';
import { Card, Spinner, PageHeader } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');

  useEffect(() => {
    let active = true;
    opsApi.stats(range).then((s) => { if (active) setStats(s); }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  if (loading) return <Spinner label="Loading metrics…" />;

  const rangeLabel = range === 'today' ? 'Today' : range === 'week' ? 'This Week' : 'This Month';

  const cards = [
    { label: 'Total Vendors', value: stats?.total_vendors ?? 0, icon: Store, tone: C.info },
    { label: 'Active Vendors', value: stats?.active_vendors ?? 0, icon: CheckCircle2, tone: C.success },
    { label: 'Pending Vendors', value: stats?.pending_vendors ?? 0, icon: Clock, tone: C.warn },
    { label: 'Live Menu Items', value: stats?.live_menu_items ?? 0, icon: UtensilsCrossed, tone: C.primary },
    { label: `Orders · ${rangeLabel}`, value: stats?.range_orders ?? 0, icon: ShoppingBag, tone: C.info },
    { label: `Revenue · ${rangeLabel}`, value: money(stats?.range_revenue), icon: IndianRupee, tone: C.success },
    { label: `Commission · ${rangeLabel}`, value: money(stats?.range_commission), icon: TrendingUp, tone: C.primaryDark },
    { label: 'Pending Payouts', value: money(stats?.pending_payouts), icon: Wallet, tone: C.warn },
  ];

  const RANGES: { key: 'today' | 'week' | 'month'; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
  ];

  return (
    <View>
      <PageHeader title={`Welcome, ${(user as any)?.name?.split(' ')[0] || 'Team'}`} subtitle="Operations overview" />

      <View style={styles.rangeRow}>
        {RANGES.map((r) => {
          const active = range === r.key;
          return (
            <Pressable
              key={r.key}
              testID={`dash-range-${r.key}`}
              onPress={() => setRange(r.key)}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.grid}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} style={styles.statCard}>
              <View style={[styles.iconBox, { backgroundColor: c.tone + '18' }]}><Icon size={20} color={c.tone} /></View>
              <Text style={styles.statValue}>{c.value}</Text>
              <Text style={styles.statLabel}>{c.label}</Text>
            </Card>
          );
        })}
      </View>

      <Text style={styles.section}>Quick Actions</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
        {hasPerm(user, 'manage_vendors') && <QuickAction icon={Plus} label="Add Vendor" onPress={() => router.push('/ops/vendors?add=1')} />}
        {hasPerm(user, 'manage_menu') && <QuickAction icon={Upload} label="Upload Menu" onPress={() => router.push('/ops/vendors')} />}
        {hasPerm(user, 'view_orders') && <QuickAction icon={Eye} label="View Orders" onPress={() => router.push('/ops/orders')} />}
      </View>
    </View>
  );
}

function QuickAction({ icon: Icon, label, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.85 }]}>
      <View style={styles.qaIcon}><Icon size={20} color={C.primary} /></View>
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md },
  rangeRow: { flexDirection: 'row', gap: SP.sm, marginBottom: SP.lg, flexWrap: 'wrap' },
  rangeChip: { paddingVertical: SP.sm, paddingHorizontal: SP.lg, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  rangeChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  rangeChipText: { fontSize: 13.5, fontWeight: '700', color: C.textSec },
  rangeChipTextActive: { color: '#fff' },
  statCard: { width: 188, flexGrow: 1, minWidth: 160 },
  iconBox: { width: 38, height: 38, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', marginBottom: SP.md },
  statValue: { fontSize: 24, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 13, color: C.textSec, marginTop: 2 },
  section: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: SP.xl, marginBottom: SP.md },
  qa: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: SP.lg, paddingHorizontal: SP.xl, flexDirection: 'row', alignItems: 'center', gap: SP.md, minWidth: 200, flexGrow: 1 },
  qaIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 15, fontWeight: '700', color: C.text },
});
