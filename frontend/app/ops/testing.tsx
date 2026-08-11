import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlaskConical, Plus, Trash2 } from 'lucide-react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, R, money, fmtDateTime, titleCase } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, EmptyState, Btn, ConfirmDialog } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

export default function Testing() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [delFor, setDelFor] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.testingListOrders()); } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [load, isAdmin]);

  const createOrder = async () => {
    setCreating(true);
    try { await opsApi.testingCreateOrder(); await load(); }
    catch (e: any) { alert(e.message); } finally { setCreating(false); }
  };
  const doDelete = async () => {
    setDeleting(true);
    try { await opsApi.testingDeleteOrder(delFor.order_id); setDelFor(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setDeleting(false); }
  };

  if (!isAdmin) {
    return (
      <View>
        <PageHeader title="Testing" subtitle="Admin only" />
        <Card><Text style={{ color: C.textMute }}>This section is available to admins only.</Text></Card>
      </View>
    );
  }

  const columns = [
    { key: 'order_id', label: 'Order', width: 200, render: (r: any) => (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
        <Text style={{ fontWeight: '700', fontSize: 13, color: C.text }}>{r.order_id}</Text>
        <View style={styles.testTag}><Text style={styles.testTagText}>TEST</Text></View>
      </View>
    ) },
    { key: 'user_name', label: 'Customer', width: 150, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.user_name}</Text> },
    { key: 'vendor_name', label: 'Vendor', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.vendor_name || '—'}</Text> },
    { key: 'food_item_name', label: 'Item', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.quantity}× {r.food_item_name}</Text> },
    { key: 'total_amount', label: 'Amount', width: 100, render: (r: any) => <Text style={{ fontSize: 13 }}>{money(r.total_amount)}</Text> },
    { key: 'status', label: 'Status', width: 110, render: (r: any) => <Badge label={titleCase(r.status)} tone={r.status === 'paid' ? 'success' : 'neutral'} /> },
    { key: 'pickup_code', label: 'Pickup Code', width: 120, render: (r: any) => <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 2, color: C.primary }}>{r.pickup_code || '—'}</Text> },
    { key: 'created_at', label: 'Created', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{r.created_at ? fmtDateTime(r.created_at) : '—'}</Text> },
    { key: 'actions', label: '', width: 120, render: (r: any) => <Btn title="Delete" variant="danger" small icon={Trash2} onPress={() => setDelFor(r)} /> },
  ];

  return (
    <View>
      <PageHeader title="Testing" subtitle="Admin-only tools for creating and clearing test data" right={
        <Btn title="Create Test Order" icon={Plus} loading={creating} onPress={createOrder} />
      } />

      <Card style={{ marginBottom: SP.lg, flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
        <FlaskConical size={20} color={C.warn} />
        <Text style={{ flex: 1, color: C.textSec, fontSize: 13 }}>
          Test orders are inserted with status <Text style={{ fontWeight: '800', color: C.text }}>PAID</Text>, a generated pickup code,
          an item from the "Perfectly Good" vendor and customer "Test Customer". They are clearly labelled <Text style={{ fontWeight: '800', color: C.text }}>TEST</Text> and can be deleted anytime.
        </Text>
      </Card>

      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length
          ? <DataTable columns={columns} rows={data.items} keyField="order_id" />
          : <EmptyState title="No test orders" subtitle="Tap “Create Test Order” to add one." />)}
      </Card>

      <ConfirmDialog
        visible={!!delFor}
        title="Delete test order?"
        message={`Permanently delete test order ${delFor?.order_id}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setDelFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  testTag: { backgroundColor: C.warn + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  testTagText: { fontSize: 10, fontWeight: '800', color: C.warn, letterSpacing: 0.5 },
});
