import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IndianRupee, ShoppingBag, Users, Store, TrendingUp, PiggyBank, Leaf, Activity } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money } from '../../src/ops/theme';
import { Card, Spinner, PageHeader, Chips, DataTable, EmptyState } from '../../src/ops/ui';

export default function Analytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  useEffect(() => {
    setLoading(true);
    opsApi.analytics(Number(days)).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Spinner label="Crunching numbers…" />;
  if (!data) return <EmptyState title="No analytics available" />;

  const t = data.totals || {};
  const cards = [
    { label: 'Revenue', value: money(t.revenue), icon: IndianRupee, tone: C.success },
    { label: 'Orders', value: t.orders ?? 0, icon: ShoppingBag, tone: C.info },
    { label: 'Avg Order Value', value: money(t.aov), icon: TrendingUp, tone: C.primary },
    { label: 'Commission Earned', value: money(t.commission), icon: IndianRupee, tone: C.primaryDark },
    { label: 'Money Saved (Customers)', value: money(t.money_saved), icon: PiggyBank, tone: C.success },
    { label: 'Food Value Rescued', value: money(t.food_value_rescued), icon: Leaf, tone: C.success },
    { label: `New Users (${days}d)`, value: t.new_users ?? 0, icon: Users, tone: C.info },
    { label: `New Vendors (${days}d)`, value: t.new_vendors ?? 0, icon: Store, tone: C.warn },
    { label: 'Active Vendors', value: t.active_vendors ?? 0, icon: Activity, tone: C.primary },
  ];

  const trend = data.trend || [];
  const maxRev = Math.max(1, ...trend.map((d: any) => d.revenue));
  const maxOrd = Math.max(1, ...trend.map((d: any) => d.orders));

  return (
    <View>
      <PageHeader title="Analytics" subtitle="Performance & insights"
        right={<Chips value={days} options={['7', '30', '90']} onChange={setDays} />} />

      <View style={styles.grid}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} style={styles.statCard}>
              <View style={[styles.iconBox, { backgroundColor: c.tone + '18' }]}><Icon size={18} color={c.tone} /></View>
              <Text style={styles.statValue}>{c.value}</Text>
              <Text style={styles.statLabel}>{c.label}</Text>
            </Card>
          );
        })}
      </View>

      <View style={styles.chartRow}>
        <Card style={{ flex: 1, minWidth: 320 }}>
          <Text style={styles.chartTitle}>Revenue Trend</Text>
          <BarChart data={trend} max={maxRev} field="revenue" color={C.primary} />
        </Card>
        <Card style={{ flex: 1, minWidth: 320 }}>
          <Text style={styles.chartTitle}>Orders Trend</Text>
          <BarChart data={trend} max={maxOrd} field="orders" color={C.info} />
        </Card>
      </View>

      <View style={styles.chartRow}>
        <Card style={{ flex: 1, minWidth: 300, padding: 0 }}>
          <Text style={[styles.chartTitle, { padding: SP.lg, paddingBottom: SP.sm }]}>Top Vendors</Text>
          <Leaderboard rows={data.top_vendors} valueKey="revenue" money />
        </Card>
        <Card style={{ flex: 1, minWidth: 300, padding: 0 }}>
          <Text style={[styles.chartTitle, { padding: SP.lg, paddingBottom: SP.sm }]}>Top Selling Items</Text>
          <Leaderboard rows={data.top_items} valueKey="qty" suffix=" sold" />
        </Card>
        <Card style={{ flex: 1, minWidth: 300, padding: 0 }}>
          <Text style={[styles.chartTitle, { padding: SP.lg, paddingBottom: SP.sm }]}>Lowest Performing Vendors</Text>
          <Leaderboard rows={data.lowest_vendors} valueKey="revenue" money />
        </Card>
      </View>

      <Card style={{ padding: 0, marginBottom: SP.xxl }}>
        <Text style={[styles.chartTitle, { padding: SP.lg, paddingBottom: SP.sm }]}>By Category</Text>
        {(data.categories || []).length === 0 ? <EmptyState title="No category data yet" /> : (
          <DataTable keyField="category" rows={data.categories} columns={[
            { key: 'category', label: 'Category', width: 200, render: (r: any) => <Text style={{ fontWeight: '700' }}>{r.category}</Text> },
            { key: 'orders', label: 'Orders', width: 120 },
            { key: 'revenue', label: 'Revenue', width: 140, render: (r: any) => <Text style={{ fontWeight: '600' }}>{money(r.revenue)}</Text> },
            { key: 'commission', label: 'Commission', width: 140, render: (r: any) => <Text>{money(r.commission)}</Text> },
          ]} />
        )}
      </Card>
    </View>
  );
}

function BarChart({ data, max, field, color }: any) {
  if (!data?.length) return <EmptyState title="No data" />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2, marginTop: SP.md }}>
      {data.map((d: any, i: number) => {
        const h = Math.max(2, (d[field] / max) * 130);
        return <View key={i} style={{ flex: 1, height: h, backgroundColor: color, borderRadius: 2, opacity: 0.85 }} />;
      })}
    </View>
  );
}

function Leaderboard({ rows, valueKey, money: isMoney, suffix }: any) {
  if (!rows?.length) return <EmptyState title="No data yet" />;
  return (
    <View style={{ paddingHorizontal: SP.lg, paddingBottom: SP.md }}>
      {rows.map((r: any, i: number) => (
        <View key={i} style={styles.lbRow}>
          <Text style={styles.lbRank}>{i + 1}</Text>
          <Text style={{ flex: 1, color: C.text, fontWeight: '600', fontSize: 13.5 }} numberOfLines={1}>{r.name || '—'}</Text>
          <Text style={{ color: C.textSec, fontWeight: '700', fontSize: 13 }}>{isMoney ? money(r[valueKey]) : `${r[valueKey]}${suffix || ''}`}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md, marginBottom: SP.lg },
  statCard: { width: 180, flexGrow: 1, minWidth: 150 },
  iconBox: { width: 34, height: 34, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', marginBottom: SP.sm },
  statValue: { fontSize: 21, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 12.5, color: C.textSec, marginTop: 2 },
  chartRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.md, marginBottom: SP.lg },
  chartTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  lbRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primarySoft, color: C.primaryDark, fontWeight: '800', fontSize: 12, textAlign: 'center', lineHeight: 22 },
});
