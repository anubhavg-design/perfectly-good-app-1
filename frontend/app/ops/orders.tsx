import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { opsApi } from '../../src/api/opsApi';
import { C, SP, money, fmtDateTime, titleCase, hasPerm } from '../../src/ops/theme';
import { Card, Badge, DataTable, Spinner, PageHeader, Chips, Dropdown, EmptyState, Btn, ConfirmDialog, Sheet, Field } from '../../src/ops/ui';
import { ExportButtons } from '../../src/ops/ExportButtons';
import { useAuth } from '../../src/context/AuthContext';
import { FlaskConical } from 'lucide-react-native';

const STATUS_TONE: any = { reserved: 'info', picked_up: 'success', cancelled: 'danger', refunded: 'warn', expired: 'warn' };

export default function Orders() {
  const { user } = useAuth();
  const canUpdate = hasPerm(user, 'update_order_status');
  const canRefund = hasPerm(user, 'manage_payouts');
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refundRow, setRefundRow] = useState<any>(null);
  const [refunding, setRefunding] = useState(false);
  const isAdmin = user?.role === 'admin';
  const [testOpen, setTestOpen] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [testVendor, setTestVendor] = useState('');
  const [creatingTest, setCreatingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const openTest = async () => {
    setTestResult(null); setTestOpen(true);
    if (!vendors.length) {
      try { const r = await opsApi.listVendors({ page_size: 100 }); setVendors(r.items || []); } catch {}
    }
  };
  const createTest = async () => {
    setCreatingTest(true);
    try {
      const res = await opsApi.createTestOrder(testVendor || undefined);
      setTestResult(res);
      await load();
    } catch (e: any) { alert(e.message); } finally { setCreatingTest(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await opsApi.listOrders({ range, status, page, page_size: 25 })); } catch {} finally { setLoading(false); }
  }, [range, status, page]);
  useEffect(() => { load(); }, [load]);

  const setStatusFor = async (id: string, s: string) => { await opsApi.orderStatus(id, s); await load(); };
  const doRefund = async () => {
    setRefunding(true);
    try { await opsApi.refundOrder(refundRow.order_id); setRefundRow(null); await load(); }
    catch (e: any) { alert(e.message); } finally { setRefunding(false); }
  };

  const columns = [
    { key: 'order_id', label: 'Order ID', width: 150, render: (r: any) => <Text style={{ fontSize: 12.5, fontWeight: '600' }}>{r.order_id}</Text> },
    { key: 'customer_name', label: 'Customer', width: 130 },
    { key: 'vendor_name', label: 'Vendor', width: 150 },
    { key: 'food_item_name', label: 'Items', width: 160, render: (r: any) => <Text style={{ fontSize: 13 }}>{r.quantity}× {r.food_item_name}</Text> },
    { key: 'order_value', label: 'Value', width: 90, render: (r: any) => <Text style={{ fontWeight: '700' }}>{money(r.order_value)}</Text> },
    { key: 'pickup_code', label: 'Pickup Code', width: 110, render: (r: any) => <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: r.pickup_code ? C.text : C.textMute }}>{r.pickup_code || '—'}</Text> },
    { key: 'created_at', label: 'Created', width: 140, render: (r: any) => <Text style={{ fontSize: 12.5, color: C.textSec }}>{fmtDateTime(r.created_at)}</Text> },
    { key: 'razorpay_payment_id', label: 'Payment', width: 90, render: (r: any) => <Badge label={r.razorpay_payment_id ? 'Paid' : 'Pending'} tone={r.razorpay_payment_id ? 'success' : 'warn'} /> },
    { key: 'status', label: 'Pickup Status', width: 150, render: (r: any) => (
      canUpdate ? (
        <View style={{ width: 140 }}>
          <Dropdown value={r.status} onChange={(s) => setStatusFor(r.order_id, s)}
            options={['reserved', 'picked_up', 'cancelled', 'refunded', 'expired'].map((s) => ({ label: titleCase(s), value: s }))} />
        </View>
      ) : <Badge label={titleCase(r.status)} tone={STATUS_TONE[r.status] || 'neutral'} />
    ) },
    { key: 'actions', label: 'Actions', width: 100, render: (r: any) => (
      canRefund && r.status !== 'refunded' && r.status !== 'cancelled'
        ? <Btn title="Refund" variant="secondary" small onPress={() => setRefundRow(r)} />
        : <Text style={{ color: C.textMute }}>—</Text>
    ) },
  ];

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / 25));

  return (
    <View>
      <PageHeader title="Orders" subtitle={`${data.total || 0} orders`} right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
          {isAdmin && <Btn title="Test Order" variant="secondary" small icon={FlaskConical} onPress={openTest} />}
          <ExportButtons entity="orders" />
        </View>
      } />
      <Card style={{ marginBottom: SP.lg, padding: SP.md }}>
        <View style={{ flexDirection: 'row', gap: SP.lg, flexWrap: 'wrap', alignItems: 'center' }}>
          <View><Text style={styles.flabel}>Period</Text><Chips value={range} options={['', 'today', 'week']} onChange={(v) => { setRange(v); setPage(1); }} /></View>
          <View><Text style={styles.flabel}>Status</Text><Chips value={status} options={['', 'reserved', 'picked_up', 'cancelled', 'refunded']} onChange={(v) => { setStatus(v); setPage(1); }} /></View>
        </View>
      </Card>
      <Card style={{ padding: 0 }}>
        {loading ? <Spinner /> : (data.items?.length ? <DataTable columns={columns} rows={data.items} keyField="order_id" /> : <EmptyState title="No orders found" />)}
      </Card>
      <ConfirmDialog visible={!!refundRow} title="Refund this order?" danger loading={refunding}
        message={`Mark order ${refundRow?.order_id || ''} as refunded and invalidate its pickup code? This does not auto-refund money in Razorpay — issue the refund there separately.`}
        confirmLabel="Mark Refunded" onConfirm={doRefund} onCancel={() => setRefundRow(null)} />

      <Sheet visible={testOpen} onClose={() => setTestOpen(false)} title="Create Test Order">
        {testResult ? (
          <View style={{ gap: SP.md }}>
            <Text style={{ color: C.textSec }}>A PAID test order was created for pickup testing.</Text>
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>PICKUP CODE</Text>
              <Text style={styles.codeValue}>{testResult.pickup_code}</Text>
            </View>
            <Text style={{ color: C.text }}>Vendor: <Text style={{ fontWeight: '700' }}>{testResult.vendor_name}</Text></Text>
            <Text style={{ color: C.textSec, fontSize: 12.5 }}>Order {testResult.order_id}</Text>
            <Text style={{ color: C.textSec, fontSize: 12.5 }}>Log in to that vendor's app → Orders → Ready for Pickup → Verify Pickup, then enter this code.</Text>
            <View style={{ flexDirection: 'row', gap: SP.md }}>
              <Btn title="Create Another" variant="secondary" onPress={() => setTestResult(null)} />
              <Btn title="Done" onPress={() => setTestOpen(false)} />
            </View>
          </View>
        ) : (
          <View style={{ gap: SP.md }}>
            <Field label="Vendor (optional — defaults to first active)">
              <Dropdown value={testVendor} onChange={setTestVendor} placeholder="First active vendor"
                options={[{ label: 'First active vendor', value: '' }, ...vendors.map((v: any) => ({ label: v.name, value: v.vendor_id }))]} />
            </Field>
            <Btn title="Create Test Order" icon={FlaskConical} loading={creatingTest} onPress={createTest} full />
          </View>
        )}
      </Sheet>
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
  codeCard: { backgroundColor: C.primary, borderRadius: 14, padding: SP.lg, alignItems: 'center' },
  codeLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  codeValue: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: 8, marginTop: 4 },
});
