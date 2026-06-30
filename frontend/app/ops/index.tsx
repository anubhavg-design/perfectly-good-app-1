import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Store, CheckCircle2, Clock, UtensilsCrossed, ShoppingBag, CalendarDays, IndianRupee, TrendingUp, Wallet, Plus, Upload, Eye } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money } from '../../src/ops/theme';
import { Card, Spinner, PageHeader } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opsApi.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading metrics…" />;

  const cards = [
    { label: 'Total Vendors', value: stats?.total_vendors ?? 0, icon: Store, tone: C.info },
    { label: 'Active Vendors', value: stats?.active_vendors ?? 0, icon: CheckCircle2, tone: C.success },
    { label: 'Pending Vendors', value: stats?.pending_vendors ?? 0, icon: Clock, tone: C.warn },
    { label: 'Live Menu Items', value: stats?.live_menu_items ?? 0, icon: UtensilsCrossed, tone: C.primary },
    { label: 'Orders Today', value: stats?.orders_today ?? 0, icon: ShoppingBag, tone: C.info },
    { label: 'Orders This Week', value: stats?.orders_week ?? 0, icon: CalendarDays, tone: C.primary },
    { label: 'Revenue Today', value: money(stats?.revenue_today), icon: IndianRupee, tone: C.success },
    { label: 'Revenue This Month', value: money(stats?.revenue_month), icon: TrendingUp, tone: C.success },
    { label: 'Commission Earned', value: money(stats?.commission_earned), icon: IndianRupee, tone: C.primaryDark },
    { label: 'Pending Payouts', value: money(stats?.pending_payouts), icon: Wallet, tone: C.warn },
  ];

  return (
    <View>
      <PageHeader title={`Welcome, ${(user as any)?.name?.split(' ')[0] || 'Team'}`} subtitle="Operations overview" />
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
        <QuickAction icon={Plus} label="Add Vendor" onPress={() => router.push('/ops/vendors?add=1')} />
        <QuickAction icon={Upload} label="Upload Menu" onPress={() => router.push('/ops/vendors')} />
        <QuickAction icon={Eye} label="View Orders" onPress={() => router.push('/ops/orders')} />
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
  statCard: { width: 188, flexGrow: 1, minWidth: 160 },
  iconBox: { width: 38, height: 38, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', marginBottom: SP.md },
  statValue: { fontSize: 24, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 13, color: C.textSec, marginTop: 2 },
  section: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: SP.xl, marginBottom: SP.md },
  qa: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: SP.lg, paddingHorizontal: SP.xl, flexDirection: 'row', alignItems: 'center', gap: SP.md, minWidth: 200, flexGrow: 1 },
  qaIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 15, fontWeight: '700', color: C.text },
});
