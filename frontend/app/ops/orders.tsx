import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, money, fmtDateTime, titleCase, hasPerm } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, Chips, Dropdown, EmptyState, Btn } from '../../src/ops/ui';
import { useAuth } from '../../src/context/AuthContext';

const STATUS_TONE: any = { reserved: 'info', picked_up: 'success', cancelled: 'danger', expired: 'warn' };

export default function Orders() {
  const { user } = useAuth();
  const canUpdate = hasPerm(user, 'update_order_status');
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.listOrders({ range, status, page, page_size: 25 })); } catch {} finally { setLoading(false); }
  }, [range, status, page]);
  useEffect(() => { load(); }, [load]);

  const setStatusFor = async (id: string, s: string) => { await opsApi.orderStatus(id, s); await load(); };

  const columns = [
    { key: 'order_id', label: 'Order ID', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5, fontWeight: '600' }}>{r.order_id}</Text> },
    { key: 'customer_name', label: 'Customer', width: 130 },
    { key: 'vendor_name', label: 'Vendor', width: 150 },
    { key: 'food_item_name', label: 'Items', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.quantity}× {r.food_item_name}</Text> },
    { key: 'order_value', label: 'Value', width: 90, render: (r: any) => <Text style={{ fontWeight: '700' }}>{money(r.order_value)}</Text> },
    { key: 'commission', label: 'Commission', width: 100, render: (r: any) => <Text style={{ fontSize: 13 }}>{money(r.commission)}</Text> },
    { key: 'created_at', label: 'Created', width: 140, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDateTime(r.created_at)}</Text> },
    { key: 'razorpay_payment_id', label: 'Payment', width: 90, render: (r: any) => <Badge label={r.razorpay_payment_id ? 'Paid' : 'Pending'} tone={r.razorpay_payment_id ? 'success' : 'warn'} /> },
    { key: 'status', label: 'Pickup Status', width: 150, render: (r: any) => (
      canUpdate ? (
        <View style={{ width: 140 }}>
          <Dropdown value={r.status} onChange={(s) => setStatusFor(r.order_id, s)}
            options={['reserved', 'picked_up', 'cancelled', 'expired'].map((s) => ({ label: titleCase(s), value: s }))} />
        </View>
      ) : <Badge label={titleCase(r.status)} tone={STATUS_TONE[r.status] || 'neutral'} />
    ) },
  ];

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / 25));

  return (
    <View>
      <PageHeader title="Orders" subtitle={`${data.total || 0} orders`} />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={{ flexDirection: 'row', gap: SP.lg, flexWrap: 'wrap', alignItems: 'center' }}>
          <View><Text style={styles.flabel}>Period</Text><Chips value={range} options={['', 'today', 'week']} onChange={(v) => { setRange(v); setPage(1); }} /></View>
          <View><Text style={styles.flabel}>Status</Text><Chips value={status} options={['', 'reserved', 'picked_up', 'cancelled']} onChange={(v) => { setStatus(v); setPage(1); }} /></View>
        </View>
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="order_id" /> : <EmptyState title="No orders found" />)}
      </Card>
      {totalPages > 1 && (
        <View style={styles.pager}>
          <Btn title="Previous" variant="secondary" small disabled={page <= 1} onPress={() => setPage((p) => p - 1)} />
          <Text style={{ color: C.textSec }}>Page {page} of {totalPages}</Text>
          <Btn title="Next" variant="secondary" small disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flabel: { fontSize: 11.5, fontWeight: '700', color: C.textMute, textTransform: 'uppercase', marginBottom: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.lg, marginTop: SP.lg },
});
